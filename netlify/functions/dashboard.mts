// GET /api/dashboard -> jobs (with their rubrics), a light row per received CV, and headline counts.
// Full results stay on /api/result.
import type { Config } from "@netlify/functions";
import { listJobs, listScreenings } from "../../src/db";
import { patternSummary, type Summary } from "../../src/screen";
import { spreadOf } from "../../src/consensus";
import { SHORTLIST_AT, WEIGHTS } from "../../src/scoring";

// What the back-tested rubric looks for, shown read-only on the Kargo roles.
const PATTERN_SIGNALS = [
  { key: "S1", name: "Hands-on logistics operations", what: "Personally did ops work inside a forwarder, CHA, 3PL, NVOCC, port or shipper desk, with a duration and volume." },
  { key: "S2", name: "Built the missing fix, and others adopted it", what: "An unprompted fix with an adoption count; 3 if operators or customers adopted it." },
  { key: "S3", name: "Owned the outcome with no layer above", what: "Sole owner, plus a crisis carried personally to resolution." },
  { key: "S4", name: "Kills and post-mortems", what: "Killed or reversed their own work on data, and documented why." },
];

export default async () => {
  const [jobRecs, rows] = await Promise.all([listJobs(), listScreenings()]);
  const byRef = new Map(jobRecs.map((j) => [j.ref, j]));
  const candidates = rows.map((s) => {
    const r = s.result;
    const base = { id: s.id, file: s.file_name, receivedAt: s.created_at, status: s.status, error: s.error, lastDecision: s.last_decision, lastSent: s.last_sent, jobRef: s.job_ref };
    if (s.status !== "done" || !r) return { ...base, name: r?.candidate?.name || "", role: byRef.get(s.job_ref)?.title || "", match: null, outcome: s.status === "running" ? "screening" : "error" };
    const job = byRef.get(s.job_ref) ?? jobRecs[0];
    // Rows screened before jobs moved to the database have no summary: build it from the pattern result.
    const sum: Summary | null = r.summary ?? (r.roles ? patternSummary(r, { ref: job.ref, title: job.title }) : null);
    if (!sum) return { ...base, name: r.candidate?.name || "", role: job.title, match: null, outcome: "error" };
    return {
      ...base,
      jobRef: sum.jobRef,
      name: r.candidate?.name || "Name not found",
      role: sum.jobTitle,
      kind: sum.kind,
      match: sum.match,
      band: sum.band,
      recommendation: sum.recommendation,
      gateFailed: sum.gateFailed,
      failedGate: sum.failedGate,
      askRelocation: sum.askRelocation,
      chips: sum.chips,
      signalScores: sum.signalScores,
      lowConfidence: !!sum.lowConfidence,
      lowConfidenceReasons: sum.lowConfidenceReasons ?? [],
      // Rows saved before this flag existed are checked from their run totals.
      needsHumanReview: sum.needsHumanReview ?? spreadOf(r.runTotals ?? []).needsHumanReview,
      runTotals: sum.runTotals ?? r.runTotals ?? [],
      runRange: sum.runRange ?? spreadOf(r.runTotals ?? []).range,
      // Inconsistent scoring gets its own group: a person decides, and bulk actions leave it out.
      outcome: (sum.needsHumanReview ?? spreadOf(r.runTotals ?? []).needsHumanReview) ? "review"
        : sum.recommendation === "Shortlist" ? "passed" : sum.recommendation === "Borderline" ? "borderline" : "failed",
    };
  });
  const done = candidates.filter((c) => c.match !== null);
  const jobs = jobRecs.map((j) => {
    const mine = candidates.filter((c) => c.jobRef === j.ref);
    const rubric = j.kind === "pattern"
      ? { signals: PATTERN_SIGNALS.map((p) => ({ ...p, weight: WEIGHTS[j.role ?? "PM"][p.key as "S1"] })) }
      : j.rubric;
    return {
      ref: j.ref, title: j.title, kind: j.kind, role: j.role, location: j.location, reportsTo: j.reports_to, openedOn: j.opened_on, requirement: j.requirement,
      gates: j.gate_notes, gateConfig: j.gates, jdFile: j.jd_file, rubric, rubricVersion: j.rubric_version, rubricStatus: j.rubric_status,
      received: mine.length, passed: mine.filter((c) => c.outcome === "passed").length,
    };
  });
  const stats = { activeJobs: jobs.filter((j) => j.rubricStatus === "approved").length, received: candidates.length, passed: done.filter((c) => c.outcome === "passed").length, emailsSent: candidates.filter((c) => c.lastSent).length };
  return Response.json({ jobs, candidates, stats, threshold: SHORTLIST_AT }, { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/dashboard" };
