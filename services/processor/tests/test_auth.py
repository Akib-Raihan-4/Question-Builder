import pymupdf
from fastapi.testclient import TestClient

from main import app


def _pdf() -> bytes:
    doc = pymupdf.open()
    doc.new_page().insert_text((72, 72), "Hello")
    return doc.tobytes()


def test_key_required_when_configured(monkeypatch):
    monkeypatch.setenv("PROCESSOR_KEY", "s3cret")
    client = TestClient(app)
    files = {"file": ("a.pdf", _pdf(), "application/pdf")}
    assert client.get("/health").status_code == 200  # health stays open for the host's checks
    assert client.post("/inspect", files=files).status_code == 401
    assert client.post("/inspect", files=files, headers={"X-Processor-Key": "wrong"}).status_code == 401
    assert client.post("/inspect", files=files, headers={"X-Processor-Key": "s3cret"}).status_code == 200
    assert client.post("/segment/qp", data={"parser_key": "edexcel"}, files=files).status_code == 401


def test_no_key_configured_is_open_for_local_dev(monkeypatch):
    monkeypatch.delenv("PROCESSOR_KEY", raising=False)
    r = TestClient(app).post("/inspect", files={"file": ("a.pdf", _pdf(), "application/pdf")})
    assert r.status_code == 200
