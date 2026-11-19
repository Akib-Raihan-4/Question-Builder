"""Read a mark scheme: one row per question part, as regions on the mark scheme PDF.

Edexcel mark schemes are ruled tables:  Question Number | Answer (| Guidance) | Mark
with one row per part, labelled "1(a)(i)" (or "1 (a)", "1", "(b)" under the same question).
We find, on every page with such a table:
  - the label column (from the "Question" header to the first vertical rule right of it),
  - row boundaries (horizontal rules crossing the label column; if a table has none, the top
    of each label),
  - the table's right edge (rightmost vertical rule).
A row's region runs from its top boundary to the next one, from the label column's right edge
to the table's right edge — so the old label is not in the crop (we print our own). A row that
continues onto the next page gets a second region there (the unlabelled first row under the
repeated header). "Total for question N" rows end a question and are not cropped.

Coordinates: PDF points, top-left origin, 0-based pages (same as question regions).
"""
from __future__ import annotations

import re

import pymupdf
from pydantic import BaseModel, Field

VERSION = "1.2.0"
LABEL = re.compile(r"^(\d{1,2})?((?:\([a-z]{1,2}\))*)((?:\([ivx]+\))*)\*?$")


class MsRegion(BaseModel):
    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class MsRow(BaseModel):
    label: str  # "1(a)(i)"
    question: int  # 1
    part: str | None  # "a(i)" — our part label format; None = the whole question
    regions: list[MsRegion] = Field(default_factory=list)
    marks: int | None = None  # the row's total from the Mark column, when printed


class MsResult(BaseModel):
    reader_version: str = VERSION
    status: str = "ok"  # "ok" | "failed"
    reason: str | None = None
    page_count: int
    rows: list[MsRow] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


ROMAN = re.compile(r"^(?:i{1,3}|iv|vi{0,3}|ix|x)$")


def normalize_label(text: str, current: tuple[int, str | None] | None) -> tuple[int, str | None, str | None] | None:
    """Read a row label into (question, letter, roman).

    '1(a)(i)' → (1, 'a', 'i');  '1 (a)' → (1, 'a', None);  '4' → (4, None, None);
    '(b)' under question 3 → (3, 'b', None);  '(ii)' under 2(a) → (2, 'a', 'ii').
    `current` is the (question, letter) of the row above, for labels that leave them out.
    """
    t = re.sub(r"\s+", "", text).rstrip(".*")
    m = re.fullmatch(r"(\d{1,2})?((?:\([a-z]{1,4}\))*)", t)
    if not m:
        # Without brackets: "1a", "1aii".
        m2 = re.fullmatch(r"(\d{1,2})([a-h])?((?:i{1,3}|iv|vi{0,3}|ix|x))?", t)
        if not m2:
            return None
        num, letter, roman = m2.groups()
        return int(num), letter, roman
    num_s, groups_s = m.groups()
    groups = re.findall(r"\(([a-z]{1,4})\)", groups_s)
    if not num_s and not groups:
        return None
    if num_s:
        num = int(num_s)
        prev_letter = None
    elif current:
        num, prev_letter = current
    else:
        return None
    # A lone Roman numeral first ("4 (i)", or "(ii)" after "4 (i)") is a part on its own when the
    # question has no letters (Maths B: parts (i), (ii)); under a letter it nests: 2(a)(ii).
    if groups and ROMAN.match(groups[0]) and (len(groups[0]) > 1 or groups[0] == "i") and not (prev_letter and not ROMAN.match(prev_letter)):
        return num, None, groups[0]
    letter = roman = None
    for g in groups:
        if letter is None and roman is None and not (ROMAN.match(g) and g != "i" and prev_letter) and len(g) <= 2 and not (ROMAN.match(g) and len(g) > 1):
            letter = g  # first group: the letter ("i" alone counts as a letter only when nothing came before)
        elif ROMAN.match(g):
            roman = g
    if roman and not letter and not num_s:
        letter = prev_letter  # "(ii)" continues the part above: 2(a)(ii)
    if not num_s and groups and letter == "i" and prev_letter:
        letter, roman = prev_letter, "i"  # "(i)" under 2(a) is 2(a)(i)
    return num, letter, roman


def label_text(q: int, letter: str | None, roman: str | None) -> str:
    return f"{q}" + (f"({letter})" if letter else "") + (f"({roman})" if roman else "")


def part_label(letter: str | None, roman: str | None) -> str | None:
    """Our part label format: 'a', 'b(i)', or 'ii' for a part numbered only in Roman; None = the whole question."""
    if not letter and not roman:
        return None
    if not letter:
        return roman
    return letter + (f"({roman})" if roman else "")


def _rules(page: pymupdf.Page, m: pymupdf.Matrix | None = None):
    """Horizontal and vertical rules (lines or thin rectangles), in display space (see `m`)."""
    m = m or pymupdf.Identity
    hs, vs = [], []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1] * m, it[2] * m
                if abs(a.y - b.y) < 0.8 and abs(a.x - b.x) > 20:
                    hs.append((a.y, min(a.x, b.x), max(a.x, b.x)))
                elif abs(a.x - b.x) < 0.8 and abs(a.y - b.y) > 8:
                    vs.append((a.x, min(a.y, b.y), max(a.y, b.y)))
            elif it[0] == "re":
                r = pymupdf.Rect(it[1]) * m
                if r.height < 2.5 and r.width > 20:
                    hs.append(((r.y0 + r.y1) / 2, r.x0, r.x1))
                elif r.width < 2.5 and r.height > 8:
                    vs.append(((r.x0 + r.x1) / 2, r.y0, r.y1))
    return hs, vs


def line_text(ws: list) -> str:
    """Words read line by line, left to right (words on one line can differ by a point or two in y)."""
    lines: list[list] = []
    for w in sorted(ws, key=lambda w: w[1]):
        if lines and abs(w[1] - lines[-1][0][1]) < 4:
            lines[-1].append(w)
        else:
            lines.append([w])
    return " ".join(" ".join(x[4] for x in sorted(ln, key=lambda x: x[0])) for ln in lines)


def _join_horizontal(hs: list[tuple]) -> list[tuple]:
    """Rules drawn as one short piece per column, at the same height and touching end to end,
    become one rule (so a rule split at the column lines still crosses the Question column)."""
    out: list[list[float]] = []
    for y, x0, x1 in sorted(hs, key=lambda h: (round(h[0]), h[1])):
        last = out[-1] if out else None
        if last and abs(last[0] - y) < 1.0 and x0 <= last[2] + 3:
            last[2] = max(last[2], x1)
        else:
            out.append([y, x0, x1])
    return [tuple(h) for h in out]


def _merge(ys: list[float], tol: float = 1.5) -> list[float]:
    out: list[float] = []
    for y in sorted(ys):
        if not out or y - out[-1] > tol:
            out.append(y)
    return out


HEADINGS = ("answer", "mark", "working", "acceptable", "notes")


def _headers(words) -> list[tuple]:
    """Table header cells: a "Question" word with "Answer"/"Mark"/"Working"… further right on the
    same band. (Guidance prose that mentions "question number" has no such headings beside it.)"""
    out = []
    for w in words:
        if w[4].lower() != "question":
            continue
        mid = (w[1] + w[3]) / 2
        if any(v[4].lower().rstrip("s") in HEADINGS and abs((v[1] + v[3]) / 2 - mid) < 22 and v[0] > w[2] + 30 for v in words):
            number = next((v for v in words if v[4].lower() in ("number", "no", "no.") and abs(v[0] - w[0]) < 15 and 0 < v[1] - w[1] < 20), None)
            out.append((w, max(w[3], number[3] if number else 0)))
    return sorted(out, key=lambda h: h[0][1])


def read_mark_scheme(data: bytes) -> MsResult:
    doc = pymupdf.open(stream=data, filetype="pdf")
    res = MsResult(page_count=doc.page_count)
    if sum(len(p.get_text().strip()) for p in doc) < 20:
        res.status, res.reason = "failed", "No text layer — this looks like a scan; mark its rows by hand."
        return res

    rows: list[MsRow] = []
    state = {"current": None, "context": None}  # row being filled; (question, letter) of the row above
    label_x: tuple[float, float] | None = None  # label column, carried to pages without a header
    mark_col: tuple[float, float] | None = None  # Mark column, carried the same way

    def segment(pi, page, words, hs, vs, y_lo, y_hi, header_bottom, lx0, lx1, has_header, ink=(), mark_col=None) -> bool:
        # On a page without its own header, read marks only where the Mark column's rules are
        # exactly where they were on the header page.
        page_vs = {round(v[0]) for v in vs if v[2] > y_lo and v[1] < y_hi}
        mark_trusted = bool(mark_col) and all(any(abs(x - m) <= 3 for x in page_vs) for m in (mark_col or ()))
        """Rows of one table (or the continuation of one) between y_lo and y_hi. False = no table here."""
        in_band = lambda y: y_lo - 1 <= y <= y_hi + 1  # noqa: E731
        seg_vs = [v for v in vs if v[2] > y_lo and v[1] < y_hi]
        table_right = max([v[0] for v in seg_vs if v[0] > lx1] or [page.rect.width - 40])
        # The Mark column: found from its heading ("Mark"), else the last two vertical rules (or the
        # table's last ~45 pt). Maths B tables have a Notes column after it.
        cols = sorted({round(v[0]) for v in seg_vs if v[0] > lx1 + 20})
        if mark_col:
            mark_left, mark_right = mark_col
        else:
            mark_left = cols[-2] if len(cols) >= 2 and table_right - cols[-2] < 90 else table_right - 45
            mark_right = table_right + 5
        bounds = _merge([y for (y, x0, x1) in hs if x0 <= lx0 + 6 and x1 >= min(lx1 - 6, lx0 + 25) and in_band(y)])
        below = [y for y in bounds if y > header_bottom - 3]  # the rule under the header row starts the first row
        label_words = [w for w in words if w[0] >= lx0 - 1 and w[2] <= lx1 + 2 and header_bottom < (w[1] + w[3]) / 2 < y_hi]
        col_lines = all(any(abs(x - c) <= 3 for x in page_vs) for c in (lx0, lx1))
        if not has_header and len(below) < 2 and not (col_lines and label_words):
            return False  # no table here (unless its column lines carry on, with labels in them)
        first_label = min((w[1] for w in label_words), default=None)
        unruled = len(below) < 2 or (first_label is not None and not any(b > first_label + 2 for b in below))
        if unruled:
            # No ruled rows (or rules only around the header): start a row at each label line.
            lines: dict[int, list] = {}
            for w in label_words:
                lines.setdefault(round(w[1] / 3), []).append(w)
            tops = sorted(min(x[1] for x in ws) - 3 for ws in lines.values())
            content_bottom = max([w[3] for w in words if w[0] > lx1 and w[3] < y_hi] or [y_hi - 3]) + 3
            below = _merge([header_bottom + 2, *tops, content_bottom], tol=4)
        mid = lambda w: (w[1] + w[3]) / 2  # noqa: E731 — text boxes poke a little above their row's rule

        # Some tables rule only around a whole question, with its parts (a), (b) … stacked in one
        # box: split such a box at every further label line.
        def split_at_labels(top: float, bottom: float) -> list[tuple[float, float]]:
            ws = sorted((w for w in label_words if top < mid(w) < bottom), key=lambda w: w[1])
            lines: list[list] = []
            for w in ws:
                if lines and abs(w[1] - lines[-1][0][1]) < 4:
                    lines[-1].append(w)
                else:
                    lines.append([w])
            starts = [min(x[1] for x in ln) - 3 for ln in lines[1:]
                      if normalize_label(" ".join(x[4] for x in sorted(ln, key=lambda x: x[0])), (1, "a")) is not None]
            cuts = [top, *[y for y in starts if top + 6 < y < bottom - 6], bottom]
            return list(zip(cuts, cuts[1:]))

        intervals = [iv for top, bottom in zip(below, below[1:]) for iv in split_at_labels(top, bottom)]
        for top, bottom in intervals:
            if bottom - top < 4:
                continue
            text = line_text([w for w in label_words if top < mid(w) < bottom])
            body = " ".join(w[4] for w in sorted((w for w in words if top < mid(w) < bottom), key=lambda w: (round(w[1]), w[0])))
            inside = [w for w in words if top < mid(w) < bottom and w[0] > lx1]
            # Trim a tall row's empty bottom (keep a little room under the last thing in it).
            # Drawings and images count too (example diagrams, graphs); table rules don't.
            art = [r.y1 for r in ink if r.x0 >= lx1 - 1 and top < r.y1 and r.y0 < bottom - 2]
            last = max([w[3] for w in inside] + [min(y, bottom) for y in art] or [top])
            y1 = min(bottom - 0.5, last + 8) if bottom - last > 30 else bottom - 0.5
            region = MsRegion(page=pi, x0=round(lx1 + 1, 1), y0=round(top + 0.5, 1), x1=round(table_right - 0.5, 1), y1=round(y1, 1))
            # The row's total in the Mark column: "2", or "(2)" on some papers.
            totals = [w for w in inside if mark_left - 2 <= w[0] and w[2] <= mark_right + 2 and re.fullmatch(r"\(?\d{1,2}\)?", w[4])]
            row_marks = int(sorted(totals, key=lambda w: w[1])[-1][4].strip("()")) if totals else None
            if not has_header and mark_col and not mark_trusted:
                row_marks = None  # this page's table has other columns (e.g. an alternative-methods box)
            if re.match(r"^\s*total\b", text, re.I) or re.match(r"^\s*total for question", body, re.I):
                state["current"] = None  # question total row: ends the question, not cropped
                continue
            if re.fullmatch(r"\s*question\s*(number|no\.?)?\s*", text, re.I):
                continue  # a repeated header row
            parsed = normalize_label(text, state["context"]) if text.strip() else None
            # Question numbers only go up, a little at a time (axis numbers on a graph, "30 25 20",
            # aren't questions). The first one is 1–3.
            if parsed:
                cq = state["context"][0] if state["context"] else None
                if (cq is None and parsed[0] > 3) or (cq is not None and not (cq <= parsed[0] <= cq + 3)):
                    parsed = None
            if parsed:
                q, letter, roman = parsed
                state["context"] = (q, letter)
                state["current"] = MsRow(label=label_text(q, letter, roman), question=q, part=part_label(letter, roman), regions=[region], marks=row_marks)
                rows.append(state["current"])
            elif not text.strip() and state["current"] is not None:
                if inside:  # the row continues (usually onto a new page); empty strips are skipped
                    state["current"].regions.append(region)
                    if row_marks is not None and state["current"].marks is None:
                        state["current"].marks = row_marks
            elif text.strip() and state["current"] is not None and inside:
                # Not a label (e.g. a "Method 1 / Method 2" box running across the table): it
                # belongs to the row above.
                state["current"].regions.append(region)
                if row_marks is not None and state["current"].marks is None:
                    state["current"].marks = row_marks
            elif text.strip() and rows:  # before the first real label: guidance pages, not rows
                res.warnings.append(f"Page {pi + 1}: couldn't read the label {text!r}")
        return True

    for pi, page in enumerate(doc):
        # Some mark schemes store landscape pages rotated: work in the page as displayed (that's
        # also how the app renders crops), so rotated pages read like any other.
        m = page.rotation_matrix if page.rotation else pymupdf.Identity
        words = [(*tuple(pymupdf.Rect(w[:4]) * m), *w[4:]) for w in page.get_text("words")] if page.rotation else page.get_text("words")
        hs, vs = _rules(page, m)
        # Drawn things that aren't table rules (diagrams, graphs) and images.
        ink = [pymupdf.Rect(d["rect"]) * m for d in page.get_drawings()]
        ink = [r for r in ink if not (r.height < 2.5 or r.width < 2.5)]
        ink += [pymupdf.Rect(i["bbox"]) * m for i in page.get_image_info()]
        headers = _headers(words)
        H = page.rect.height
        # The part above the first header continues the previous page's table.
        first_top = headers[0][0][1] - 4 if headers else H
        if label_x is not None and first_top > 20:
            # The table carries on from the last page; its columns may be drawn a little differently
            # here (narrower Question column), so measure them from this page's rules if possible.
            top_vs = sorted({round(v[0], 1) for v in vs if v[1] < first_top})

            def nearest(x: float, within: float) -> float | None:
                best = min(top_vs, key=lambda v: abs(v - x), default=None)
                return best if best is not None and abs(best - x) < within else None

            lft = nearest(label_x[0], 15)
            if lft is not None:
                right_side = [v for v in top_vs if v > lft + 15]
                rgt = min(right_side, key=lambda v: abs(v - label_x[1]), default=None)
                if rgt is not None and abs(rgt - label_x[1]) < 40:
                    label_x = (lft, rgt)

            if not segment(pi, page, words, hs, vs, 0, first_top, 0.0, *label_x, has_header=False, ink=ink, mark_col=mark_col) and not headers:
                label_x, state["current"] = None, None  # no header and no table rules: the table has ended
        elif label_x is None and not headers:
            continue  # before the table starts (cover, guidance pages)
        for k, (hw, header_bottom) in enumerate(headers):
            y_lo = hw[1] - 4
            y_hi = headers[k + 1][0][1] - 4 if k + 1 < len(headers) else H
            band_vs = [v for v in vs if v[2] > y_lo and v[1] < y_hi]
            right_of = [v[0] for v in band_vs if hw[2] - 2 < v[0] < hw[2] + 80]
            nxt = sorted(w[0] for w in words if abs(w[1] - hw[1]) < 8 and w[0] > hw[2] + 5)
            # The column's left rule: the nearest one left of the heading (headings may be centred).
            left = max([v[0] for v in band_vs if hw[0] - 60 < v[0] < hw[0] + 2] or [hw[0] - 5])
            col_right = min(right_of) if right_of else (nxt[0] - 3 if nxt else hw[2] + 20)
            label_x = (left, col_right)
            mw = next((w for w in words if w[4].lower() in ("mark", "marks") and abs(w[1] - hw[1]) < 22 and w[0] > col_right), None)
            if mw:
                xs = sorted({v[0] for v in band_vs})
                lft = max([x for x in xs if x < mw[0] + 2] or [mw[0] - 20])
                rgt = min([x for x in xs if x > mw[2] - 2] or [mw[2] + 30])
                mark_col = (lft, rgt)
            else:
                mark_col = None
            segment(pi, page, words, hs, vs, y_lo, y_hi, header_bottom, *label_x, has_header=True, ink=ink, mark_col=mark_col)

    if not rows:
        res.status, res.reason = "failed", "No mark scheme table found (looked for a 'Question Number' column)."
    res.rows = rows
    return res


__all__ = ["MsResult", "MsRow", "MsRegion", "read_mark_scheme", "normalize_label", "part_label", "label_text"]
