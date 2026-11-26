"""Tidy the rows of an Edexcel IAL Pure Mathematics P1–P4 mark scheme (read by ms_reader.py).

These mark schemes put a "Notes" section under each question's scheme table ("Notes:", then
entries like "M1: Attempts to …", "(b)", "B1: …"), inside the same ruled frame. The general
reader keeps that guidance with the rows (a second box per part, rows such as "2(x)"); what
teachers want is the scheme itself. So, page by page, everything from the start of the notes to
the next "Question | Scheme | Marks" header is cut out, boxes are trimmed to end above it, and
rows left with nothing are dropped. Other mark schemes are not touched.
"""
from __future__ import annotations

import re

import pymupdf

from ms_reader import MsResult, MsRow

COVER = re.compile(r"Pure\s+Mathematics\s+P[1-4]\b|\bWMA1[1-4]\b|Core\s+Mathematics\s+C(?:12|34)\b|\bWMA0[12]\b|Mechanics\s+M1\b|\bWME01\b|Statistics\s+S1\b|\bWST01\b", re.I)
# A note entry at the left margin: "M1:", "dM1:", "A1*:", "B1ft:", "SC:", "Notes:", "Note:".
NOTE_START = re.compile(r"^(?:Notes?|d{0,2}[MABE]\d*\*?(?:ft)?|SC|B\d)\s*:?$", re.I)
LEFT = 60.0  # note entries start at x ≈ 34–55
LABEL_LEFT = 110.0  # the table's "Question" heading and question labels ("6(a)") sit at x ≈ 34–75


def is_ial_pure_ms(doc: pymupdf.Document) -> bool:
    return bool(doc.page_count) and bool(COVER.search(doc[0].get_text()[:600]))


def _notes_bands(page: pymupdf.Page) -> list[tuple[float, float]]:
    """Stretches of the page that are notes, not scheme: from a note's start to the next table header."""
    words = page.get_text("words")
    headers = sorted(
        w[1] for w in words
        if w[4] == "Question" and w[0] < LABEL_LEFT and any(v[4] == "Scheme" and abs(v[1] - w[1]) < 18 for v in words)
    )
    # A question number in the left margin ("6.", "7", "8(a)") starts a new scheme table.
    qstarts = sorted(w[1] for w in words if w[0] < LABEL_LEFT and re.match(r"^\d{1,2}(?:\.$|\([a-z]{1,4}\))", w[4]))
    starts = sorted(w[1] for w in words if w[0] < LEFT and NOTE_START.match(w[4]))
    # A question's "(9 marks)" line in the Marks column: its scheme ends there, the notes follow.
    q_totals = sorted(
        w[1] for w in words
        if w[0] > page.rect.width * 0.7 and w[4].lower().startswith("marks)")
        and any(re.fullmatch(r"\(\d{1,2}", v[4]) and abs(v[1] - w[1]) < 3 and 0 < w[0] - v[2] < 12 for v in words)
    )
    starts = sorted(set(starts) | set(q_totals))
    # A part's scheme ends at its marks, "(3)", in the right-hand column; what follows before the
    # next part ("Condone …", "Do not allow …", "(c)" over "M1: …") is already the notes.
    # The Marks column: a part's total "(3)", the mark codes ("M1", "dM1", "M1A1", "A1*", "B1ft"…)
    # and a question's "Total 5" row. Scheme lines stay left of it; notes run across it.
    right = page.rect.width * 0.8
    MARK = re.compile(r"\(\d{1,2}\)|(?:d{0,2}[MABE]\d\*?){1,3}(?:ft|cso|cao)?|Total|\d{1,2}", re.I)
    totals = sorted(w[1] for w in words if w[0] > right and re.fullmatch(r"\(\d{1,2}\)", w[4]))
    codes = sorted(w[1] for w in words if w[0] > right and re.fullmatch(r"(?:d{0,2}[MABE]\d\*?){1,3}(?:ft|cso|cao)?", w[4]))
    total_rows = sorted(w[1] for w in words if w[0] > right and w[4] == "Total")
    across = sorted(w[1] for w in words if w[0] > right and not MARK.fullmatch(w[4].strip(".,")))
    left = sorted(w[1] for w in words if w[0] < LEFT)
    bands: list[tuple[float, float]] = []
    for s in starts:
        if bands and bands[-1][0] <= s < bands[-1][1]:
            continue  # already inside a notes band
        top = max([h for h in headers if h < s] or [0.0])
        if s in q_totals:
            end = min([h for h in headers + qstarts if h > s] or [page.rect.height])
            bands.append((s - 2, end - 2))
            continue
        last_mark = max([y for y in totals + codes if top < y < s] or [top])
        cands = [s]
        # A heading just above the first note ("(c)", "(b)", "Way 2:").
        y = s
        for ly in reversed([v for v in left if last_mark < v < s]):
            if y - ly > 25:
                break
            cands.append(ly)
            y = ly
        # The question's "Total 5" row ends the scheme.
        cands += [t for t in total_rows if last_mark - 1 < t < s]
        # After a part's "(3)" (its last entry), the next line is already the notes.
        lt = max([t for t in totals if top < t < s] or [0.0])
        if lt and lt >= last_mark:
            nxt = [w[1] for w in words if lt + 4 < w[1] < s]
            if nxt:
                cands.append(min(nxt))
        # Text running across the Marks column is notes; its paragraph starts a line or so above.
        run = [a for a in across if last_mark < a < s]
        if run:
            first = run[0]
            lines = sorted({round(w[1]) for w in words if last_mark + 4 < w[1] <= first})
            while len(lines) >= 2 and lines[-1] - lines[-2] < 16:
                lines.pop()
            cands.append(lines[-1] if lines else first)
        start = min(cands) - 2
        end = min([h for h in headers + qstarts if h > s] or [page.rect.height])
        bands.append((start, end - 2))
    return bands


def tidy_rows(doc: pymupdf.Document, result: MsResult) -> MsResult:
    """Cut the notes out of every row (see module doc). Returns the same result, tidied."""
    bands = {i: _notes_bands(doc[i]) for i in range(doc.page_count)}
    rows: list[MsRow] = []
    for row in result.rows:
        kept = []
        for g in row.regions:
            y0, y1 = g.y0, g.y1
            for b0, b1 in bands.get(g.page, []):
                if b0 <= y0 + 4 and y1 <= b1 + 4:
                    y1 = y0  # wholly in the notes
                    break
                if y0 < b0 < y1:
                    y1 = b0  # trim to end above the notes
            if y1 - y0 > 8:
                kept.append(g.model_copy(update={"y1": round(y1, 1)}))
        if kept:
            rows.append(row.model_copy(update={"regions": kept}))
    result.rows = rows
    return result
