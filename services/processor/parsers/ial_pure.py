"""Edexcel International A Level Pure Mathematics P1–P4 (WMA11–WMA14), Mechanics M1 (WME01), Statistics
S1 (WST01), and the older Core
Mathematics C12 / C34 (WMA01 / WMA02): whole questions only.

These papers have no separate answer booklet: each question starts with its bold number ("1.")
in the left margin, its parts (a), (b)… and their marks follow, then ruled answer lines run over
as many pages as needed ("Question 1 continued" at the top of each), and the question ends at
"(Total for Question 1 is 6 marks)". Teachers pick whole questions here, so a question is one
box per page from its number down to its Total line, with no parts.

The general Edexcel parser (parsers/edexcel.py) is untouched; main.py sends a paper here only
when its cover says it is one of these papers (see `is_ial_pure`).
"""
from __future__ import annotations

import re

import pymupdf

from .base import BaseParser, Question, Region

# Cover: "Pure Mathematics P3", paper reference "WMA13/01".
# Also the units before P1–P4: "Core Mathematics C12 / C34" (WMA01, WMA02), and Mechanics M1 /
# Statistics S1 (WME01, WST01): same booklet layout.
COVER = re.compile(r"Pure\s+Mathematics\s+P[1-4]\b|\bWMA1[1-4]\s*/\s*0?1\b|Core\s+Mathematics\s+C(?:12|34)\b|\bWMA0[12]\s*/\s*0?1\b|Mechanics\s+M1\b|\bWME01\s*/\s*0?1\b|Statistics\s+S1\b|\bWST01\s*/\s*0?1\b", re.I)
# "1." — also "3..", "7<tab>" (a missing dot) and "1:", as printed on some papers.
START = re.compile(r"^\s*(\d{1,2})\s*(?:\.+(?:\s|$)|\t|:)")
# A number alone on its line followed by a tab ("5<tab>") is a question number, not a page number.
BARE_START = re.compile(r"^\s*(\d{1,2})\t\s*$")
CONTINUED = re.compile(r"^\s*Question\s+(\d{1,2})\s+continued", re.I)
TOTAL = re.compile(r"\(\s*Total\s+for\s+Question\s+(\d+)\s+(?:is|=)\s+(\d+)\s+marks?\s*\)", re.I)
# Older papers (to 2022): "(Total 6 marks)" — the question is the one being answered.
TOTAL_OLD = re.compile(r"\(\s*Total\s+(\d+)\s+marks?\s*\)", re.I)
PAPER_TOTAL = re.compile(r"TOTAL\s+FOR\s+PAPER\s+(?:IS|=)\s+(\d+)\s+MARKS", re.I)
# Margin and footer furniture, not question content.
FURNITURE = re.compile(r"DO NOT WRITE IN THIS AREA|^\*P\d|^Turn over|^\d{1,2}$|^[\uf0a0-\uf0ff\s]+$|^Leave$|^blank$|^Leave\s*blank|^PMT$|^Q\d{1,2}$", re.I)
ANSWER_LINE = re.compile(r"^[_.\s…]{8,}$")


def is_ial_pure(doc: pymupdf.Document) -> bool:
    """Is this an IAL Pure Mathematics P1–P4 question paper? (Read from the cover page.)"""
    return bool(doc.page_count) and bool(COVER.search(doc[0].get_text()))


class IalPureParser(BaseParser):
    old = False  # set per paper in find_questions
    key = "edexcel"  # same family: papers keep parser key "edexcel"; the version says which ran
    version = "ial-pure-1.1.0"

    # Crop from just right of the number column to just left of the margin strip (like edexcel.py).
    crop_x0 = 59.0
    crop_x1 = 557.5
    # Older layout (to 2022): number at x ≈ 55 and a "Leave blank" marks column on the right.
    old_crop_x0 = 70.0
    old_crop_x1 = 521.0
    content_top = 50.0
    content_bottom = 790.0
    number_x_max = 62.0  # the question number sits at x ≈ 43 (≈ 55 on older papers)

    @staticmethod
    def _lines(page: pymupdf.Page) -> list[tuple[float, float, float, float, str]]:
        """Text lines (x0, y0, x1, y1, text) of the page body, top to bottom, without margin furniture."""
        out = []
        for b in page.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                raw = "".join(s["text"] for s in ln["spans"])
                text = raw.strip()
                if not text:
                    continue
                x0, y0, x1, y1 = ln["bbox"]
                if (b := BARE_START.match(raw)) and x0 <= IalPureParser.number_x_max and y0 < 792:
                    text = b.group(1) + "."
                # Rotated margin text ("DO NOT WRITE IN THIS AREA") and the barcode/page-number footer.
                if ln.get("dir", (1, 0))[0] < 0.9 or FURNITURE.search(text) or y0 > 792:
                    continue
                out.append((x0, y0, x1, y1, text))
        return sorted(out, key=lambda t: (round(t[1]), t[0]))

    def _region(self, page: int, y0: float, y1: float) -> Region:
        x0, x1 = (self.old_crop_x0, self.old_crop_x1) if self.old else (self.crop_x0, self.crop_x1)
        return Region(page=page, x0=x0, y0=round(max(self.content_top, y0), 2), x1=x1, y1=round(min(self.content_bottom, y1), 2))

    @staticmethod
    def _is_old_layout(doc: pymupdf.Document) -> bool:
        """Older papers have a "Leave blank" column down the right edge of every page."""
        for i in range(1, min(doc.page_count, 4)):
            for w in doc[i].get_text("words"):
                if w[4] == "Leave" and w[0] > 500 and w[1] < 60:
                    return True
        return False

    def find_questions(self, doc: pymupdf.Document) -> list[Question]:
        self.old = self._is_old_layout(doc)
        pages = [self._lines(doc[i]) for i in range(doc.page_count)]
        # Where each question starts and ends, in reading order.
        starts: dict[int, tuple[int, float]] = {}
        totals: dict[int, tuple[int, float, int]] = {}
        expected = 1
        for pi, lines in enumerate(pages):
            if pi == 0:
                continue  # the cover
            for x0, y0, x1, y1, text in lines:
                m = START.match(text)
                if m and x0 <= self.number_x_max and int(m.group(1)) == expected and not TOTAL.search(text):
                    starts[expected] = (pi, y0)
                    expected += 1
                t = TOTAL.search(text)
                if t:
                    totals.setdefault(int(t.group(1)), (pi, y0, int(t.group(2))))
                elif (o := TOTAL_OLD.search(text)) and expected > 1:
                    totals.setdefault(expected - 1, (pi, y0, int(o.group(1))))

        questions: list[Question] = []
        numbers = sorted(starts)
        for k, n in enumerate(numbers):
            p0, y0 = starts[n]
            warnings: list[str] = []
            if n in totals and totals[n][:2] >= (p0, y0):
                # Up to just above the Total line: the builder prints its own total.
                p1, y1, marks = totals[n]
                end = (p1, y1 - 2)
            else:
                # No Total line found: run to just above the next question (or the paper's end).
                marks = 0
                warnings.append(f"No '(Total for Question {n} is … marks)' line found — check the box and marks")
                nxt = starts.get(numbers[k + 1]) if k + 1 < len(numbers) else None
                end = (nxt[0], nxt[1] - 4) if nxt else (doc.page_count - 1, self.content_bottom)
            regions = self._span(pages, (p0, y0 - 3), end, n)
            text = " ".join(
                t for r in regions for (_x0, ly0, _x1, ly1, t) in pages[r.page]
                if r.y0 <= (ly0 + ly1) / 2 <= r.y1 and not ANSWER_LINE.match(t) and not CONTINUED.match(t) and not TOTAL.search(t) and not TOTAL_OLD.search(t)
            )
            text = START.sub("", re.sub(r"\s+", " ", text), count=1).strip()
            questions.append(
                Question(
                    number=n,
                    total_marks=marks,
                    confidence=0.6 if warnings else 1.0,
                    text=text,
                    warnings=warnings,
                    regions=regions,
                    parts=[],
                )
            )
        return questions

    def _span(self, pages, start: tuple[int, float], end: tuple[int, float], n: int) -> list[Region]:
        """One box per page from start to end. Continuation pages start under "Question n continued";
        pages with nothing on them (blank pages) are skipped."""
        (p0, y0), (p1, y1) = start, end
        out: list[Region] = []
        for p in range(p0, p1 + 1):
            lines = pages[p]
            if not lines:
                continue
            top = y0 if p == p0 else self.content_top
            if p != p0:
                cont = next((ln for ln in lines if CONTINUED.match(ln[4]) and int(CONTINUED.match(ln[4]).group(1)) == n), None)
                if cont:
                    top = cont[3] + 2
            if p == p1:
                bottom = y1
            else:
                # The page's last line (answer lines run to the bottom), with a little room.
                bottom = max(ln[3] for ln in lines) + 4
            if bottom - top > 8:
                out.append(self._region(p, top, bottom))
        return out

    def paper_warnings(self, questions: list[Question]) -> list[str]:
        out = []
        if not questions:
            out.append("No questions found")
            return out
        nums = [q.number for q in questions]
        if nums != list(range(1, len(nums) + 1)):
            out.append(f"Question numbers are not 1…{len(nums)} in order")
        return out

    def segment(self, pdf_bytes: bytes):
        res = super().segment(pdf_bytes)
        # The paper's own total, to check the questions add up.
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        m = next((PAPER_TOTAL.search(doc[i].get_text()) for i in range(doc.page_count - 1, -1, -1) if PAPER_TOTAL.search(doc[i].get_text())), None)
        if m and res.questions:
            want, got = int(m.group(1)), sum(q.total_marks for q in res.questions)
            if want != got:
                res.warnings.append(f"Question totals add up to {got}, but the paper says TOTAL FOR PAPER IS {want} MARKS")
        return res
