"""The adaptive parser: no layout rules, it learns each paper's layout. Synthetic papers (run in CI)
and, when /samples has them, papers no rules were written for."""
from pathlib import Path

import pymupdf
import pytest

from parsers import segment
from parsers.adaptive import AdaptiveParser, adds_up


def paper(questions, total_text="TOTAL FOR PAPER IS {t} MARKS", one_per_page=False, total_word="is", nbsp=False, drift=False, no_total=()):
    """A small question paper: cover, then questions with a bold number, part marks "(n)" at the
    right, and "(Total for Question n is m marks)" under each."""
    doc = pymupdf.open()
    cover = doc.new_page()
    cover.insert_text((72, 100), "Mathematics  Paper 1  Total Marks")
    page, y = None, 800
    for n, parts in questions:
        if one_per_page or page is None or y > 600:
            page, y = doc.new_page(), 60
        x = 42 if drift and n % 2 else 43
        page.insert_text((x, y), f"{n}.", fontname="hebo", fontsize=11)
        page.insert_text((61, y), f"Question {n} is about something worth {sum(parts)} marks.", fontsize=11)
        y += 30
        for k, m in enumerate(parts):
            page.insert_text((61, y), f"({'abcdef'[k]}) Work out part {'abcdef'[k]}.", fontsize=11)
            page.insert_text((520, y), f"({m})", fontname="hebo", fontsize=11)
            y += 40
        if n not in no_total:
            space = " " if nbsp and n == 1 else " "
            page.insert_text((330, y), f"(Total for Question{space}{n} {total_word} {sum(parts)} mark{'s' if sum(parts) > 1 else ''})", fontname="hebo", fontsize=11)
        y += 40
    t = sum(sum(p) for _, p in questions)
    page.insert_text((300, y + 20), total_text.format(t=t), fontname="hebo", fontsize=11)
    return doc.tobytes()


QS = [(1, [2, 3]), (2, [1]), (3, [4, 2, 1]), (4, [3, 3]), (5, [5]), (6, [2, 2, 2])]


def read(data):
    r = AdaptiveParser().segment(data)
    return {q.number: q.total_marks for q in r.questions}, r


def test_reads_numbers_and_totals_and_they_add_up():
    data = paper(QS)
    got, r = read(data)
    assert got == {n: sum(p) for n, p in QS}
    assert adds_up(r, pymupdf.open(stream=data))
    q3 = r.questions[2]
    assert q3.regions and all(g.x0 > 50 for g in q3.regions)  # the number itself is left out of the box
    assert not q3.warnings


def test_other_wordings_drift_and_nbsp():
    # "= 1 mark" vs "= 4 marks", a number column that drifts by a point, a non-breaking space.
    data = paper(QS, total_word="=", drift=True, nbsp=True, total_text="TOTAL FOR PAPER = {t} MARKS")
    assert read(data)[0] == {n: sum(p) for n, p in QS}


def test_one_question_per_page_is_not_page_furniture():
    data = paper(QS, one_per_page=True)
    assert read(data)[0] == {n: sum(p) for n, p in QS}


def test_missing_total_line_uses_the_part_marks():
    data = paper(QS, no_total=(3,))
    got, r = read(data)
    assert got[3] == 7
    assert r.questions[2].warnings  # flagged for a look


def test_marks_that_dont_add_up_are_not_trusted():
    data = paper(QS, total_text="TOTAL FOR PAPER IS 99 MARKS")
    _, r = read(data)
    assert not adds_up(r, pymupdf.open(stream=data))


def test_fallback_keeps_the_board_parser_when_it_adds_up():
    data = paper(QS)
    r = segment("edexcel", data)
    assert adds_up(r, pymupdf.open(stream=data))


UNSEEN = Path(__file__).resolve().parents[3] / "samples" / "unseen"
CHEM = sorted(UNSEEN.glob("IAL_CHEMISTRY_*_U1_QP*.pdf"))


@pytest.mark.skipif(not CHEM, reason="no unseen Chemistry samples in /samples (not committed)")
@pytest.mark.parametrize("pdf", CHEM, ids=lambda p: p.stem[:30])
def test_chemistry_unit_1_needs_no_rules(pdf):
    """No parser was written for IAL Chemistry: the board parser finds nothing, the fallback reads it."""
    data = pdf.read_bytes()
    r = segment("edexcel", data)
    assert r.parser_version.startswith("adaptive")
    assert sum(q.total_marks for q in r.questions) == 80
    assert all(q.regions for q in r.questions)
