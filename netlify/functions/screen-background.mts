// Background job: runs the full pipeline on one stored CV and saves the result in Neon for the page to pick up.
import { finishJob, takeFile } from "../../src/db";
import { screen } from "../../src/screen";

export default async (req: Request) => {
  const { id } = (await req.json()) as { id: string };
  const job = await takeFile(id);
  if (!job) return;
  try {
    const result = await screen(job.name, job.file, job.role);
    const { redactedText, ...rest } = result; // the page doesn't need the CV text back
    await finishJob(id, result.ok ? "done" : "error", rest, result.error);
  } catch (e) {
    // Never log CV content; only the error type.
    console.error("screening failed:", e instanceof Error ? e.name : "unknown");
    await finishJob(id, "error", null, "Screening failed. Try again.");
  }
};
