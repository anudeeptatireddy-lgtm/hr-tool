from screener.extraction import quote_in_text
from screener.llm import parse_json

CV = "— Managed carrier allocation for 3 accounts — combined throughput of 800+ shipments monthly\nBuilt a  dashboard."


def test_verbatim_quote_passes_with_whitespace_and_dash_differences():
    assert quote_in_text("Managed carrier allocation for 3 accounts - combined throughput of 800+ shipments monthly", CV)
    assert quote_in_text("built a dashboard.", CV)


def test_paraphrase_or_invented_quote_fails():
    assert not quote_in_text("Managed carrier allocation for 5 accounts", CV)
    assert not quote_in_text("Managed carrier allocation ... shipments monthly", CV)
    assert not quote_in_text("", CV)


def test_parse_json_strips_fences_and_prose():
    assert parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json('Here you go: {"a": 2} thanks') == {"a": 2}
