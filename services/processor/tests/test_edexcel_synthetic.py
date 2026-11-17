"""Edexcel-style paper built in code, so the parser logic is tested without copyrighted PDFs."""
import pymupdf

from parsers.edexcel import EdexcelParser

BOLD, REG = "tibo", "tiro"  # Times bold / regular (PyMuPDF base-14)


def _paper(offset: float = 0.0) -> bytes:
    doc = pymupdf.open()
    w, h = 595.28 + 2 * offset, 841.89 + 2 * offset

    def page():
        p = doc.new_page(width=w, height=h)
        p.insert_text((61.6 + offset, 808 + offset), str(doc.page_count), fontname=BOLD, fontsize=10)  # page no.
        p.insert_text((501.8 + offset, 828 + offset), "Turn over", fontname=BOLD, fontsize=12)
        return p

    def t(p, x, y, s, bold=False):
        p.insert_text((x + offset, y + offset), s, fontname=BOLD if bold else REG, fontsize=12)

    cover = page()
    t(cover, 100, 300, "Mathematics B  Paper 1")
    p = page()
    # Q1: no parts
    t(p, 42.5, 155, "1", True); t(p, 60.9, 155, "Solve the inequality 7x + 3 > 4x - 15")
    t(p, 342.4, 375, "(Total for Question 1 is 2 marks)", True)
    # Q2: parts (a), (b) with marks
    t(p, 42.5, 410, "2", True); t(p, 60.9, 410, "(a) Write 1.2 x 10^-4 as an ordinary number.")
    t(p, 496.0, 470, "(1)", True)
    t(p, 60.9, 500, "(b) Calculate the value.")
    t(p, 496.0, 600, "(2)", True)
    t(p, 336.4, 625, "(Total for Question 2 is 3 marks)", True)
    # Q3: starts here and continues on the next page; (a) with nested romans and one mark
    t(p, 42.5, 660, "3", True); t(p, 60.9, 660, "A = {1, 2, 3}")
    t(p, 60.9, 690, "(a) List the elements of")
    t(p, 79.3, 714, "(i) B u C")
    t(p, 75.9, 740, "(ii) A' n C")
    p2 = page()
    t(p2, 496.0, 120, "(3)", True)
    t(p2, 60.9, 150, "(b) Explain why the set is empty.")
    t(p2, 496.0, 220, "(1)", True)
    t(p2, 336.4, 245, "(Total for Question 3 is 4 marks)", True)
    # Q4: a list (i)/(ii) inside the text, no part marks
    t(p2, 42.5, 280, "4", True); t(p2, 60.9, 280, "Shade the region of points that are")
    t(p2, 60.9, 304, "(i) more than 4 cm from A")
    t(p2, 60.9, 328, "(ii) closer to B than C")
    t(p2, 342.4, 600, "(Total for Question 4 is 3 marks)", True)
    t(p2, 306.8, 640, "TOTAL FOR PAPER IS 12 MARKS", True)
    return doc.tobytes()


def _questions(offset=0.0):
    r = EdexcelParser().segment(_paper(offset))
    assert r.status == "ok"
    return r, {q.number: q for q in r.questions}


def test_numbers_totals_and_parts():
    r, q = _questions()
    assert list(q) == [1, 2, 3, 4]
    assert [q[n].total_marks for n in q] == [2, 3, 4, 3]
    assert r.warnings == []
    assert q[1].parts == []
    assert [(p.label, p.marks) for p in q[2].parts] == [("a", 1), ("b", 2)]
    # Romans sharing one mark fold into their letter
    assert [(p.label, p.marks) for p in q[3].parts] == [("a", 3), ("b", 1)]
    # A list inside the question text is not parts
    assert q[4].parts == []
    assert all(x.confidence == 1.0 for x in q.values())


def test_regions_exclude_number_column_and_total_line():
    _, q = _questions()
    for n, question in q.items():
        for g in question.regions:
            assert g.x0 > 55, "crop must start right of the question number"
            assert g.y1 <= 790, "crop must stop above the footer"
    q1 = q[1].regions[0]
    assert q1.y1 < 375 - 10, "crop must stop above the Total line"


def test_multi_page_question_splits_per_page():
    _, q = _questions()
    pages = [g.page for g in q[3].regions]
    assert pages == [1, 2]
    a = q[3].parts[0]
    assert [g.page for g in a.regions] == [1, 2]


def test_bordered_pages_are_offset():
    off = 28.35
    _, q0 = _questions()
    _, q1 = _questions(off)
    a, b = q0[2].regions[0], q1[2].regions[0]
    assert abs((b.x0 - a.x0) - off) < 0.01 and abs((b.y0 - a.y0) - off) < 0.01
    assert [x.total_marks for x in q1.values()] == [2, 3, 4, 3]
