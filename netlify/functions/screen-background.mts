// Background job: runs the full pipeline on one stored CV for its job and saves the result in Neon.
import { finishJob, getJobRecord, setScreeningJob, takeFile } from "../../src/db";
import { screenForJob, type JobRow } from "../../src/screen";

export default async (req: Request) => {
  const { id } = (await req.json()) as { id: string };
  const job = await takeFile(id);
  if (!job) return;
  try {
    const ref = (await jobRefFor(id)) ?? (job.role === "Senior PM" ? "KRG-SPM-01" : "KRG-PM-01");
    const rec = await getJobRecord(ref);
    if (!rec) throw new Error("job missing");
    const row: JobRow = { ref: rec.ref, title: rec.title, kind: rec.kind, role: rec.kind === "pattern" ? job.role ?? null : null, gates: rec.gates, rubric: rec.rubric, rubric_version: rec.rubric_version, rubric_status: rec.rubric_status };
    const result = await screenForJob(job.name, job.file, row);
    const { redactedText, ...rest } = result;
    // A Kargo CV with no role picked is scored for the role it fits; record that job.
    const used = rest.kind === "generated" ? rec.ref : ((rest as any).roleUsed === "Senior PM" ? "KRG-SPM-01" : "KRG-PM-01");
    await setScreeningJob(id, used, rec.rubric_version);
    await finishJob(id, result.ok ? "done" : "error", rest, result.error);
  } catch (e) {
    // Never log CV content; only the error type.
    console.error("screening failed:", e instanceof Error ? e.name : "unknown");
    await finishJob(id, "error", null, "Screening failed. Try again.");
  }
};

import { neon } from "@neondatabase/serverless";
async function jobRefFor(id: string): Promise<string | null> {
  const rows = (await neon(process.env.DATABASE_URL!)`select job_ref from screenings where id = ${id}`) as { job_ref: string | null }[];
  return rows[0]?.job_ref ?? null;
}
