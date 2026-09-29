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

## Milestone 3 · Scoring, back-test, website

22. **Project renamed to HR Tool** and moved to `~/hr-tool` (was `~/kargo-screener`), with git history kept. It is separate from common-ground.
23. **Moved to TypeScript on Netlify** so the user can test the logic on a hosted site. Netlify doesn't run Python functions, and one implementation keeps the site, the back-test and the tests in agreement. Streamlit is replaced by two static pages.
24. **Scoring is code** (`src/scoring.ts`), per the Components Map. It reads only `work_kind`, `employer_type`, `months`, `hands_on_tasks`, `volume`, `users`, `adoption` and the ownership and kill flags. It never reads employer or college names. How each signal is scored:
    - **S1:** hands-on months are summed across roles. A role counts only if it's at an operator (forwarder, CHA, 3PL, NVOCC, port, shipper), has at least one doing-verb task, and has a duration.
      - 3 = 24+ months with a stated volume.
      - 2 = 24+ months with no volume (flagged low confidence), 6–23 months, or 24+ months embedded with ops teams from a vendor seat.
      - 1 = software, integration or sales work for logistics, or under 6 months hands-on.
    - **S2:** 3 = built for ops or customers, with adoption stated. 2 = adopted by their own team. 1 = a build with no adoption, or a tool for themselves.
    - **S3:** 3 = sole owner plus a crisis carried to resolution. 2 = sole owner only. 1 = a layer above them, or a crisis without sole ownership.
    - **S4:** 3 = killed or reversed their own work. 2 = a lesson adopted by others. 1 = an incident handled.
    - Every item needs a verified quote, or it gets no credit and is flagged.
25. **Median of 3 extractions.** Single runs varied by a point on S3 or S4, and one hire flipped band in 2 of 3 single-run back-tests. Each CV is now extracted 3 times in parallel, and the run with the median total is kept whole, so its quotes and card match. This triples AI calls per CV; Flash is cheap.
26. **Extraction prompt, third pass** (general rules, nothing hire-specific):
    - `work_kind` is decided from the tasks described, not the job title. SPEC's rule is a doing-verb next to an operational object. Commercial tasks don't count.
    - `own_call` is defined as reversing something they built or decided themselves. Replacing someone else's vendor, or fixing an incident, doesn't count.
    - An answer missing required keys counts as a failed parse and gets the one allowed retry.
27. **Back-test ground truth** is in `data/hires/ratings.json` (file id → rating). Only `scripts/backtest.ts` reads it. SPEC's expected per-hire scores aren't stored anywhere in the code. The published `public/backtest.json` shows file ids only, never names.
28. **Gates:**
    - PM: PM years + half of adjacent years must be 1.5–5.
    - Senior PM: 4–9 PM years, plus an owned integration or platform area with a verified quote.
    - Location: Mumbai, Navi Mumbai or Thane passes; willing to relocate passes; won't relocate fails; unknown becomes an "ask" (a question in the invite, not a decline).
    - A failed gate makes the recommendation Decline, but the score is still shown.
29. **Both roles are scored every time**, as the map asks. The card uses the role the founder picked. If none was picked, the CV's stated role is used; if that's unclear, the role is guessed from PM tenure (4+ years = Senior PM) and flagged "please confirm".
30. **Risk line:** when no signal lost points, it names the open gate question, or says the CV claims still need testing in interview. It no longer calls a 3/3 signal "weakest".
31. **The card is built in code for now.** AI call 2 (the interview brief and the email draft) comes with the email milestone.
32. **Neon set up** following the user's steps: `neon link` to project `wandering-truth-50280890`, branch `production`; `neon config init` with a minimal `neon.ts`; `neon deploy` reported no changes. `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `NEON_BRANCH` are in `.env` (git-ignored). Neon skills are installed in `.claude/skills/`. The Neon MCP server was added to the user-level Claude Code and VS Code configs, not the repo, with its own Neon API key (`neon api-keys revoke 3372008` removes it). The database isn't used yet; it will hold the decision log and audit trail (Milestones 5–7). Blobs keep job results until then.
33. **Neon replaces Netlify Blobs** (user's request). Each screening is one row in `screenings`: id, file name, role, status, the CV bytes while it runs, the result as JSONB, the error, and timestamps. The CV bytes are set to null when screening finishes, so no CVs are kept. The result (candidate name, email, evidence and scores) stays for the future decision log. The app uses the pooled URL over the HTTP driver; migrations use the direct URL, as Neon advises. `DATABASE_URL` is a secret env var on Netlify.
34. **The live site is `hrtoolproject`** (https://hrtoolproject.netlify.app). It's linked to GitHub `anudeeptatireddy-lgtm/hr-tool` and deploys every push to `main`, after the tests pass. Deploys come from Git, not from local uploads. The env vars `GEMINI_API_KEY` and `DATABASE_URL` (both secrets), `GEMINI_MODEL` and `DEMO_MODE` are set on it. A first site, `hr-tool-kargo`, was deployed from the CLI and never linked to Git. It was deleted at the user's request.

## Milestone 5–6 (part) · Decisions and email via Resend

35. **Decide, then draft, then send.** Advance, Hold and Decline on the card each write a row to `decisions` (timestamp, role, score, recommendation, and the rationale from the card's why and risk lines). Advance drafts an invite and Decline drafts a decline. Hold only logs. A draft is shown for editing and goes out only when the founder clicks **Send**, the only code path that calls Resend (hard rule 3). A double click can't send twice: the draft is claimed before sending.
36. **AI call 2 drafts the email** from non-identifying facts: the role, strengths reworded from the signal reasons with employer names removed, and whether to ask about relocation. The name is merged in code as `{first_name}`. Drafts that mention scores, bands, rubric, signals, screening or AI, or lack the name placeholder, are rejected, and a fixed template is used instead. The invite has the `[SCHEDULING LINK]` placeholder and the relocation question when location is unknown.
37. **Demo mode is on by default.** Every email goes to `DEMO_RECIPIENT` with a "[Demo]" subject prefix. If `DEMO_RECIPIENT` is missing or still the placeholder, sending is refused rather than falling back to the candidate's address (hard rule 4). The sender is `onboarding@resend.dev` until a domain is verified in Resend.
38. **The Resend key is scoped to this project only:** it lives in `~/hr-tool/.env` and in the `hrtoolproject` site's own env vars (secret). It isn't in team-level Netlify variables or the shell profile.

## Dashboard UI (user's HireSync-style mockup)

39. **The front end is a single-page app** (`public/index.html`, `app.js`, `app.css`) in the dark style of the user's mockup, with hash routes:
    - **Dashboard:** tiles, top candidate matches, quick actions, job openings, recent emails.
    - **Jobs:** each JD with its gates, a download link, and every CV received for it, with dates.
    - **Candidates:** Passed / Borderline / Failed / Screening tabs.
    - **Candidate detail:** the card, signals, both roles and the evidence.
    - **Emails & log:** decisions and emails, with CSV export (the Milestone 7 audit view, done early).
    - **Back-test.**
    
    The old `backtest.html` and `style.css` were removed.
40. **"Match %" is the role's weighted total** (0–100). Passed = Shortlist: 65%+ with every gate met. Failed = under 45%, or any gate failed; the pill says "Failed gate" and the tooltip names the gate. When fewer than 5 candidates pass, the dashboard shows the top 5 labelled "below the pattern threshold" (hard rule 6).
41. **Bulk email keeps the founder's approval.** "Email all passed" drafts an invite for each passed candidate who hasn't been emailed, then shows every draft (editable, each with a tick box). Nothing goes out until "Send all selected". Row buttons: Invite for passed candidates, Send decline for everyone else. Both open a draft first.
42. **Bulk upload** screens CVs two at a time, since each CV already makes 3 extraction calls. The dashboard refreshes every 5 seconds while any CV is still screening.
43. **Jobs are fixed in code** (`src/jobs.ts`): only the two roles the rubric was built for. There's no "Upload new JD", because a new role would need its own rubric and back-test.

## Milestone 4 · The 60 applicants

44. **Redaction rebuilt for real CV layouts.** A pre-run check on the 60 applicant CVs found the name would have reached the AI on 35 of them. The fixture CVs all put the name alone on line 1, but these PDFs vary: a title as the first line, the name and email on one line, or a sidebar or header that PDF extraction puts at the *end* of the text. The name is now found in the opening lines **or within 4 lines of an email or phone number**. As a safety net, words from the uploaded file name also count, when they appear in that zone. When the file name gives name words, only a line containing them is trusted, so headings like "Core Competencies" aren't taken as names or redacted through the evidence. Result: the name was detected on 60 of 60 CVs, with no name left after redaction. With a generic file name like `resume.pdf`, 51 of 60 are still found.
45. **Leak safety net:** if the AI's extraction reports a real name that is in the text it was sent, the app redacts that name and extracts again before scoring.
46. **Batch run** (`npm run screen:applications`): each CV goes through the same `screen()` pipeline as an upload and is saved to Neon, so it shows on the dashboard. A `pm_` or `spm_` file-name prefix counts as the role the applicant chose; other files are role-detected from the CV. Duplicates by email or name are skipped. Applicant CVs are git-ignored.
47. **Duplicates are matched on name, not email.** The 60 test CVs are 60 different people sharing 8 class inboxes, so email-based dedupe had skipped 52 real applicants. A CV now counts as a duplicate only with the same name or an identical file. Email counts only when no name was found.
48. **Integration gate prompt fix.** Extraction was reading "owned" too strictly: a CV saying "Led the integration with ICEGATE" and "Designed the … integration" was marked as not owning one. Leading, designing, being the PM for, or running an integration or platform area now counts; being one contributor, or only using an API, doesn't. Integration-gate failures on the 20 Senior PM applicants fell from 10 to 3. The back-test still passes. `--rescreen` re-runs files already in Neon and updates their rows in place.
49. **Milestone 4 result (60 applicants):** 10 reached 65%+ on score and 8 are shortlisted after gates. Of the 5 borderline and 47 declines, 29 failed a gate: 20 on the PM tenure range, 6 on the Senior PM tenure range and 3 on integration ownership. Two PM applicants at 80–82% fail only because PM years plus half of adjacent years come to about 5.6, over the 5-year limit. Whether adjacent years should count toward the upper limit is an open question for the user.

## QA fixes · Priority 1 (rubric vs job description)

50. **Kept the back-tested past-hire rubric for the two Kargo roles** (user's choice). SPEC.md's premise is that ranking follows the pattern of Arjun's best hires, not the JD, and the Milestone 3 back-test depends on it. The PM scoring 35% for lacking logistics ops is that rule working as designed. On the Jobs page these rubrics are shown read-only, labelled "Back-tested on past hires".
51. **New jobs get a rubric generated from their own text** (`src/rubric.ts`): 3–4 signals, integer weights summing to exactly 100 with the largest on the most job-critical requirement, a description for each 0–3 level, and a probe question per signal. The prompt includes the user's constraint word for word ("Generate signals strictly from the requirements below…") and bans signals on college, certificates, company size, age or gender. Gates stay separate from signals.
52. **The rubric is stored with the job (the `jobs` table) and reviewed before use.** It can be edited in the UI and must be approved before any CV can be uploaded for that job; the server refuses otherwise. Each saved edit makes a new version and returns to draft. Screenings record the job and rubric version they were scored with.
53. **Generated-rubric screening keeps the hard rules** (`src/genericScreen.ts`):
    - Identity is removed before any AI call.
    - Call 1 extracts quoted evidence per signal, plus job dates and location.
    - Only evidence with a verified quote goes on.
    - Employer names are scrubbed.
    - Call 2 scores from that evidence alone and must cite one of the verified quotes, or the signal scores 0 and is flagged.
    - Median of 3 runs.
    
    Gates for these jobs: minimum years, calculated in code from the date ranges with overlaps counted once, and Mumbai-or-relocate (Devanagari "मुंबई" included).

## QA round 2

54. **Advancing below the pass threshold needs confirmation.** The page asks "This candidate scored X%, below your Y% threshold. Advance anyway?" before anything is logged or drafted. `/api/decide` enforces the same rule: an Advance below 65% without `confirmBelowThreshold: true` is refused with 409 and nothing is logged. That covers stale tabs and any other client. A confirmed low Advance is recorded in the decision's rationale ("Advanced below the 65% threshold after confirmation"). Decline and Hold are unaffected, and "Email all passed" only includes candidates above the threshold.
55. **Unresolved placeholders block sending.** One pattern (`src/placeholders.ts`, mirrored in `public/app.js`) catches `[...]`, `{{...}}`, `{snake_case}`, `<UPPER CASE>` and TODO/TBD/XXX in the subject or body. In the draft editor, Send stays disabled with an inline error naming each placeholder, re-checked as you type. `/api/send` refuses the same drafts with 400 and they stay unsent, so a stale page or a direct call can't get through either.
56. **Scheduling link.** An invite containing `[SCHEDULING LINK]` shows a required "Scheduling link" field; a valid http(s) URL typed there replaces the placeholder in the message. "Email all passed" has one link field that fills every invite. If a `SCHEDULING_URL` env var is set, drafts get the real link automatically. None is set yet, because the user has no booking tool.
57. **Short CVs are scored, not rejected.** Only a file with under 20 non-space characters (empty, or a scanned image with no text layer) is refused, down from 200 characters. A CV under 400 characters is scored as usual and marked `lowConfidence: true`, with the reason "Short CV (N characters): scored on very little text". The existing thin-evidence flag on S1 now uses the same field. The candidate lists show a "Low confidence" badge, with the reason on hover. The detail page shows the reason and an **Ask for more detail** button (marked "recommended" when confidence is low). It logs a `more_info` decision and drafts an email asking for roles with dates, what they did in each, and a result or two. That email goes through the same review-and-Send flow. Migration `004_more_info.sql` adds the new decision and email type.
