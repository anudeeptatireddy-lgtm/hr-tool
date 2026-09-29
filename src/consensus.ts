// Extraction varies a little between runs, so a candidate's band shouldn't hang on one call.
// Run K extractions in parallel, score each, and keep the run with the median total (its quotes and card
// stay consistent because they all come from that one run).
import { extractEvidence, type Evidence } from "./extraction.js";
import { DEFAULT_WEIGHTS, scoreSignals, total, type Scored, type Weights } from "./scoring.js";

export const RUNS = 3;
/** More than this many points between the highest and lowest run means the score isn't reliable: a person should look. */
export const REVIEW_SPREAD = 10;
export function spreadOf(totals: number[]): { spread: number; needsHumanReview: boolean; range: [number, number] } {
  if (!totals.length) return { spread: 0, needsHumanReview: false, range: [0, 0] };
  const lo = Math.min(...totals), hi = Math.max(...totals), spread = Math.round((hi - lo) * 10) / 10;
  return { spread, needsHumanReview: spread > REVIEW_SPREAD, range: [lo, hi] };
}

export type Consensus = { evidence: Evidence; scored: Scored; totals: number[]; picked: number; errors: string[] };

export async function extractConsensus(cv: string, k = RUNS, weights: Weights = DEFAULT_WEIGHTS, timeoutMs?: number): Promise<{ result: Consensus | null; error: string }> {
  // Seeds 1..k: different enough to show real ambiguity, and the same every time this CV is screened.
  const runs = await Promise.all(Array.from({ length: k }, (_, i) => extractEvidence(cv, timeoutMs, i + 1)));
  const good = runs.filter((r) => r.evidence).map((r) => {
    const scored = scoreSignals(r.evidence!, cv);
    return { evidence: r.evidence!, scored, t: total(scored.signals, weights) };
  });
  const errors = runs.filter((r) => !r.evidence).map((r) => r.error);
  if (!good.length) return { result: null, error: errors[0] || "extraction failed" };
  const sorted = [...good].sort((a, b) => a.t - b.t);
  const med = sorted[Math.floor((sorted.length - 1) / 2)];
  return { result: { evidence: med.evidence, scored: med.scored, totals: good.map((g) => g.t), picked: good.indexOf(med), errors }, error: "" };
}
