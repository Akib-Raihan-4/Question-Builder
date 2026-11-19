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

VERSION = "1.0.0"
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
    """Our part label format: 'a', 'b(i)'; None = the whole question."""
    if not letter and not roman:
        return None
    return (letter or "") + (f"({roman})" if roman else "")


def _rules(page: pymupdf.Page):
    """Horizontal and vertical rules (lines or thin rectangles)."""
    hs, vs = [], []
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1], it[2]
                if abs(a.y - b.y) < 0.8 and abs(a.x - b.x) > 20:
                    hs.append((a.y, min(a.x, b.x), max(a.x, b.x)))
                elif abs(a.x - b.x) < 0.8 and abs(a.y - b.y) > 8:
                    vs.append((a.x, min(a.y, b.y), max(a.y, b.y)))
            elif it[0] == "re":
                r = it[1]
                if r.height < 2.5 and r.width > 20:
                    hs.append(((r.y0 + r.y1) / 2, r.x0, r.x1))
                elif r.width < 2.5 and r.height > 8:
                    vs.append(((r.x0 + r.x1) / 2, r.y0, r.y1))
    return hs, vs


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

    def segment(pi, page, words, hs, vs, y_lo, y_hi, header_bottom, lx0, lx1, has_header, ink=()) -> bool:
        """Rows of one table (or the continuation of one) between y_lo and y_hi. False = no table here."""
        in_band = lambda y: y_lo - 1 <= y <= y_hi + 1  # noqa: E731
        seg_vs = [v for v in vs if v[2] > y_lo and v[1] < y_hi]
        table_right = max([v[0] for v in seg_vs if v[0] > lx1] or [page.rect.width - 40])
        bounds = _merge([y for (y, x0, x1) in hs if x0 <= lx0 + 6 and x1 >= lx1 - 6 and in_band(y)])
        below = [y for y in bounds if y > header_bottom - 3]  # the rule under the header row starts the first row
        label_words = [w for w in words if w[0] >= lx0 - 1 and w[2] <= lx1 + 2 and header_bottom < (w[1] + w[3]) / 2 < y_hi]
        if not has_header and len(below) < 2:
            return False
        if len(below) < 2:
            # No ruled rows: start a row at each label line.
            lines: dict[int, list] = {}
            for w in label_words:
                lines.setdefault(round(w[1] / 3), []).append(w)
            tops = sorted(min(x[1] for x in ws) - 3 for ws in lines.values())
            content_bottom = max([w[3] for w in words if w[0] > lx1 and w[3] < y_hi] or [y_hi - 3]) + 3
            below = _merge([header_bottom + 2, *tops, content_bottom], tol=4)
        mid = lambda w: (w[1] + w[3]) / 2  # noqa: E731 — text boxes poke a little above their row's rule
        for top, bottom in zip(below, below[1:]):
            if bottom - top < 4:
                continue
            text = " ".join(w[4] for w in sorted((w for w in label_words if top < mid(w) < bottom), key=lambda w: (round(w[1]), w[0])))
            body = " ".join(w[4] for w in sorted((w for w in words if top < mid(w) < bottom), key=lambda w: (round(w[1]), w[0])))
            inside = [w for w in words if top < mid(w) < bottom and w[0] > lx1]
            # Trim a tall row's empty bottom (keep a little room under the last thing in it).
            # Drawings and images count too (example diagrams, graphs); table rules don't.
            art = [r.y1 for r in ink if r.x0 >= lx1 - 1 and top < r.y1 and r.y0 < bottom - 2]
            last = max([w[3] for w in inside] + [min(y, bottom) for y in art] or [top])
            y1 = min(bottom - 0.5, last + 8) if bottom - last > 30 else bottom - 0.5
            region = MsRegion(page=pi, x0=round(lx1 + 1, 1), y0=round(top + 0.5, 1), x1=round(table_right - 0.5, 1), y1=round(y1, 1))
            if re.match(r"^\s*total\b", text, re.I) or re.match(r"^\s*total for question", body, re.I):
                state["current"] = None  # question total row: ends the question, not cropped
                continue
            if re.fullmatch(r"\s*question\s*(number|no\.?)?\s*", text, re.I):
                continue  # a repeated header row
            parsed = normalize_label(text, state["context"]) if text.strip() else None
            if parsed:
                q, letter, roman = parsed
                state["context"] = (q, letter)
                state["current"] = MsRow(label=label_text(q, letter, roman), question=q, part=part_label(letter, roman), regions=[region])
                rows.append(state["current"])
            elif not text.strip() and state["current"] is not None:
                if inside:  # the row continues (usually onto a new page); empty strips are skipped
                    state["current"].regions.append(region)
            elif text.strip() and rows:  # before the first real label: guidance pages, not rows
                res.warnings.append(f"Page {pi + 1}: couldn't read the label {text!r}")
        return True

    for pi, page in enumerate(doc):
        words = page.get_text("words")
        hs, vs = _rules(page)
        # Drawn things that aren't table rules (diagrams, graphs) and images.
        ink = [d["rect"] for d in page.get_drawings() if not (d["rect"].height < 2.5 or d["rect"].width < 2.5)]
        ink += [pymupdf.Rect(i["bbox"]) for i in page.get_image_info()]
        headers = _headers(words)
        H = page.rect.height
        # The part above the first header continues the previous page's table.
        first_top = headers[0][0][1] - 4 if headers else H
        if label_x is not None and first_top > 20:
            if not segment(pi, page, words, hs, vs, 0, first_top, 0.0, *label_x, has_header=False, ink=ink) and not headers:
                label_x, state["current"] = None, None  # no header and no table rules: the table has ended
        elif label_x is None and not headers:
            continue  # before the table starts (cover, guidance pages)
        for k, (hw, header_bottom) in enumerate(headers):
            y_lo = hw[1] - 4
            y_hi = headers[k + 1][0][1] - 4 if k + 1 < len(headers) else H
            band_vs = [v for v in vs if v[2] > y_lo and v[1] < y_hi]
            right_of = [v[0] for v in band_vs if hw[2] - 2 < v[0] < hw[2] + 80]
            nxt = sorted(w[0] for w in words if abs(w[1] - hw[1]) < 8 and w[0] > hw[2] + 5)
            left = min([v[0] for v in band_vs if hw[0] - 30 < v[0] < hw[0] + 2] or [hw[0] - 5])
            col_right = min(right_of) if right_of else (nxt[0] - 3 if nxt else hw[2] + 20)
            label_x = (left, col_right)
            segment(pi, page, words, hs, vs, y_lo, y_hi, header_bottom, *label_x, has_header=True, ink=ink)

    if not rows:
        res.status, res.reason = "failed", "No mark scheme table found (looked for a 'Question Number' column)."
    res.rows = rows
    return res


__all__ = ["MsResult", "MsRow", "MsRegion", "read_mark_scheme", "normalize_label", "part_label", "label_text"]
