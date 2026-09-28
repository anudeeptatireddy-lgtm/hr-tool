# HR Tool

Screens CVs for Kargo's PM and Senior PM roles against the pattern of Arjun's best past hires, not the job descriptions. `CLAUDE.md` has the rules and build plan, and `docs/SPEC.md` has the rubric.

This version tests the logic only: upload a CV, then see the extraction, the S1–S4 scores for both roles, the gates and the candidate card. No emails are sent.

## Run it

```bash
npm install
cp .env.example .env         # add GEMINI_API_KEY
npm test                     # unit tests, no API calls
npm run db:migrate           # create the Neon tables (once)
npm run backtest             # Milestone 3 acceptance test on the 8 past hires (calls Gemini)
npx netlify dev --offline    # local site on http://localhost:8888
```

## How a CV is screened

1. Text is extracted from the PDF, DOCX, DOC or TXT file.
2. The name, email, phone and web links are removed before anything goes to the AI.
3. AI call 1 turns the CV into evidence JSON, each item with a verbatim quote. It runs 3 times in parallel, and the run with the median score is kept.
4. Every quote is checked against the CV. No quote means no credit.
5. Code scores S1–S4 (0–3) from SPEC's anchors, then applies each role's weights, gates and bands.
6. The card is built: 2 "why ranked here" lines with quotes, 1 risk line and 3 probe questions.
