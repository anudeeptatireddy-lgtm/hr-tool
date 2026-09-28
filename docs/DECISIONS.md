# Decisions

Choices made where the spec was silent. Anything touching weights, thresholds, email wording or which files to include is asked, not decided here.

## Milestone 1 · Setup

1. **Project location:** `~/kargo-screener`, next to the other projects (`~/common-ground`, `~/skinstinct-*`). Copied from `~/Downloads/kargo-screener`. The placeholder `docs/SPEC.md` was replaced with the full spec from `~/Downloads/SPEC.md`. `CLAUDE.md` is the same file as `~/Downloads/Rubrics.md`.
2. **Python 3.12** in `.venv` (from `~/.local/bin/python3.12`). The system Python is 3.9, below the 3.11 minimum.
3. **Model:** `claude-sonnet-5` is the current Sonnet id. It's set via `ANTHROPIC_MODEL` in `.env`, so it can change without a code edit.
4. **Legacy `.doc` and `.rtf`** go through macOS's built-in `textutil`, so no extra install is needed. This ties `.doc` support to macOS; `antiword` would be the Linux fallback if we ever deploy.
5. **PDF:** `pdfplumber` first, with `pypdf` as a fallback when it returns no text.
6. **DOCX tables are read too.** `python-docx` skips table cells in `.paragraphs`, and CVs often put roles or skills in tables. Repeated text from merged cells is de-duplicated.
7. **"Failed" means under 200 characters**, as well as unreadable. A near-empty result is usually a scanned image, and scoring it would just produce zeros. It's logged and skipped. There's no OCR.
8. **Whitespace is normalised** (runs of spaces collapsed, at most one blank line). Milestone 3's verbatim-quote check will compare against this same normalised text, with whitespace-insensitive matching.
9. **`DEMO_MODE` defaults to true** when missing from `.env`, so a missing setting can never email a real candidate.
10. **The data rules the user gave** (hires = test fixtures, JDs = gates only, applications not read by hand, no hire names or examples in prompts, names removed for the back-test) are recorded in `CLAUDE.md` under "What each file is for". The Context row of the architecture table was updated to match.
