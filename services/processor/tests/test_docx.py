import io
import json

import docx
import pymupdf
from fastapi.testclient import TestClient

from docx_export import DocxSpec, build_docx
from main import app


def _paper() -> bytes:
    doc = pymupdf.open()
    p = doc.new_page(width=595.28, height=841.89)
    p.draw_rect(pymupdf.Rect(35, 36, 560, 794))  # page frame: must be ignored
    p.insert_text((60.9, 100), "A student measured the length of a spring.", fontname="tiro", fontsize=12)
    p.insert_text((60.9, 124), "(a) State the resolution of the ruler.", fontname="tiro", fontsize=12)
    p.insert_text((496, 150), "(1)", fontname="tibo", fontsize=12)
    p.draw_rect(pymupdf.Rect(200, 200, 400, 320))  # a diagram
    p.insert_text((260, 260), "spring", fontname="tiro", fontsize=10)
    return doc.tobytes()


def _spec(mode: str) -> DocxSpec:
    return DocxSpec.model_validate({
        "title": "T", "header": {"title": "Unit 3 practice", "instructions": "Answer all questions."},
        "mode": mode, "total_marks": 1,
        "items": [{"number": 1, "marks": 1, "paper_id": "p", "regions": [{"page": 0, "x0": 59, "y0": 80, "x1": 557.5, "y1": 400}]}],
    })


def _text(data: bytes):
    d = docx.Document(io.BytesIO(data))
    body = [p.text for p in d.paragraphs]
    cells = [p.text for t in d.tables for c in t.rows[0].cells for p in c.paragraphs]
    return d, body, cells


def test_pictures_mode_has_editable_numbers_and_totals():
    d, body, cells = _text(build_docx(_spec("pictures"), {"p": _paper()}))
    assert "Unit 3 practice" in body
    assert "(Total for Question 1 is 1 mark)" in body
    assert "TOTAL FOR PAPER IS 1 MARKS" in body
    assert cells[0] == "1" and len(d.inline_shapes) == 1


def test_editable_mode_keeps_words_as_text_and_diagrams_as_pictures():
    d, body, cells = _text(build_docx(_spec("editable"), {"p": _paper()}))
    joined = " ".join(cells)
    assert "A student measured the length of a spring." in joined
    assert "(a) State the resolution of the ruler." in joined
    assert "(1)" in cells
    assert "spring" not in [c.strip() for c in cells]  # the label inside the diagram stays in its picture
    assert len(d.inline_shapes) == 1  # only the diagram, not the page frame


def test_endpoint():
    client = TestClient(app)
    r = client.post(
        "/export/docx",
        data={"spec": json.dumps(_spec("editable").model_dump())},
        files={"pdf_p": ("p.pdf", _paper(), "application/pdf")},
    )
    assert r.status_code == 200 and r.content[:2] == b"PK"
    missing = client.post("/export/docx", data={"spec": json.dumps(_spec("pictures").model_dump())})
    assert missing.status_code == 400


def _logo() -> bytes:
    d = pymupdf.open()
    p = d.new_page(width=120, height=60)
    p.draw_circle((30, 30), 25, color=(0, 0, 1), fill=(0, 0, 1))
    return p.get_pixmap(alpha=True).tobytes("png")


def test_logo_and_text_watermark():
    spec = DocxSpec.model_validate({**_spec("pictures").model_dump(), "watermark": {"text": "Greenfield", "opacity": 0.08}})
    data = build_docx(spec, {"p": _paper()}, logo=_logo())
    d = docx.Document(io.BytesIO(data))
    header_xml = d.sections[0].header._element.xml
    assert "wp:anchor" in header_xml and 'behindDoc="1"' in header_xml  # watermark behind the text
    assert d.paragraphs[0].runs and d.paragraphs[0]._p.xml.count("<pic:pic") == 1  # logo first


def test_no_watermark_by_default():
    d = docx.Document(io.BytesIO(build_docx(_spec("pictures"), {"p": _paper()})))
    assert "wp:anchor" not in d.sections[0].header._element.xml


def test_added_lines_and_space():
    spec = DocxSpec.model_validate({
        **_spec("pictures").model_dump(exclude={"items"}),
        "items": [{"number": 1, "marks": 1, "paper_id": "p", "blocks": [
            {"kind": "crop", "page": 0, "x0": 59, "y0": 80, "x1": 557.5, "y1": 200},
            {"kind": "lines", "count": 3},
            {"kind": "space", "h": 100},
        ]}],
    })
    d = docx.Document(io.BytesIO(build_docx(spec, {"p": _paper()})))
    xml = d.tables[0]._tbl.xml
    assert xml.count('w:val="dotted"') == 3
