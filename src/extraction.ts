// AI call 1: redacted CV text -> evidence JSON (schema from docs/SPEC.md plus documented extras, DECISIONS.md #14).
import { callJson } from "./gemini.js";
import { EXTRACT_PROMPT } from "./prompts/extract.js";

export type OpsRole = {
  employer: string; role_title: string; employer_type: string; work_kind: string;
  months: number; hands_on_tasks: string[]; volume: string; cv_quote: string;
};
export type Build = { trigger: string; built: string; users: string; adoption: string; adoption_quote: string; outcome: string; cv_quote: string };
export type Kill = { what: string; own_call: boolean; learning_adopted: boolean; cv_quote: string };
export type Evidence = {
  candidate: { name: string; email: string; role_applied: string; location: string; relocation_stated: boolean | null };
  pm_years: number;
  adjacent_years: number;
  ops_roles: OpsRole[];
  unprompted_builds: Build[];
  ownership: { sole_owner: boolean; layer_above: string; crisis: string; cv_quote: string; crisis_quote: string };
  kills_postmortems: Kill[];
  integration_platform_ownership: boolean;
  integration_quote: string;
  gaps_or_unclear: string[];
};

export const SCHEMA = {
  candidate: { name: "", email: "", role_applied: "PM | Senior PM | unclear", location: "", relocation_stated: null },
  pm_years: 0.0,
  adjacent_years: 0.0,
  ops_roles: [{
    employer: "", role_title: "",
    employer_type: "forwarder | CHA | 3PL | NVOCC | port | shipper | software_vendor | none",
    work_kind: "hands_on_operations | embedded_with_ops_from_vendor | software_or_sales_for_logistics",
    months: 0, hands_on_tasks: [""], volume: "", cv_quote: "",
  }],
  unprompted_builds: [{ trigger: "", built: "", users: "ops | customers | own team | self", adoption: "", adoption_quote: "", outcome: "", cv_quote: "" }],
  ownership: { sole_owner: false, layer_above: "", crisis: "", cv_quote: "", crisis_quote: "" },
  kills_postmortems: [{ what: "", own_call: false, learning_adopted: false, cv_quote: "" }],
  integration_platform_ownership: false,
  integration_quote: "",
  gaps_or_unclear: [""],
};

export function systemPrompt(today = new Date()): string {
  return EXTRACT_PROMPT.replace("{today}", today.toISOString().slice(0, 10)).replace("{schema}", JSON.stringify(SCHEMA, null, 2));
}

// Fill any missing fields so scoring never trips on a partial model answer.
export function normaliseEvidence(raw: any): Evidence {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
  const o = raw?.ownership ?? {};
  return {
    candidate: {
      name: str(raw?.candidate?.name), email: str(raw?.candidate?.email), role_applied: str(raw?.candidate?.role_applied) || "unclear",
      location: str(raw?.candidate?.location), relocation_stated: typeof raw?.candidate?.relocation_stated === "boolean" ? raw.candidate.relocation_stated : null,
    },
    pm_years: num(raw?.pm_years),
    adjacent_years: num(raw?.adjacent_years),
    ops_roles: arr(raw?.ops_roles).map((r: any) => ({
      employer: str(r.employer), role_title: str(r.role_title), employer_type: str(r.employer_type), work_kind: str(r.work_kind),
      months: num(r.months), hands_on_tasks: arr(r.hands_on_tasks).map(str).filter(Boolean), volume: str(r.volume), cv_quote: str(r.cv_quote),
    })),
    unprompted_builds: arr(raw?.unprompted_builds).map((b: any) => ({
      trigger: str(b.trigger), built: str(b.built), users: str(b.users), adoption: str(b.adoption), adoption_quote: str(b.adoption_quote), outcome: str(b.outcome), cv_quote: str(b.cv_quote),
    })),
    ownership: { sole_owner: o.sole_owner === true, layer_above: str(o.layer_above), crisis: str(o.crisis), cv_quote: str(o.cv_quote), crisis_quote: str(o.crisis_quote) },
    kills_postmortems: arr(raw?.kills_postmortems).map((k: any) => ({ what: str(k.what), own_call: k.own_call === true, learning_adopted: k.learning_adopted === true, cv_quote: str(k.cv_quote) })),
    integration_platform_ownership: raw?.integration_platform_ownership === true,
    integration_quote: str(raw?.integration_quote),
    gaps_or_unclear: arr(raw?.gaps_or_unclear).map(str).filter(Boolean),
  };
}

const REQUIRED = Object.keys(SCHEMA);
const OWNERSHIP_KEYS = Object.keys(SCHEMA.ownership);

/** Top-level keys (and ownership fields) the model left out. A partial answer counts as a parse failure. */
export function missingKeys(data: any): string[] {
  if (!data || typeof data !== "object") return REQUIRED;
  const miss = REQUIRED.filter((k) => !(k in data) || data[k] === null);
  if (data.ownership && typeof data.ownership === "object") miss.push(...OWNERSHIP_KEYS.filter((k) => !(k in data.ownership)).map((k) => `ownership.${k}`));
  return miss;
}

export async function extractEvidence(redactedCv: string, timeoutMs?: number, seed?: number): Promise<{ evidence: Evidence | null; error: string }> {
  const { data, error } = await callJson(systemPrompt(), `CV text:\n<cv>\n${redactedCv}\n</cv>`, timeoutMs, missingKeys, seed);
  return { evidence: data ? normaliseEvidence(data) : null, error };
}

// ---------- verbatim quote check (hard rule 1) ----------

const PUNCT: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "−": "-", "…": "..." };

export function norm(s: string): string {
  return s.normalize("NFKC").replace(/[‘’“”–—−…]/g, (c) => PUNCT[c]).toLowerCase().replace(/\s+/g, " ").trim();
}

/** True if the quote appears in the CV. Only whitespace, case and quote/dash styles may differ. */
export function quoteInText(quote: string, text: string): boolean {
  const q = norm(quote).replace(/^[\s.,;"']+|[\s.,;"']+$/g, "");
  return q.length > 0 && norm(text).includes(q);
}
