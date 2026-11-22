"""IAL Pure Mathematics P1–P4: whole questions, routed by the cover; other papers keep their parser."""
from pathlib import Path

import pytest

from parsers import parser_for
from parsers.edexcel import EdexcelParser
from parsers.ial_pure import IalPureParser

SAMPLES = Path(__file__).resolve().parents[3] / "samples"
PURE = sorted((SAMPLES / "IAL Mathematics P3 ").glob("*QP.pdf")) + sorted((SAMPLES / "IAL-new").glob("IAL_MATHS_*_P[1-4]_QP.pdf"))
OTHER = sorted(SAMPLES.glob("IGCSE_MATHEMATICS_B_*_QP*.pdf"))[:2] + sorted((SAMPLES / "IAL-new").glob("IAL_MATHS_*_[DMS]1_QP.pdf"))


@pytest.mark.skipif(not PURE, reason="no IAL Pure Mathematics samples in /samples (they are not committed)")
@pytest.mark.parametrize("pdf", PURE, ids=lambda p: p.stem[:40])
def test_pure_papers_whole_questions(pdf):
    data = pdf.read_bytes()
    parser = parser_for("edexcel", data)
    assert isinstance(parser, IalPureParser)
    r = parser.segment(data)
    nums = [q.number for q in r.questions]
    assert nums == list(range(1, len(nums) + 1)) and len(nums) >= 8
    assert sum(q.total_marks for q in r.questions) == 75  # every P1–P4 paper is out of 75
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
