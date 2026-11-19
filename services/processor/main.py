import hmac
import json
import os

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import Response

from cover import read_cover
from docx_export import DocxSpec, build_docx
from parsers import PARSERS, get_parser
from parsers.base import SegmentResult
from page_layout import LayoutResult, paper_layout

def require_key(x_processor_key: str | None = Header(default=None)) -> None:
    """When PROCESSOR_KEY is set (always, when hosted), every call except /health must send it.
    The processor handles copyrighted papers, so it must not be usable by anyone who finds it."""
    expected = os.environ.get("PROCESSOR_KEY")
    if expected and not hmac.compare_digest(x_processor_key or "", expected):
        raise HTTPException(401, "Missing or wrong X-Processor-Key")


app = FastAPI(title="Papersmith processor", docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "parsers": {k: p.version for k, p in PARSERS.items()}}


@app.post("/segment/qp", response_model=SegmentResult, dependencies=[Depends(require_key)])
async def segment_qp(parser_key: str = Form(...), file: UploadFile = File(...)) -> SegmentResult:
    try:
        parser = get_parser(parser_key)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Not a PDF")
    return parser.segment(data)


@app.post("/layout", response_model=LayoutResult, dependencies=[Depends(require_key)])
async def layout(file: UploadFile = File(...)) -> LayoutResult:
    """Where text, drawings and answer dots are on every page (for removing answer space)."""
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Not a PDF")
    return paper_layout(data)


@app.post("/inspect", dependencies=[Depends(require_key)])
async def inspect(file: UploadFile = File(...)) -> dict:
    """Paper details read from the cover page, to pre-fill the upload form."""
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Not a PDF")
    return read_cover(data)


@app.post("/export/docx", dependencies=[Depends(require_key)])
async def export_docx(request: Request) -> Response:
    """Build a .docx: form field `spec` (JSON, see docx_export.DocxSpec) + one file per source
    paper named `pdf_<paper_id>`."""
    form = await request.form()
    try:
        spec = DocxSpec.model_validate(json.loads(str(form.get("spec"))))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Bad spec: {e}") from e
    pdfs = {}
    for key, value in form.multi_items():
        if key.startswith("pdf_") and hasattr(value, "read"):
            pdfs[key[4:]] = await value.read()
    missing = {i.paper_id for i in spec.items} - set(pdfs)
    if missing:
        raise HTTPException(400, f"Missing PDFs for {sorted(missing)}")
    async def file_bytes(name: str) -> bytes | None:
        f = form.get(name)
        return await f.read() if f is not None and hasattr(f, "read") else None

    data = build_docx(spec, pdfs, logo=await file_bytes("logo"), watermark_logo=await file_bytes("watermark_logo"))
    return Response(
        data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
