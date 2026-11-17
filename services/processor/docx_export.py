"""Word (.docx) export of a built paper.

Two modes:
  pictures  – each stored region is a 200-dpi picture (looks exactly like the original). The new
              question numbers, Total lines, header and instructions are real Word text.
  editable  – each region is rebuilt as Word paragraphs (bold/italic/superscript kept) so the
              wording can be edited. Anything drawn (diagrams, graphs, tables, maths built from
              lines) becomes a picture of just that band, in place. Answer space is kept as spacing.

Regions are PDF points, top-left origin (PyMuPDF native), 0-based pages — the stored format.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass

import pymupdf
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt
from pydantic import BaseModel

DPI = 200
FONT = "Times New Roman"
NUMBER_COL = Mm(10)
MARGIN = Mm(20)
CONTENT_W_PT = (210 - 40 - 10) * 72 / 25.4  # A4 width - margins - number column, in points
BAND_PAD = 3.0  # pt around drawings when cutting picture bands
JOIN_GAP = 6.0  # pt: lines closer than this belong to the same paragraph
MIN_SPACE = 10.0  # pt: vertical gaps larger than this are kept as spacing (answer space)
MAX_SPACE = 500.0


class XRegion(BaseModel):
    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class XItem(BaseModel):
    number: int
    marks: int
    paper_id: str
    regions: list[XRegion]


class XHeader(BaseModel):
    school: str | None = None
    title: str | None = None
    className: str | None = None
    timeAllowed: str | None = None
    instructions: str | None = None


class DocxSpec(BaseModel):
    title: str
    header: XHeader
    mode: str = "pictures"  # "pictures" | "editable"
    total_marks: int
    items: list[XItem]


# ---------------------------------------------------------------------------- helpers


def _fix_widths(table, widths) -> None:
    """Word ignores cell widths unless the grid and layout are fixed too."""
    tbl_pr = table._tbl.tblPr
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tbl_pr.append(layout)
    for col, w in zip(table.columns, widths):
        col.width = w
        for cell in col.cells:
            cell.width = w


def _no_borders(table) -> None:
    tbl_pr = table._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        borders.append(el)
    tbl_pr.append(borders)


def _bottom_rule(paragraph) -> None:
    p_pr = paragraph._p.get_or_add_pPr()
    bdr = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    for k, v in (("val", "single"), ("sz", "6"), ("space", "4"), ("color", "333333")):
        bottom.set(qn(f"w:{k}"), v)
    bdr.append(bottom)
    p_pr.append(bdr)


def _para(container, text: str = "", *, bold=False, size=11, align=None, space_after=0.0, space_before=0.0):
    p = container.add_paragraph()
    if text:
        r = p.add_run(text)
        r.bold = bold
        r.font.size = Pt(size)
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    pf.space_before = Pt(space_before)
    if align:
        p.alignment = align
    return p


def _picture(container, page: pymupdf.Page, rect: pymupdf.Rect, scale: float, space_before: float = 0.0):
    pix = page.get_pixmap(clip=rect, dpi=DPI)
    p = container.add_paragraph()
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(0)
    p.add_run().add_picture(io.BytesIO(pix.tobytes("png")), width=Pt(rect.width * scale))


@dataclass
class _Line:
    y0: float
    y1: float
    x0: float
    x1: float
    spans: list[dict]


def _graphic_bands(page: pymupdf.Page, clip: pymupdf.Rect) -> list[tuple[float, float]]:
    """Vertical bands of the region that contain drawings or images (diagrams, tables, graphs)."""
    rects = []
    for d in page.get_drawings():
        full = d["rect"]
        # The page frame / margin boxes surround everything: not part of any question.
        if full.height > page.rect.height * 0.6 or (full.contains(clip) and full.height > clip.height):
            continue
        r = full & clip
        if r.is_empty or (r.width < 2 and r.height < 2):
            continue
        if r.height < 1.5:
            # A rule across the whole region is a separator; a short one is usually a fraction
            # bar, so take the digits above and below it into the picture too.
            if r.width > clip.width * 0.8:
                continue
            if r.width < 80:
                r = pymupdf.Rect(r.x0, r.y0 - 12, r.x1, r.y1 + 12)
        rects.append(r)
    for img in page.get_image_info():
        r = pymupdf.Rect(img["bbox"]) & clip
        if not r.is_empty:
            rects.append(r)
    bands: list[list[float]] = []
    for r in sorted(rects, key=lambda r: r.y0):
        y0, y1 = max(clip.y0, r.y0 - BAND_PAD), min(clip.y1, r.y1 + BAND_PAD)
        if bands and y0 <= bands[-1][1]:
            bands[-1][1] = max(bands[-1][1], y1)
        else:
            bands.append([y0, y1])
    return [(a, b) for a, b in bands]


def _lines(page: pymupdf.Page, clip: pymupdf.Rect) -> list[_Line]:
    out = []
    for b in page.get_text("dict", clip=clip)["blocks"]:
        if b["type"] != 0:
            continue
        for ln in b["lines"]:
            if abs(ln["dir"][0] - 1) > 0.01:
                continue
            spans = [s for s in ln["spans"] if s["text"].strip()]
            if spans:
                x0, y0, x1, y1 = ln["bbox"]
                out.append(_Line(y0, y1, x0, x1, spans))
    out.sort(key=lambda l: (round(l.y0), l.x0))
    # Merge lines that share a baseline (PyMuPDF often splits a visual line into several).
    merged: list[_Line] = []
    for l in out:
        if merged and abs(l.y0 - merged[-1].y0) < 3 and l.x0 >= merged[-1].x1 - 2:
            m = merged[-1]
            merged[-1] = _Line(min(m.y0, l.y0), max(m.y1, l.y1), m.x0, l.x1, m.spans + l.spans)
        else:
            merged.append(l)
    return merged


def _add_runs(p, spans: list[dict]) -> None:
    prev_x1 = None
    for s in spans:
        text = s["text"]
        x0 = s["bbox"][0]
        if prev_x1 is not None and x0 - prev_x1 > 2 and not text.startswith((" ", "\t")):
            p.add_run(" ")
        text = re.sub(r"\t+", " ", text)  # PDF tabs after "(a)" etc. become wide gaps in Word
        dots_only = bool(re.fullmatch(r"\s*[.…]{6,}\s*", text))
        # Answer lines: the PDF draws them with tiny dots; in Word make them fill the line.
        r = p.add_run(re.sub(r"[.…]{6,}", "." * (150 if dots_only else 60), text))
        flags = s["flags"]
        r.bold = bool(flags & 16) or "Bold" in s["font"]
        r.italic = bool(flags & 2) or "Italic" in s["font"]
        if flags & 1:
            r.font.superscript = True
        r.font.size = Pt(8 if dots_only else max(7.0, min(14.0, round(s["size"] * 0.92, 1))))
        prev_x1 = s["bbox"][2]


def _editable_region(cell, page: pymupdf.Page, rect: pymupdf.Rect, scale: float, first: bool) -> None:
    bands = _graphic_bands(page, rect)

    def in_band(l: _Line):
        cy = (l.y0 + l.y1) / 2
        return any(a <= cy <= b for a, b in bands)

    blocks: list[tuple[float, float, str, object]] = [(a, b, "pic", None) for a, b in bands]
    blocks += [(l.y0, l.y1, "text", l) for l in _lines(page, rect) if not in_band(l)]
    blocks.sort(key=lambda b: b[0])

    cursor = rect.y0
    para = None
    last: _Line | None = None
    for y0, y1, kind, obj in blocks:
        gap = y0 - cursor
        space = gap * scale if gap > MIN_SPACE else 0.0
        if kind == "pic":
            _picture(cell, page, pymupdf.Rect(rect.x0, y0, rect.x1, y1), scale, space_before=min(space, MAX_SPACE))
            para, last = None, None
            cursor = y1
            continue
        line: _Line = obj  # type: ignore[assignment]
        # Marks like "(2)" and labelled answer lines ("Percentage uncertainty = ....") sit to the right.
        right = line.x0 > rect.x0 + (rect.width * 0.35)
        same_para = (
            para is not None and last is not None and not right and line.y0 - last.y1 < JOIN_GAP and abs(line.x0 - last.x0) < 30
        )
        if same_para:
            para.add_run(" ")
        else:
            para = cell.add_paragraph()
            pf = para.paragraph_format
            pf.space_after = Pt(0)
            pf.space_before = Pt(min(space, MAX_SPACE))
            if right:
                para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            else:
                pf.left_indent = Pt(min(40.0, max(0.0, (line.x0 - rect.x0) * scale)))
        _add_runs(para, line.spans)
        last = line
        cursor = y1
    trailing = rect.y1 - cursor
    if trailing > MIN_SPACE:
        p = cell.add_paragraph()
        p.paragraph_format.space_before = Pt(min(trailing * scale, MAX_SPACE))
        p.paragraph_format.space_after = Pt(0)


# ---------------------------------------------------------------------------- main


def build_docx(spec: DocxSpec, pdfs: dict[str, bytes]) -> bytes:
    docs = {pid: pymupdf.open(stream=data, filetype="pdf") for pid, data in pdfs.items()}
    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Mm(210), Mm(297)
    sec.left_margin = sec.right_margin = sec.top_margin = sec.bottom_margin = MARGIN
    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(11)
    normal.element.rPr.rFonts.set(qn("w:eastAsia"), FONT)

    h = spec.header
    if h.school:
        _para(doc, h.school.upper(), bold=True, size=11, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    _para(doc, h.title or spec.title, bold=True, size=16, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    info = "     ".join(x for x in [
        h.className and f"Class: {h.className}",
        h.timeAllowed and f"Time: {h.timeAllowed}",
        f"Total: {spec.total_marks} marks",
    ] if x)
    rule = _para(doc, info, size=10, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=6)
    if h.instructions:
        for line in h.instructions.splitlines():
            rule = _para(doc, line, size=10, space_after=2)
    _bottom_rule(rule)

    for item in spec.items:
        src = docs[item.paper_id]
        table = doc.add_table(rows=1, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.LEFT
        table.autofit = False
        _no_borders(table)
        num_cell, body = table.rows[0].cells
        _fix_widths(table, [NUMBER_COL, Mm(210 - 40) - NUMBER_COL])
        num_cell.paragraphs[0].add_run(str(item.number)).bold = True
        body._tc.remove(body.paragraphs[0]._p)  # start empty

        widest = max((r.x1 - r.x0) for r in item.regions) if item.regions else 1
        scale = min(1.0, CONTENT_W_PT / widest)
        for i, r in enumerate(item.regions):
            page = src[r.page]
            rect = pymupdf.Rect(r.x0, r.y0, r.x1, r.y1) & page.rect
            if spec.mode == "editable":
                _editable_region(body, page, rect, scale, first=i == 0)
            else:
                _picture(body, page, rect, scale, space_before=0 if i == 0 else 4)
        if not body.paragraphs:
            body.add_paragraph()

        marks = f"{item.marks} mark{'' if item.marks == 1 else 's'}"
        _para(doc, f"(Total for Question {item.number} is {marks})", bold=True, size=11,
              align=WD_ALIGN_PARAGRAPH.RIGHT, space_before=4, space_after=12)

    _para(doc, f"TOTAL FOR PAPER IS {spec.total_marks} MARKS", bold=True, size=12,
          align=WD_ALIGN_PARAGRAPH.RIGHT, space_before=8)

    doc.core_properties.title = h.title or spec.title
    doc.core_properties.author = "Papersmith"
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


__all__ = ["DocxSpec", "build_docx"]
