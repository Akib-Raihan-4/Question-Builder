"""IAL Pure Mathematics P1–P4 (and C12/C34, M1, S1): whole questions, routed by the cover; other papers keep their parser."""
from pathlib import Path

import pytest

from parsers import parser_for
from parsers.edexcel import EdexcelParser
from parsers.ial_pure import IalPureParser

SAMPLES = Path(__file__).resolve().parents[3] / "samples"
# Papers printed "5<tab>" (no dot, the number alone on its line) and "1:" (Paperlords downloads).
ODD = [SAMPLES / "IAL-Maths-paperlords" / f for f in ("M1/June 2026 M1 QP.pdf", "S1/June 2025 S1 QP.pdf")]
PURE = (
    sorted((SAMPLES / "IAL Mathematics P3 ").glob("*QP.pdf"))
    + sorted((SAMPLES / "IAL-new").glob("IAL_MATHS_*_[PMS][1-4]_QP.pdf"))
    + [p for p in ODD if p.exists()]
)
OTHER = sorted(SAMPLES.glob("IGCSE_MATHEMATICS_B_*_QP*.pdf"))[:2] + sorted((SAMPLES / "IAL-new").glob("IAL_MATHS_*_D1_QP.pdf"))


@pytest.mark.skipif(not PURE, reason="no IAL Pure Mathematics samples in /samples (they are not committed)")
@pytest.mark.parametrize("pdf", PURE, ids=lambda p: p.stem[:40])
def test_pure_papers_whole_questions(pdf):
    data = pdf.read_bytes()
    parser = parser_for("edexcel", data)
    assert isinstance(parser, IalPureParser)
    r = parser.segment(data)
    nums = [q.number for q in r.questions]
    assert nums == list(range(1, len(nums) + 1)) and len(nums) >= 6
    assert sum(q.total_marks for q in r.questions) == 75  # every P1–P4, M1 and S1 paper is out of 75
    assert not r.warnings
    for q in r.questions:
        assert not q.parts and q.regions and not q.warnings
        # One box per page, in page order, inside the page.
        pages = [g.page for g in q.regions]
        assert pages == sorted(set(pages))
        assert all(50 <= g.y0 < g.y1 <= 790 for g in q.regions)


@pytest.mark.skipif(not OTHER, reason="no samples in /samples")
@pytest.mark.parametrize("pdf", OTHER, ids=lambda p: p.stem[:40])
def test_other_papers_keep_the_edexcel_parser(pdf):
    data = pdf.read_bytes()
    assert type(parser_for("edexcel", data)) is EdexcelParser


MS_JUNE_2025 = SAMPLES / "IAL-P3-pmt" / "June 2025 MS.pdf"


@pytest.mark.skipif(not MS_JUNE_2025.exists(), reason="no IAL P3 mark scheme sample")
def test_ial_pure_ms_notes_are_cut_out_like_the_admin_did():
    """June 2025 P3 as an admin tidied it by hand: one box per part, the scheme only."""
    from main import read_ms

    r = read_ms(MS_JUNE_2025.read_bytes())
    assert r.reader_version.startswith("ial-maths-ms")
    got = {x.label: [(g.page + 1, round(g.y1)) for g in x.regions] for x in r.rows}
    admin = {
        "1(a)": [(7, 173)], "1(b)": [(7, 248)], "1(c)": [(8, 180)], "1(d)": [(8, 307)], "2(a)": [(9, 171)],
        "3(a)": [(10, 157)], "4(a)": [(13, 282)], "4(b)": [(14, 176)], "6(c)": [(17, 190)],
        "8(a)": [(20, 332), (21, 213)], "9(a)": [(23, 202)], "9(b)": [(24, 248), (25, 255)], "10(b)": [(29, 321)],
    }
    assert "2(x)" not in got and "7(b)" not in got  # rows that were only notes
    assert len(got) == 29
    for label, boxes in admin.items():
        assert [p for p, _ in got[label]] == [p for p, _ in boxes], label
        assert all(abs(a[1] - b[1]) <= 8 for a, b in zip(got[label], boxes)), (label, got[label], boxes)
