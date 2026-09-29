// Milestone 3 acceptance test. Runs the real pipeline (identity removed) on the 8 past-hire CVs, scores
// them with SPEC's default 40/30/20/10 weights, and checks: every Exceeds hire >= 65, every other hire < 65.
// Usage: npm run backtest            (fresh extraction via Gemini)
//        npm run backtest -- --cached (re-score saved extractions, no API calls)
import "dotenv/config";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractConsensus } from "../src/consensus.js";
import type { Evidence } from "../src/extraction.js";
import { extractText } from "../src/extractText.js";
import { redactIdentity } from "../src/redact.js";
import { DEFAULT_WEIGHTS, SHORTLIST_AT, scoreSignals, total } from "../src/scoring.js";

const ROOT = join(import.meta.dirname, "..");
const HIRES = join(ROOT, "data", "hires");
const OUT = join(ROOT, "output", "extractions", "hires");
const cached = process.argv.includes("--cached");
const ratings: Record<string, string> = JSON.parse(readFileSync(join(HIRES, "ratings.json"), "utf8"));
mkdirSync(OUT, { recursive: true });

type Row = { runs?: number[]; id: string; rating: string; S1: number; S2: number; S3: number; S4: number; total: number; pass: boolean; flags: number; reasons: Record<string, string> };
const rows: Row[] = [];
const runTotals: Record<string, number[]> = {};
const files = readdirSync(HIRES).filter((f) => f.endsWith(".docx")).sort();

await Promise.all(files.map(async (f) => {
  const id = f.slice(0, 5);
  const saved = join(OUT, f.replace(/\.docx$/, ".ts.json"));
  let text: string, ev: Evidence | null;
  if (cached && existsSync(saved)) {
    ({ text, evidence: ev } = JSON.parse(readFileSync(saved, "utf8")));
  } else {
    const doc = await extractText(f, readFileSync(join(HIRES, f)));
    text = redactIdentity(doc.text, f).text;
    const r = await extractConsensus(text);
    if (!r.result) { console.error(`${id}: extraction flagged: ${r.error}`); return; }
    ev = r.result.evidence;
    runTotals[id] = r.result.totals;
    writeFileSync(saved, JSON.stringify({ text, evidence: ev }, null, 2));
  }
  const sc = scoreSignals(ev!, text);
  const t = total(sc.signals, DEFAULT_WEIGHTS);
  const rating = ratings[id];
  const pass = rating === "Exceeds" ? t >= SHORTLIST_AT : t < SHORTLIST_AT;
  rows.push({ runs: runTotals[id], id, rating, S1: sc.signals.S1.score, S2: sc.signals.S2.score, S3: sc.signals.S3.score, S4: sc.signals.S4.score, total: t, pass, flags: sc.flags.length,
    reasons: Object.fromEntries(Object.entries(sc.signals).map(([k, v]) => [k, v.reason])) });
}));

rows.sort((a, b) => b.total - a.total);
console.log(`Back-test · weights S1 ${DEFAULT_WEIGHTS.S1} / S2 ${DEFAULT_WEIGHTS.S2} / S3 ${DEFAULT_WEIGHTS.S3} / S4 ${DEFAULT_WEIGHTS.S4} · shortlist at ${SHORTLIST_AT}\n`);
console.log("hire   rating    S1 S2 S3 S4   total  flags  result     (3 runs)");
for (const r of rows) console.log(`${r.id}  ${r.rating.padEnd(8)}  ${r.S1}  ${r.S2}  ${r.S3}  ${r.S4}   ${r.total.toFixed(1).padStart(5)}  ${String(r.flags).padStart(5)}  ${(r.pass ? "ok" : "BAND FLIP").padEnd(10)} ${(r.runs ?? []).join(" / ")}`);
const exc = rows.filter((r) => r.rating === "Exceeds"), rest = rows.filter((r) => r.rating !== "Exceeds");
const gap = Math.min(...exc.map((r) => r.total)) - Math.max(...rest.map((r) => r.total));
const passed = rows.length === files.length && rows.every((r) => r.pass);
console.log(`\nLowest Exceeds ${Math.min(...exc.map((r) => r.total)).toFixed(1)} · highest other ${Math.max(...rest.map((r) => r.total)).toFixed(1)} · gap ${gap.toFixed(1)}`);
console.log(passed ? "PASS: all Exceeds hires >= 65 and all others < 65" : "FAIL: see band flips above");
writeFileSync(join(ROOT, "public", "backtest.json"), JSON.stringify({ ranAt: new Date().toISOString(), weights: DEFAULT_WEIGHTS, threshold: SHORTLIST_AT, passed, gap, rows }, null, 2));
process.exit(passed ? 0 : 1);
