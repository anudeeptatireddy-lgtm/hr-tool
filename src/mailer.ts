// Sends one email via Resend. Only ever called from the founder's Send click (hard rule 3).
import { DEMO_MODE } from "./config";

export type SendResult = { ok: boolean; id: string; sentTo: string; error: string };

/** Hard rule 4: in demo mode every email goes to DEMO_RECIPIENT, never to the address on the CV. */
export function recipientFor(candidateEmail: string): { to: string; error: string } {
  if (DEMO_MODE()) {
    const demo = (process.env.DEMO_RECIPIENT || "").trim();
    if (!demo || demo.endsWith("@example.com")) return { to: "", error: "DEMO_RECIPIENT isn't set, so nothing can be sent in demo mode." };
    return { to: demo, error: "" };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(candidateEmail)) return { to: "", error: "No valid candidate email on the CV." };
  return { to: candidateEmail, error: "" };
}

export async function sendEmail(candidateEmail: string, subject: string, body: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY || "";
  if (!key) return { ok: false, id: "", sentTo: "", error: "RESEND_API_KEY isn't set." };
  const { to, error } = recipientFor(candidateEmail);
  if (!to) return { ok: false, id: "", sentTo: "", error };
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `Arjun at Kargo <${from}>`, to: [to], subject: DEMO_MODE() ? `[Demo] ${subject}` : subject, text: body }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return { ok: false, id: "", sentTo: to, error: `Resend ${res.status}: ${data.message ?? "error"}` };
  return { ok: true, id: data.id ?? "", sentTo: to, error: "" };
}
