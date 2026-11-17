from fastapi import FastAPI, File, Form, HTTPException, UploadFile

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
