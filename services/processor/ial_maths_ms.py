"""Read an Edexcel IAL Mathematics mark scheme (P1–P4, C12/C34, M1, S1) by its ruled table.

These mark schemes are one ruled table per question — Question | Scheme | Marks (| Notes) — and
the table's own lines say where every row starts and ends. So, page by page:

* the label column is the table's first column (found from its vertical lines; it moves from page
  to page, and from paper to paper);
* every cell of that column is a row: a label ("1a", "2(b)(ii)", "3.", "(c)") starts a new row,
  an empty cell continues the row above;
* "Notes" — a "Notes for question 2" heading, or a cell of examiner notes ("M1: Attempts to …",
  "B1ft:") — is guidance, not scheme: it is left out until the next part or question starts;
* a row's marks are its part total "(3)" in the Marks column, else the sum of its mark codes.

Text outside the ruled tables (general guidance, notes printed below a table) is never a row.
A page without a ruled table is skipped; if that leaves fewer questions than the general reader
finds (e.g. a mark scheme with no table lines at all), main.py uses the general reader instead.
"""
from __future__ import annotations

import re

import pymupdf

from ms_reader import MsRegion, MsResult, MsRow, _rules, label_text, normalize_label, part_label

VERSION = "ial-maths-ms-1.0.0"

# A cell of examiner notes: its label column holds note entries, not labels.
NOTE_ENTRY = re.compile(r"^(?:Notes?\b|N\.?B\.?\b|d{0,2}[MABE]\d+\*?(?:ft)?\s*:|[MABE]\d?\s*:|SC\s*:|B\d\s*:)", re.I)
# "Notes for question 2", "Notes on Q3": guidance for the whole question follows.
NOTES_HEADING = re.compile(r"^\s*Notes?\s+(?:for|on)\s+(?:question|qu|qn|q)\.?\s*\d", re.I)
HEADER = re.compile(r"^(?:Q|Qu|Qn|Question|Questio|Number|No\.?)$", re.I)
PART_TOTAL = re.compile(r"^[(\[]\s*(\d{1,2})\s*[)\]]$")  # "(3)" or "[3]"
PART_LETTERS = set("abcdefghjk")
CONT = re.compile(r"\s*(?:cont(?:inued|\.|'d|d)?)\s*$", re.I)


def _all_rules(page: pymupdf.Page, m: pymupdf.Matrix):
    """Horizontal and vertical rules, including the sides of outlined rectangles (table frames)."""
    hs, vs = _rules(page, m)
    for d in page.get_drawings():
        stroked = "s" in (d.get("type") or "")
        for it in d["items"]:
            if it[0] == "re":
                r = pymupdf.Rect(it[1]) * m
                if not stroked:
                    # Thick borders drawn as filled bars (2.5–5 pt); anything else filled is shading.
                    if 2.5 <= r.width <= 5 and r.height > 8:
                        vs.append(((r.x0 + r.x1) / 2, r.y0, r.y1))
                    elif 2.5 <= r.height <= 5 and r.width > 20:
                        hs.append(((r.y0 + r.y1) / 2, r.x0, r.x1))
                    continue
                if r.width > 8 and r.height > 8:
                    vs += [(r.x0, r.y0, r.y1), (r.x1, r.y0, r.y1)]
                    hs += [(r.y0, r.x0, r.x1), (r.y1, r.x0, r.x1)]
    return hs, vs


def _group_x(vs, tol: float = 3.5):
    """Vertical rules grouped by x (a double border counts once): [(x, [(y0, y1), …]), …]."""
    out: list[tuple[float, list[tuple[float, float]]]] = []
    for x, y0, y1 in sorted(vs):
        if out and x - out[-1][0] <= tol:
            out[-1][1].append((y0, y1))
        else:
            out.append((x, [(y0, y1)]))
    return out


def _covers(segs, y0: float, y1: float) -> bool:
    mid = (y0 + y1) / 2
    return any(a - 1 <= mid <= b + 1 for a, b in segs)


def _runs(segs, gap: float = 3) -> list[list[float]]:
    """Segments of one line joined where they touch: [[y0, y1], …]."""
    out: list[list[float]] = []
    for a, b in sorted(segs):
        if out and a - out[-1][1] < gap:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


LABELISH = re.compile(r"^(?:Q\.?\d|\d{1,2}(?:\.|\(|[a-h]\b|$)|\([a-h]\)|Question|Qu?\.?$)", re.I)


class _Table:
    """One ruled table: label column [lx0, lx1], right edge rx, column lines, and label cells."""

    def __init__(self, words, hs, groups, a, b, top: float, bottom: float):
        self.words = words
        self.lx0, self.lx1 = a[0], b[0]
        self.left_segs = [(max(y0, top), min(y1, bottom)) for y0, y1 in a[1] if min(y1, bottom) - max(y0, top) > 1]
        right = [g for g in groups if g[0] > self.lx1 + 100 and any(_overlap(s, (top, bottom)) for s in g[1])]
        self.ok = False
        if not right:
            return
        self.rx = max(g[0] for g in right)
        self.cols = [g[0] for g in groups if self.lx1 <= g[0] <= self.rx + 1 and any(_overlap(s, (top, bottom)) for s in g[1])]
        # Cell edges: rules across the label column, and where its left line starts and stops (a
        # table carried on from the page before has no top border).
        ys = [y for y, x0, x1 in hs if x0 <= self.lx0 + 4 and x1 >= self.lx1 - 4 and top - 2 <= y <= bottom + 2]
        ys = sorted(ys + [v for run in _runs(self.left_segs) for v in run])
        cuts: list[float] = []
        for y in ys:
            if not cuts or y - cuts[-1] > 2.5:
                cuts.append(y)
        self.cells = [(c, d) for c, d in zip(cuts, cuts[1:]) if d - c > 4 and _covers(self.left_segs, c, d)]
        # Row lines of the scheme column only (where several labels share one label cell).
        self.inner = sorted(y for y, x0, x1 in hs if x0 <= self.lx1 + 4 and x1 >= self.lx1 + 60 and top - 2 <= y <= bottom + 2)
        self.ok = bool(self.cells)

    def text_in(self, x0: float, x1: float, y0: float, y1: float) -> list[tuple]:
        return [w for w in self.words if x0 <= (w[0] + w[2]) / 2 <= x1 and y0 <= (w[1] + w[3]) / 2 <= y1]


def _tables(page: pymupdf.Page, known: list[tuple[float, float]] = ()) -> list[_Table]:
    """The page's scheme tables, top to bottom. `known`: label columns of earlier pages (a page
    carrying a table on may have no label and no heading in it)."""
    m = page.rotation_matrix if page.rotation else pymupdf.Identity
    words = [(*tuple(pymupdf.Rect(w[:4]) * m), *w[4:]) for w in page.get_text("words")] if page.rotation else page.get_text("words")
    hs, vs = _all_rules(page, m)
    groups = [g for g in _group_x(vs) if sum(y1 - y0 for y0, y1 in g[1]) > 40]
    found: list[_Table] = []
    for i, a in enumerate(groups):
        for b in groups[i + 1:]:
            if not 15 <= b[0] - a[0] <= 130:
                continue
            for ra in _runs(a[1]):
                for rb in _runs(b[1]):
                    top, bottom = max(ra[0], rb[0]), min(ra[1], rb[1])
                    if bottom - top < 20:
                        continue
                    # Columns side by side: no other line between them over the same stretch.
                    if any(a[0] < c[0] < b[0] and sum(max(0, min(y1, bottom) - max(y0, top)) for y0, y1 in c[1]) > (bottom - top) / 2 for c in groups):
                        continue
                    # A label column has a label or the "Question" heading in it (a page frame does not).
                    seen = any(abs(a[0] - k0) < 3 and abs(b[0] - k1) < 3 for k0, k1 in known)
                    if not seen and not any(LABELISH.match(w[4]) for w in words if a[0] < (w[0] + w[2]) / 2 < b[0] and top <= (w[1] + w[3]) / 2 <= bottom):
                        continue
                    if any(min(bottom, t.left_segs[-1][1] if t.left_segs else 0) - max(top, t.left_segs[0][0] if t.left_segs else 0) > 10 for t in found):
                        continue  # this stretch already has its table (one further left)
                    t = _Table(words, hs, groups, a, b, top, bottom)
                    if t.ok:
                        found.append(t)
    return sorted(found, key=lambda t: t.cells[0][0])


def _overlap(a, b) -> bool:
    return min(a[1], b[1]) - max(a[0], b[0]) > 5


def _lines(words) -> list[tuple[float, str]]:
    """Words grouped into lines: [(top y, text)], top to bottom."""
    out: list[list] = []
    for w in sorted(words, key=lambda w: (w[1], w[0])):
        if out and abs(w[1] - out[-1][0]) < 4:
            out[-1][1].append(w)
        else:
            out.append([w[1], [w]])
    return [(y, " ".join(v[4] for v in sorted(ws, key=lambda v: v[0]))) for y, ws in out]


# A Marks-column entry: "M1", "dM1", "A1ft", "A1cso", "M1A1ftA1", "B1*", "B1B1".
MARK_TOKEN = re.compile(r"^(?:d{0,2}[MABE]\d(?:\*|ft|cso|cao|oe|aef|awrt)*)+[,;.]?$")


def _codes(token: str) -> int:
    return sum(int(d) for d in re.findall(r"[MABE](\d)", token)) if MARK_TOKEN.match(token) else 0


def _stacked(g: "_Table", y: float) -> bool:
    """Is the number on the label line at y part of a fraction (another number right above or below)?"""
    here = [w for w in g.words if g.lx0 <= (w[0] + w[2]) / 2 <= g.lx1 and abs(w[1] - y) < 4 and re.fullmatch(r"Q?\d{1,2}\.?", w[4])]
    return any(
        abs((w[0] + w[2]) / 2 - (h[0] + h[2]) / 2) < 8 and 2 < abs(w[1] - h[1]) < 22 and re.fullmatch(r"[\d.]+", w[4])
        for h in here for w in g.words if w is not h
    )


def _parse(text: str, ctx):
    t = CONT.sub("", re.sub(r"^Q\.?\s*(?=\d)", "", text.strip(), flags=re.I))
    t = re.sub(r"\s+", "", t.replace("*", ""))
    if not t or len(t) > 14:
        return None
    t = re.sub(r"^(\d{1,2}\.?)([a-h])(?=\(|$)", r"\1(\2)", t)  # "3a(i)" → "3(a)(i)"
    if re.fullmatch(r"[a-h]|i{1,3}|iv|vi{0,3}", t):
        t = f"({t})"  # a bare "b" or "ii"
    p = normalize_label(t, ctx)
    if p and p[1] and p[1] not in PART_LETTERS:
        return None  # "(x)", "(n)": algebra in the working, not a part
    return p


def _rank(letter: str | None, roman: str | None) -> tuple:
    return (letter or "", _roman(roman))


def _roman(r: str | None) -> int:
    return {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}.get(r or "", 0)


def read_ial_maths_ms(doc: pymupdf.Document) -> MsResult:
    res = MsResult(page_count=doc.page_count, reader_version=VERSION)
    rows: list[MsRow] = []
    row: MsRow | None = None
    cur: tuple[int, str | None, str | None] | None = None  # (question, letter, roman) of the open row
    notes: str | None = None  # None | "q" (notes for the whole question) | "p" (notes under a part)
    mark_x: tuple[float, float] | None = None
    row_marks: dict[int, list[tuple]] = {}  # id(row) → marks-column words

    pending: list[tuple] = []  # unlabelled cells at the top of a page, until a label shows whose they are

    def add(r: MsRow, pi: int, g: "_Table", top: float, bottom: float) -> None:
        last = r.regions[-1] if r.regions else None
        if last and last.page == pi and abs(last.y1 - top) < 3:
            last.y1 = round(bottom, 2)
        else:
            r.regions.append(MsRegion(page=pi, x0=round(g.lx1, 2), y0=round(top, 2), x1=round(g.rx, 2), y1=round(bottom, 2)))
        if mark_x:
            row_marks.setdefault(id(r), []).extend(g.text_in(mark_x[0], mark_x[1], top, bottom))

    known: list[tuple[float, float]] = []
    for pi, page in enumerate(doc):
        labelled = False  # a label seen on this page yet
        for g in _tables(page, known):
            known.append((g.lx0, g.lx1))
            # The Marks column: under a "Mark(s)" heading, else the column with the most mark codes.
            cols = list(zip(g.cols, g.cols[1:]))
            head = next(
                # The heading is capitalised ("Marks"); "mark" in the notes' prose is not it.
                (w for w in g.words if w[4] in ("Mark", "Marks", "MARKS", "MARK") and g.lx1 < w[0] < g.rx),
                None,
            )
            if head:
                mark_x = next(((a, b) for a, b in cols if a - 2 <= (head[0] + head[2]) / 2 <= b + 2), mark_x)
            elif cols and (not mark_x or not any(abs(a - mark_x[0]) < 3 for a, _ in cols)):
                # Only a narrow column (a Notes column says "M1", "A1" too).
                counts = [(sum(1 for w in g.text_in(a, b, 0, 9999) if _codes(w[4])), (a, b)) for a, b in cols if b - a <= 90]
                best = max(counts, default=(0, None))
                mark_x = best[1] if best[0] else mark_x

            # A "Notes" heading just above a table (outside its cells): the table is notes.
            top0 = g.cells[0][0]
            if any(re.fullmatch(r"Notes?:?", w[4]) for w in g.text_in(g.lx0, g.rx, top0 - 18, top0 + 1)):
                notes = "q"
            for y0, y1 in g.cells:
                label_words = g.text_in(g.lx0, g.lx1, y0, y1)
                body = g.text_in(g.lx1, g.rx, y0, y1)
                lab_lines = _lines(label_words)
                body_text = " ".join(t for _, t in _lines(body))
                first = lab_lines[0][1] if lab_lines else ""
                if first and HEADER.match(first.split()[0]) and re.search(r"\b(Scheme|Marks?|Answer)\b", body_text):
                    # The table's header row — sometimes in one cell with the first row under it.
                    head_lines = [ln for ln in lab_lines if all(HEADER.match(w) for w in ln[1].split())] or lab_lines[:1]
                    rest = [ln for ln in lab_lines if ln not in head_lines]
                    if not rest:
                        continue
                    y0 = max(y0, max(ln[0] for ln in head_lines) + 12)
                    lab_lines = rest
                    body_text = " ".join(t for _, t in _lines(g.text_in(g.lx1, g.rx, y0, y1)))
                    first = lab_lines[0][1]
                if not lab_lines and re.fullmatch(r"\s*(?:Total\b.*\d+|[(\[]\s*\d+\s*marks?\s*[)\]]|Total\s*(?:for|marks).*)\s*", body_text, re.I):
                    continue  # the question's total line: not part of any part's scheme
                if NOTES_HEADING.match(body_text) or NOTES_HEADING.match(first + " " + body_text) or (not first and re.fullmatch(r"\s*Notes?\s*:?\s*", body_text)):
                    notes = "q"
                    continue
                if any(NOTE_ENTRY.match(t) for _, t in lab_lines) and not any(_parse(t, cur[:2] if cur else None) and re.match(r"^\s*Q?\d", t) for _, t in lab_lines):
                    # A cell of notes ("Notes", "M1: …"), perhaps with a part label of its own above.
                    notes = notes or "p"
                    continue
                # Split a cell holding more than one label (labels stacked in one merged cell).
                pieces: list[tuple[float, float, tuple | None]] = []
                starts = []
                ctx = cur[:2] if cur else None
                for y, t in lab_lines:  # "1 (a)", then "(b)", "(c)" under it: each reads against the one above
                    if (p := _parse(t, ctx)) is not None:
                        starts.append((y, p, t))
                        ctx = p[:2]
                if not starts:
                    pieces.append((y0, y1, None))
                else:
                    # The first label owns the cell from its top (labels may sit mid-row); the next one
                    # starts at the scheme column's last row line above it.
                    edges = [y0]
                    for k in range(1, len(starts)):
                        above = [v for v in g.inner if starts[k - 1][0] + 4 < v <= starts[k][0] + 2]
                        edges.append(above[-1] if above else starts[k][0] - 2)
                    edges.append(y1)
                    for k, (y, p, t) in enumerate(starts):
                        pieces.append((edges[k], edges[k + 1], p, t, y))
                for top, bottom, p, *lt in pieces:
                    if p is not None:
                        q, letter, roman = p
                        prev = cur[0] if cur else 0
                        if re.fullmatch(r"\s*Q?\d{1,2}\s*", lt[0]):
                            # A bare number is only the next question, and not a number in a fraction.
                            ok = q in (prev, prev + 1) and not _stacked(g, lt[1])
                        else:
                            ok = prev <= q <= prev + 3 if cur else q <= 3
                        if not ok:
                            p = None  # not a label after all (a number in the working)
                    if p is not None:
                        q, letter, roman = p
                        prev_row = row
                        if notes:
                            later = cur is None or q > cur[0] or (q == cur[0] and _rank(letter, roman) > _rank(cur[1], cur[2]))
                            if notes == "q" and not (q > (cur[0] if cur else 0)):
                                continue  # a part label inside the notes for the whole question
                            if notes == "p" and not later:
                                continue
                            notes = None
                        lab = label_text(q, letter, roman)
                        existing = next((r for r in rows if r.label == lab), None)
                        if existing is None:
                            row = MsRow(label=lab, question=q, part=part_label(letter, roman))
                            rows.append(row)
                        else:
                            row = existing  # the same label again ("2(a) continued")
                        cur = (q, letter, roman)
                        # Unlabelled rows at the top of the page lead into a new question ("Allow column
                        # vectors …" above 7(a)); otherwise they finish the row above.
                        for cell in pending:
                            add(row if existing is None and (prev_row is None or q > prev_row.question) else prev_row or row, *cell)
                        pending.clear()
                        labelled = True
                    elif notes or row is None:
                        continue
                    elif not labelled:
                        pending.append((pi, g, top, bottom))
                        continue
                    add(row, pi, g, top, bottom)
        for cell in pending:
            if row is not None:
                add(row, *cell)
        pending.clear()

    info = []
    for r in rows:
        ws = sorted(row_marks.get(id(r), []), key=lambda w: (w[1], w[0]))
        totals = [int(m.group(1)) for w in ws if (m := PART_TOTAL.match(w[4]))]
        # Codes down to the row's first total: an alternative method ("Aliter") below repeats them.
        first = next((w for w in ws if PART_TOTAL.match(w[4])), None)
        codes = sum(_codes(w[4]) for w in ws if first is None or w[1] <= first[1] + 3)
        info.append((totals, codes))
    for k, r in enumerate(rows):
        totals, codes = info[k]
        last_part = r.part is not None and (k + 1 == len(rows) or rows[k + 1].question != r.question)
        before = [rows[j].marks for j in range(k) if rows[j].question == r.question]
        # Sub-parts (i), (ii) above with no total of their own, which this total covers too.
        sibs = []
        for j in range(k - 1, -1, -1):
            o = rows[j]
            if o.question != r.question or not r.part or not o.part or o.part[:1] != r.part[:1] or info[j][0]:
                break
            sibs.append(info[j][1])
        if codes and codes in totals:
            r.marks = codes
        elif totals and sibs and codes and sum(sibs) + codes == totals[0]:
            r.marks = codes
        elif totals and not (last_part and codes and len(totals) == 1 and before and None not in before and sum(before) + codes == totals[0]):
            r.marks = totals[0]
        else:
            # A question's last part with only the question's total under it (the parts add up to
            # it): its own codes.
            r.marks = codes or (totals[0] if totals else None)
    res.rows = [r for r in rows if r.regions]
    return res
