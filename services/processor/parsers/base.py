"""Shared contract every board parser implements.

All coordinates are PDF points with a TOP-LEFT origin (PyMuPDF native); pages are 0-based.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Literal

import pymupdf as fitz
from pydantic import BaseModel, Field


class Region(BaseModel):
    page: int
    x0: float
    y0: float
    x1: float
    y1: float


class Part(BaseModel):
    label: str  # "a", "b(i)"
    marks: int = 0
    text: str = ""
    regions: list[Region] = Field(default_factory=list)


class Question(BaseModel):
    number: int
    total_marks: int = 0
    confidence: float = 1.0
    text: str = ""
    warnings: list[str] = Field(default_factory=list)
    regions: list[Region] = Field(default_factory=list)
    parts: list[Part] = Field(default_factory=list)


class SegmentResult(BaseModel):
    parser_key: str
    parser_version: str
    status: Literal["ok", "failed"] = "ok"
    reason: str | None = None
    page_count: int
    page_width: float
    page_height: float
    questions: list[Question] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class BaseParser(ABC):
    key: str
    version: str

    def segment(self, pdf_bytes: bytes) -> SegmentResult:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        first = doc[0].rect
        base = dict(
            parser_key=self.key,
            parser_version=self.version,
            page_count=doc.page_count,
            page_width=first.width,
            page_height=first.height,
        )
        # v1 supports text-based PDFs only: a page with no text layer means a scan.
        scanned = [i + 1 for i, p in enumerate(doc) if not p.get_text("text").strip()]
        if scanned and len(scanned) > doc.page_count // 2:
            return SegmentResult(
                **base, status="failed",
                reason=f"No text layer on pages {scanned[:10]}… — scanned PDFs are not supported in v1.",
            )
        questions = self.find_questions(doc)
        return SegmentResult(**base, questions=questions, warnings=self.paper_warnings(questions))

    def paper_warnings(self, questions: list[Question]) -> list[str]:
        return []

    @abstractmethod
    def find_questions(self, doc: fitz.Document) -> list[Question]:
        """Board-specific segmentation. Implemented in Phase 3 from measured samples."""
