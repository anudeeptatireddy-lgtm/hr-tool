// AI call 2 (Components Map): drafts the invite or decline email from the scored record, never the raw CV.
// The model gets no name, email, employer or college: placeholders are merged in code afterwards.
import { callJson } from "./gemini";
import type { Evidence } from "./extraction";
import type { RoleResult, Scored } from "./scoring";

export type Kind = "invite" | "decline";
export type Draft = { subject: string; body: string; draftedBy: "ai" | "template" };

export const SCHEDULING_LINK = "[SCHEDULING LINK]";

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

const SYSTEM = `You write short, warm, plain-English emails from Arjun Mehta, founder of Kargo (a Series A logistics software company in Mumbai), to a job applicant. Kargo has no HR team; Arjun writes to candidates himself.

Rules:
- Address the candidate as {first_name} and sign off as "Arjun". Never invent a name.
- Never mention scores, bands, rubrics, signals, "pattern", AI, screening tools or other candidates.
- Never promise an offer, salary or a hiring decision.
- Keep it under 150 words. No emoji, no exclamation marks in the subject.
- invite: thank them, say you'd like to talk about the role, mention one or two specific things from their background (from "strengths", in your own words), and ask them to pick a time at ${SCHEDULING_LINK}. The first conversation is 30 minutes with Arjun. If needs_relocation_question is true, ask plainly whether they are based in Mumbai or open to relocating, since the role is in-office in Mumbai.
- decline: thank them sincerely for applying, say you won't be moving forward for this role right now, be specific and kind about one strength if there is one, and wish them well. No feedback about weaknesses. Don't say "unfortunately" more than once.

Reply with only JSON: {"subject": "...", "body": "..."}`;

export function templateDraft(kind: Kind, f: Facts): Omit<Draft, "draftedBy"> {
  if (kind === "invite") {
    return {
      subject: `Kargo · ${f.role}: let's talk`,
      body: `Hi {first_name},\n\nThank you for applying for the ${f.role} role at Kargo. Your background stood out and I'd like to talk.\n\nCould you pick a 30-minute slot here: ${SCHEDULING_LINK}${f.needs_relocation_question ? "\n\nThe role is in-office in Mumbai. Are you based in Mumbai, or open to relocating?" : ""}\n\nLooking forward to it,\nArjun\nFounder, Kargo`,
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
  return d.subject.trim().length > 0 && d.body.includes("{first_name}") && d.body.length < 1500;
}

export type Facts = { role: string; strengths: string[]; needs_relocation_question: boolean };

export async function draftEmail(kind: Kind, ev: Evidence, sc: Scored, rr: RoleResult): Promise<Draft> {
  return draftEmailFromFacts(kind, draftFacts(ev, sc, rr));
}

/** Drafts from non-identifying facts only. Used directly for jobs with a generated rubric. */
export async function draftEmailFromFacts(kind: Kind, facts: Facts): Promise<Draft> {
  const { data } = await callJson(SYSTEM, JSON.stringify({ kind, ...facts }), 30_000);
  if (valid(data)) return { subject: data.subject.trim(), body: data.body.trim(), draftedBy: "ai" };
  return { ...templateDraft(kind, facts), draftedBy: "template" };
}

/** Merges the placeholders in code, so the model never saw the name. */
export function merge(text: string, candidateName: string): string {
  const first = candidateName.trim().split(/\s+/)[0] || "there";
  return text.split("{first_name}").join(first);
}
