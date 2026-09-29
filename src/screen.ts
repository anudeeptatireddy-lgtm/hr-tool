// The whole Flow A for one CV: text -> redact identity -> AI extraction -> quote check -> score both roles -> card.
import { buildCard, type Card } from "./card";
import { extractConsensus } from "./consensus";
import type { Evidence } from "./extraction";
import { extractText } from "./extractText";
import { PLACEHOLDER, redactIdentity } from "./redact";
import { forRole, type Role, type RoleResult, type Scored } from "./scoring";

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
