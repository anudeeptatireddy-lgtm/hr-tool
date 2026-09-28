# Kargo Hiring Screener

Screens applicants for Kargo's PM and Senior PM roles against the pattern of Arjun's best past hires, and turns his decision into the follow-up emails and a decision log. See `CLAUDE.md` for the rules and build plan and `docs/SPEC.md` for the rubric.

## Setup

```bash
~/.local/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then fill in the keys
```

## Milestone 1: text extraction check

```bash
.venv/bin/python -m scripts.check_extract
```

This prints file, format, character count and ok/failed for every file under `data/`. It prints no CV contents.
