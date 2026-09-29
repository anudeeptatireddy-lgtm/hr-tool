// POST /api/decide {id, decision, role?} -> logs Arjun's decision; for Advance/Decline returns an email draft.
// Drafting never sends anything: sending is a separate click on /api/send.
import type { Config } from "@netlify/functions";
import { createDraft, getScreening, logDecision, type Decision } from "../../src/db";
import { draftEmail, draftEmailFromFacts, merge, type Kind } from "../../src/emailDraft";
import { patternSummary } from "../../src/screen";
import { recipientFor } from "../../src/mailer";
import { SHORTLIST_AT, type Role } from "../../src/scoring";

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const { id, decision, role, confirmBelowThreshold } = (await req.json().catch(() => ({}))) as { id?: string; decision?: Decision; role?: Role; confirmBelowThreshold?: boolean };
  if (!id || !/^[0-9a-f-]{36}$/.test(id) || !["advance", "decline", "hold", "more_info"].includes(decision as string)) return Response.json({ error: "Bad request" }, { status: 400 });
  const r = await getScreening(id);
  if (!r) return Response.json({ error: "Screening not found" }, { status: 404 });
  const isPattern = !!r.roles;
  const useRole: Role = role === "PM" || role === "Senior PM" ? role : r.roleUsed;
  const rr = isPattern ? r.roles[useRole] : null;
  const sum = r.summary ?? patternSummary(r, { ref: useRole === "Senior PM" ? "KRG-SPM-01" : "KRG-PM-01", title: useRole === "Senior PM" ? "Senior Product Manager" : "Product Manager" });
  const score = isPattern ? rr.total : sum.match;
  // Advancing someone below the pass threshold needs an explicit "Advance anyway" (checked here, not only in the page).
  const below = decision === "advance" && score < SHORTLIST_AT;
  if (below && confirmBelowThreshold !== true) {
    return Response.json({ needsConfirmation: true, match: score, threshold: SHORTLIST_AT,
      error: `This candidate scored ${Math.round(score)}%, below your ${SHORTLIST_AT}% threshold.` }, { status: 409 });
  }
  // Rationale = the card's reasons, so the log says why, not just what (hard rule 8).
  const rationale = [...(below ? [`Advanced below the ${SHORTLIST_AT}% threshold after confirmation`] : []), ...r.card.why.map((w: any) => w.line), `Risk: ${r.card.risk}`].join(" | ");
  const logged = await logDecision(id, decision!, isPattern ? useRole : sum.jobTitle, score, isPattern ? rr.recommendation : sum.recommendation, rationale);
  if (decision === "hold") return Response.json({ decisionId: logged.id, loggedAt: logged.created_at });

  const kind: Kind = decision === "advance" ? "invite" : decision === "more_info" ? "more_info" : "decline";
  const d = isPattern ? await draftEmail(kind, r.evidence, r.scored, rr)
    : await draftEmailFromFacts(kind, { role: sum.jobTitle, strengths: sum.strengths, needs_relocation_question: sum.askRelocation });
  const subject = merge(d.subject, r.candidate.name), body = merge(d.body, r.candidate.name);
  const emailId = await createDraft(id, logged.id, kind, r.candidate.email, subject, body, d.draftedBy);
  const { to, error } = recipientFor(r.candidate.email);
  return Response.json({ decisionId: logged.id, loggedAt: logged.created_at, email: { id: emailId, kind, subject, body, draftedBy: d.draftedBy, willSendTo: to, demo: (process.env.DEMO_MODE ?? "true") !== "false", sendBlocked: error } });
};

export const config: Config = { path: "/api/decide" };
