# Kargo Hiring Screener — Project Context for Claude Code

## What we're building and why

Arjun Mehta is the founder of Kargo, a Series A logistics SaaS company in Mumbai. He has no HR team. Two roles, Product Manager and Senior Product Manager, have been open for 11 weeks: 60 applications, 19 opened, 0 offers. He reviews CVs late at night on instinct, keeps no record of why, and candidates never hear back.

This tool screens every applicant against the pattern of Arjun's best past hires (not against the job spec). It gives him a ranked shortlist, and for each person it shows who they are, why they ranked there, and what to probe. After that, **his only action is one click per candidate: Advance, Decline, or Hold.** Everything after that click happens automatically: invite and decline emails, and the decision log.

**Core principle: the system recommends, Arjun decides. His decision is the last thing he touches.**

## Read these first

1. `docs/SPEC.md` is the scoring spec and the source of truth for the rubric, weights, anchors, gates, extraction schema, card fields and probe questions. If it still contains a placeholder, stop and ask the user for it.
2. `data/brief/case_brief.pdf` is the original case.
3. `data/jds/*.docx` contains the two job descriptions.
4. `data/hires/*.docx` contains the 8 past-hire CVs. Their ratings are below; they are not in the files.
5. `data/applications/` holds the 60 applicant CVs in mixed formats. It may be empty until the user adds them.

### Past-hire ratings (the ground truth for the back-test)

| File | Name | Role | Rating |
|---|---|---|---|
| cv_01 | Rohan Desai | Head of Engineering | Exceeds |
| cv_02 | Sunita Krishnamurthy | Operations Lead | Exceeds |
| cv_03 | Vikram Nair | Product Manager | Meets |
| cv_04 | Aditya Shetty | Sales Lead | Exceeds |
| cv_05 | Preetham Rao | Backend Engineer | Below |
| cv_06 | Meghna Tiwari | Customer Success Manager | Exceeds |
| cv_07 | Lavanya Iyer | Product Manager | Exceeds |
| cv_08 | Rahul Bose | Growth & Marketing Lead | Meets |

## What each file is for (developer rules, from the user)

We are building the screening tool. We do not screen candidates ourselves.

- `data/hires/` = **test fixtures.** Use them only to build the extractor and run the Milestone 3 back-test. Never hand-score them. Never hardcode their names or expected scores into code or prompts.
- `data/jds/` = **runtime input for gates only** (tenure, location, integration requirement). The JDs never drive ranking. If a JD and SPEC.md disagree, SPEC.md wins.
- `data/applications/` = **runtime input.** Don't open or read these CVs beyond checking that extraction works on 2–3 samples. Ranking happens only by running the pipeline.
- `docs/SPEC.md` = the rubric. When turning the anchors into the scoring prompt, remove all hire names and hire-specific examples and describe each 0–3 level generically. The back-test must run on hire CVs **with names removed**, so the model can't recognise them.
- No calibration examples from the hires in the Context stage. The rubric anchors are the context.

## Rubric summary (full detail in SPEC.md)

- **S1 Hands-on logistics operations (40%)**: did they personally do ops work inside a forwarder, CHA, 3PL, NVOCC, port or shipper logistics desk? This requires a doing-verb, a duration and a volume. Building or selling software *for* logistics scores 1, not 3.
- **S2 Built the missing fix, and others adopted it (30%)**: an unprompted fix with an adoption count. Scores 3 if operators or customers adopted it, 2 if their own team did.
- **S3 Owned the outcome with no layer above (20%)**: sole owner plus a crisis they carried to resolution.
- **S4 Kills and post-mortems (10%)**: they killed or reversed their own work on data.
- Each signal is scored 0–3. Total = sum of (score ÷ 3 × weight).
- PM weights: 40/30/15/15. Senior PM weights: 40/30/20/10.
- Bands: 65 or more is Shortlist; 45–64 is Borderline; under 45 is Decline recommendation.
- Gates come from the JDs: tenure range, Mumbai or willing to relocate, and for Senior PM an owned integration or platform area.
- **Ignore completely:** college or MBA tier, generic certificates, conference talks, company size, and years beyond the minimum.

## Architecture (follows the user's Components Map, `docs/components_map.png` if added)

| Stage | Actor | What happens |
|---|---|---|
| Trigger | Founder | Uploads a CV and selects the role applied for (PM / Senior PM). The existing 60 in `data/applications/` run as a batch, with the role detected from the CV and asked in the UI if unclear. |
| Input | Founder | CV file + selected role |
| Context | System | Extracts candidate info and prepares data. **Personal details are removed before anything goes to the AI** (name, email, phone, profile links; employer and college names are stripped before scoring). JD = gates only; rubric = SPEC.md anchors described generically. |
| Processing | System | Scores the candidate against **both** the PM and Senior PM rubrics in code, from the extraction JSON only. Signal scores S1–S4 are role-independent; each role applies its own weights and gates. |
| AI | AI model (Gemini) | Call 1: extraction to JSON (before scoring). Call 2: generates the interview brief and a personalised email draft (invite or rejection) from the scored record, never the raw CV. |
| Output | Founder | Hiring dashboard: ranked candidates, scores, interview brief and draft emails with one-click send |
| Email | Resend | Sends the email only when the founder clicks send; status goes back to the dashboard |

Still required though not drawn on the map: Hold as a third option, the decision log and audit view (hard rule 8), top 5 labelled "below pattern threshold", and the nightly digest.

### Default stack (change only if the user asks)

- Python 3.11+ (3.12 in `.venv`). **Gemini** (user's choice) via its REST v1 endpoint with `httpx`; model `gemini-3.6-flash` (`GEMINI_MODEL`).
- `resend` Python SDK for email.
- Streamlit for Arjun's UI: one page, cards sorted by score, three buttons per card.
- SQLite for candidates, scores, evidence and decisions.
- Text extraction: `pypdf` or `pdfplumber` for PDF, `python-docx` for DOCX, plain read for TXT. Log and skip anything unreadable; never crash the batch.
- Config via `.env` (see `.env.example`).

## Hard rules (do not break these)

1. **Every score must cite a `cv_quote` copied verbatim from the CV. No quote means no credit.** Validate that the quote actually appears in the extracted text; if it doesn't, set that signal's score to 0 and flag it.
2. **Extraction and scoring are separate steps.** Per the Components Map, scoring runs in code from the extraction JSON only; it never sees the raw CV. The brief/email call also works from the scored record, not the CV.
3. **Never send any email without Arjun's click.** No automatic declines on score alone. **Offers are never automated**; the tool stops at the interview invite.
4. **DEMO_MODE=true redirects every email to DEMO_RECIPIENT.** The candidates are fictional; never email the addresses in their CVs. Resend's test sender also only delivers to the account owner's email.
5. Before the scoring call, remove employer names, college names, photos, age, gender and marital status. Score the work described, not who they know or where they studied.
6. If fewer than 5 candidates reach 65, show the top 5 anyway, labelled "below pattern threshold".
7. Model output must be JSON. Strip code fences, parse safely, and retry once on a parse failure, then flag it.
8. Log every decision with a timestamp, score, band and rationale. This record is part of the product.

## Build order (stop after each milestone and show the user)

1. **Setup:** scaffold the repo, `.env` loading, and a text extractor that works on every file in `data/`. Print a table of file, format, character count, and ok/failed.
2. **Extraction:** call 1 on the 8 hire CVs and save the JSON. Show one example.
3. **Scoring + back-test (the key acceptance test):** score the 8 hires using the default 40/30/20/10 weights. **Pass condition: all 5 Exceeds hires score 65 or more, and Vikram, Rahul and Preetham score under 65.** SPEC.md section 6 has the expected scores (Lavanya 100, Rohan, Sunita and Meghna 93.3, Aditya 86.7, Rahul 40, Preetham 33.3, Vikram 26.7). Small differences are fine, but band flips are not. If it fails, fix the prompts, not the thresholds.
4. **Applicants:** run gates plus scoring on all files in `data/applications/`. Output the ranked list and the score distribution.
5. **UI:** a Streamlit card for each candidate: headline, 2 "why ranked here" lines with quotes, 1 risk line, 3 probe questions, and Advance, Decline and Hold buttons. Borderline candidates are collapsed; Declines are in a separate tab.
6. **Emails via Resend:** the invite (role, a next step with a scheduling link placeholder, and a location or relocation question if unknown) and a decline (warm, specific, sent within 48 hours of the click). Also a nightly digest to ARJUN_EMAIL listing new shortlisted candidates.
7. **Audit view:** a table of every decision with rationale, exportable to CSV.

## Out of scope

Offer letters or offer emails, calendar booking integrations (use a link placeholder), an ATS, multi-user login, and retraining the rubric automatically. Also retroactive mass emails to the 19 previously opened applicants: build it as a list Arjun approves, never as an automatic send.

## When unsure

Ask the user before guessing on anything involving rubric weights, thresholds, email wording, or which files to include. Everything else, decide sensibly and note it in `docs/DECISIONS.md`.
