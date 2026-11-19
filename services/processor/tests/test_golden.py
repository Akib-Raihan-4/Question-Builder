import json

import pytest

from tests.golden import GOLDEN, PARTIAL, golden_name, sample_pdfs, snapshot

PDFS = sample_pdfs()
COMPLETE = [p for p in PDFS if not any(k in p.name for k in PARTIAL)]


@pytest.mark.skipif(not PDFS, reason="no real papers in /samples (they are not committed)")
@pytest.mark.parametrize("pdf", PDFS, ids=lambda p: p.stem[:40])
def test_matches_golden(pdf):
    golden = GOLDEN / golden_name(pdf)
    if not golden.exists():
        pytest.skip(f"no golden file for {pdf.name}; run: python tests/golden.py --update")
    expected = json.loads(golden.read_text())
    actual = snapshot(pdf)
    exp_q = {q["number"]: q for q in expected["questions"]}
    act_q = {q["number"]: q for q in actual["questions"]}
    assert list(act_q) == list(exp_q), "question numbers changed"
    for n, e in exp_q.items():
        a = act_q[n]
        assert a["total_marks"] == e["total_marks"], f"Q{n} total marks changed"
        assert [(p["label"], p["marks"]) for p in a["parts"]] == [(p["label"], p["marks"]) for p in e["parts"]], f"Q{n} parts/marks changed"
        assert a["regions"] == e["regions"], f"Q{n} regions changed"
        assert [p["regions"] for p in a["parts"]] == [p["regions"] for p in e["parts"]], f"Q{n} part regions changed"
    assert actual == expected


@pytest.mark.skipif(not COMPLETE, reason="no real papers in /samples")
@pytest.mark.parametrize("pdf", COMPLETE, ids=lambda p: p.stem[:40])
def test_phase3_done_when(pdf):
    """Every question number found in sequence, totals present, and part marks add up."""
    s = snapshot(pdf)
    nums = [q["number"] for q in s["questions"]]
    assert nums == list(range(1, len(nums) + 1))
    # Question totals must match the paper's own "TOTAL FOR PAPER IS N MARKS" (100 for 4MB1, 50 for WPH13).
    assert not any("TOTAL FOR PAPER" in w for w in s["warnings"]), s["warnings"]
    assert s["questions"]
    for q in s["questions"]:
        assert not any("No '(Total" in w for w in q["warnings"]), f"Q{q['number']} missing Total line"
        if q["parts"]:
            assert sum(p["marks"] for p in q["parts"]) == q["total_marks"], f"Q{q['number']} parts don't add up"
