from .base import BaseParser
from .edexcel import EdexcelParser

PARSERS: dict[str, type[BaseParser]] = {
    "edexcel": EdexcelParser,
}


def get_parser(key: str) -> BaseParser:
    try:
        return PARSERS[key]()
    except KeyError as e:
        raise ValueError(f"Unknown parser '{key}'. Available: {', '.join(PARSERS)}") from e
