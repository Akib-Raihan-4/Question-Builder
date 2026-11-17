"""'By hand' mode: no automatic detection. The paper is stored with its page size and the admin
draws every question box in the review screen. Used for layouts the board parsers don't know
(and works for scanned papers too, since nothing needs the text layer)."""
from __future__ import annotations

import pymupdf

from .base import BaseParser, Question, SegmentResult


class ManualParser(BaseParser):
    key = "manual"
    version = "manual"

    def segment(self, pdf_bytes: bytes) -> SegmentResult:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        first = doc[0].rect
        return SegmentResult(
            parser_key=self.key, parser_version=self.version, page_count=doc.page_count,
            page_width=first.width, page_height=first.height, questions=[],
            warnings=["Questions are marked by hand for this paper."],
        )

    def find_questions(self, doc: pymupdf.Document) -> list[Question]:
        return []
