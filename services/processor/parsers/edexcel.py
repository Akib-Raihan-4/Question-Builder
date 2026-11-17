"""Pearson Edexcel International GCSE question-paper parser.

Every threshold below was MEASURED from real papers (7 x 4MB1 Paper 1, 2019-2021) with PyMuPDF,
not guessed. All thresholds are in "A4 layout" coordinates: PDF points, top-left origin, on a
595.28 x 841.89 page. Some downloads add a uniform border (e.g. 652 x 899 = A4 + 28.35pt each
side); we detect that per page and subtract it before applying thresholds, then add it back for
output so regions always refer to the ORIGINAL page.

Measured layout:
  question number   bold integer, x0 = 42.5 (span may carry trailing spaces), text starts at 60.9
  part letter       word "(a)" at x0 ~ 60.9
  nested roman      word "(i)"/"(ii)"/"(iii)" right-aligned, x0 73-79 (under a letter)
                    or at x0 ~ 60.9 when the question has romans but no letters
  part marks        bold "(2)" alone, right-aligned, x1 = 510.2
  question end      bold "(Total for Question N is M marks)", right-aligned at x1 = 510.2
  footer            page number / barcode / "Turn over" at y >= 793
  margin strips     "DO NOT WRITE IN THIS AREA" images/vertical text at x >= 567 or x <= 28
  content band      y 50-790; answer lines reach x = 552.8
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import pymupdf

from .base import BaseParser, Part, Question, Region

A4_W, A4_H = 595.28, 841.89


@dataclass(frozen=True)
class EdexcelConfig:
    # Question number column
    number_x0_min: float = 38.0
    number_x0_max: float = 47.0
    # Crop horizontally from just right of the number column to just left of the margin strip
    crop_x0: float = 59.0
    crop_x1: float = 562.0
    # Vertical content band (excludes header strip and footer: page number, barcode, Turn over)
    content_top: float = 50.0
    content_bottom: float = 790.0
    # Part labels (word x0 bands)
    letter_x0: tuple[float, float] = (56.0, 66.0)
    roman_nested_x0: tuple[float, float] = (66.0, 90.0)
    # Part marks "(2)": bold, right-aligned at x1 ~ 510
    marks_x1: tuple[float, float] = (500.0, 516.0)
    # Padding around detected lines
    pad_above: float = 3.0
    pad_below: float = 2.0
    # Content closer than this above a question's first line is part of the question
    chain_gap: float = 4.0
    total_line_pattern: str = r"\(\s*Total\s+for\s+Question\s+(\d+)\s+(?:is|=)\s+(\d+)\s+marks?\s*\)"
    paper_total_pattern: str = r"TOTAL\s+FOR\s+PAPER\s+(?:IS|=)\s+(\d+)\s+MARKS"
    part_marks_pattern: str = r"^\((\d{1,2})\)$"
    letter_pattern: str = r"^\(([a-h])\)$"
    roman_pattern: str = r"^\((i|ii|iii|iv|v|vi|vii|viii)\)$"
    low_confidence: float = 0.9


@dataclass
class _Event:
    page: int
    y0: float
    y1: float
    kind: str  # start | total | letter | roman | marks
    value: int | str
    extra: int | None = None


@dataclass
class _Label:
    label: str  # "a", "a(i)", "i"
    page: int
    y0: float
    marks: int | None = None
    end: tuple[int, float] | None = None  # (page, y1) of its marks line
    children: list["_Label"] = field(default_factory=list)


class EdexcelParser(BaseParser):
    key = "edexcel"
    version = "1.0.1"

    def __init__(self, config: EdexcelConfig | None = None):
        self.c = config or EdexcelConfig()

    # ------------------------------------------------------------------ helpers

    @staticmethod
    def _offset(page: pymupdf.Page) -> tuple[float, float]:
        """Uniform border around an A4 layout (0,0 for true A4 pages)."""
        dx = max(0.0, (page.rect.width - A4_W) / 2)
        dy = max(0.0, (page.rect.height - A4_H) / 2)
        return dx, dy

    def _collect(self, doc: pymupdf.Document) -> tuple[list[_Event], dict[int, list[tuple]], int | None]:
        c = self.c
        events: list[_Event] = []
        self._boxes: dict[int, list[tuple]] = {}
        lines_by_page: dict[int, list[tuple]] = {}
        paper_total = None
        for pn, page in enumerate(doc):
            dx, dy = self._offset(page)
            plines = []
            for b in page.get_text("dict")["blocks"]:
                if b["type"] != 0:
                    continue
                for ln in b["lines"]:
                    if abs(ln["dir"][0] - 1) > 0.01:  # skip vertical margin text
                        continue
                    text = "".join(s["text"] for s in ln["spans"]).strip()
                    if not text:
                        continue
                    x0, y0, x1, y1 = ln["bbox"]
                    x0, x1, y0, y1 = x0 - dx, x1 - dx, y0 - dy, y1 - dy
                    if y0 < c.content_top - 5 or y0 > c.content_bottom:
                        continue
                    plines.append((x0, y0, x1, y1, text))

                    if m := re.search(c.total_line_pattern, text):
                        events.append(_Event(pn, y0, y1, "total", int(m.group(1)), int(m.group(2))))
                    if m := re.search(c.paper_total_pattern, text, re.I):
                        paper_total = int(m.group(1))

                    for s in ln["spans"]:
                        t = s["text"].strip()
                        sx0, sy0, sx1, sy1 = s["bbox"]
                        sx0, sx1, sy0, sy1 = sx0 - dx, sx1 - dx, sy0 - dy, sy1 - dy
                        bold = bool(s["flags"] & 16) or "Bold" in s["font"]
                        if not bold:
                            continue
                        if (
                            re.fullmatch(r"\d{1,2}", t)
                            and c.number_x0_min <= sx0 <= c.number_x0_max
                        ):
                            events.append(_Event(pn, sy0, sy1, "start", int(t)))
                        elif (m := re.match(c.part_marks_pattern, t)) and c.marks_x1[0] <= sx1 <= c.marks_x1[1]:
                            events.append(_Event(pn, sy0, sy1, "marks", int(m.group(1))))
            lines_by_page[pn] = plines
            boxes = [(x0, y0, x1, y1) for x0, y0, x1, y1, _ in plines]
            for d in page.get_drawings():
                r = d["rect"]
                x0, y0, x1, y1 = r.x0 - dx, r.y0 - dy, r.x1 - dx, r.y1 - dy
                if x1 > c.crop_x0 and x0 < c.crop_x1 and c.content_top - 5 < y0 and y1 < c.content_bottom + 5 and (y1 - y0) < 400:
                    boxes.append((x0, y0, x1, y1))
            self._boxes[pn] = boxes

            for w in page.get_text("words"):
                wx0, wy0, wy1, word = w[0] - dx, w[1] - dy, w[3] - dy, w[4]
                if wy0 < c.content_top - 5 or wy0 > c.content_bottom:
                    continue
                if c.letter_x0[0] <= wx0 < c.letter_x0[1] and re.match(c.letter_pattern, word):
                    events.append(_Event(pn, wy0, wy1, "letter", word[1:-1]))
                elif re.match(c.roman_pattern, word) and (
                    c.letter_x0[0] <= wx0 < c.letter_x0[1] or c.roman_nested_x0[0] <= wx0 < c.roman_nested_x0[1]
                ):
                    nested = c.roman_nested_x0[0] <= wx0
                    events.append(_Event(pn, wy0, wy1, "roman", word[1:-1], 1 if nested else 0))

        order = {"start": 0, "letter": 1, "roman": 2, "marks": 3, "total": 4}
        events.sort(key=lambda e: (e.page, round(e.y0, 1), order[e.kind]))
        return events, lines_by_page, paper_total

    def _top(self, page: int, floor: float, line_y0: float, chain: bool = False) -> float:
        """Top of a crop that starts at a line at `line_y0`, never above `floor` (the end of the
        previous item on this page).

        Content that straddles the line (tall maths, matrix brackets) can reach above it, so
        that is taken in. With `chain` (question starts), content stacked directly on top of
        that (e.g. upper matrix rows) is taken in too, until a clear gap — which keeps out
        page instructions like "Answer ALL questions" sitting above question 1.
        """
        c = self.c
        boxes = [
            (y0, y1) for (x0, y0, x1, y1) in self._boxes.get(page, [])
            if y1 > floor + 0.5 and x1 > c.crop_x0 and x0 < c.crop_x1
        ]
        top = min([line_y0, *[y0 for y0, y1 in boxes if y0 < line_y0 < y1 - 1]])
        while chain:
            above = [y0 for y0, y1 in boxes if y0 < top - 0.5 and y1 >= top - c.chain_gap]
            if not above:
                break
            top = min(above)
        return max(top - c.pad_above, floor)

    def _region(self, doc, page: int, y0: float, y1: float) -> Region:
        dx, dy = self._offset(doc[page])
        c = self.c
        return Region(
            page=page,
            x0=round(c.crop_x0 + dx, 2),
            y0=round(max(c.content_top, y0) + dy, 2),
            x1=round(c.crop_x1 + dx, 2),
            y1=round(min(c.content_bottom, y1) + dy, 2),
        )

    def _span(self, doc, start: tuple[int, float], end: tuple[int, float]) -> list[Region]:
        """Regions from (page, y) to (page, y), one per page."""
        (p0, y0), (p1, y1) = start, end
        out = []
        for p in range(p0, p1 + 1):
            top = y0 if p == p0 else self.c.content_top
            bottom = y1 if p == p1 else self.c.content_bottom
            if bottom - top > 4:
                out.append(self._region(doc, p, top, bottom))
        return out

    def _text(self, doc, lines_by_page, regions: list[Region], skip: list[str]) -> str:
        parts = []
        for r in regions:
            dx, dy = self._offset(doc[r.page])
            for x0, y0, x1, y1, text in lines_by_page.get(r.page, []):
                cy = (y0 + y1) / 2 + dy
                if r.y0 <= cy <= r.y1 and x1 + dx > r.x0 and not any(re.search(s, text) for s in skip):
                    parts.append(text)
        return re.sub(r"\s+", " ", " ".join(parts)).strip()

    # ------------------------------------------------------------------ main

    def find_questions(self, doc: pymupdf.Document) -> list[Question]:
        c = self.c
        events, lines_by_page, paper_total = self._collect(doc)

        # 1. Question starts: numbers must run 1, 2, 3, ... (stray bold digits are ignored).
        starts: list[_Event] = []
        expected = 1
        for e in events:
            if e.kind == "start" and e.value == expected:
                starts.append(e)
                expected += 1

        totals = {e.value: e for e in events if e.kind == "total"}
        questions: list[Question] = []
        prev_end: tuple[int, float] = (0, c.content_top)

        for i, s in enumerate(starts):
            nxt = starts[i + 1] if i + 1 < len(starts) else None
            total = totals.get(s.value)
            warnings: list[str] = []
            conf = 1.0

            # 2. Question end: its Total line, else just before the next question.
            if total and (total.page, total.y0) > (s.page, s.y0) and (not nxt or (total.page, total.y0) < (nxt.page, nxt.y0)):
                end = (total.page, total.y0 - c.pad_below)
            else:
                total = None
                conf -= 0.2
                warnings.append(f"No '(Total for Question {s.value} ...)' line found")
                end = (nxt.page, nxt.y0 - c.pad_above) if nxt else (s.page, c.content_bottom)

            floor = prev_end[1] if prev_end[0] == s.page else c.content_top
            start_pos = (s.page, self._top(s.page, floor, s.y0, chain=True))
            prev_end = (end[0], (total.y1 + c.pad_below) if total else end[1])
            in_q = [
                e for e in events
                # words and spans on the same line can differ by ~1pt in y0
                if (s.page, s.y0 - 2) <= (e.page, e.y0) < end and e.kind in ("letter", "roman", "marks")
            ]

            # 3. Parts: letters, with romans nested under the current letter.
            labels: list[_Label] = []
            current: _Label | None = None
            last: _Label | None = None
            for e in in_q:
                if e.kind == "letter":
                    current = _Label(str(e.value), e.page, e.y0)
                    labels.append(current)
                    last = current
                elif e.kind == "roman":
                    if current and e.extra == 1:
                        child = _Label(f"{current.label}({e.value})", e.page, e.y0)
                        current.children.append(child)
                    else:
                        child = _Label(str(e.value), e.page, e.y0)
                        labels.append(child)
                        current = None
                    last = child
                elif e.kind == "marks" and last is not None:
                    # 4. A mark belongs to the label above it.
                    last.marks = (last.marks or 0) + int(e.value)
                    last.end = (e.page, e.y1 + c.pad_below)

            leaves: list[_Label] = []
            for lab in labels:
                if lab.children and all(ch.marks is not None for ch in lab.children):
                    leaves.extend(lab.children)  # each sub-part carries its own marks
                else:
                    if lab.children:  # marks given once for the whole letter: fold romans in
                        lab.marks = (lab.marks or 0) + sum(ch.marks or 0 for ch in lab.children)
                        ends = [x.end for x in [lab, *lab.children] if x.end]
                        lab.end = max(ends) if ends else None
                    leaves.append(lab)

            # Labels with no marks anywhere are a list inside the question text
            # (e.g. "the region (i) closer to A (ii) ..."), not answerable parts.
            if leaves and all(lf.marks is None for lf in leaves):
                leaves = []

            parts: list[Part] = []
            part_floor = start_pos
            for j, lf in enumerate(leaves):
                pf = part_floor[1] if part_floor[0] == lf.page else c.content_top
                part_start = (lf.page, self._top(lf.page, pf, lf.y0))
                part_end = lf.end
                if part_end is None:
                    following = leaves[j + 1] if j + 1 < len(leaves) else None
                    part_end = (following.page, following.y0 - c.pad_above) if following else end
                regs = self._span(doc, part_start, part_end)
                part_floor = part_end
                parts.append(
                    Part(
                        label=lf.label,
                        marks=lf.marks or 0,
                        regions=regs,
                        text=self._text(doc, lines_by_page, regs, [c.part_marks_pattern]),
                    )
                )
                if lf.marks is None:
                    conf -= 0.1
                    warnings.append(f"Part ({lf.label}) has no marks")

            # 5. Total marks and the sum check.
            parts_sum = sum(p.marks for p in parts)
            if total:
                total_marks = int(total.extra or 0)
                if parts and parts_sum != total_marks:
                    conf -= 0.3
                    warnings.append(f"Part marks add up to {parts_sum}, but the Total line says {total_marks}")
            else:
                total_marks = parts_sum
            if parts and len(parts) == 1:
                warnings.append("Only one part label found")
                conf -= 0.1

            regions = self._span(doc, start_pos, end)
            questions.append(
                Question(
                    number=int(s.value),
                    total_marks=total_marks,
                    confidence=round(max(0.0, conf), 2),
                    text=self._text(
                        doc, lines_by_page, regions,
                        [c.total_line_pattern, c.part_marks_pattern, r"^\d{1,2}$"],
                    ),
                    warnings=warnings,
                    regions=regions,
                    parts=parts,
                )
            )

        self._paper_total = paper_total
        return questions

    def paper_warnings(self, questions: list[Question]) -> list[str]:
        out = []
        found = sum(q.total_marks for q in questions)
        pt = getattr(self, "_paper_total", None)
        if pt is not None and found != pt:
            out.append(f"Question totals add up to {found}, but the paper says TOTAL FOR PAPER IS {pt} MARKS")
        if not questions:
            out.append("No questions found")
        return out
