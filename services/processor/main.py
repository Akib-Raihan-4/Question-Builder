import json

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from cover import read_cover
from docx_export import DocxSpec, build_docx
from parsers import PARSERS, get_parser
from parsers.base import SegmentResult

app = FastAPI(title="Papersmith processor")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "parsers": {k: p.version for k, p in PARSERS.items()}}


@app.post("/segment/qp", response_model=SegmentResult)
async def segment_qp(parser_key: str = Form(...), file: UploadFile = File(...)) -> SegmentResult:
    try:
        parser = get_parser(parser_key)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Not a PDF")
    return parser.segment(data)


@app.post("/inspect")
async def inspect(file: UploadFile = File(...)) -> dict:
    """Paper details read from the cover page, to pre-fill the upload form."""
    data = await file.read()
    if not data.startswith(b"%PDF"):
        raise HTTPException(400, "Not a PDF")
    return read_cover(data)


@app.post("/export/docx")
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
    data = build_docx(spec, pdfs)
    return Response(
        data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
