"""Turn sideways pages upright (some mark schemes print landscape tables on portrait pages).

Only each page's /Rotate is set; the content is untouched. Readers and the app then work with
the page as displayed, so the stored file, the boxes and what teachers see all agree.
"""
from __future__ import annotations

from collections import Counter

import pymupdf

# Text running this way (as the page displays now) → the extra turn that makes it read normally.
TURN = {(0, -1): 90, (0, 1): 270, (-1, 0): 180}


def upright(data: bytes) -> bytes | None:
    """The PDF with its sideways pages turned upright, or None if every page already reads normally."""
    doc = pymupdf.open(stream=data, filetype="pdf")
    changed = False
    for page in doc:
        m = page.rotation_matrix
        dirs = Counter()
        for b in page.get_text("dict")["blocks"]:
            for ln in b.get("lines", []):
                # Direction as displayed (an already-set /Rotate counts), weighted by text length.
                d = pymupdf.Point(ln["dir"]) * m - pymupdf.Point(0, 0) * m
                dirs[(round(d.x), round(d.y))] += sum(len(s["text"]) for s in ln["spans"])
        if not dirs:
            continue
        way, _ = dirs.most_common(1)[0]
        if way in TURN:
            page.set_rotation((page.rotation + TURN[way]) % 360)
            changed = True
    return doc.tobytes(garbage=0) if changed else None
