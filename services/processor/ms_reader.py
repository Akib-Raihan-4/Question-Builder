"""Read a mark scheme: one row per question part, as regions on the mark scheme PDF.

Edexcel mark schemes (IGCSE, IAL, GCSE, A level) are ruled tables:
    Question (Number) | Answer / Working (| Notes, Guidance) | Mark
The left (Question) column decides the rows:
  - every new label ("1(a)(i)", "1 (a)", "4", "(b)" under the same question) starts a row;
  - a row runs until the next label — across as many pages as it needs, one region per page;
  - a row starts at the horizontal rule just above its label;
  - on a page without its own label, the open row carries on from just under the header;
  - a row's last region on a page ends at the table's last rule (or the end of its content when
    the table is ruled only round the header);
  - "Total for question 4" / "Total 4 marks" lines are left out; an "Alternative" method or "NB"
    note under the total still belongs to the question until the next label;
  - left-column text that isn't the next label ("Method 2", "Alt") doesn't start a row.
Regions run from the label column's right edge to the table's right edge, so the printed label
isn't in the crop (we print our own). Marks come from the Mark column.

Coordinates: PDF points, top-left origin, 0-based pages, display space (rotated pages turned).
"""
from __future__ import annotations

import re

import pymupdf
from pydantic import BaseModel, Field

VERSION = "2.0.0"
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
    t = re.sub(r"^(\d{1,2})\.(?=\(|[a-z]|$)", r"\1", t)  # "1.(a)", "2. (b)", "3."
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


HEADINGS = ("answer", "mark", "working", "acceptable", "note", "scheme", "guidance", "solution")


def _headers(words) -> list[tuple]:
    """Table header cells: a "Question" (or "Q") word with "Answer"/"Mark"/"Scheme"… further right on
    the same band. (Guidance prose that mentions "question number" has no such headings beside it.)"""
    out = []
    for w in words:
        word = w[4].lower().rstrip(".")
        if word not in ("question", "questio", "q", "qn", "qu"):  # ("Questio n": broken over two lines)
            continue
        mid = (w[1] + w[3]) / 2
        if any(abs((v[1] + v[3]) / 2 - mid) < 4 and v[2] <= w[0] and w[0] - v[2] < 60 for v in words):
            continue  # a header cell starts its line; "This question is …" is answer text
        beside = {v[4].lower().rstrip("s") for v in words if v[4].lower().rstrip("s") in HEADINGS and abs((v[1] + v[3]) / 2 - mid) < 22 and v[0] > w[2] + 30}
        if word not in ("question", "questio"):
            # A bare "Q" (also a maths letter) only as a header line: a capital, and nothing on its
            # line but headings.
            line = [v for v in words if abs((v[1] + v[3]) / 2 - mid) < 4 and v is not w]
            if not w[4][0].isupper() or len(beside) < 2 or any(v[4].lower().rstrip("s") not in HEADINGS + ("additional", "number", "no", "no.") for v in line):
                continue
        if beside:
            number = next((v for v in words if v[4].lower() in ("number", "no", "no.") and abs(v[0] - w[0]) < 15 and 0 < v[1] - w[1] < 20), None)
            out.append((w, max(w[3], number[3] if number else 0)))
    return sorted(out, key=lambda h: h[0][1])


def _columns(band: list, tol: float = 4) -> list[float]:
    """The x of each column line (lines a few points apart, like a double border, count once)."""
    out: list[float] = []
    for x in sorted(v[0] for v in band if v[2] - v[1] > 20):
        if not out or x - out[-1] > tol:
            out.append(x)
    return out


def _clean_label(text: str, ctx):
    """A label as printed, without "cont"/"continued" and the * that marks quality-of-writing parts."""
    t = re.sub(r"\s*cont(inued|\.|'d)?\s*$", "", text.strip(), flags=re.I).lstrip("*").replace("*", "")
    return normalize_label(t, ctx)


TOTAL_LINE = re.compile(r"^total\s*(for\s+(question|q)\b|:?\s*\(?\d+\)?\s*(marks?)?\s*$)", re.I)
MARK_CODE = re.compile(r"(?:^|[^A-Za-z])d?[MABCEP](\d)(?=ft|cao|oe|\W|[MABCEP]|$)")
FOLLOW_ON = re.compile(r"(alt|alternative|method|nb|note|special|sc)\b")


def read_mark_scheme(data: bytes) -> MsResult:
    doc = pymupdf.open(stream=data, filetype="pdf")
    res = MsResult(page_count=doc.page_count)
    if sum(len(p.get_text().strip()) for p in doc) < 20:
        res.status, res.reason = "failed", "No text layer — this looks like a scan; mark its rows by hand."
        return res

    rows: list[MsRow] = []
    current: MsRow | None = None  # the open row: it runs until the next label
    ctx: tuple[int, str | None] | None = None  # (question, letter) of the last label
    label_x: tuple[float, float] | None = None  # label column, carried to pages without a header
    ended_x: tuple[float, float] | None = None  # the label column of a table that seemed to end
    mark_col: tuple[float, float] | None = None  # Mark column, from its heading
    cols_at_header: list[float] = []  # the table's column lines where the Mark heading was read
    after_total: set[int] = set()  # rows whose "Total" line has been passed (marks settled)
    settled: set[int] = set()  # rows reopened by a repeated label (marks settled)

    for pi, page in enumerate(doc):
        # Work in display space: rotated (landscape) pages are read the way they are seen.
        m = page.rotation_matrix if page.rotation else pymupdf.Identity
        words = [(*tuple(pymupdf.Rect(w[:4]) * m), *w[4:]) for w in page.get_text("words")] if page.rotation else page.get_text("words")
        hs, vs = _rules(page, m)
        # A header needs real table lines beside it (guidance prose can say "question" and "mark").
        headers = [h for h in _headers(words) if any(abs(v[0] - h[0][0]) < 70 and v[1] - 30 < h[0][1] < v[2] + 30 for v in vs)]
        H = page.rect.height

        # Table segments on this page: the part above the first header continues the last page's
        # table; then one segment per header.  (y_lo, y_hi, header_bottom, lx0, lx1, has_header, mark_col)
        segs = []
        first_top = headers[0][0][1] - 4 if headers else H
        if label_x is None and ended_x is not None and not headers:
            # A page between tables (a diagram, notes) and then the table again without its header:
            # it resumes where its label column's lines are.
            xs = [v[0] for v in vs if v[2] - v[1] > 20]
            if all(any(abs(x - c) <= 3 for x in xs) for c in ended_x):
                label_x = ended_x
        if label_x is not None and first_top > 20:
            # Columns may be drawn a little differently here: re-measure them from this page's rules.
            top_vs = sorted({round(v[0], 1) for v in vs if v[1] < first_top})
            lft = min(top_vs, key=lambda v: abs(v - label_x[0]), default=None)
            if lft is not None and abs(lft - label_x[0]) < 15:
                rgt = min([v for v in top_vs if v > lft + 15], key=lambda v: abs(v - label_x[1]), default=None)
                if rgt is not None and abs(rgt - label_x[1]) < 40:
                    label_x = (lft, rgt)
            segs.append((0, first_top, 0.0, *label_x, False, None))
        for k, (hw, hb) in enumerate(headers):
            y_lo = hw[1] - 4
            y_hi = headers[k + 1][0][1] - 4 if k + 1 < len(headers) else H
            band = [v for v in vs if v[2] > y_lo and v[1] < y_hi]
            right_of = [v[0] for v in band if hw[2] - 2 < v[0] < hw[2] + 80]
            nxt = sorted(w[0] for w in words if abs(w[1] - hw[1]) < 8 and w[0] > hw[2] + 5)
            # The column's left rule: the nearest one left of the heading (headings may be centred).
            left = max([v[0] for v in band if hw[0] - 60 < v[0] < hw[0] + 2] or [hw[0] - 5])
            col_right = min(right_of) if right_of else (nxt[0] - 3 if nxt else hw[2] + 20)
            # Question number and part in two narrow columns ("1" | "(a)"): the label is both.
            nxt_v = min([v[0] for v in band if col_right + 8 < v[0] < col_right + 45], default=None)
            if nxt_v is not None:
                inside = [w for w in words if w[0] >= col_right - 1 and w[2] <= nxt_v + 1 and y_lo < w[1] < y_hi]
                # …only when that narrow column holds nothing but part labels: "(a)", "(ii)", "b".
                if inside and all(re.fullmatch(r"\(?[a-z]{1,4}\)?", w[4]) for w in inside):
                    col_right = nxt_v
            label_x = (left, col_right)
            mw = min((w for w in words if w[4].lower() in ("mark", "marks") and abs(w[1] - hw[1]) < 22 and w[0] > col_right),
                     key=lambda w: abs(w[1] - hw[1]), default=None)  # the heading on the header's line, not prose above it
            mc = None
            if mw:  # only the rules that cross the "Mark" heading (or the first row under it) bound its column
                ym = (mw[1] + mw[3]) / 2
                # (some header rows are drawn without all their column lines: the first row has them)
                xs = sorted({v[0] for v in band if v[1] < ym < v[2] or v[1] < hb + 8 < v[2]})
                mc = (max([x for x in xs if x < mw[0] + 2] or [mw[0] - 20]), min([x for x in xs if x > mw[2] - 2] or [mw[2] + 30]))
            segs.append((y_lo, y_hi, hb, left, col_right, True, mc))

        for (y_lo, y_hi, hb, lx0, lx1, has_header, mc) in segs:
            if has_header:
                mark_col = mc
                cols_at_header = _columns([v for v in vs if v[2] > y_lo and v[1] < y_hi])
            seg_vs = [v for v in vs if v[2] > y_lo and v[1] < y_hi]
            table_right = max([v[0] for v in seg_vs if v[0] > lx1] or [page.rect.width - 40])
            rules = _merge([y for (y, x0, x1) in hs if x0 <= lx0 + 6 and x1 >= min(lx1 - 6, lx0 + 25) and y_lo - 1 <= y <= y_hi + 1])
            under_header = [y for y in rules if y > hb - 3]
            page_vs = {round(v[0]) for v in seg_vs}
            col_lines = all(any(abs(x - c) <= 3 for x in page_vs) for c in (lx0, lx1))
            if not has_header and len(under_header) < 2 and not col_lines:
                if not headers:  # no header and no table lines on this page: the table has ended
                    current, label_x, ended_x = None, None, label_x
                continue  # (a strip above this page's header: nothing to read, keep the open row)

            # Top: the rule under the header; on a continuation page the first row can sit above the
            # page's first rule, so from just above the first label if that is higher.
            if has_header:
                top = under_header[0] if under_header else hb + 2
            else:
                first_lab = min((w[1] for w in words if w[0] >= lx0 - 1 and w[2] <= lx1 + 2 and y_lo < w[1] < y_hi and w[1] > 20), default=None)
                cands = [c for c in (under_header[0] if under_header else None, first_lab - 3 if first_lab is not None else None) if c is not None]
                top = min(cands) if cands else y_lo + 2
            # Bottom: the table's last rule — unless content carries on below it (tables ruled only
            # round the header): then the end of the content.
            content_end = max([w[3] for w in words if lx0 - 1 <= w[0] < table_right and top - 1 < w[1] < y_hi] or [top]) + 3
            last_rule = under_header[-1] if len(under_header) >= 2 else None
            bottom = last_rule if last_rule is not None and last_rule >= content_end - 6 else min(content_end, y_hi)

            def total_end(line_bottom: float) -> float:
                # A total line is cut out of its row: it ends at the rule under it.
                return min([y for y in rules if line_bottom - 2 <= y <= line_bottom + 25] or [line_bottom + 3])

            # Events down the page: a new label starts a row; a "Total …" line closes its part of a row.
            events: list[tuple[float, str, object]] = []
            tw = sorted((w for w in words if lx0 - 1 <= w[0] <= table_right and top < (w[1] + w[3]) / 2 < bottom), key=lambda w: (w[1], w[0]))
            for w in tw:
                same_line = [x for x in tw if abs(x[1] - w[1]) < 3]
                rest = " ".join(x[4] for x in sorted(same_line, key=lambda x: x[0]) if x[0] >= w[0])
                if re.fullmatch(r"\(?\d{1,2}", w[4]):
                    # "(7 marks)", "13 marks": the question's total (IAL Maths) — alone at the line's end.
                    if not re.fullmatch(r"\(?\d{1,2}\s+marks?\)?", rest, re.I) or any(w[0] - 40 < x[0] < w[0] for x in same_line):
                        continue
                elif w[4].lower().lstrip("(") != "total":
                    continue
                elif any(w[0] - 150 < x[0] < w[0] for x in same_line) or not TOTAL_LINE.match(rest.lstrip("(").rstrip(")")):
                    continue  # "total" inside an answer, not a total line
                snap_t = max([y for y in rules if w[1] - 25 <= y <= w[1] + 2] or [w[1] - 3])
                if not any(abs(e[0] - snap_t) < 3 and e[1] == "total" for e in events):
                    events.append((snap_t, "total", total_end(w[3])))

            lw = [w for w in words if w[0] >= lx0 - 1 and w[2] <= lx1 + 2 and top < (w[1] + w[3]) / 2 < bottom]
            lines: list[list] = []
            for w in sorted(lw, key=lambda w: w[1]):
                if lines and abs(w[1] - lines[-1][0][1]) < 4:
                    lines[-1].append(w)
                else:
                    lines.append([w])
            prev_bottom = top - 1
            # In an unruled table a number just above a label (≤ 30 pt) may be that row's mark, printed
            # a line high — or the total at the bottom of the row above. See close().
            mark_from: dict[float, float] = {}
            for ln in lines:
                text = line_text(ln)
                ytop = min(x[1] for x in ln)
                # The row starts at the rule just above its label — never above the previous label line.
                ruled = [y for y in rules if max(ytop - 25, prev_bottom) <= y <= ytop + 2]
                snap = max(ruled or [max(ytop - 3, prev_bottom)])
                if not ruled:
                    mark_from[snap] = max(ytop - 30, prev_bottom + 1)
                prev_bottom = max(x[3] for x in ln)
                if re.match(r"^\s*total\b", text, re.I):
                    events.append((snap, "total", total_end(prev_bottom)))
                    continue
                p = _clean_label(text, ctx)
                srt = sorted(ln, key=lambda x: x[0])
                if p is None and len(srt) > 1 and srt[1][0] - srt[0][2] > 8:
                    p = _clean_label(srt[0][4], ctx)  # a label with working beside it ("7  35")
                if p:  # question numbers only move forward, a few at a time ("Method 2", page numbers…)
                    cq = ctx[0] if ctx else None
                    if (cq is None and p[0] > 3) or (cq is not None and not (cq <= p[0] <= cq + 3)):
                        p = None
                    # A bare number that skips a question and has a number stacked right above or below
                    # it is part of a fraction in the working (the 1 or 9 of 1/9), not the next question.
                    elif cq is not None and p[0] > cq + 1 and not p[1] and not p[2] and any(
                        abs((w[0] + w[2]) / 2 - (srt[0][0] + srt[0][2]) / 2) < 6 and 0 < abs(srt[0][1] - w[1]) < 22 and re.fullmatch(r"\d+", w[4]) for w in words
                    ):
                        p = None
                if p and current is not None and label_text(*p) == current.label and not any(e[1] == "label" for e in events):
                    p = None  # the same label repeated at the top of a page: the row continues
                if p and events and events[-1][1] == "label" and label_text(*events[-1][2]) == label_text(*p):
                    p = None  # printed twice in a row
                if p:
                    events.append((snap, "label", p))
                    ctx = (p[0], p[1])
            events.sort(key=lambda e: (e[0], 0 if e[1] == "total" else 1))

            # The Mark column: from its heading; on a page without a header, only if its rules are
            # where the heading had them. With no "Mark" heading: the table's last column.
            if mark_col:
                mcol = mark_col
                trusted = has_header or all(any(abs(x - c) <= 3 for x in page_vs) for c in mark_col)
                here = _columns(seg_vs)
                if not trusted and cols_at_header and len(here) == len(cols_at_header):
                    # Columns sized differently on this page (Maths A): the same column by position.
                    i = min(range(len(cols_at_header)), key=lambda k: abs(cols_at_header[k] - mark_col[0]))
                    if abs(cols_at_header[i] - mark_col[0]) <= 3 and i + 1 < len(here):
                        mcol, trusted = (here[i], here[i + 1]), True
                elif not trusted and len(here) >= 3:
                    # Otherwise the column most like it: about as wide, and near where it was.
                    c0, w0 = (mark_col[0] + mark_col[1]) / 2, mark_col[1] - mark_col[0]
                    best = min(zip(here, here[1:]), key=lambda c: abs((c[0] + c[1]) / 2 - c0) + abs(c[1] - c[0] - w0))
                    if abs((best[0] + best[1]) / 2 - c0) + abs(best[1] - best[0] - w0) < 40 and best[0] > lx1 + 5:
                        mcol, trusted = best, True
            else:
                cols = sorted({round(v[0]) for v in seg_vs if v[0] > lx1 + 20})
                mcol = (cols[-2] if len(cols) >= 2 and table_right - cols[-2] < 90 else table_right - 45, table_right + 5)
                trusted = True

            def in_columns(ym: float) -> bool:
                # Full-width boxes under a row ("Alternatives", "NB …") hold working, not marks.
                return any(lx1 + 3 < v[0] < table_right - 3 and v[1] - 2 <= ym <= v[2] + 2 for v in seg_vs)

            def follow_on(y0: float, y1: float) -> bool:
                # After a question's total, only an alternative method or a note still belongs to it.
                ws = sorted((w for w in words if y0 < (w[1] + w[3]) / 2 < y1 and lx0 - 1 <= w[0] <= table_right), key=lambda w: (round(w[1]), w[0]))
                return bool(ws) and FOLLOW_ON.match(ws[0][4].lower().strip(":.-–")) is not None

            y = top
            carry: list = []  # numbers just above this row's label, left by the row above

            def close(y_end: float) -> None:
                if current is None or y_end - y <= 6:
                    return
                done = id(current) in after_total
                if done and not follow_on(y, y_end):
                    return
                current.regions.append(MsRegion(page=pi, x0=round(lx1 + 1, 1), y0=round(y + 0.5, 1), x1=round(table_right - 0.5, 1), y1=round(y_end - 0.5, 1)))
                if trusted and not done and id(current) not in settled:
                    # The row's total: the last number in the Mark column ("2", or "(2)").
                    nums = sorted((w for w in words
                                   if mcol[0] - 2 <= w[0] and w[2] <= mcol[1] + 2 and y < (w[1] + w[3]) / 2 < y_end
                                   and re.fullmatch(r"[(\[]?\d{1,2}[)\]]?", w[4]) and in_columns((w[1] + w[3]) / 2)), key=lambda w: w[1])
                    lead_from = mark_from.get(y_end, y_end)
                    own = carry + [w for w in nums if (w[1] + w[3]) / 2 < lead_from]
                    lead = [w for w in nums if (w[1] + w[3]) / 2 >= lead_from]
                    carry.clear()
                    if own:  # this row has its mark: a number just above the next label is that row's
                        # "[3]" is a part's total where "(6)" under it is the question's (IAL Maths).
                        boxed = [w for w in own if w[4].startswith("[")]
                        current.marks = int((boxed or own)[-1][4].strip("()[]"))
                        carry.extend(lead)
                    elif lead:
                        current.marks = int(lead[-1][4].strip("()[]"))
                    else:
                        # No total printed (Maths A, Further Pure): add up the mark codes instead —
                        # "M1", "A1", "B2", "dM1", "M1A1", "B1,B1" (not "[8]", the question's total).
                        codes = [w[4] for w in words if mcol[0] - 2 <= w[0] and w[2] <= mcol[1] + 2 and y < (w[1] + w[3]) / 2 < y_end and in_columns((w[1] + w[3]) / 2)]
                        found = [int(n) for c in codes for n in MARK_CODE.findall(c)]
                        if found and current.marks is None:
                            current.marks = sum(found)

            for ys, kind, p in events:
                close(ys)
                if kind == "total":
                    # The row stays open: an alternative method can follow its total and still
                    # belongs to the question until the next label.
                    if current is not None:
                        after_total.add(id(current))
                    y = max(ys, p)
                    continue
                q, letter, roman = p
                again = next((r for r in rows if r.label == label_text(q, letter, roman)), None)
                if again is not None:
                    # The same label again later (an alternative-method table, notes for the
                    # question): more of that part — its marks are already read.
                    current = again
                    settled.add(id(again))
                else:
                    current = MsRow(label=label_text(q, letter, roman), question=q, part=part_label(letter, roman))
                    rows.append(current)
                y = ys
            close(bottom)

    rows = [r for r in rows if r.regions]
    if not rows:
        res.status, res.reason = "failed", "No mark scheme table found (looked for a 'Question Number' column)."
    res.rows = rows
    return res


__all__ = ["MsResult", "MsRow", "MsRegion", "read_mark_scheme", "normalize_label", "part_label", "label_text"]
