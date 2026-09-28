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

## Milestone 2 · Extraction

11. **DOCX is read in document order.** One hire CV keeps its name and contact block in a table, and reading tables last had moved it to the end, where name detection missed it. Body paragraphs and tables are now read in the order they appear.
12. **Identity redaction for the back-test** (`screener/redact.py`): the name is read from the CV's own first line, never hardcoded. The full name and each part of it (first and last) are replaced with `[CANDIDATE]` anywhere in the text, which also catches names inside quoted references. Email, phone and any web address with a path (LinkedIn, GitHub, LeetCode) are replaced too. Employer names stay in for extraction (user confirmed): the model needs them to judge employer type. They get stripped before scoring (Milestone 3).
13. **Quote checks run against the redacted text** the model actually saw. Matching ignores case, whitespace and curly-vs-straight quote and dash styles, and nothing else. A "..." join or a paraphrase fails.
14. **Schema extras beyond SPEC.md**, added so the scoring call can apply the anchors from the JSON alone:
    - `ops_roles[].role_title` and `ops_roles[].work_kind` (`hands_on_operations`, `embedded_with_ops_from_vendor` or `software_or_sales_for_logistics`). S1 hinges on hands-on versus software-for-logistics, and SPEC lists "a logistics company name on a tech role" as a false positive.
    - `software_vendor` as an `employer_type`.
    - `ownership.crisis_quote`: S3 needs both a sole-owner line and a crisis line, and these are often different lines.
    - `adjacent_years`: SPEC's PM gate counts BA or ops-analyst time at half weight.
    - `integration_quote`: the Senior PM gate needs evidence too.
    - `role_applied` may be `unclear`.
15. **JSON handling:** fences are stripped, and if the model wraps the JSON in prose, the outermost `{...}` is parsed. On failure it retries once with a "JSON only" reminder, then flags the file. A `refusal` or `max_tokens` stop is reported as the flag reason.
16. **No thinking or effort settings** are passed, so `claude-sonnet-5` uses its defaults. Revisit if extraction quality is poor.
17. **Guard tests** (`tests/`) fail if any hire name appears in a prompt or code file (names are read from the fixture file names at test time), or if redaction leaves a name in any hire CV.
18. **Switched to Gemini** at the user's request: `gemini-3.6-flash` on the v1 REST endpoint via `httpx`, with JSON response mode and temperature 0. This is the same setup that works in the common-ground project. 429 and 5xx errors are retried with backoff. The `anthropic` package was removed.
19. **The user's Components Map is now the architecture** (recorded in `CLAUDE.md`). Changes from the original plan:
    - Personal details are removed before *every* AI call, not only for the back-test.
    - Scoring is code, not a model call. It applies the SPEC anchors to the extraction JSON and scores both roles.
    - AI call 2 writes the interview brief and the email draft.
    - Emails are AI-drafted and sent on the founder's click.
    - Founder upload with a role picker is the trigger, and the 60 existing CVs run as a batch.
    - Items not drawn on the map but required by the hard rules (Hold, decision log, top-5 rule, digest) stay in.
20. **"Present" is counted to today.** For the hire fixtures this inflates tenure (they were hired years ago). It doesn't affect the back-test, which applies no gates.
21. **Extraction prompt, second pass** (general fixes, nothing hire-specific):
    - SPEC's S3 evidence words (sole, only, first, independently, no [role] above, reports to CEO/founder) were added.
    - `sole_owner` must be true whenever `layer_above` is "none".
    - Every build and every handled incident is listed separately.
    - `users` now means whose problem the build fixed.
    - Result: 59 of 59 quotes verified across the 8 hires.
