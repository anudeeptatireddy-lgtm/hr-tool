// GET /api/dashboard -> jobs, a light row per received CV, and headline counts. Full results stay on /api/result.
import type { Config } from "@netlify/functions";
import { listScreenings } from "../../src/db";
import { JOBS } from "../../src/jobs";
import { SHORTLIST_AT } from "../../src/scoring";

const LABELS = { S1: "Ops", S2: "Fix adopted", S3: "Owner", S4: "Kills" } as const;

export default async () => {
  const rows = await listScreenings();
  const candidates = rows.map((s) => {
    const r = s.result;
    const base = { id: s.id, file: s.file_name, receivedAt: s.created_at, status: s.status, error: s.error, lastDecision: s.last_decision, lastSent: s.last_sent };
    if (s.status !== "done" || !r?.roles) return { ...base, name: r?.candidate?.name || "", role: s.role_selected || "", match: null, outcome: s.status === "running" ? "screening" : "error" };
    const rr = r.roles[r.roleUsed];
    const sig = r.scored.signals;
    return {
      ...base,
      name: r.candidate.name || "Name not found",
      hasEmail: !!r.candidate.email,
      role: r.roleUsed,
      roleNote: r.roleNote,
      match: rr.total,
      band: rr.band,
      recommendation: rr.recommendation,
      gateFailed: rr.gateFailed,
      failedGate: rr.gates.find((g: any) => g.status === "fail")?.name || "",
      askRelocation: rr.gates.some((g: any) => g.status === "ask"),
      chips: (["S1", "S2", "S3", "S4"] as const).filter((k) => sig[k].score >= 2).map((k) => `${LABELS[k]} ${sig[k].score}/3`),
      signals: Object.fromEntries((["S1", "S2", "S3", "S4"] as const).map((k) => [k, sig[k].score])),
      outcome: rr.recommendation === "Shortlist" ? "passed" : rr.recommendation === "Borderline" ? "borderline" : "failed",
    };
  });
  const done = candidates.filter((c) => c.match !== null);
  const jobs = JOBS.map((j) => {
    const mine = done.filter((c) => c.role === j.role);
    return { ...j, received: candidates.filter((c) => c.role === j.role).length, passed: mine.filter((c) => c.outcome === "passed").length };
  });
  const stats = {
    activeJobs: JOBS.length,
    received: candidates.length,
    passed: done.filter((c) => c.outcome === "passed").length,
    emailsSent: candidates.filter((c) => c.lastSent).length,
  };
  return Response.json({ jobs, candidates, stats, threshold: SHORTLIST_AT }, { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/dashboard" };
