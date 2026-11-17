import pymupdf

from cover import read_cover


def _pdf(text: str) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_textbox(pymupdf.Rect(40, 40, 560, 800), text)
    return doc.tobytes()


def test_ial_cover():
    c = read_cover(_pdf(
        "Pearson Edexcel International Advanced Level Tuesday 23 January 2024 Afternoon "
        "WPH13/01 Paper reference Physics UNIT 3: Practical Skills in Physics I You must have"
    ))
    assert c["paper_code"] == "WPH13/01"
    assert (c["series"], c["year"]) == ("January", 2024)
    assert c["qualification"] == "International A Level"
    assert c["title"] == "Unit 3: Practical Skills in Physics I"


def test_igcse_cover():
    c = read_cover(_pdf("Pearson Edexcel International GCSE Tuesday 19 May 2020 Mathematics A Paper 1H 4MA1/1H Higher Tier"))
    assert c["paper_code"] == "4MA1/1H"
    assert (c["series"], c["year"]) == ("June", 2020)
    assert c["qualification"] == "International GCSE"
    assert c["tier"] == "H"


def test_unknown_cover_is_blank_not_an_error():
    c = read_cover(_pdf("Some worksheet"))
    assert c["paper_code"] is None and c["year"] is None
