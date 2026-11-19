import pymupdf
from fastapi.testclient import TestClient

from main import app
from ms_reader import normalize_label, read_mark_scheme


def _table(doc, rows, header=True, top=60):
    """A ruled mark-scheme table: label column 42–95, answer 95–486, mark 486–552."""
    p = doc.new_page(width=595, height=842)
    y = top
    if header:
        p.insert_text((48, y + 14), "Question", fontsize=10)
        p.insert_text((49, y + 26), "Number", fontsize=10)
        p.insert_text((287, y + 20), "Answer", fontsize=10)
        p.insert_text((500, y + 20), "Mark", fontsize=10)
        p.draw_line((42, y), (552, y))
        y += 30
    for label, h in rows:
        p.draw_line((42, y), (552, y))
        if label:
            p.insert_text((48, y + 13), label, fontsize=10)
        p.insert_text((102, y + 13), f"answer for {label or 'continued'}", fontsize=10)
        p.insert_text((520, y + 13), "(1)", fontsize=10)
        y += h
    p.draw_line((42, y), (552, y))
    for x in (42, 95, 486, 552):
        p.draw_line((x, top), (x, y))
    return p


def test_labels():
    assert normalize_label("1(a)(i)", None) == (1, "a", "i")
    assert normalize_label("1 (a)", None) == (1, "a", None)
    assert normalize_label("4", None) == (4, None, None)
    assert normalize_label("(ii)", (2, "a")) == (2, "a", "ii")
    assert normalize_label("(b)", (3, "a")) == (3, "b", None)
    assert normalize_label("Total", (1, None)) is None


def test_rows_regions_and_page_continuation():
    doc = pymupdf.open()
    _table(doc, [("1(a)(i)", 40), ("1(a)(ii)", 60), ("1(b)", 300)])
    _table(doc, [("", 50), ("2(a)", 40), ("Total for question 2", 20)])  # 1(b) continues, then a total row
    r = read_mark_scheme(doc.tobytes())
    assert r.status == "ok"
    assert [(x.label, x.question, x.part) for x in r.rows] == [
        ("1(a)(i)", 1, "a(i)"), ("1(a)(ii)", 1, "a(ii)"), ("1(b)", 1, "b"), ("2(a)", 2, "a"),
    ]
    first = r.rows[0].regions[0]
    assert first.x0 > 95 and first.x1 < 553  # the label column is not in the crop
    assert len(r.rows[2].regions) == 2 and r.rows[2].regions[1].page == 1


def test_scan_fails_with_reason():
    doc = pymupdf.open()
    doc.new_page()
    r = read_mark_scheme(doc.tobytes())
    assert r.status == "failed" and "scan" in r.reason


def test_endpoint():
    doc = pymupdf.open()
    _table(doc, [("1", 40)])
    res = TestClient(app).post("/segment/ms", files={"file": ("ms.pdf", doc.tobytes(), "application/pdf")})
    assert res.status_code == 200 and res.json()["rows"][0]["label"] == "1"
