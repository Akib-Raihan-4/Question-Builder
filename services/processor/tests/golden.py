"""Golden-file helpers: real papers live in /samples (never committed); only the expected
JSON (numbers, marks, parts, regions — no question text) is committed."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SAMPLES = ROOT / "samples"
GOLDEN = Path(__file__).parent / "fixtures" / "golden"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from parsers import parser_for  # noqa: E402


# Question papers with picture-only pages (part of the text is missing), or scans: their questions
# can't all be found from the text, so they're kept as golden snapshots but not held to
# "every Total line found".
PARTIAL = ("2019_Jan_P2_QP", "2019_Jan_P2R_QP", "2019_MayJune_P2R_QP")


def sample_pdfs() -> list[Path]:
    """Question papers in /samples and its subfolders (mark schemes are tested elsewhere)."""
    if not SAMPLES.exists():
        return []
    top = sorted(SAMPLES.glob("*.pdf"))
    sub = sorted(p for p in SAMPLES.glob("*/*.pdf") if "_QP" in p.name)
    return top + sub


def golden_name(pdf: Path) -> str:
    return re.sub(r"_\d{10,}$", "", pdf.stem) + ".json"


def snapshot(pdf: Path) -> dict:
    data = pdf.read_bytes()
    r = parser_for("edexcel", data).segment(data)
    rnd = lambda v: round(v * 2) / 2  # 0.5 pt
    reg = lambda g: [g.page, rnd(g.x0), rnd(g.y0), rnd(g.x1), rnd(g.y1)]
    return {
        "parser_version": r.parser_version,
        "page_count": r.page_count,
        "warnings": r.warnings,
        "questions": [
            {
                "number": q.number,
                "total_marks": q.total_marks,
                "confidence": q.confidence,
                "warnings": q.warnings,
                "regions": [reg(g) for g in q.regions],
                "parts": [
                    {"label": p.label, "marks": p.marks, "regions": [reg(g) for g in p.regions]} for p in q.parts
                ],
            }
            for q in r.questions
        ],
    }


if __name__ == "__main__":
    # python tests/golden.py --update   (re-generate after an intentional parser change)
    if "--update" not in sys.argv:
        sys.exit("usage: python tests/golden.py --update")
    GOLDEN.mkdir(parents=True, exist_ok=True)
    for pdf in sample_pdfs():
        out = GOLDEN / golden_name(pdf)
        out.write_text(json.dumps(snapshot(pdf), indent=1) + "\n")
        print("wrote", out.name)
