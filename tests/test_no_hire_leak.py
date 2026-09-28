"""Guard: no past-hire name may appear in any prompt or code file.

Names are read from the fixture file names at test time, so they are never written into the code.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def hire_name_parts():
    parts = set()
    for f in (ROOT / "data" / "hires").glob("cv_*.docx"):
        for p in f.stem.split("_")[2:]:
            if len(p) > 2:
                parts.add(p.lower())
    return parts


def test_prompts_and_code_have_no_hire_names():
    names = hire_name_parts()
    assert names, "no hire fixtures found"
    files = list((ROOT / "screener").rglob("*.py")) + list((ROOT / "screener").rglob("*.md")) + list((ROOT / "scripts").rglob("*.py"))
    hits = [(f.name, n) for f in files for n in names if n in f.read_text().lower()]
    assert not hits, f"hire names found: {hits}"


def test_redaction_removes_names_from_every_hire():
    from screener.extract_text import extract
    from screener.redact import redact_identity

    for f in (ROOT / "data" / "hires").glob("cv_*.docx"):
        text, _ = redact_identity(extract(f).text)
        low = text.lower()
        for p in f.stem.split("_")[2:]:
            assert p.lower() not in low, f"{f.name}: name part left after redaction"
