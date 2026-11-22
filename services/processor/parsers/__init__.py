from .base import BaseParser
from .edexcel import EdexcelParser
from .manual import ManualParser
from .ial_pure import IalPureParser, is_ial_pure

PARSERS: dict[str, type[BaseParser]] = {
    "edexcel": EdexcelParser,
    "manual": ManualParser,
}


def get_parser(key: str) -> BaseParser:
    try:
        return PARSERS[key]()
    except KeyError as e:
        raise ValueError(f"Unknown parser '{key}'. Available: {', '.join(PARSERS)}") from e


def parser_for(key: str, pdf_bytes: bytes) -> BaseParser:
    """The parser for this paper. Edexcel IAL Pure Mathematics P1–P4 papers (read from the cover)
    get their own whole-question parser; every other paper uses the parser it was sent to."""
    parser = get_parser(key)
    if key == "edexcel":
        import pymupdf

        try:
            if is_ial_pure(pymupdf.open(stream=pdf_bytes, filetype="pdf")):
                return IalPureParser()
        except Exception:  # an unreadable PDF: let the normal parser report it
            pass
    return parser
