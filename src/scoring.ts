// Scoring in code (Components Map "Processing"): SPEC.md anchors applied to the extraction JSON only.
// It never sees the raw CV except to check that each cited quote is really in it (hard rule 1).
// No employer, college or personal field is read here: only work_kind, months, volume, users, adoption, flags.
import { type Evidence, quoteInText } from "./extraction.js";

export type Role = "PM" | "Senior PM";
export type Signal = "S1" | "S2" | "S3" | "S4";
export type Weights = Record<Signal, number>;

export const WEIGHTS: Record<Role, Weights> = {
  PM: { S1: 40, S2: 30, S3: 15, S4: 15 },
  "Senior PM": { S1: 40, S2: 30, S3: 20, S4: 10 },
};
/** Default weights from SPEC.md, used for the back-test on past hires. */
export const DEFAULT_WEIGHTS: Weights = { S1: 40, S2: 30, S3: 20, S4: 10 };

export const SHORTLIST_AT = 65;
export const BORDERLINE_AT = 45;
export type Band = "Shortlist" | "Borderline" | "Decline";

export type SignalResult = { score: 0 | 1 | 2 | 3; reason: string; quote: string; field: string };
export type Flag = { field: string; quote: string; issue: string };

const OPERATORS = new Set(["forwarder", "cha", "3pl", "nvocc", "port", "shipper"]);
const lc = (s: string) => s.trim().toLowerCase();

/** Items whose quote isn't in the CV get no credit and are flagged. */
function verified<T extends { cv_quote: string }>(items: T[], cv: string, field: string, flags: Flag[]): T[] {
  return items.filter((it, i) => {
    if (quoteInText(it.cv_quote, cv)) return true;
    flags.push({ field: `${field}[${i}]`, quote: it.cv_quote, issue: it.cv_quote ? "quote not found in CV: no credit" : "no quote: no credit" });
    return false;
  });
}

function s1(ev: Evidence, cv: string, flags: Flag[]): SignalResult & { lowConfidence: boolean; handsOnMonths: number } {
  const roles = verified(ev.ops_roles, cv, "ops_roles", flags);
  // Hands-on needs all three: a doing-verb task, a duration, and an operator employer (not a software seat).
  const hands = roles.filter((r) => r.work_kind === "hands_on_operations" && OPERATORS.has(lc(r.employer_type)) && r.hands_on_tasks.length > 0 && r.months > 0);
  const H = hands.reduce((a, r) => a + r.months, 0);
  const withVolume = hands.filter((r) => r.volume.trim());
  const embedded = roles.filter((r) => r.work_kind === "embedded_with_ops_from_vendor").reduce((a, r) => a + r.months, 0);
  // Software or sales work counts as logistics exposure only at a logistics operator or a logistics software vendor.
  const softwareOnly = roles.filter((r) => r.work_kind === "software_or_sales_for_logistics" && (OPERATORS.has(lc(r.employer_type)) || lc(r.employer_type) === "software_vendor"));
  const best = [...withVolume, ...hands].sort((a, b) => b.months - a.months)[0];
  const base = { handsOnMonths: H, lowConfidence: false };
  if (H >= 24 && withVolume.length)
    return { ...base, score: 3, reason: `${H} months of hands-on logistics operations, with volume (${withVolume[0].volume})`, quote: withVolume[0].cv_quote, field: "ops_roles" };
  if (H >= 24)
    return { ...base, lowConfidence: true, score: 2, reason: `${H} months of hands-on operations, but no volume stated`, quote: best.cv_quote, field: "ops_roles" };
  if (H >= 6)
    return { ...base, lowConfidence: !withVolume.length, score: 2, reason: `${H} months of hands-on logistics operations (under 24)`, quote: best.cv_quote, field: "ops_roles" };
  if (embedded >= 24) {
    const r = roles.find((x) => x.work_kind === "embedded_with_ops_from_vendor")!;
    return { ...base, score: 2, reason: `${embedded} months embedded with operations teams from a vendor seat`, quote: r.cv_quote, field: "ops_roles" };
  }
  const touch = hands[0] ?? softwareOnly[0] ?? roles.find((x) => x.work_kind === "embedded_with_ops_from_vendor" && lc(x.employer_type) !== "none");
  if (touch)
    return { ...base, score: 1, reason: hands.length ? `only ${H} months hands-on` : "logistics only through software, integration or sales work, not operations", quote: touch.cv_quote, field: "ops_roles" };
  return { ...base, score: 0, reason: "no logistics operations evidence", quote: "", field: "ops_roles" };
}

function s2(ev: Evidence, cv: string, flags: Flag[]): SignalResult {
  const builds = verified(ev.unprompted_builds, cv, "unprompted_builds", flags);
  // Adoption counts only when its own words are really in the CV (a result like "120K users" isn't adoption).
  const adopted = (b: { adoption: string; adoption_quote?: string }) => !!b.adoption.trim() && !!b.adoption_quote && quoteInText(b.adoption_quote, cv);
  const forOps = builds.find((b) => ["ops", "customers"].includes(lc(b.users)) && adopted(b));
  if (forOps) return { score: 3, reason: `built "${forOps.built}" for ${lc(forOps.users)}; ${forOps.adoption}`, quote: forOps.cv_quote, field: "unprompted_builds" };
  const team = builds.find((b) => lc(b.users) === "own team" && adopted(b));
  if (team) return { score: 2, reason: `built "${team.built}", adopted by their own team (${team.adoption})`, quote: team.cv_quote, field: "unprompted_builds" };
  if (builds[0]) return { score: 1, reason: `built "${builds[0].built}", no adoption by others stated`, quote: builds[0].cv_quote, field: "unprompted_builds" };
  return { score: 0, reason: "only assigned work described", quote: "", field: "unprompted_builds" };
}

function s3(ev: Evidence, cv: string, flags: Flag[]): SignalResult {
  const o = ev.ownership;
  const ownOk = o.sole_owner && quoteInText(o.cv_quote, cv);
  const crisisOk = !!o.crisis.trim() && quoteInText(o.crisis_quote, cv);
  if (o.sole_owner && !ownOk) flags.push({ field: "ownership.cv_quote", quote: o.cv_quote, issue: "sole-owner quote not found in CV: no credit" });
  if (o.crisis.trim() && !crisisOk) flags.push({ field: "ownership.crisis_quote", quote: o.crisis_quote, issue: "crisis quote not found in CV: no credit" });
  if (ownOk && crisisOk) return { score: 3, reason: `sole owner, and carried a crisis to resolution: ${o.crisis}`, quote: o.crisis_quote, field: "ownership" };
  if (ownOk) return { score: 2, reason: "sole owner of their area; no crisis described", quote: o.cv_quote, field: "ownership" };
  const layer = o.layer_above.trim();
  const described = !!layer && !/^(none|not stated|not mentioned|no one|nobody|unknown|unclear|n\/a|na)\b/i.test(layer);
  if (crisisOk || described)
    return { score: 1, reason: `owner within a team${described ? ` (${layer} above or alongside)` : ""}`, quote: crisisOk ? o.crisis_quote : quoteInText(o.cv_quote, cv) ? o.cv_quote : "", field: "ownership" };
  return { score: 0, reason: "contributor only; no ownership described", quote: "", field: "ownership" };
}

function s4(ev: Evidence, cv: string, flags: Flag[]): SignalResult {
  const ks = verified(ev.kills_postmortems, cv, "kills_postmortems", flags);
  const own = ks.find((k) => k.own_call);
  if (own) return { score: 3, reason: `stopped or reversed their own work: ${own.what}`, quote: own.cv_quote, field: "kills_postmortems" };
  const shared = ks.find((k) => k.learning_adopted);
  if (shared) return { score: 2, reason: `analysed a loss and the lesson was adopted: ${shared.what}`, quote: shared.cv_quote, field: "kills_postmortems" };
  if (ks[0]) return { score: 1, reason: `handled an incident, not their own call reversed: ${ks[0].what}`, quote: ks[0].cv_quote, field: "kills_postmortems" };
  return { score: 0, reason: "only wins listed", quote: "", field: "kills_postmortems" };
}

export type Scored = {
  signals: Record<Signal, SignalResult>;
  flags: Flag[];
  lowConfidence: boolean;
  handsOnMonths: number;
};

/** Role-independent: the four signal scores. */
export function scoreSignals(ev: Evidence, cvText: string): Scored {
  const flags: Flag[] = [];
  const one = s1(ev, cvText, flags);
  const { lowConfidence, handsOnMonths, ...S1 } = one;
  return { signals: { S1, S2: s2(ev, cvText, flags), S3: s3(ev, cvText, flags), S4: s4(ev, cvText, flags) }, flags, lowConfidence, handsOnMonths };
}

export function total(signals: Record<Signal, { score: number }>, w: Weights): number {
  const t = (["S1", "S2", "S3", "S4"] as Signal[]).reduce((a, s) => a + (signals[s].score / 3) * w[s], 0);
  return Math.round(t * 10) / 10;
}

export function band(t: number): Band {
  return t >= SHORTLIST_AT ? "Shortlist" : t >= BORDERLINE_AT ? "Borderline" : "Decline";
}

// ---------- gates (from the JDs, as SPEC.md "Pattern vs JD" defines them) ----------

export type Gate = { name: string; status: "pass" | "fail" | "ask"; detail: string };

const MUMBAI = /\b(mumbai|navi mumbai|thane|bombay)\b/i;

export function gates(ev: Evidence, role: Role, cvText: string): Gate[] {
  const out: Gate[] = [];
  if (role === "PM") {
    const exp = Math.round((ev.pm_years + 0.5 * ev.adjacent_years) * 10) / 10;
    const ok = exp >= 1.5 && exp <= 5;
    out.push({ name: "PM tenure 1.5–5 yrs", status: ok ? "pass" : "fail", detail: `${ev.pm_years} PM + half of ${ev.adjacent_years} adjacent = ${exp} yrs` });
  } else {
    const ok = ev.pm_years >= 4 && ev.pm_years <= 9;
    out.push({ name: "PM tenure 4–9 yrs", status: ok ? "pass" : "fail", detail: `${ev.pm_years} PM yrs` });
    const integ = ev.integration_platform_ownership && quoteInText(ev.integration_quote, cvText);
    out.push({ name: "Owned an integration or platform area", status: integ ? "pass" : "fail", detail: integ ? ev.integration_quote : "no owned integration/platform area with a CV quote" });
  }
  const loc = ev.candidate.location;
  if (MUMBAI.test(loc)) out.push({ name: "Mumbai or relocating", status: "pass", detail: `based in ${loc}` });
  else if (ev.candidate.relocation_stated === true) out.push({ name: "Mumbai or relocating", status: "pass", detail: `based in ${loc || "unknown"}, willing to relocate` });
  else if (ev.candidate.relocation_stated === false) out.push({ name: "Mumbai or relocating", status: "fail", detail: `based in ${loc || "unknown"}, won't relocate` });
  else out.push({ name: "Mumbai or relocating", status: "ask", detail: `based in ${loc || "unknown"}; ask about relocation in the invite` });
  return out;
}

export type RoleResult = { role: Role; weights: Weights; total: number; band: Band; gates: Gate[]; recommendation: Band; gateFailed: boolean };

export function forRole(sc: Scored, ev: Evidence, role: Role, cvText: string): RoleResult {
  const w = WEIGHTS[role];
  const t = total(sc.signals, w);
  const g = gates(ev, role, cvText);
  const gateFailed = g.some((x) => x.status === "fail");
  return { role, weights: w, total: t, band: band(t), gates: g, gateFailed, recommendation: gateFailed ? "Decline" : band(t) };
}

/** Sort for the shortlist: total, then S1, then S2 (SPEC tie-break). */
export function compareCandidates(a: { total: number; signals: Record<Signal, { score: number }> }, b: typeof a): number {
  return b.total - a.total || b.signals.S1.score - a.signals.S1.score || b.signals.S2.score - a.signals.S2.score;
}
