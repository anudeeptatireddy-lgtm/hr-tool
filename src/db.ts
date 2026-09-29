// Neon Postgres over HTTP (the serverless driver), using the pooled URL for app traffic.
import { neon } from "@neondatabase/serverless";
import type { Role } from "./scoring";

let _sql: ReturnType<typeof neon> | null = null;
function sql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}

export type Job = { status: "running" | "done" | "error"; error?: string | null; result?: unknown; name: string; role: Role | null };

export async function createJob(id: string, name: string, role: Role | null, file: Buffer): Promise<void> {
  // bytea goes in as base64 text and is decoded by Postgres.
  await sql()`insert into screenings (id, file_name, role, file_bytes) values (${id}, ${name}, ${role}, decode(${file.toString("base64")}, 'base64'))`;
}

export async function takeFile(id: string): Promise<{ name: string; role: Role | null; file: Buffer } | null> {
  const rows = (await sql()`select file_name, role, encode(file_bytes, 'base64') as b64 from screenings where id = ${id} and status = 'running' and file_bytes is not null`) as { file_name: string; role: Role | null; b64: string }[];
  if (!rows[0]) return null;
  return { name: rows[0].file_name, role: rows[0].role, file: Buffer.from(rows[0].b64, "base64") };
}

/** Saves the outcome and clears the stored file: CVs aren't kept after screening. */
export async function finishJob(id: string, status: "done" | "error", result: unknown, error: string): Promise<void> {
  await sql()`update screenings set status = ${status}, result = ${result === null ? null : JSON.stringify(result)}::jsonb, error = ${error || null}, file_bytes = null, finished_at = now() where id = ${id}`;
}

export async function getJob(id: string): Promise<Job | null> {
  const rows = (await sql()`select status, error, result, file_name, role from screenings where id = ${id}`) as { status: Job["status"]; error: string | null; result: unknown; file_name: string; role: Role | null }[];
  if (!rows[0]) return null;
  const r = rows[0];
  return { status: r.status, error: r.error, result: r.result, name: r.file_name, role: r.role };
}

// ---------- decisions and emails ----------

export type Decision = "advance" | "decline" | "hold";

export async function getScreening(id: string): Promise<any | null> {
  const rows = (await sql()`select result from screenings where id = ${id} and status = 'done'`) as { result: any }[];
  return rows[0]?.result ?? null;
}

export async function logDecision(screeningId: string, decision: Decision, role: string, score: number, band: string, rationale: string): Promise<{ id: string; created_at: string }> {
  const rows = (await sql()`insert into decisions (screening_id, decision, role, score, band, rationale)
    values (${screeningId}, ${decision}, ${role}, ${score}, ${band}, ${rationale}) returning id, created_at`) as { id: string; created_at: string }[];
  return rows[0];
}

export async function createDraft(screeningId: string, decisionId: string, kind: "invite" | "decline", candidateTo: string, subject: string, body: string, draftedBy: string): Promise<string> {
  const rows = (await sql()`insert into emails (screening_id, decision_id, kind, candidate_to, subject, body, drafted_by)
    values (${screeningId}, ${decisionId}, ${kind}, ${candidateTo || null}, ${subject}, ${body}, ${draftedBy}) returning id`) as { id: string }[];
  return rows[0].id;
}

export async function getEmail(id: string): Promise<{ id: string; candidate_to: string | null; status: string } | null> {
  const rows = (await sql()`select id, candidate_to, status from emails where id = ${id}`) as { id: string; candidate_to: string | null; status: string }[];
  return rows[0] ?? null;
}

/** Claims a draft for sending so a double click can't send it twice. */
export async function claimDraft(id: string, subject: string, body: string): Promise<boolean> {
  const rows = (await sql()`update emails set subject = ${subject}, body = ${body}, status = 'failed', error = 'sending'
    where id = ${id} and status = 'draft' returning id`) as { id: string }[];
  return rows.length === 1;
}

export async function markEmail(id: string, ok: boolean, sentTo: string, resendId: string, error: string): Promise<void> {
  await sql()`update emails set status = ${ok ? "sent" : "draft"}, sent_to = ${sentTo || null}, resend_id = ${resendId || null},
    error = ${error || null}, sent_at = ${ok ? new Date().toISOString() : null} where id = ${id}`;
}
