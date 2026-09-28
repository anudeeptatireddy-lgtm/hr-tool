# Arjun's Hiring Pattern — Scoring Spec for the Kargo Screening Product

Sep 28, 2026

## The finding

All 5 hires rated Exceeds Expectations spent 2–4 years doing freight or logistics operations work by hand before their current function. None of the 3 others did. Rohan, Sunita, Aditya, Meghna and Lavanya handled Bills of Lading, customs holds, port terminals or carrier allocation. Vikram (Meets), Rahul (Meets) and Preetham (Below) have zero hands-on logistics operations time.

This doc turns that pattern into a scoring spec. It covers the exact evidence behind it, a 4-signal rubric with 0–3 anchors taken from real CV lines, a back-test on all 8 hires, and what the product should extract, score and show. It is written for whoever builds the screening product, not for Arjun to read CVs with.

## Data used and its limits

The pattern comes from 8 hire CVs plus the rating table in the case brief. Treat it as a strong hypothesis, not a proven model.

- **Sources:** `hires/` (8 CVs, cv_01 to cv_08), `jds/` (Product Manager, Senior Product Manager), and the Joined and Last Rating columns in the case brief.
- **Missing:** the brief says each hire profile holds "what stood out", "what the interview revealed" and a one-line outcome note. The files received are CVs only, so none of that is used here. Get these notes; they may explain the Meets vs Below split, which CVs can't.
- **Sample size:** 8 people, 6 functions, only 2 PMs (Vikram, Lavanya). The pattern holds up anyway because of 3 matched pairs (next sections), where two people with near-identical CVs differ only on operations experience.
- **Rubric fitted to the same 8:** the back-test shows the rubric reproduces the ratings. It was built from those same people, so that is a consistency check, not validation. Validate on the next 3–5 hires.

## Hire-by-hire evidence ledger

Each cell cites the CV line it rests on. Sorted by rating, Exceeds first.

| Hire · role · rating | Hands-on logistics ops before current role | Built a fix nobody asked for, and who adopted it | Owned outcomes with no layer above | Failure or kill evidence |
| --- | --- | --- | --- | --- |
| **Lavanya Iyer** · PM · Exceeds | ~32 months at Mahindra Logistics (Jul 2020–Mar 2023): carrier allocation, capacity planning, exception management; 800+ shipments/month; 8 carrier partners daily | Daily visibility dashboard for 500+ shipments, Excel then Tableau, adopted by 2 other regional teams. Branch's first quarterly carrier scorecard; renegotiated rates with 2 carriers. Same-day triage cut unresolved exceptions 28% | "Sole PM" for dock scheduling, carrier integration and visibility at Portwise (Series A). Eng lead: "doesn't hedge" | Killed 2 features despite strong discovery demand; capacity went to a workflow with 3x weekly active use in 30 days. Wrote the 4-hour outage post-mortem, internal and customer versions |
| **Rohan Desai** · Head of Eng · Exceeds | ~32 months as Operations Executive at a CHA firm, Nhava Sheva/JNPT (Jul 2017–Mar 2020): 180+ shipments/month; BoL, Shipping Bills, CoO, LC docs; daily with shipping lines, ICD, port, customs | Excel shipment tracker; 12-person ops team adopted it in 2 weeks. BoL verification prototype built over a weekend; 30 colleagues using it in month 1, now a core feature | Translated field needs into specs "without a product layer"; "most senior engineer in the room"; vendor migration under time pressure, 0 data loss, lag -60% | Indirect: added code review and on-call after incidents; P1s -40% in 6 months |
| **Sunita Krishnamurthy** · Ops Lead · Exceeds | ~49 months across Blue Anchor (30–40 LCL/month) and Trident Freight (200+ shipments/month, sea and air); then ops consultant to 3 logistics firms from Oct 2020 | Redesigned the team's intake workflow over a weekend after the FMS vendor changed export format without notice; kept permanently. SOPs for a CHA firm adopted in full within 60 days | Self-employed consultant; ran a paper-to-cloud FMS migration end to end (scope, vendor, training, 30-day go-live). DGFT audit: 4 gaps fixed, 0 observations | Indirect: 2 customs inspections closed with no penalties |
| **Meghna Tiwari** · CS Manager · Exceeds | ~29 months at Coastline Freight Forwarders (Aug 2019–Jan 2022): 12 key accounts, 15–20 live shipments/day; CI, packing lists, CoO, LC negotiation sets | Onboarding checklist became team standard, onboarding queries -35%. 30-60-90 framework used by whole CS team, time-to-value -3 weeks | Resolved a 7pm customs hold overnight with the CHA before the client knew; covered 8 extra accounts for 3 months with 0 churn; 0 escalations in 14 months | Indirect: found an undocumented product limitation hitting 4 accounts and ran the 6-week fix |
| **Aditya Shetty** · Sales Lead · Exceeds | 4 months at Maersk (Mar–Jul 2017) + 24 months at Jacaranda Port Services, JNPT (Aug 2017–Aug 2019): 25 forwarder/NVOCC clients; worked terminal peaks, berth windows, DO releases | First case study programme, now the team's main sales collateral. Lost-deal post-mortem became standard qualification practice | "No account manager layer between the client and execution"; runs full sales cycle alone; 8 of 14 accounts self-sourced | 4-month forwarder deal lost; documented root cause (wrong economic buyer, misread IT procurement) and shared it |
| **Vikram Nair** · PM · Meets | None. HR tech SaaS since 2019 (Springboard, Series B) | PRD template and sprint review adopted by the 4-person PM team. Analytics dashboard built with the data team | Owned one module, but as APM he "supported senior PMs"; one of 4 PMs; roadmap reviewed by CTO and VP Sales | None; 12 features shipped, no kills listed |
| **Rahul Bose** · Growth Lead · Meets | None. Fintech and HR tech SaaS | Content programme from zero, 800 to 15,000 sessions in 18 months. First case study programme, most-used sales collateral | "No CMO above, reports to CEO"; built a 4-person team | None listed |
| **Preetham Rao** · Backend Eng · Below | None hands-on. Integrated Delhivery, Bluedart and Ecom Express via REST/SFTP APIs at Cartexa (3,200 employees) | Monitoring dashboard found a coupon bug losing ₹12L/month. Regression suite cut QA time 30%. Both internal engineering tools | One of 12 engineers on the OMP team; on-call rotation, 22-minute P1 resolution | Indirect: patched the coupon bug within 48 hours |

## Three matched pairs

In each pair, the two CVs match on the skills a JD screens for. The one who did hands-on logistics ops is rated higher every time. This is the strongest evidence in the dataset.

### Rohan (Exceeds) vs Preetham (Below): backend engineers

| What they share | Rohan | Preetham |
| --- | --- | --- |
| Stack | Python, PostgreSQL, FastAPI, Redis, Docker, Kubernetes, AWS | Python, PostgreSQL, FastAPI, Redis, Docker, Kubernetes (EKS), AWS |
| Postgres indexing fix | Found a peak-hour timeout's root cause in 3 hours, fixed same day | Redesigned indexing strategy, query time -40%, zero downtime |
| Migration | Off a legacy data vendor, 0 data loss, lag -60% | 3 batch jobs to Celery, lag from 4 hours to under 8 minutes |
| Mentoring | 2 juniors, one promoted in 14 months | 2 juniors, fortnightly 1:1s |
| AWS certification | Solutions Architect – Associate (2022) | Developer – Associate (2022) |
| **The difference** | **~32 months doing freight documentation at JNPT** | **Logistics only as API endpoints** |

On a JD screen, Preetham arguably wins, with bigger scale, better latency numbers and open-source PRs. What separates them is who their work was for. Rohan's builds were used by operations staff (a 12-person ops team, 30 colleagues); Preetham's were used by engineers.

### Lavanya (Exceeds) vs Vikram (Meets): product managers

| What they share | Lavanya | Vikram |
| --- | --- | --- |
| PM tenure at hire | ~2 years (Apr 2023–Apr 2025) | ~3 years (Jul 2020–Jun 2023) |
| Discovery | 3 parallel tracks with freight forwarder clients | 40+ interviews across 6 enterprise accounts |
| Shipping | 6 features in 12 months | 12 features in 18 months, $180K incremental ARR |
| Product School certificate | Yes (2023) | Yes, CPO (2021) |
| **The difference** | **~32 months of carrier ops at a 3PL, sole PM, killed 2 features** | **HR tech, one of 4 PMs, no kills listed** |

Vikram has more PM years, a bigger ARR number, an XLRI MBA, Reforge and a conference talk. None of it moved him past Meets.

### Aditya (Exceeds) vs Rahul (Meets): go-to-market

| What they share | Aditya | Rahul |
| --- | --- | --- |
| Target attainment | 110–118% of quota, 5+ quarters | 105–120% of pipeline target |
| Built the first case study programme | Yes, now primary sales collateral | Yes, most-used deal collateral |
| Operated without a manager layer | No account manager layer | No CMO, reports to CEO |
| **The difference** | **24 months at a JNPT port terminal + Maersk** | **Fintech and HR tech** |

This pair matters most for the rubric. Rahul has signals 2 and 3 fully, and still landed at Meets. So building things and owning outcomes are not enough without operations experience.

## The four scoring signals

Score each signal 0–3 from CV evidence only, then weight: S1 40%, S2 30%, S3 20%, S4 10%. The weights follow the evidence. S1 alone separates Exceeds from everyone else. S2 and S3 appear in Meets hires too, so they rank candidates but don't decide.

### S1 · Hands-on logistics operations (40%)

**Question the product answers:** did this person personally do operational work inside a freight forwarder, CHA, 3PL, NVOCC, shipping line, port or terminal, or a shipper's logistics desk?

| Score | Anchor | Real example |
| --- | --- | --- |
| 3 | 24+ months in an operations role inside a logistics operator, with daily transactional work | Rohan: 32 months, 180+ shipments/month, BoL and customs at JNPT |
| 2 | 6–23 months in such a role, or 24+ months embedded on-site with ops teams from a vendor seat | Rohan's Clearfly rollout work alone would score 2 |
| 1 | Builds or sells software for logistics without doing the operations work | Preetham: courier API integrations |
| 0 | No logistics exposure | Vikram, Rahul |

**Evidence that counts:** a verb of doing next to an operational object. Examples: "prepared Bills of Lading", "coordinated with CHA and customs officer", "managed carrier allocation", "handled DO releases", "ran exception management", with shipment volumes per day or month.

**Operational vocabulary to detect:** Bill of Lading (BoL/HBL/MBL), Shipping Bill, Certificate of Origin, LC or bank negotiation set, CHA, customs hold, ICEGATE, DGFT, ICD/CFS, JNPT or Nhava Sheva, berth window, DO release, detention/demurrage, NVOCC, LCL/FCL, carrier allocation, TMS, CargoWise, IATA DGR, NDR.

**False positives to reject:** vocabulary with no doing-verb ("familiar with EXIM"), a logistics company name on a tech or HR role, and API integration with courier partners (score 1, not 3).

### S2 · Built the missing fix, and the operations people adopted it (30%)

**Question:** did they notice a broken process nobody assigned them, build a fix, and get other people to use it?

| Score | Anchor | Real example |
| --- | --- | --- |
| 3 | Unprompted fix for operators or customers, with an adoption count or time-to-adoption | Rohan: tracker, 12 people in 2 weeks; Lavanya: dashboard, 2 other regional teams |
| 2 | Fix adopted by their own function's team | Vikram: PRD template, 4 PMs; Rahul and Aditya: case study programmes |
| 1 | Improvement to their own work or internal tooling, no adoption stated | Preetham: monitoring dashboard, regression suite |
| 0 | Only assigned work described | none of the 8 |

**Evidence that counts:** a trigger ("after finding the team had no reliable way to...", "when the vendor changed format without notice"), plus a build, plus adoption with a number (people, teams, weeks, "retained permanently", "now standard").

### S3 · Owned the outcome with no layer above (20%)

**Question:** were they the final decision-maker for their area, and did they carry a problem to the end under pressure?

| Score | Anchor | Real example |
| --- | --- | --- |
| 3 | Sole owner or "no layer above", plus one crisis carried personally to resolution | Meghna: 7pm customs hold fixed overnight; Lavanya: sole PM plus outage post-mortem |
| 2 | Sole owner, no crisis described | a candidate who is a solo PM with no incident story |
| 1 | Owner within a team that has senior people above or peers deciding | Vikram: one of 4 PMs, APM under senior PMs; Preetham: one of 12 engineers |
| 0 | Contributor only | none of the 8 |

**Evidence that counts:** "sole", "only", "first", "no [role] above", "reports to CEO/founder", "independently", plus a dated incident with an outcome ("shipment departed on schedule", "0 data loss").

### S4 · Kills and post-mortems (10%)

**Question:** do they describe a call that failed, or a feature they stopped, and what changed afterwards?

| Score | Anchor | Real example |
| --- | --- | --- |
| 3 | Killed or reversed their own work on data, and documented why | Lavanya: killed 2 features, capacity to a 3x-usage workflow |
| 2 | A loss analysed, with the lesson adopted by others | Aditya: lost-deal post-mortem became standard practice |
| 1 | An incident or error handled, but not their own call reversed | Rohan, Sunita, Meghna, Preetham |
| 0 | Only wins listed | Vikram, Rahul |

S4 carries the least weight because 3 of 5 Exceeds hires score only 1. It's in the rubric because the PM JD explicitly asks for "shipped things, killed things". Raise its weight for PM roles once more PM outcomes exist.

## Back-test on the 8 hires

The rubric puts every Exceeds hire at 86.7 or higher and every other hire at 40 or lower. That leaves a gap of 46.7 points with no one in it.

| Hire | Actual rating | S1 ops (40) | S2 built fix (30) | S3 owned (20) | S4 kills (10) | Total /100 |
| --- | --- | --- | --- | --- | --- | --- |
| Lavanya Iyer | Exceeds | 3 | 3 | 3 | 3 | 100.0 |
| Rohan Desai | Exceeds | 3 | 3 | 3 | 1 | 93.3 |
| Sunita Krishnamurthy | Exceeds | 3 | 3 | 3 | 1 | 93.3 |
| Meghna Tiwari | Exceeds | 3 | 3 | 3 | 1 | 93.3 |
| Aditya Shetty | Exceeds | 3 | 2 | 3 | 2 | 86.7 |
| Rahul Bose | Meets | 0 | 2 | 3 | 0 | 40.0 |
| Preetham Rao | Below | 1 | 1 | 1 | 1 | 33.3 |
| Vikram Nair | Meets | 0 | 2 | 1 | 0 | 26.7 |

Total = sum of (score ÷ 3 × weight). Three things follow for the product:

- **Threshold:** shortlist at 65 or higher. That sits in the middle of the empty gap, and it's a starting point to revisit after the first cohort.
- **It predicts who thrives, not who fails.** Preetham (Below) outscores Vikram (Meets). CVs can't separate those two; the missing interview notes may.
- **S1 alone would also separate the groups.** The other signals exist to rank among candidates who all have operations backgrounds. That will matter, because the applicant pool may contain several.

## What does not predict success

The product should give these zero weight. Each one appears equally or more often among the lower-rated hires.

| Signal a typical screen rewards | Exceeds hires | Meets/Below hires | Verdict |
| --- | --- | --- | --- |
| Tier-1 MBA or college | 1 of 5 (Lavanya, NIT Trichy). Others: VJTI, Loyola, Manipal, HR College | Vikram: XLRI + NIT Calicut. Rahul: St. Stephen's + NMIMS | Ignore |
| Degree matching the function | Meghna runs CS on a B.Sc. Psychology; Sunita leads ops on a B.Com | Vikram: B.Tech CS + MBA, the "right" path | Ignore |
| Generic PM or growth certificates | Lavanya: Product School | Vikram: Product School CPO + Reforge; Rahul: 3 HubSpot/Google certificates | Ignore |
| Conference talks, thought leadership | 0 of 5 | Vikram: ProductBeats speaker | Ignore |
| Large-company scale numbers | Not a theme | Preetham: 2M+ daily events, 3,200-person company; Vikram: 400+ enterprise clients | Ignore, or slight negative for PM roles |
| More years in the function | Lavanya: ~2 PM years | Vikram: ~3 PM years | Ignore above the JD minimum |

Domain certifications are the exception: IATA DGR (Sunita), APICS CSCP and CargoWise (Lavanya). They corroborate S1 but should never score on their own.

## Pattern vs JD

Use the JDs for pass/fail gates and the pattern for ranking. The JDs ask for curiosity about operations; Arjun's history rewards having done operations work. A JD-matching screen would let Vikram through as easily as Lavanya.

### Product Manager JD

| JD line | Product treatment | Why |
| --- | --- | --- |
| 2–4 years of PM experience | Gate, with tolerance: 1.5–5 years passes. Count adjacent roles like BA or ops analyst at half weight | Lavanya had ~2 years and is the best PM hire |
| Mumbai-based or willing to relocate; in-office | Gate. Flag unknown location for a yes/no question in the invite email | Lavanya, Vikram, Preetham were all Bengaluru-based when hired |
| "Building for the first time rather than maintaining" | Feeds S3. Sole PM or first PM at seed–Series A scores up; one of several PMs scores down | Vikram was one of 4 PMs at Series B |
| "Shipped things, killed things, and learned from both" | This is S4. Raise its weight to 15% for this role, taking 5 from S3 | Only Lavanya lists a kill |
| "Genuine curiosity about how operations work at ground level" | Replace with S1. Curiosity isn't scoreable from a CV; experience is | Vikram's 40+ interviews read as curiosity, but he landed at Meets |
| "Comfort operating without structure" | Feeds S2. A candidate who built the process that was missing scores up | Rohan, Sunita, Lavanya |

### Senior Product Manager JD

| JD line | Product treatment | Why |
| --- | --- | --- |
| 5–8 years of PM experience, owning an area with no senior PMs above | Gate on 4–9 years; the "no senior PMs above" part is S3 | JD states it outright |
| Platform, integration layer or complex technical environments | Gate. At least one owned integration or platform area | Role owns carrier, port-portal and ERP integrations |
| Ops-heavy industry familiarity, a "genuine advantage" | S1 at full 40% | Pattern says this is the main signal, not an advantage |
| Calls in ambiguous situations, living with consequences | S3 and S4 | Same evidence patterns |
| Early-stage time, or "rules not written yet" | Feeds S3 | Same as the PM role |

**Risk for this role:** none of the 8 hires is at Senior PM level. The pattern is extrapolated. Watch for integration-heavy candidates who score S1 = 1 (logistics seen only through APIs, the Preetham profile). The JD will like them; the pattern warns against them.

## Product implementation

The AI step should extract evidence first and score second, in two separate calls. Scoring straight from a raw CV invites the model to reward polish, which is exactly what the section above says to ignore.

### Step 1 · Extraction output (one JSON object per CV)

```json
{
  "candidate": {"name": "", "email": "", "role_applied": "PM | Senior PM", "location": "", "relocation_stated": null},
  "pm_years": 0.0,
  "ops_roles": [
    {"employer": "", "employer_type": "forwarder | CHA | 3PL | NVOCC | port | shipper | none",
     "months": 0, "hands_on_tasks": [""], "volume": "", "cv_quote": ""}
  ],
  "unprompted_builds": [
    {"trigger": "", "built": "", "users": "ops | customers | own team | self", "adoption": "", "cv_quote": ""}
  ],
  "ownership": {"sole_owner": false, "layer_above": "", "crisis": "", "cv_quote": ""},
  "kills_postmortems": [{"what": "", "own_call": false, "learning_adopted": false, "cv_quote": ""}],
  "integration_platform_ownership": false,
  "gaps_or_unclear": [""]
}
```

Every non-empty field must carry a `cv_quote` copied from the CV. No quote, no credit. This one rule blocks most hallucinated scores.

### Step 2 · Scoring logic

1. **Gates:** role-specific tenure range (see Pattern vs JD), location or relocation, and the integration requirement for Senior PM. A gate failure means decline, unless the only problem is missing location info, which becomes a question in the invite email instead.
2. **Score** S1–S4 against the anchors in The four scoring signals, one integer each, and cite the extraction field used.
3. **Weight:** PM uses S1 40, S2 30, S3 15, S4 15. Senior PM uses S1 40, S2 30, S3 20, S4 10.
4. **Band:** 65+ goes to the Shortlist. 45–64 goes to a Borderline list that Arjun sees collapsed. Under 45 is a Decline recommendation.
5. **Tie-break** within a band: higher S1, then higher S2.
6. **Confidence flag:** mark Low if S1 rests on one line with no volume or duration.

### Step 3 · What Arjun sees (one card per candidate)

| Field | Content | Example (Lavanya, as if she applied) |
| --- | --- | --- |
| Headline | Name, role, total, band | Lavanya Iyer · PM · 100 · Shortlist |
| Why ranked here | 2 lines, each tied to a signal, with the CV quote | "S1: 32 months carrier allocation, 800+ shipments/month at Mahindra Logistics" |
| Risk | The weakest signal, in one line | "PM tenure ~2 years, at the JD floor" |
| Probe questions | 3, drawn from the bank below, aimed at the weakest signals | see below |
| Buttons | Advance · Decline · Hold | Advance triggers the invite email via Resend |

### Probe question bank

| Signal | Ask | Strong answer has | Weak answer has |
| --- | --- | --- | --- |
| S1 | "Walk me through the worst shipment day you personally handled." | A named document or hold, the people called, the clock time, and the outcome | A story about a customer they interviewed |
| S1 | "What does a forwarder's ops desk do between 8 and 11am?" | Specific tasks: DO follow-ups, BoL corrections, carrier chasing | Generic words like "tracking" and "coordination" |
| S2 | "What did you build that nobody asked for? Who used it in week 2?" | A trigger, a crude first version, a user count | A project their manager assigned |
| S3 | "Tell me about a call you made that no one above you checked." | Their decision, its consequence, what they'd change | "We aligned with stakeholders" |
| S4 | "What did you kill, and what data made you do it?" | A metric and a threshold, plus where the capacity went | Nothing killed, or a kill imposed by someone else |

## Risks, guardrails and open questions

| Risk | Guardrail in the product |
| --- | --- |
| S1 turns into a network filter: Rohan's ops years were at a family firm | Score the tasks and volumes described, never employer names. Strip company names before the scoring call |
| Keyword stuffing: "BoL", "CHA", "JNPT" pasted into a CV | S1 needs a doing-verb, a duration and a volume together. Vocabulary alone scores 0 |
| The pool has almost no ops-native PMs, so everyone scores under 65 | If fewer than 5 candidates reach 65, show the top 5 anyway, marked "below pattern threshold". Arjun still gets a list |
| Hiring clones of past hires narrows the team | The rubric scores evidence of work, not background traits like college, gender, age or city of origin. Never pass photos, age or gender to the model |
| Rubric fitted to 8 people | Log every decision. After 3 new hires reach a 6-month rating, re-check whether S1 still separates them |
| Automated emails go out wrong | Declines send only after Arjun's click, never on score alone. Offers are never automated |

**Open questions to settle before building:**

- [ ] Get the interview notes and one-line outcome notes the brief mentions. Do they explain Preetham at Below and Vikram at Meets?
- [ ] Confirm the weights with Arjun in one 10-minute review. This is the only rubric decision he needs to make.
- [ ] Senior PM calibration: no past hire at that level. Accept the extrapolation, or ask Arjun for 1–2 senior people he'd rehire?
- [ ] Does the 65 threshold hold against the real 60 applicants? Score them and look at the distribution before fixing it.
