// Milestone 4: screen every CV in data/applications/ through the real pipeline and save each one to Neon,
// so the batch shows up on the dashboard exactly like uploads do. Prints the ranked list and the distribution.
// Role: a pm_ / spm_ file-name prefix counts as the role the applicant picked; otherwise it's detected from the CV.
// --only <text>: just the files whose name contains <text> (comma-separated for several).
// --rescreen: re-run files already in the database and update those rows in place (after a prompt or rule change).
// Duplicates are skipped: same name, or identical file. Email only counts when no name was found, because
// several applicants can share one inbox (the test batch uses 8 shared addresses for 60 people). Usage: npm run screen:applications
import "dotenv/config";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { createJob, finishJob, replaceResult } from "../src/db.js";
import { screen } from "../src/screen.js";
import type { Role } from "../src/scoring.js";

const ROOT = join(import.meta.dirname, "..");
const DIR = join(ROOT, "data", "applications");
const CONCURRENCY = 3;
const sql = neon(process.env.DATABASE_URL!);

const roleFromName = (f: string): Role | null => (/^spm_/i.test(f) ? "Senior PM" : /^pm_/i.test(f) ? "PM" : null);
const arg = (k: string) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : ""; };
const only = arg("--only").split(",").map((x) => x.trim()).filter(Boolean);
const RESCREEN = process.argv.includes("--rescreen");
const allFiles = readdirSync(DIR).filter((f) => /\.(pdf|docx|doc|txt)$/i.test(f)).sort();
const files = only.length ? allFiles.filter((f) => only.some((o) => f.includes(o))) : allFiles;

// Existing names and emails in the database, so a re-run doesn't screen the same person twice.
const existing = (await sql`select lower(result->'candidate'->>'email') as email, lower(result->'candidate'->>'name') as name from screenings where status = 'done'`) as { email: string | null; name: string | null }[];
const seenName = new Set(existing.map((r) => r.name).filter(Boolean) as string[]);
const seenEmailNoName = new Set(existing.filter((r) => !r.name).map((r) => r.email).filter(Boolean) as string[]);
const seenHash = new Set<string>();

type Row = { file: string; name: string; role: Role; roleNote: string; total: number; rec: string; gate: string; S: number[]; flags: number; signals: any };
const rows: Row[] = [], skipped: string[] = [], failed: string[] = [];
let next = 0, done = 0;
const t0 = Date.now();

async function worker() {
  while (next < files.length) {
    const f = files[next++];
    const buf = readFileSync(join(DIR, f));
    if (RESCREEN) {
      const prev = (await sql`select id from screenings where file_name = ${f} and status = 'done' order by created_at desc limit 1`) as { id: string }[];
      if (prev[0]) {
        const r = await screen(f, buf, roleFromName(f));
        const { redactedText, ...rest } = r;
        await replaceResult(prev[0].id, r.ok ? "done" : "error", rest, r.error);
        done++;
        if (!r.ok) failed.push(`${f}: ${r.error}`);
        process.stderr.write(`\r${done}/${files.length} re-screened (${Math.round((Date.now() - t0) / 1000)}s)`);
        continue;
      }
    }
    const hash = createHash("sha256").update(buf).digest("hex");
    if (seenHash.has(hash)) { skipped.push(`${f} (identical file)`); done++; continue; }
    seenHash.add(hash);
    // Name is found locally before any AI call, so a duplicate is skipped without spending AI calls.
    const { redactIdentity } = await import("../src/redact.js");
    const { extractText } = await import("../src/extractText.js");
    const pre = redactIdentity((await extractText(f, buf)).text, f);
    const name = pre.name.toLowerCase(), email = pre.email.toLowerCase();
    if ((name && seenName.has(name)) || (!name && email && seenEmailNoName.has(email))) { skipped.push(`${f} (already screened: same name)`); done++; continue; }
    if (name) seenName.add(name); else if (email) seenEmailNoName.add(email);
    const r = await screen(f, buf, roleFromName(f));
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

// Report on every applicant file in the database (this run plus earlier runs), latest screening per file.
const all = (await sql`select distinct on (file_name) file_name, result from screenings
  where status = 'done' and file_name = any(${allFiles}) order by file_name, created_at desc`) as { file_name: string; result: any }[];
const report: Row[] = all.map(({ file_name, result: r }) => {
  const rr = r.roles[r.roleUsed], sg = r.scored.signals;
  return { file: file_name, name: r.candidate.name, role: r.roleUsed, roleNote: r.roleNote, total: rr.total, rec: rr.recommendation,
    gate: rr.gates.find((g: any) => g.status === "fail")?.name ?? "", S: [sg.S1.score, sg.S2.score, sg.S3.score, sg.S4.score], flags: r.scored.flags.length, signals: sg };
});
rows.length = 0; rows.push(...report);
rows.sort((a, b) => b.total - a.total || b.S[0] - a.S[0] || b.S[1] - a.S[1]);
console.log(`\nAll ${rows.length} applicants in the database (${RESCREEN ? "re-screened" : "screened"} this run: ${files.length - skipped.length - failed.length})`);
console.log("\nrank  match  result      role       S1 S2 S3 S4  flags  gate failed                         file");
rows.forEach((r, i) => console.log(`${String(i + 1).padStart(3)}  ${r.total.toFixed(1).padStart(5)}  ${r.rec.padEnd(10)}  ${r.role.padEnd(9)}  ${r.S.join("  ")}   ${String(r.flags).padStart(4)}  ${(r.gate || "-").padEnd(34)} ${r.file}`));

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
