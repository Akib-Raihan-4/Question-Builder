"""A parser with no layout rules: it learns each question paper's layout from the paper itself.

Used when the board parsers' questions don't add up to the paper's printed total (main.py), so a
new subject or board works without anyone writing rules for it. Whole questions only, no parts.

How it reads a paper:
  1. every text line, with its position and boldness (rotated pages as displayed);
  2. page furniture is text that repeats at the same spot on many pages (headers, footers,
     page numbers, margin notes) and is set aside;
  3. question numbers: numbers that start lines, grouped by x position and boldness; the group
     that counts 1, 2, 3 … through the paper is the question column;
  4. totals: lines with "total" and a number, as a pattern (digits → N, "1 mark" = "4 marks");
     the pattern that gives most questions exactly one total wins — matched by position, or by
     the question number printed in it (papers that print every question first, answers after);
  5. of the readings found, the one whose marks add up to the paper's printed total is kept.
A question's box runs from its number to just above its total line, one box per page.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass

import pymupdf

from .base import BaseParser, Part, Question, Region, SegmentResult


@dataclass
class Line:
    page: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    bold: bool
    num_x1: float  # right edge of the line's first word (a question number's width)


def read_lines(doc: pymupdf.Document) -> list[Line]:
    out = []
    for pi, page in enumerate(doc):
        m = page.rotation_matrix if page.rotation else None  # work as the page is displayed
        for b in page.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                d = ln.get("dir", (1, 0))
                if m is None and abs(d[0]) < 0.9:
                    continue  # rotated margin text ("DO NOT WRITE IN THIS AREA")
                spans = [s for s in ln["spans"] if s["text"].strip()]
                if not spans:
                    continue
                text = "".join(s["text"] for s in ln["spans"])
                bold = bool(spans[0]["flags"] & 16) or "bold" in spans[0]["font"].lower()
                r = pymupdf.Rect(ln["bbox"]) * m if m else pymupdf.Rect(ln["bbox"])
                first = pymupdf.Rect(spans[0]["bbox"]) * m if m else pymupdf.Rect(spans[0]["bbox"])
                word = re.match(r"\s*\S+", spans[0]["text"])
                # The first word's right edge, from the span's share of characters.
                frac = len(word.group(0)) / max(1, len(spans[0]["text"])) if word else 1
                num_x1 = first.x0 + (first.x1 - first.x0) * frac
                out.append(Line(pi, r.x0, r.y0, r.x1, r.y1, text, bold, num_x1))
    return sorted(out, key=lambda l: (l.page, round(l.y0), l.x0))


def _shape(l: Line):
    return (re.sub(r"\d+", "#", l.text.strip()), round(l.x0 / 6), round(l.y0 / 6))


def drop_furniture(lines: list[Line], pages: int, share: float) -> list[Line]:
    """Text (digits ignored) at the same spot on at least `share` of the pages is page furniture."""
    seen = defaultdict(set)
    for l in lines:
        seen[_shape(l)].add(l.page)
    limit = max(3, pages * share)
    return [l for l in lines if len(seen[_shape(l)]) < limit]


LEAD = re.compile(r"^\s*(\d{1,2})(?!\d)(\S*)")


def number_columns(lines: list[Line]) -> list[list[tuple[int, Line]]]:
    """Candidate question-number columns, each reduced to its chain 1, 2, 3 … in reading order."""
    found = []
    for l in lines:
        m = LEAD.match(l.text)
        # "1." or "3" yes; "1.5" or "12,000" no (a decimal is not a question number).
        if m and not re.match(r"^[.,]\d", m.group(2)):
            found.append((int(m.group(1)), l))
    # Same boldness, and x within 3 pt of a neighbour (numbers drift a point or two).
    groups: list[list] = []
    for bold in (True, False):
        col: list = []
        for n, l in sorted((f for f in found if f[1].bold == bold), key=lambda f: f[1].x0):
            if col and l.x0 - col[-1][1].x0 > 3:
                groups.append(col)
                col = []
            col.append((n, l))
        if col:
            groups.append(col)
    chains = []
    for items in groups:
        items = sorted(items, key=lambda f: (f[1].page, f[1].y0))
        chain, want = [], 1
        for n, l in items:
            if n == want:
                chain.append((n, l))
                want += 1
        if len(chain) >= 2:
            chains.append(chain)
    return sorted(chains, key=len, reverse=True)[:6]


def pattern(text: str) -> str:
    """A line's shape: digits → N, any spaces (non-breaking too) as one, "1 mark" / "4 marks" alike."""
    return re.sub(r"(\w{3,})s\b", r"\1", re.sub(r"\d+", "N", re.sub(r"\s+", " ", text.strip().lower())))


def totals_for(chain, lines: list[Line]):
    """Each question's total line, from the 'total' pattern that fits the chain best.
    → (pattern, {question number: (marks, the line)})"""
    starts = [(l.page, l.y0) for _, l in chain]
    owner = lambda l: max((i for i, s in enumerate(starts) if s <= (l.page, l.y0 + 1)), default=None)
    by_pattern = defaultdict(list)
    for l in lines:
        if re.search(r"total", l.text, re.I) and re.search(r"\d", l.text):
            by_pattern[pattern(l.text)].append(l)
    index_of = {n: i for i, (n, _) in enumerate(chain)}
    best, best_score = None, -1
    for pat, ls in by_pattern.items():
        for by_number in (False, True):
            per = defaultdict(list)
            for l in ls:
                nums = [int(x) for x in re.findall(r"\d+", l.text)]
                o = index_of.get(nums[0]) if by_number and len(nums) > 1 else (None if by_number else owner(l))
                if o is not None and (l.page, l.y0) >= starts[o]:
                    per[o].append((nums[-1], l))
            # The same total printed twice (under the question and after its answers) is one.
            score = sum(1 for v in per.values() if len({m for m, _ in v}) == 1)
            if score > best_score:
                best, best_score = (pat, per), score
    if not best:
        return None, {}
    pat, per = best
    return pat, {chain[i][0]: v[0] for i, v in per.items() if len({m for m, _ in v}) == 1}


def printed_totals(lines: list[Line], question_pattern: str | None = None) -> set[int]:
    """Numbers on the paper's own 'total' lines (the cover's "total mark for this paper is 75", the
    last page's "TOTAL FOR PAPER IS 75 MARKS"): the questions' marks must add up to one of them.
    Those wordings appear once or twice; a question's total wording repeats, so it is left out."""
    totals = [l for l in lines if re.search(r"total", l.text, re.I) and re.search(r"\d", l.text)]
    count = defaultdict(int)
    for l in totals:
        count[pattern(l.text)] += 1
    return {
        int(n) for l in totals
        if count[pattern(l.text)] <= 2 and pattern(l.text) != question_pattern
        for n in re.findall(r"\d+", l.text)
    }


def mark_lines(lines: list[Line], width: float) -> list[Line]:
    """The paper's part marks. The style is learned: the short bits at the right edge with a
    number in them ("(3)", "[2]"), the commonest shape of those."""
    # A bare number is a graph axis, a diagram label or a page number; marks have something round
    # the number: "(3)", "[3]".
    right = [l for l in lines if l.x0 > width * 0.65 and len(l.text.strip()) <= 6 and re.search(r"\d", l.text) and re.search(r"[^\d\s]", l.text)]
    shapes = defaultdict(list)
    for l in right:
        shapes[pattern(l.text)].append(l)
    style = max(shapes.values(), key=len, default=[])
    return style if len(style) >= 3 else []


def part_marks(chain, lines: list[Line], width: float) -> dict[int, int]:
    """Each question's part marks added up — for a question whose total line can't be read."""
    style = mark_lines(lines, width)
    if not style:
        return {}
    starts = [(l.page, l.y0) for _, l in chain] + [(10**6, 0)]
    out = {}
    for k, (n, _) in enumerate(chain):
        got = [int(re.search(r"\d+", l.text).group()) for l in style if starts[k] <= (l.page, l.y0) < starts[k + 1]]
        if got:
            out[n] = sum(got)
    return out


LETTER = re.compile(r"^\(([a-h])\)")
ROMAN = re.compile(r"^\((i{1,3}|iv|v|vi{1,3}|ix|x)\)")


def find_parts(lines: list[Line], marks: list[Line], start: Line, left: float, total: int):
    """The question's parts — labels "(a)", "(b)", "(i)" at the left of the question, each "(N)"
    mark going to the part above it. → [(label, marks, first line)], or [] unless every part has
    marks and they add up to the question's total."""
    parts: list[dict] = []  # in order: {"label", "letter", "line", "marks"}
    letter = None
    for l in lines:
        if l == start:  # (same line, read separately)
            t = LEAD.sub("", l.text.strip(), count=1).strip()  # "1. (a) Find …": after the number
        elif l.x0 <= left + 60:
            t = l.text.strip()
        else:
            continue  # "(a)" inside the text or an answer option, not a label
        while True:  # a line can hold more than one label: "(a)(i)", "(b) (ii)"
            if m := ROMAN.match(t):
                label = f"{letter}({m.group(1)})" if letter else m.group(1)
                prev = parts[-1] if parts else None
                if prev and prev["label"] == letter and prev["letter"] == letter:
                    prev["label"] = label  # "(a)" straight followed by "(i)": the part is a(i)
                else:
                    parts.append({"label": label, "letter": letter, "line": l, "marks": 0})
            elif m := LETTER.match(t):
                letter = m.group(1)
                parts.append({"label": letter, "letter": letter, "line": l, "marks": 0})
            else:
                break
            t = t[m.end():].strip()
    # Labels must run in order (a, b, c …) and each appear once.
    letters = [p["letter"] for p in parts if p["letter"]]
    if len(parts) < 2 or letters != sorted(letters) or len({p["label"] for p in parts}) != len(parts):
        return []
    for mk in marks:
        owner = None
        for p in parts:
            if (p["line"].page, p["line"].y0) <= (mk.page, mk.y0 + 2):
                owner = p
        if owner:
            owner["marks"] += int(re.search(r"\d+", mk.text).group())
    if not all(p["marks"] for p in parts) or sum(p["marks"] for p in parts) != total:
        return []
    return [(p["label"], p["marks"], p["line"]) for p in parts]


@dataclass
class Reading:
    chain: list[tuple[int, Line]]
    totals: dict[int, tuple[int, Line]]  # each question's total line
    marks: dict[int, int]  # each question's marks: its total line, else its part marks added up
    adds_up: bool


def best_reading(doc: pymupdf.Document) -> Reading | None:
    every = read_lines(doc)
    # Every line but the cover's: no furniture is set aside here, because a question number that
    # starts each page at the top looks just like a page number. Page numbers and other stray
    # number columns lose on the totals below.
    lines = [l for l in every if l.page > 0]
    best = None
    width = doc[0].rect.width
    for chain in number_columns(lines):
        pat, totals = totals_for(chain, lines)
        parts = part_marks(chain, lines, width) if len(totals) < len(chain) else {}
        marks = {n: totals[n][0] if n in totals else parts.get(n, 0) for n, _ in chain}
        adds = all(marks.values()) and sum(marks.values()) in printed_totals(every, pat)
        score = (adds, sum(1 for n in marks if n in totals), len(chain))
        if best is None or score > best[0]:
            best = (score, Reading(chain, totals, marks, adds))
    return best[1] if best else None


def adds_up(result: SegmentResult, doc: pymupdf.Document) -> bool:
    """Do a parser's questions run 1, 2, 3 …, each question's parts add up to it, and the marks add
    up to the paper's printed total? (The same checks Publish makes.)"""
    qs = result.questions
    if not qs or [q.number for q in qs] != list(range(1, len(qs) + 1)) or not all(q.total_marks for q in qs):
        return False
    if any(q.parts and sum(p.marks for p in q.parts) != q.total_marks for q in qs):
        return False
    return sum(q.total_marks for q in qs) in printed_totals(read_lines(doc))


class AdaptiveParser(BaseParser):
    key = "edexcel"  # the papers keep their board's key; the version says which parser ran
    version = "adaptive-1.0.0"

    def find_questions(self, doc: pymupdf.Document) -> list[Question]:
        r = best_reading(doc)
        if not r:
            return []
        lines = read_lines(doc)
        # Running headers ("Question 3 continued") repeat on a few pages: not part of any box.
        content = [l for l in drop_furniture(lines, doc.page_count, 0.15) if l.page > 0]
        kept = {id(l) for l in content}
        by_page, headers = defaultdict(list), defaultdict(list)
        for l in content:
            by_page[l.page].append(l)
        for l in lines:
            if id(l) not in kept:
                headers[l.page].append(l)
        # The page's usual content area, for pages that are only answer space (ruled lines are
        # drawings, not text): the top and bottom most pages' text reaches.
        firsts = sorted(min(l.y0 for l in ls) for ls in by_page.values())
        lasts = sorted(max(l.y1 for l in ls) for ls in by_page.values())
        marks = mark_lines([l for l in lines if l.page > 0], doc[0].rect.width)
        usual_top = firsts[len(firsts) // 10] - 2 if firsts else 50
        usual_bottom = lasts[int(len(lasts) * 0.9)] + 4 if lasts else doc[0].rect.height - 50
        # Left edge: just right of the question numbers (the builder prints its own); right edge:
        # the text's right edge on most pages.
        x0 = max(l.num_x1 for _, l in r.chain) + 3
        rights = sorted(l.x1 for l in content)
        x1 = rights[int(len(rights) * 0.98)] + 4 if rights else doc[0].rect.width - 36
        questions = []
        for k, (n, start) in enumerate(r.chain):
            total = r.totals.get(n)
            nxt = r.chain[k + 1][1] if k + 1 < len(r.chain) else None
            if total:
                end_page, end_y = total[1].page, total[1].y0 - 2
            elif nxt:
                end_page, end_y = nxt.page, nxt.y0 - 4
            else:
                end_page, end_y = doc.page_count - 1, doc[-1].rect.height - 40
            regions, text = [], []
            for p in range(start.page, end_page + 1):
                here = by_page.get(p, [])
                if any(re.fullmatch(r"\s*blank\s+page\s*", l.text, re.I) for l in here + headers[p]):
                    continue  # "BLANK PAGE"
                if p == start.page:
                    top = start.y0 - 3
                else:
                    # Below a running header at the top of the page ("Question 3 continued").
                    over = [h.y1 for h in headers[p] if h.y0 < usual_top + 30 and h.x0 < x1 and h.x1 > x0]
                    top = max([usual_top] + [y + 2 for y in over])
                if p == end_page:
                    bottom = end_y
                else:
                    # Down to the page's text, but above its footer (page number, barcode).
                    feet = [h.y0 - 2 for h in headers[p] if h.y0 > doc[p].rect.height * 0.85]
                    bottom = min([max([usual_bottom] + [l.y1 + 4 for l in here])] + feet)
                if bottom - top > 8:
                    regions.append(Region(page=p, x0=round(x0, 2), y0=round(top, 2), x1=round(x1, 2), y1=round(bottom, 2)))
                    text += [l.text.strip() for l in here if top <= l.y0 < bottom]
            parts = []
            span = [l for g in regions for l in by_page.get(g.page, []) if g.y0 - 1 <= l.y0 < g.y1] if regions else []
            if start not in span:
                span = [start] + span
            in_q = [mk for g in regions for mk in marks if mk.page == g.page and g.y0 <= mk.y0 < g.y1]
            found = find_parts(span, in_q, start, x0, r.marks.get(n, 0))
            for k2, (label, pm, first) in enumerate(found):
                nxt_p = found[k2 + 1][2] if k2 + 1 < len(found) else None
                lo = (first.page, first.y0 - 3)
                hi = (nxt_p.page, nxt_p.y0 - 3) if nxt_p else (10**6, 0)
                pregs = []
                for g in regions:
                    top = max(g.y0, lo[1]) if g.page == lo[0] else g.y0
                    bot = min(g.y1, hi[1]) if g.page == hi[0] else g.y1
                    if lo[0] <= g.page <= hi[0] and bot - top > 8:
                        pregs.append(Region(page=g.page, x0=g.x0, y0=round(top, 2), x1=g.x1, y1=round(bot, 2)))
                parts.append(Part(label=label, marks=pm, regions=pregs))
            questions.append(
                Question(
                    number=n,
                    total_marks=r.marks.get(n, 0),
                    confidence=0.9 if total and r.adds_up else 0.6,
                    text=re.sub(r"\s+", " ", " ".join(text))[:4000],
                    warnings=[] if total else [f"No total line found for question {n}: marks are its parts added up, and its box runs to the next question — check both"],
                    regions=regions,
                    parts=parts,
                )
            )
        return questions

    def paper_warnings(self, questions: list[Question]) -> list[str]:
        if not questions:
            return ["No questions found"]
        return []
