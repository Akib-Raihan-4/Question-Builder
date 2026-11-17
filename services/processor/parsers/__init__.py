from .base import BaseParser
from .edexcel import EdexcelParser
from .manual import ManualParser

PARSERS: dict[str, type[BaseParser]] = {
    "edexcel": EdexcelParser,
    "manual": ManualParser,
}


def get_parser(key: str) -> BaseParser:
    try:
        return PARSERS[key]()
    except KeyError as e:
        raise ValueError(f"Unknown parser '{key}'. Available: {', '.join(PARSERS)}") from e
