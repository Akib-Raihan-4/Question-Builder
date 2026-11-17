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

from parsers import get_parser  # noqa: E402


def golden_name(pdf: Path) -> str:
    return re.sub(r"_\d{10,}$", "", pdf.stem) + ".json"


def snapshot(pdf: Path) -> dict:
    r = get_parser("edexcel").segment(pdf.read_bytes())
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
    for pdf in sorted(SAMPLES.glob("*.pdf")):
        out = GOLDEN / golden_name(pdf)
        out.write_text(json.dumps(snapshot(pdf), indent=1) + "\n")
        print("wrote", out.name)
