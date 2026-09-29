// Rubrics for jobs created in the app (kind 'generated'). The two Kargo roles keep the back-tested
// past-hire rubric in scoring.ts; these are generated from the job's own text, then reviewed and approved.
import { callJson } from "./gemini.js";

export type RubricSignal = {
  key: string;            // G1..G4
  name: string;           // short label, e.g. "Owned a B2B roadmap"
  weight: number;         // integer, all weights sum to 100
  what: string;           // what the signal looks for in a CV
  levels: Record<"0" | "1" | "2" | "3", string>;  // what each score means
  probe: string;          // interview question aimed at this signal
};
export type Rubric = { signals: RubricSignal[] };

const SYSTEM = `You design a CV screening rubric for one job. You get the job's title, what it's looking for, and its gates.

Generate signals strictly from the requirements below. Do not invent a signal not stated or clearly implied by the job description.

Rules:
- 3 or 4 signals. Each is something a CV can show evidence of (work done, outcomes, scope), not a personality trait.
- Weights are integers that sum to 100. Give the most job-critical requirement the largest weight.
- Never create a signal for college or university, degree prestige, certificates on their own, company size, age, gender, or years beyond a minimum.
- Gates (minimum years, location) are checked separately: don't turn them into signals.
- For each signal, describe what scores 0, 1, 2 and 3. 3 = strong direct evidence with specifics (numbers, scope, outcome); 0 = no evidence.
- Add one interview probe question per signal.

Reply with only JSON: {"signals": [{"name": "", "weight": 0, "what": "", "levels": {"0": "", "1": "", "2": "", "3": ""}, "probe": ""}]}`;

/** Makes a model or hand-edited rubric valid: 3–4 signals, keys G1.., integer weights summing to exactly 100. */
export function normaliseRubric(raw: any): { rubric: Rubric | null; error: string } {
  const list = Array.isArray(raw?.signals) ? raw.signals : [];
  const s = list.slice(0, 4).map((x: any, i: number) => ({
    key: `G${i + 1}`,
    name: String(x?.name ?? "").trim().slice(0, 80),
    weight: Math.max(0, Math.round(Number(x?.weight) || 0)),
    what: String(x?.what ?? "").trim().slice(0, 400),
    levels: Object.fromEntries((["0", "1", "2", "3"] as const).map((k) => [k, String(x?.levels?.[k] ?? "").trim().slice(0, 300)])) as RubricSignal["levels"],
    probe: String(x?.probe ?? "").trim().slice(0, 300),
  }));
  if (s.length < 3) return { rubric: null, error: "A rubric needs 3 or 4 signals." };
  if (s.some((x: RubricSignal) => !x.name || !x.what || Object.values(x.levels).some((v) => !v))) return { rubric: null, error: "Every signal needs a name, a description and all four levels." };
  const sum = s.reduce((a: number, x: RubricSignal) => a + x.weight, 0);
  if (sum <= 0) return { rubric: null, error: "Weights must add up to 100." };
  // Rescale to exactly 100, keeping the order of importance; rounding remainder goes to the heaviest.
  if (sum !== 100) {
    s.forEach((x: RubricSignal) => (x.weight = Math.round((x.weight / sum) * 100)));
    const diff = 100 - s.reduce((a: number, x: RubricSignal) => a + x.weight, 0);
    s.reduce((m: RubricSignal, x: RubricSignal) => (x.weight > m.weight ? x : m), s[0]).weight += diff;
  }
  return { rubric: { signals: s }, error: "" };
}

export async function generateRubric(job: { title: string; requirement: string; gateNotes: string[] }): Promise<{ rubric: Rubric | null; error: string }> {
  const user = JSON.stringify({ title: job.title, looking_for: job.requirement, gates: job.gateNotes });
  const { data, error } = await callJson(SYSTEM, user, 60_000);
  if (!data) return { rubric: null, error: error || "Couldn't generate a rubric." };
  return normaliseRubric(data);
}
