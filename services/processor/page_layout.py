"""Where things are on each page, so answer space can be removed later.

For every page we return two lists of boxes (PDF points, top-left origin, rounded to 0.5 pt):
  ink   – everything that must be kept: text lines (except rows of answer dots), drawings
          (diagrams, graph grids, tables, boxes) and images.
  dots  – rows of answer dots ("......", also ". . ." and "...... , ......" for coordinates), and
          ruled answer lines typed as underscores ("________", IAL Mathematics booklets).
A labelled answer line ("Percentage uncertainty = ......") is one text line with words in it,
so it counts as ink and is always kept.

The web app decides what to remove inside a stored region from these boxes; nothing here
depends on regions, so admin edits to boxes never make this stale.
"""
from __future__ import annotations

import re

import pymupdf
from pydantic import BaseModel

DOT_LINE = re.compile(r"^[\s.,…·_]*$")
EDGE = 50.0  # pt: vertical "DO NOT WRITE IN THIS AREA" text lives in the page margins


class PageLayout(BaseModel):
    ink: list[list[float]]
    dots: list[list[float]]


class LayoutResult(BaseModel):
    version: int = 1
    pages: list[PageLayout]


def _box(r) -> list[float]:
    return [round(v * 2) / 2 for v in (r[0], r[1], r[2], r[3])]


def _is_white(color) -> bool:
    return color is not None and len(color) >= 3 and min(color[:3]) > 0.97


def page_layout(page: pymupdf.Page) -> PageLayout:
    W, H = page.rect.width, page.rect.height
    ink: list[list[float]] = []
    dots: list[list[float]] = []

    for block in page.get_text("dict")["blocks"]:
        if block.get("type") == 1:  # image
            ink.append(_box(block["bbox"]))
            continue
        for line in block.get("lines", []):
            text = "".join(s["text"] for s in line["spans"])
            if not text.strip():
                continue
            x0, y0, x1, y1 = line["bbox"]
            horizontal = abs(line["dir"][1]) < 0.01
            if not horizontal and (x1 < EDGE or x0 > W - EDGE):
                continue  # margin warnings
            if DOT_LINE.match(text) and (text.count(".") + text.count("…") * 3 >= 10 or text.count("_") >= 20):
                dots.append(_box(line["bbox"]))
            else:
                ink.append(_box(line["bbox"]))

    for d in page.get_drawings():
        r = d["rect"]
        if r.width > W * 0.8 and r.height > H * 0.8:
            continue  # page frame
        if d.get("type") == "f" and _is_white(d.get("fill")):
            continue  # white boxes painted over the page
        if r.width < 0.5 and r.height < 0.5:
            continue
        ink.append(_box(r))

    for info in page.get_image_info():
        ink.append(_box(info["bbox"]))

    return PageLayout(ink=ink, dots=dots)


def paper_layout(data: bytes) -> LayoutResult:
    doc = pymupdf.open(stream=data, filetype="pdf")
    return LayoutResult(pages=[page_layout(p) for p in doc])


__all__ = ["LayoutResult", "PageLayout", "paper_layout", "page_layout"]
