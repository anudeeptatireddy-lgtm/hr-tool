// AI call 2 (Components Map): drafts the invite or decline email from the scored record, never the raw CV.
// The model gets no name, email, employer or college: placeholders are merged in code afterwards.
import { callJson } from "./gemini.js";
import type { Evidence } from "./extraction.js";
import type { RoleResult, Scored } from "./scoring.js";
import { findPlaceholders } from "./placeholders.js";

export type Kind = "invite" | "decline" | "more_info";
export type Draft = { subject: string; body: string; draftedBy: "ai" | "template" };

export const SCHEDULING_LINK = "[SCHEDULING LINK]";
/** What the invite asks for when there's no booking link: a reply with times, so nothing blocks sending. */
export const REPLY_WITH_TIMES = "Could you reply with two or three times that suit you for a 30-minute call over the next week?";

/** A booking link is configured (SCHEDULING_URL). Without one, invites ask for a reply with times instead. */
export const bookingLink = () => { const l = (process.env.SCHEDULING_URL || "").trim(); return /^https?:\/\//.test(l) ? l : ""; };

const ROLE_TITLE = { PM: "Product Manager", "Senior PM": "Senior Product Manager" } as const;

/** Only public, non-identifying facts: what they did, with employer names and quotes left out. */
export function draftFacts(ev: Evidence, sc: Scored, rr: RoleResult) {
  const employers = ev.ops_roles.map((r) => r.employer).filter((e) => e.trim().length > 2);
  const scrub = (s: string) => employers.reduce((t, e) => t.split(e).join("a previous employer"), s);
  const strengths = (["S1", "S2", "S3", "S4"] as const).filter((s) => sc.signals[s].score >= 2).map((s) => scrub(sc.signals[s].reason));
  return {
    role: ROLE_TITLE[rr.role],
    strengths,
    needs_relocation_question: rr.gates.some((g) => g.name.startsWith("Mumbai") && g.status === "ask"),
  };
}

const system = () => `You write short, warm, plain-English emails from Arjun Mehta, founder of Kargo (a Series A logistics software company in Mumbai), to a job applicant. Kargo has no HR team; Arjun writes to candidates himself.

Rules:
- Address the candidate as {first_name} and sign off as "Arjun". Never invent a name.
- Never mention scores, bands, rubrics, signals, "pattern", AI, screening tools or other candidates.
- Never promise an offer, salary or a hiring decision.
- Keep it under 150 words. No emoji, no exclamation marks in the subject.
- invite: thank them, say you'd like to talk about the role, mention one or two specific things from their background (from "strengths", in your own words), and ${bookingLink() ? `ask them to pick a time at ${SCHEDULING_LINK}` : "ask them to reply to this email with two or three times that suit them over the next week. Don't include any link, bracket or placeholder"}. The first conversation is 30 minutes with Arjun. If needs_relocation_question is true, ask plainly whether they are based in Mumbai or open to relocating, since the role is in-office in Mumbai.
- more_info: thank them for applying, say their CV was brief and you'd like to understand their experience better, and ask them to reply with more detail: the roles they've held with dates, what they personally did in each, and a result or two they're proud of. Don't say it's a rejection or an advance; no scheduling link.
- decline: thank them sincerely for applying, say you won't be moving forward for this role right now, be specific and kind about one strength if there is one, and wish them well. No feedback about weaknesses. Don't say "unfortunately" more than once.

Reply with only JSON: {"subject": "...", "body": "..."}`;

export function templateDraft(kind: Kind, f: Facts): Omit<Draft, "draftedBy"> {
  if (kind === "more_info") {
    return {
      subject: `Your application for ${f.role} at Kargo: a bit more detail?`,
      body: `Hi {first_name},\n\nThank you for applying for the ${f.role} role at Kargo. Your CV was quite brief, and I'd like to understand your experience properly before deciding on next steps.\n\nCould you reply with a little more detail: the roles you've held (with dates), what you personally did in each, and one or two results you're proud of?\n\nThanks,\nArjun\nFounder, Kargo`,
    };
  }
  if (kind === "invite") {
    return {
      subject: `Kargo · ${f.role}: let's talk`,
      body: `Hi {first_name},\n\nThank you for applying for the ${f.role} role at Kargo. Your background stood out and I'd like to talk.\n\n${bookingLink() ? `Could you pick a 30-minute slot here: ${SCHEDULING_LINK}` : REPLY_WITH_TIMES}${f.needs_relocation_question ? "\n\nThe role is in-office in Mumbai. Are you based in Mumbai, or open to relocating?" : ""}\n\nLooking forward to it,\nArjun\nFounder, Kargo`,
    };
  }
  return {
    subject: `Your application for ${f.role} at Kargo`,
    body: `Hi {first_name},\n\nThank you for applying for the ${f.role} role at Kargo and for the time you put into it. We won't be moving forward with your application for this role right now.\n\nI appreciate your interest in what we're building, and I wish you the very best with your search.\n\nArjun\nFounder, Kargo`,
  };
}

function valid(d: any): d is { subject: string; body: string } {
  if (!d || typeof d.subject !== "string" || typeof d.body !== "string") return false;
  const text = `${d.subject} ${d.body}`.toLowerCase();
  // Guardrails: nothing about the scoring may leak into a candidate email.
  if (/\b(score|band|rubric|signal|shortlist|borderline|threshold|pattern|screen(ing|er)?|ai|algorithm)\b/.test(text)) return false;
  // No stray placeholders: only the name, and the booking link when one is configured.
  const allowed = new Set(["{first_name}", ...(bookingLink() ? [SCHEDULING_LINK] : [])]);
  if (findPlaceholders(d.subject, d.body).some((p) => !allowed.has(p))) return false;
  return d.subject.trim().length > 0 && d.body.includes("{first_name}") && d.body.length < 1500;
}

export type Facts = { role: string; strengths: string[]; needs_relocation_question: boolean };

export async function draftEmail(kind: Kind, ev: Evidence, sc: Scored, rr: RoleResult): Promise<Draft> {
  return draftEmailFromFacts(kind, draftFacts(ev, sc, rr));
}

/** Drafts from non-identifying facts only. Used directly for jobs with a generated rubric. */
export async function draftEmailFromFacts(kind: Kind, facts: Facts): Promise<Draft> {
  const { data } = await callJson(system(), JSON.stringify({ kind, ...facts }), 30_000);
  if (valid(data)) return { subject: data.subject.trim(), body: data.body.trim(), draftedBy: "ai" };
  return { ...templateDraft(kind, facts), draftedBy: "template" };
}

/** Merges the placeholders in code, so the model never saw the name. */
export function merge(text: string, candidateName: string): string {
  const first = candidateName.trim().split(/\s+/)[0] || "there";
  const link = bookingLink();
  const out = text.split("{first_name}").join(first);
  // With a booking link the placeholder is filled in. Without one, drafts don't contain it in the first place.
  return link ? out.split(SCHEDULING_LINK).join(link) : out;
}
