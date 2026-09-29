// POST /api/jobs {action, ...}: create a job (and generate its rubric), regenerate, save edits, approve.
// Only 'generated' jobs can be changed; the two Kargo roles keep the back-tested rubric.
import type { Config } from "@netlify/functions";
import { approveRubric, createGeneratedJob, getJobRecord, saveRubric } from "../../src/db";
import { generateRubric, normaliseRubric } from "../../src/rubric";

const gateNotesFor = (g: { minYears?: number; requireMumbai?: boolean }) =>
  [g.minYears ? `At least ${g.minYears} yrs experience` : "", g.requireMumbai ? "Mumbai or willing to relocate" : ""].filter(Boolean);

export default async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST only" }, { status: 405 });
  const b = (await req.json().catch(() => ({}))) as any;

  if (b.action === "create") {
    const title = String(b.title || "").trim().slice(0, 120), requirement = String(b.requirement || "").trim().slice(0, 4000);
    if (!title || requirement.length < 20) return Response.json({ error: "Add a title and a few lines on what the job is looking for." }, { status: 400 });
    const gates = { minYears: Math.max(0, Math.min(30, Number(b.minYears) || 0)), requireMumbai: !!b.requireMumbai };
    const ref = `JOB-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const { rubric, error } = await generateRubric({ title, requirement, gateNotes: gateNotesFor(gates) });
    await createGeneratedJob({ ref, title, location: String(b.location || "").slice(0, 120), requirement, gates, gateNotes: gateNotesFor(gates), rubric });
    return Response.json({ ref, rubric, error });
  }

  const job = b.ref ? await getJobRecord(String(b.ref)) : null;
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.kind !== "generated") return Response.json({ error: "The Kargo roles use the back-tested past-hire rubric, which can't be edited here." }, { status: 400 });

  if (b.action === "regenerate") {
    const { rubric, error } = await generateRubric({ title: job.title, requirement: job.requirement, gateNotes: job.gate_notes });
    if (!rubric) return Response.json({ error }, { status: 502 });
    return Response.json({ rubric, version: await saveRubric(job.ref, rubric) });
  }
  if (b.action === "save") {
    const { rubric, error } = normaliseRubric(b.rubric);
    if (!rubric) return Response.json({ error }, { status: 400 });
    return Response.json({ rubric, version: await saveRubric(job.ref, rubric) });
  }
  if (b.action === "approve") {
    return (await approveRubric(job.ref)) ? Response.json({ approved: true }) : Response.json({ error: "Generate a rubric first." }, { status: 400 });
  }
  return Response.json({ error: "Unknown action" }, { status: 400 });
};

export const config: Config = { path: "/api/jobs" };
