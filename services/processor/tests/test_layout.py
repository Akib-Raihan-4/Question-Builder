import pymupdf
from fastapi.testclient import TestClient

from main import app
from page_layout import paper_layout


def _paper() -> bytes:
    doc = pymupdf.open()
    p = doc.new_page(width=595.28, height=841.89)
    p.draw_rect(pymupdf.Rect(35, 36, 560, 794))  # page frame: ignored
    p.insert_text((60, 100), "(b) Describe how she should measure the height.", fontname="tiro", fontsize=11)
    for i in range(4):
        p.insert_text((60, 140 + 28 * i), "." * 90, fontname="tiro", fontsize=11)  # answer lines
    p.insert_text((60, 300), "Percentage uncertainty = " + "." * 30, fontname="tiro", fontsize=11)  # labelled: kept
    p.draw_rect(pymupdf.Rect(100, 340, 400, 480))  # a graph grid / diagram
    return doc.tobytes()


def test_layout_separates_answer_dots_from_ink():
    page = paper_layout(_paper()).pages[0]
    assert len(page.dots) == 4
    tops = sorted(round(b[1]) for b in page.ink)
    assert any(abs(t - 89) <= 3 for t in tops)  # question text
    assert any(abs(t - 289) <= 3 for t in tops)  # labelled answer line counts as ink
    assert any(abs(t - 340) <= 1 for t in tops)  # the diagram
    assert not any(b[2] - b[0] > 500 and b[3] - b[1] > 700 for b in page.ink)  # no page frame


def test_layout_endpoint():
    res = TestClient(app).post("/layout", files={"file": ("p.pdf", _paper(), "application/pdf")})
    assert res.status_code == 200
    assert res.json()["version"] == 1 and len(res.json()["pages"]) == 1
