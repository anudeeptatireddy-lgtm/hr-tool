// POST /api/submit {name, data (base64), role} -> {id}. Stores the CV in Neon and starts the background screening.
import { countRunning, createJob, finishJob, getJobRecord, setScreeningJob } from "../db.js";

// Each screening is PDF parsing plus 3 AI calls; past this many at once the server slows for everyone.
const MAX_RUNNING = 6;

const OK_EXT = new Set(["pdf", "docx", "doc", "txt"]);
const MAX_BYTES = 4 * 1024 * 1024;

/** Starts screening one stored CV after the response; resolves true if it was started. */
export type StartScreening = (id: string, req: Request) => Promise<boolean>;

export const makeSubmit = (startScreening: StartScreening) => async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  let body: { name?: string; data?: string; role?: string; jobRef?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Send JSON." }, { status: 400 }); }
  const name = String(body.name || "").slice(0, 200);
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (!OK_EXT.has(ext)) return Response.json({ error: "Upload a .pdf, .docx, .doc or .txt file." }, { status: 400 });
  const buf = Buffer.from(String(body.data || ""), "base64");
  if (!buf.length || buf.length > MAX_BYTES) return Response.json({ error: "File is empty or over 4 MB." }, { status: 400 });
  // A job, or (older clients) a Kargo role; "detect" leaves the Kargo role to be read from the CV.
  const job = body.jobRef ? await getJobRecord(String(body.jobRef)) : null;
  if (body.jobRef && !job) return Response.json({ error: "Unknown job." }, { status: 400 });
  if (job?.kind === "generated" && job.rubric_status !== "approved") return Response.json({ error: "Approve this job's rubric before screening CVs for it." }, { status: 400 });
  const role = job?.kind === "pattern" ? job.role : body.role === "PM" || body.role === "Senior PM" ? body.role : null;

  if ((await countRunning()) >= MAX_RUNNING) {
    return Response.json({ error: "Busy screening other CVs. Retrying shortly." }, { status: 429, headers: { "Retry-After": "5" } });
  }
  const id = crypto.randomUUID();
  await createJob(id, name, role, buf);
  if (job) await setScreeningJob(id, job.ref, job.rubric_version);
  if (!(await startScreening(id, req))) {
    await finishJob(id, "error", null, "Couldn't start screening.");
    return Response.json({ error: "Couldn't start screening." }, { status: 502 });
  }
  return Response.json({ id });
};
