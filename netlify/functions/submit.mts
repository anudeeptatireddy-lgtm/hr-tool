// POST /api/submit {name, data (base64), role} -> {id}. Stores the CV in Neon and starts the background screening.
import type { Config } from "@netlify/functions";
import { createJob, finishJob } from "../../src/db";

const OK_EXT = new Set(["pdf", "docx", "doc", "txt"]);
const MAX_BYTES = 4 * 1024 * 1024;

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  let body: { name?: string; data?: string; role?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const name = String(body.name || "").slice(0, 200);
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (!OK_EXT.has(ext)) return Response.json({ error: "Upload a .pdf, .docx, .doc or .txt file." }, { status: 400 });
  const buf = Buffer.from(String(body.data || ""), "base64");
  if (!buf.length || buf.length > MAX_BYTES) return Response.json({ error: "File is empty or over 4 MB." }, { status: 400 });
  const role = body.role === "PM" || body.role === "Senior PM" ? body.role : null;

  const id = crypto.randomUUID();
  await createJob(id, name, role, buf);
  // Background functions answer 202 straight away and keep running (up to 15 minutes).
  const res = await fetch(new URL("/.netlify/functions/screen-background", req.url), { method: "POST", body: JSON.stringify({ id }) });
  if (res.status !== 202) {
    await finishJob(id, "error", null, `Couldn't start screening (${res.status}).`);
    return Response.json({ error: "Couldn't start screening." }, { status: 502 });
  }
  return Response.json({ id });
};

export const config: Config = { path: "/api/submit" };
