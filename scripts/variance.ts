// Measures scoring consistency: runs extraction K times per CV (no consensus) and reports, per signal, how often
// the runs disagree. Usage: npm run variance -- [--k 4] [--flagged] [--only a,b]   (reads data/applications)
import "dotenv/config";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { extractEvidence } from "../src/extraction";
import { extractText } from "../src/extractText";
import { redactIdentity } from "../src/redact";
import { DEFAULT_WEIGHTS, scoreSignals, total, type Signal } from "../src/scoring";

const ROOT = join(import.meta.dirname, "..");
const DIR = join(ROOT, "data", "applications");
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : ""; };
const K = Number(arg("--k")) || 4;
let files = readdirSync(DIR).filter((f) => /\.(pdf|docx|doc|txt)$/i.test(f)).sort();
if (arg("--only")) files = files.filter((f) => arg("--only").split(",").some((o) => f.includes(o)));
if (process.argv.includes("--flagged")) {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`select file_name, result->'runTotals' as rt from screenings where status = 'done'`) as { file_name: string; rt: number[] | null }[];
  const flagged = new Set(rows.filter((r) => r.rt && Math.max(...r.rt) - Math.min(...r.rt) > 10).map((r) => r.file_name));
  files = files.filter((f) => flagged.has(f));
}
const SIGS: Signal[] = ["S1", "S2", "S3", "S4"];
const per: Record<Signal, { disagree: number; n: number }> = { S1: { disagree: 0, n: 0 }, S2: { disagree: 0, n: 0 }, S3: { disagree: 0, n: 0 }, S4: { disagree: 0, n: 0 } };
const out: any[] = [];
let flaggedNow = 0;
await Promise.all(files.map(async (f, idx) => {
  await new Promise((r) => setTimeout(r, (idx % 6) * 400)); // stagger
  const text = redactIdentity((await extractText(f, readFileSync(join(DIR, f)))).text, f).text;
  const runs = await Promise.all(Array.from({ length: K }, (_, i) => extractEvidence(text, undefined, i + 1)));
  const scored = runs.filter((r) => r.evidence).map((r) => scoreSignals(r.evidence!, text));
  const totals = scored.map((s) => total(s.signals, DEFAULT_WEIGHTS));
  const row: any = { file: f, totals, spread: Math.max(...totals) - Math.min(...totals) };
  for (const s of SIGS) {
    const v = scored.map((x) => x.signals[s].score);
    row[s] = v;
    per[s].n++;
    if (new Set(v).size > 1) per[s].disagree++;
  }
  if (row.spread > 10) flaggedNow++;
  out.push(row);
}));
out.sort((a, b) => b.spread - a.spread);
console.log(`file                            spread  totals                         S1        S2        S3        S4`);
for (const r of out) console.log(`${r.file.padEnd(32)}${String(Math.round(r.spread)).padStart(5)}   ${r.totals.map((t: number) => t.toFixed(0).padStart(3)).join(" ").padEnd(28)}  ${SIGS.map((s) => r[s].join("").padEnd(8)).join("  ")}`);
console.log(`\nCVs whose runs spread > 10 points: ${flaggedNow} of ${out.length}`);
for (const s of SIGS) console.log(`  ${s}: runs disagreed on ${per[s].disagree} of ${per[s].n} CVs`);
mkdirSync(join(ROOT, "output"), { recursive: true });
writeFileSync(join(ROOT, "output", `variance-${Date.now()}.json`), JSON.stringify(out, null, 2));
