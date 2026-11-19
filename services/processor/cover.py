"""Read paper details (code, series, year, level, tier) from a question paper's cover page.

Best effort: any field may be None and the admin fills it in. Covers vary by year, e.g.
  'Pearson Edexcel International Advanced Level Tuesday 23 January 2024 ... WPH13/01 Paper reference'
  'Pearson Edexcel International GCSE Tuesday 19 May 2020 ...'
"""
from __future__ import annotations

import re

import pymupdf

MONTH_TO_SERIES = {
    "january": "January", "february": "January", "march": "January",
    "may": "June", "june": "June",
    "october": "October",
    "november": "November",
}


def read_cover(pdf_bytes: bytes) -> dict:
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    text = " ".join(" ".join(doc[i].get_text().split()) for i in range(min(2, doc.page_count)))
    cover = " ".join(doc[0].get_text().split()) if doc.page_count else ""
    out: dict = {"paper_code": None, "series": None, "year": None, "qualification": None, "tier": None, "title": None}

    # Paper reference: 4MB1/01, 4MA1/1H, 4PH1/2PR, WPH13/01, 9MA0/01 ...
    m = re.search(r"\b([0-9A-Z]{4,6})\s*/\s*(\d{1,2}[A-Z]{0,3})\b", text)
    if m:
        out["paper_code"] = f"{m.group(1)}/{m.group(2)}"
    m = re.search(r"\b(January|February|March|May|June|October|November)\s+(20\d{2})\b", text)
    # Only the cover itself: "a specimen of wire" in a question on page 2 is not a specimen paper.
    if re.search(r"\bSpecimen (?:Paper|Papers|Material)|\bSpecimen\b(?=.{0,80}Paper Reference)|Sample Assessment", cover, re.I):
        # Specimen / sample assessment papers: dated by "Specimen 2017", "first teaching
        # September 2016" or, failing that, the copyright year.
        out["series"] = "Specimen"
        y = (re.search(r"Specimen(?:\s+Papers?)?\s+(20\d{2})", cover, re.I)
             or re.search(r"first teaching[^0-9]{0,40}(20\d{2})", cover, re.I)
             or re.search(r"©\s*(20\d{2})", cover))
        out["year"] = int(y.group(1)) if y else (int(m.group(2)) if m else None)
    elif m:
        out["series"] = MONTH_TO_SERIES[m.group(1).lower()]
        out["year"] = int(m.group(2))
    if re.search(r"International Advanced (Level|Subsidiary)", text):
        out["qualification"] = "International A Level"
    elif "International GCSE" in text:
        out["qualification"] = "International GCSE"
    elif re.search(r"\bGCE\b|Advanced Level", text):
        out["qualification"] = "A Level"
    elif "GCSE" in text:
        out["qualification"] = "GCSE"
    m = re.search(r"\b(Higher|Foundation) Tier\b", text)
    if m:
        out["tier"] = m.group(1)[0]
    m = re.search(r"\bUNIT\s+(\d+)\s*:\s*([A-Za-z ,&'-]+?)(?=\s+(?:You|Instructions|Candidates|Total|\*|$))", text)
    if m:
        out["title"] = f"Unit {m.group(1)}: {m.group(2).strip()}"
    return out
