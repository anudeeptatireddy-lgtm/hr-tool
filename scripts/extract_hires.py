"""Milestone 2: run extraction (call 1) on the 8 hire CVs with identity removed.

Hires are test fixtures: we redact each CV's own name, email, phone and profile links so the
model can't recognise the person. Output: output/extractions/hires/<file>.json
Usage: .venv/bin/python -m scripts.extract_hires [--only cv_07]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from screener import config  # noqa: E402
from screener.extract_text import extract  # noqa: E402
from screener.extraction import check_quotes, extract_evidence  # noqa: E402
from screener.redact import redact_identity  # noqa: E402

OUT = config.OUTPUT / "extractions" / "hires"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="substring of a file name to run just that one")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    files = sorted((config.DATA / "hires").glob("*.docx"))
    if args.only:
        files = [f for f in files if args.only in f.name]
    failed = 0
    print(f"{'file':<34} {'name removed':<13} {'quotes ok':>9}  status")
    for f in files:
        doc = extract(f)
        if not doc.ok:
            print(f"{f.name:<34} {'-':<13} {'-':>9}  text extraction failed: {doc.error}")
            failed += 1
            continue
        text, name = redact_identity(doc.text)
        name_left = bool(name) and any(p.lower() in text.lower() for p in name.split() if len(p) > 2)
        ev, err = extract_evidence(text)
        if ev is None:
            print(f"{f.name:<34} {'yes' if name and not name_left else 'NO':<13} {'-':>9}  FLAGGED: {err}")
            failed += 1
            continue
        quotes = check_quotes(ev, text)
        ok = sum(q["verified"] for q in quotes)
        record = {"source_file": f.name, "redacted_text": text, "evidence": ev, "quote_check": quotes}
        (OUT / f"{f.stem}.json").write_text(json.dumps(record, indent=2, ensure_ascii=False))
        print(f"{f.name:<34} {'yes' if name and not name_left else 'NO':<13} {ok:>4}/{len(quotes):<4}  saved")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
