import pymupdf

from parsers import get_parser


def test_manual_parser_returns_page_info_only():
    doc = pymupdf.open()
    doc.new_page(width=595.28, height=841.89)  # even a page with no text (a scan) is fine
    r = get_parser("manual").segment(doc.tobytes())
    assert r.status == "ok" and r.questions == [] and r.page_count == 1
