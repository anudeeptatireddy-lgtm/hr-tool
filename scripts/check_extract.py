"""Milestone 1: extract text from every file under data/ and print a status table.

Only prints counts and status, never CV contents, so it is safe to run on applications.
Usage: .venv/bin/python -m scripts.check_extract
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from screener import config  # noqa: E402
from screener.extract_text import extract  # noqa: E402

SKIP_NAMES = {"README.md", ".DS_Store"}


def main() -> int:
    print("Config:")
    for k, v in config.summary().items():
        print(f"  {k:<18} {v}")
    print()

    files = sorted(
        p for p in config.DATA.rglob("*")
        if p.is_file() and p.name not in SKIP_NAMES and not p.name.startswith("~$")
    )
    rows = [extract(p) for p in files]
    w = max(len(str(r.path.relative_to(config.DATA))) for r in rows) if rows else 10
    print(f"{'file':<{w}}  {'format':<6}  {'chars':>7}  status")
    print("-" * (w + 28))
    for r in rows:
        status = "ok" if r.ok else f"FAILED ({r.error})"
        print(f"{str(r.path.relative_to(config.DATA)):<{w}}  {r.fmt:<6}  {r.chars:>7}  {status}")
    ok = sum(r.ok for r in rows)
    print("-" * (w + 28))
    print(f"{ok} of {len(rows)} ok")
    apps = [p for p in files if p.parent.name == "applications"]
    print(f"data/applications: {len(apps)} CV files")
    return 0 if ok == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
