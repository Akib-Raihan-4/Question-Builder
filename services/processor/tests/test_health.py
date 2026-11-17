import fitz
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _pdf(text: str | None) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595.28, height=841.89)
    if text:
        page.insert_text((72, 72), text)
    return doc.tobytes()


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert "edexcel" in r.json()["parsers"]


def test_segment_text_pdf_returns_contract():
    r = client.post("/segment/qp", data={"parser_key": "edexcel"}, files={"file": ("a.pdf", _pdf("Hello"), "application/pdf")})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["page_count"] == 1
    assert round(body["page_height"]) == 842


def test_scanned_pdf_fails_with_reason():
    r = client.post("/segment/qp", data={"parser_key": "edexcel"}, files={"file": ("a.pdf", _pdf(None), "application/pdf")})
    assert r.json()["status"] == "failed"
    assert "scanned" in r.json()["reason"]


def test_unknown_parser():
    r = client.post("/segment/qp", data={"parser_key": "nope"}, files={"file": ("a.pdf", _pdf("x"), "application/pdf")})
    assert r.status_code == 400
