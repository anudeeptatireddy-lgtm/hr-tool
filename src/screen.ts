// The whole Flow A for one CV: text -> redact identity -> AI extraction -> quote check -> score both roles -> card.
import { buildCard, type Card } from "./card";
import { extractConsensus } from "./consensus";
import type { Evidence } from "./extraction";
import { extractText } from "./extractText";
import { PLACEHOLDER, redactIdentity } from "./redact";
import { forRole, type Gate, type Role, type RoleResult, type Scored } from "./scoring";
import { genericCard, genericConsensus, genericGates, genericOutcome, type GenericEvidence, type GenericScored, type JobGates } from "./genericScreen";
import type { Rubric } from "./rubric";

/** A name the model reported that is really in the text we sent: a sign redaction missed it. */
export function leakedName(ev: Evidence | null, sentText: string): string {
  const n = (ev?.candidate.name ?? "").trim();
  if (!n || n.includes(PLACEHOLDER) || /^\[|unknown|not (stated|given)/i.test(n)) return "";
  return sentText.toLowerCase().includes(n.toLowerCase()) ? n : "";
}

function redactNames(text: string, name: string): string {
  let out = text;
  for (const part of name.split(/\s+/).filter((p) => p.length > 2)) out = out.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), PLACEHOLDER);
  return out;
}

export type Screening = {
  ok: boolean;
  error: string;
  file: string;
  candidate: { name: string; email: string };
  roleSelected: Role | null;
  roleUsed: Role;
  roleNote: string;
  evidence: Evidence | null;
  scored: Scored | null;
  roles: Record<Role, RoleResult> | null;
  card: Card | null;
  redactedText: string;
  runTotals: number[];
};

export function detectRole(ev: Evidence, selected: Role | null): { role: Role; note: string } {
  if (selected) return { role: selected, note: "selected by founder" };
  const r = ev.candidate.role_applied.toLowerCase();
  if (r.includes("senior")) return { role: "Senior PM", note: "detected from CV" };
  if (r === "pm") return { role: "PM", note: "detected from CV" };
  // Unclear: use the tenure band it fits, and say so.
  return ev.pm_years >= 4 ? { role: "Senior PM", note: "role unclear: guessed from PM tenure, please confirm" } : { role: "PM", note: "role unclear: guessed from PM tenure, please confirm" };
}

export async function screen(file: string, buf: Buffer, selected: Role | null, timeoutMs?: number): Promise<Screening> {
  const base = { file, candidate: { name: "", email: "" }, roleSelected: selected, roleUsed: selected ?? ("PM" as Role), roleNote: "", evidence: null, scored: null, roles: null, card: null, redactedText: "", runTotals: [] as number[] };
  const doc = await extractText(file, buf);
  if (!doc.ok) return { ...base, ok: false, error: `Couldn't read this file: ${doc.error}` };
  // Personal details are kept here, on our side, and never sent to the AI.
  let red = redactIdentity(doc.text, file);
  let { result, error } = await extractConsensus(red.text, undefined, undefined, timeoutMs);
  // Safety net: if the AI could still read a name, redact that name too and extract again before scoring.
  const leaked = leakedName(result?.evidence ?? null, red.text);
  if (leaked) {
    const again = redactIdentity(redactNames(doc.text, leaked), file);
    red = { ...again, name: red.name || leaked, email: red.email || again.email };
    ({ result, error } = await extractConsensus(red.text, undefined, undefined, timeoutMs));
  }
  if (!result) return { ...base, candidate: { name: red.name, email: red.email }, redactedText: red.text, ok: false, error: `Extraction flagged: ${error}` };
  const { evidence, scored } = result;
  const roles = { PM: forRole(scored, evidence, "PM", red.text), "Senior PM": forRole(scored, evidence, "Senior PM", red.text) };
  const { role, note } = detectRole(evidence, selected);
  return { ok: true, error: "", file, candidate: { name: red.name, email: red.email }, roleSelected: selected, roleUsed: role, roleNote: note, evidence, scored, roles, card: buildCard(scored, roles[role]), redactedText: red.text, runTotals: result.totals };
}

// ---------- one summary shape for both kinds of job (dashboard, emails, UI) ----------

export type JobRow = { ref: string; title: string; kind: "pattern" | "generated"; role: Role | null; gates: JobGates; rubric: Rubric | null; rubric_version: number; rubric_status: string };
export type Summary = {
  kind: "pattern" | "generated"; jobRef: string; jobTitle: string; rubricVersion: number;
  match: number; band: string; recommendation: string; gateFailed: boolean; failedGate: string; askRelocation: boolean;
  gates: Gate[]; chips: string[]; signalScores: { key: string; name: string; weight: number; score: number }[]; strengths: string[];
};

const PATTERN_NAMES = { S1: "Ops", S2: "Fix adopted", S3: "Owner", S4: "Kills" } as const;

export function patternSummary(r: Screening, job: { ref: string; title: string; rubric_version?: number }): Summary {
  const rr = r.roles![r.roleUsed], sg = r.scored!.signals;
  const keys = ["S1", "S2", "S3", "S4"] as const;
  return {
    kind: "pattern", jobRef: job.ref, jobTitle: job.title, rubricVersion: job.rubric_version ?? 1,
    match: rr.total, band: rr.band, recommendation: rr.recommendation, gateFailed: rr.gateFailed,
    failedGate: rr.gates.find((g) => g.status === "fail")?.name ?? "", askRelocation: rr.gates.some((g) => g.status === "ask"),
    gates: rr.gates, chips: keys.filter((k) => sg[k].score >= 2).map((k) => `${PATTERN_NAMES[k]} ${sg[k].score}/3`),
    signalScores: keys.map((k) => ({ key: k, name: PATTERN_NAMES[k], weight: rr.weights[k], score: sg[k].score })),
    strengths: keys.filter((k) => sg[k].score >= 2).map((k) => sg[k].reason),
  };
}

export type GenericScreening = {
  ok: boolean; error: string; file: string; kind: "generated"; candidate: { name: string; email: string };
  jobRef: string; jobTitle: string; rubric: Rubric | null; evidence: GenericEvidence | null; scored: GenericScored | null;
  gates: Gate[]; card: ReturnType<typeof genericCard> | null; summary: Summary | null; redactedText: string; runTotals: number[];
};

export async function screenGeneric(file: string, buf: Buffer, job: JobRow, timeoutMs?: number): Promise<GenericScreening> {
  const base: GenericScreening = { ok: false, error: "", file, kind: "generated", candidate: { name: "", email: "" }, jobRef: job.ref, jobTitle: job.title, rubric: job.rubric,
    evidence: null, scored: null, gates: [], card: null, summary: null, redactedText: "", runTotals: [] };
  if (!job.rubric || job.rubric_status !== "approved") return { ...base, error: "This job's rubric hasn't been approved yet." };
  const doc = await extractText(file, buf);
  if (!doc.ok) return { ...base, error: `Couldn't read this file: ${doc.error}` };
  const red = redactIdentity(doc.text, file);
  const { result, error } = await genericConsensus(red.text, job.rubric, 3, timeoutMs);
  if (!result) return { ...base, candidate: { name: red.name, email: red.email }, redactedText: red.text, error: `Extraction flagged: ${error}` };
  const gates = genericGates(result.ev, job.gates);
  const out = genericOutcome(result.scored.total, gates);
  const summary: Summary = {
    kind: "generated", jobRef: job.ref, jobTitle: job.title, rubricVersion: job.rubric_version,
    match: result.scored.total, band: out.band, recommendation: out.recommendation, gateFailed: out.gateFailed,
    failedGate: gates.find((g) => g.status === "fail")?.name ?? "", askRelocation: gates.some((g) => g.status === "ask"), gates,
    chips: result.scored.signals.filter((s) => s.score >= 2).map((s) => `${s.name.split(/\s+/).slice(0, 3).join(" ")} ${s.score}/3`),
    signalScores: result.scored.signals.map((s) => ({ key: s.key, name: s.name, weight: s.weight, score: s.score })),
    strengths: result.scored.signals.filter((s) => s.score >= 2).map((s) => s.reason),
  };
  return { ...base, ok: true, candidate: { name: red.name, email: red.email }, evidence: result.ev, scored: result.scored, gates,
    card: genericCard(result.scored, job.rubric, gates), summary, redactedText: red.text, runTotals: result.totals };
}

/** Screens one CV for one job: the back-tested pattern for the Kargo roles, the approved generated rubric otherwise. */
export async function screenForJob(file: string, buf: Buffer, job: JobRow, timeoutMs?: number): Promise<((Screening & { kind: "pattern" }) | GenericScreening) & { summary: Summary | null }> {
  if (job.kind === "generated") return screenGeneric(file, buf, job, timeoutMs);
  const r = await screen(file, buf, job.role, timeoutMs);
  return { ...r, kind: "pattern" as const, summary: r.ok ? patternSummary(r, job) : null };
}
