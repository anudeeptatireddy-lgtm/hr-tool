// POST /api/send {emailId, subject, body} -> sends the approved (and possibly edited) draft via Resend.
// This is the only place an email leaves the system, and it only runs on the founder's Send click.
import type { Config } from "@netlify/functions";
import { claimDraft, getEmail, markEmail } from "../../src/db";
import { sendEmail } from "../../src/mailer";

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const { emailId, subject, body } = (await req.json().catch(() => ({}))) as { emailId?: string; subject?: string; body?: string };
  if (!emailId || !/^[0-9a-f-]{36}$/.test(emailId) || !subject?.trim() || !body?.trim()) return Response.json({ error: "Subject and body are required." }, { status: 400 });
  const e = await getEmail(emailId);
  if (!e) return Response.json({ error: "Draft not found" }, { status: 404 });
  if (e.status === "sent") return Response.json({ error: "Already sent." }, { status: 409 });
  if (!(await claimDraft(emailId, subject.slice(0, 300), body.slice(0, 5000)))) return Response.json({ error: "This draft is already being sent." }, { status: 409 });
  const r = await sendEmail(e.candidate_to ?? "", subject, body);
  await markEmail(emailId, r.ok, r.sentTo, r.id, r.error);
  if (!r.ok) return Response.json({ error: r.error }, { status: 502 });
  return Response.json({ sent: true, to: r.sentTo, resendId: r.id });
};

export const config: Config = { path: "/api/send" };
