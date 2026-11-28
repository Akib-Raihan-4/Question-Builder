from .base import BaseParser
from .edexcel import EdexcelParser
from .manual import ManualParser
from .ial_pure import IalPureParser, is_ial_pure
from .adaptive import AdaptiveParser, adds_up
from .base import SegmentResult

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


def segment(key: str, pdf_bytes: bytes) -> SegmentResult:
    """Find a paper's questions: the board's parser first; if its questions don't add up to the
    paper's printed total, the adaptive parser (no layout rules) — kept only if its add up."""
    result = parser_for(key, pdf_bytes).segment(pdf_bytes)
    if key == "manual" or result.status != "ok":
        return result
    import pymupdf

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    if adds_up(result, doc):
        return result
    adaptive = AdaptiveParser().segment(pdf_bytes)
    return adaptive if adaptive.status == "ok" and adds_up(adaptive, doc) else result
