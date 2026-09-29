// Milestone 4: screen every CV in data/applications/ through the real pipeline and save each one to Neon,
// so the batch shows up on the dashboard exactly like uploads do. Prints the ranked list and the distribution.
// Role: a pm_ / spm_ file-name prefix counts as the role the applicant picked; otherwise it's detected from the CV.
// Duplicates (same email, or same name) are skipped. Usage: npm run screen:applications
import "dotenv/config";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { createJob, finishJob } from "../src/db";
import { screen } from "../src/screen";
import type { Role } from "../src/scoring";

const ROOT = join(import.meta.dirname, "..");
const DIR = join(ROOT, "data", "applications");
const CONCURRENCY = 3;
const sql = neon(process.env.DATABASE_URL!);

const roleFromName = (f: string): Role | null => (/^spm_/i.test(f) ? "Senior PM" : /^pm_/i.test(f) ? "PM" : null);
const files = readdirSync(DIR).filter((f) => /\.(pdf|docx|doc|txt)$/i.test(f)).sort();

// Existing names and emails in the database, so a re-run doesn't screen the same person twice.
const existing = (await sql`select lower(result->'candidate'->>'email') as email, lower(result->'candidate'->>'name') as name from screenings where status = 'done'`) as { email: string | null; name: string | null }[];
const seenEmail = new Set(existing.map((r) => r.email).filter(Boolean) as string[]);
const seenName = new Set(existing.map((r) => r.name).filter(Boolean) as string[]);

type Row = { file: string; name: string; role: Role; roleNote: string; total: number; rec: string; gate: string; S: number[]; flags: number; signals: any };
const rows: Row[] = [], skipped: string[] = [], failed: string[] = [];
let next = 0, done = 0;
const t0 = Date.now();

async function worker() {
  while (next < files.length) {
    const f = files[next++];
    const buf = readFileSync(join(DIR, f));
    const r = await screen(f, buf, roleFromName(f));
    const email = r.candidate.email.toLowerCase(), name = r.candidate.name.toLowerCase();
    if ((email && seenEmail.has(email)) || (name && seenName.has(name))) { skipped.push(`${f} (duplicate of an earlier screening)`); done++; continue; }
    if (email) seenEmail.add(email);
    if (name) seenName.add(name);
    const id = crypto.randomUUID();
    await createJob(id, f, roleFromName(f), buf);
    const { redactedText, ...rest } = r;
    await finishJob(id, r.ok ? "done" : "error", rest, r.error);
    done++;
    if (!r.ok) { failed.push(`${f}: ${r.error}`); continue; }
    const rr = r.roles![r.roleUsed];
    const sg = r.scored!.signals;
    rows.push({ file: f, name: r.candidate.name, role: r.roleUsed, roleNote: r.roleNote, total: rr.total, rec: rr.recommendation, gate: rr.gates.find((g) => g.status === "fail")?.name ?? "",
      S: [sg.S1.score, sg.S2.score, sg.S3.score, sg.S4.score], flags: r.scored!.flags.length, signals: sg });
    process.stderr.write(`\r${done}/${files.length} screened (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stderr.write("\n");

rows.sort((a, b) => b.total - a.total || b.S[0] - a.S[0] || b.S[1] - a.S[1]);
console.log("\nrank  match  result      role       S1 S2 S3 S4  flags  gate failed           file");
rows.forEach((r, i) => console.log(`${String(i + 1).padStart(3)}  ${r.total.toFixed(1).padStart(5)}  ${r.rec.padEnd(10)}  ${r.role.padEnd(9)}  ${r.S.join("  ")}   ${String(r.flags).padStart(4)}  ${(r.gate || "-").padEnd(20)} ${r.file}`));

const bucket = (lo: number, hi: number) => rows.filter((r) => r.total >= lo && r.total < hi).length;
console.log("\nScore distribution");
for (const [lo, hi] of [[90, 101], [80, 90], [65, 80], [45, 65], [30, 45], [15, 30], [0, 15]]) {
  const n = bucket(lo, hi);
  console.log(`  ${String(lo).padStart(2)}–${hi === 101 ? 100 : hi - 1}`.padEnd(10) + `${"█".repeat(n)} ${n}`);
}
const by = (k: string) => rows.filter((r) => r.rec === k).length;
console.log(`\nShortlist ${by("Shortlist")} · Borderline ${by("Borderline")} · Decline ${by("Decline")} (of which failed a gate: ${rows.filter((r) => r.gate).length}) · skipped duplicates ${skipped.length} · unreadable/flagged ${failed.length}`);
console.log(`Reached 65%+ on score alone (before gates): ${rows.filter((r) => r.total >= 65).length}`);
const gateCounts: Record<string, number> = {};
for (const r of rows) if (r.gate) gateCounts[r.gate] = (gateCounts[r.gate] ?? 0) + 1;
console.log("Gate failures:", gateCounts);
console.log("Roles:", { PM: rows.filter((r) => r.role === "PM").length, "Senior PM": rows.filter((r) => r.role === "Senior PM").length, detected: rows.filter((r) => r.roleNote !== "selected by founder").length });
if (skipped.length) console.log("Skipped:", skipped);
if (failed.length) console.log("Failed:", failed);
mkdirSync(join(ROOT, "output"), { recursive: true });
writeFileSync(join(ROOT, "output", "applications.json"), JSON.stringify({ ranAt: new Date().toISOString(), rows, skipped, failed }, null, 2));
