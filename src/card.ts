// The card Arjun sees (SPEC.md "What Arjun sees"): headline, 2 "why ranked here" lines with quotes,
// 1 risk line, 3 probe questions aimed at the weakest signals. Built in code from the scored record.
import type { Scored, Signal, RoleResult } from "./scoring";

const NAMES: Record<Signal, string> = { S1: "Hands-on logistics ops", S2: "Built a fix others adopted", S3: "Owned the outcome", S4: "Kills and post-mortems" };

export const PROBES: Record<Signal, { ask: string; strong: string; weak: string }[]> = {
  S1: [
    { ask: "Walk me through the worst shipment day you personally handled.", strong: "A named document or hold, the people called, the clock time, and the outcome", weak: "A story about a customer they interviewed" },
    { ask: "What does a forwarder's ops desk do between 8 and 11am?", strong: "Specific tasks: DO follow-ups, BoL corrections, carrier chasing", weak: 'Generic words like "tracking" and "coordination"' },
  ],
  S2: [{ ask: "What did you build that nobody asked for? Who used it in week 2?", strong: "A trigger, a crude first version, a user count", weak: "A project their manager assigned" }],
  S3: [{ ask: "Tell me about a call you made that no one above you checked.", strong: "Their decision, its consequence, what they'd change", weak: '"We aligned with stakeholders"' }],
  S4: [{ ask: "What did you kill, and what data made you do it?", strong: "A metric and a threshold, plus where the capacity went", weak: "Nothing killed, or a kill imposed by someone else" }],
};

export type Card = {
  why: { signal: Signal; line: string; quote: string }[];
  risk: string;
  probes: { signal: Signal; ask: string; strong: string; weak: string }[];
};

export function buildCard(sc: Scored, rr: RoleResult): Card {
  const order: Signal[] = ["S1", "S2", "S3", "S4"];
  const contrib = (s: Signal) => (sc.signals[s].score / 3) * rr.weights[s];
  const why = [...order].filter((s) => sc.signals[s].score > 0 && sc.signals[s].quote)
    .sort((a, b) => contrib(b) - contrib(a)).slice(0, 2)
    .map((s) => ({ signal: s, line: `${s} ${NAMES[s]} (${sc.signals[s].score}/3): ${sc.signals[s].reason}`, quote: sc.signals[s].quote }));
  // Weakest = most weighted points lost.
  const weakest = [...order].sort((a, b) => (rr.weights[b] - contrib(b)) - (rr.weights[a] - contrib(a)) || order.indexOf(a) - order.indexOf(b));
  const failed = rr.gates.find((g) => g.status === "fail");
  const ask = rr.gates.find((g) => g.status === "ask");
  const w = weakest[0];
  const risk = failed ? `Gate: ${failed.name} failed (${failed.detail})`
    : sc.lowConfidence && sc.signals.S1.score >= 2 ? `S1 rests on thin evidence: ${sc.signals.S1.reason}. Confirm in interview.`
    : sc.signals[w].score === 3
      ? `No gaps on the CV${ask ? `, but ${ask.detail}` : ""}. CV claims aren't verified yet: test the S1 story in interview.`
    : `${w} ${NAMES[w]} is weakest (${sc.signals[w].score}/3): ${sc.signals[w].reason}${ask ? `. Also: ${ask.detail}` : ""}`;
  const probes: Card["probes"] = [];
  for (const s of weakest) for (const p of PROBES[s]) if (probes.length < 3) probes.push({ signal: s, ...p });
  return { why, risk, probes };
}
