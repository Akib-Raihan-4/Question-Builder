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


def test_regional_paper_code():
    c = read_cover(_pdf("Mathematics B Paper 2R Paper Reference 4MB1/02R Wednesday 15 January 2020 Pearson Edexcel International GCSE"))
    assert c["paper_code"] == "4MB1/02R"
    assert (c["series"], c["year"]) == ("January", 2020)


def test_specimen_cover():
    c = read_cover(_pdf("Pearson Edexcel International GCSE Mathematics B Paper 1 Specimen Paper Paper Reference 4MB1/01 "
                        "Time: 1 hour 30 minutes S50135A ©2016 Pearson Education Ltd."))
    assert c["paper_code"] == "4MB1/01"
    assert (c["series"], c["year"]) == ("Specimen", 2016)


def test_specimen_in_a_question_is_not_a_specimen_paper():
    doc = pymupdf.open()
    doc.new_page().insert_textbox(pymupdf.Rect(40, 40, 560, 800), "Pearson Edexcel International Advanced Level Tuesday 23 January 2024 WPH13/01")
    doc.new_page().insert_textbox(pymupdf.Rect(40, 40, 560, 800), "1 A student measured the diameter of a specimen of wire.")
    c = read_cover(doc.tobytes())
    assert (c["series"], c["year"]) == ("January", 2024)
