"""Pearson Edexcel International GCSE parser.

Thresholds are deliberately left empty until Phase 3, when they are measured from real
sample papers in /samples (span x-bands, font sizes, bold flags) — not guessed.
"""
from __future__ import annotations

from dataclasses import dataclass

import fitz

from .base import BaseParser, Question


@dataclass(frozen=True)
class EdexcelConfig:
    # Filled in Phase 3 from measurements.
    number_column_max_x: float | None = None
    part_label_x_band: tuple[float, float] | None = None
    marks_min_x: float | None = None
    header_band: float | None = None
    footer_band: float | None = None
    total_line_pattern: str = r"\(Total for Question (\d+) (?:is|=) (\d+) marks?\)"
    part_marks_pattern: str = r"^\((\d+)\)$"


class EdexcelParser(BaseParser):
    key = "edexcel"
    version = "0.0.1"

    def __init__(self, config: EdexcelConfig | None = None):
        self.config = config or EdexcelConfig()

    def find_questions(self, doc: fitz.Document) -> list[Question]:
        return []
