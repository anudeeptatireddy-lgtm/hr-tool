// Background job: runs the full pipeline on one stored CV and saves the result for the page to pick up.
import { getStore } from "@netlify/blobs";
import { screen } from "../../src/screen";
import type { Role } from "../../src/scoring";

export default async (req: Request) => {
  const { id } = (await req.json()) as { id: string };
  const store = getStore("hr-tool");
  const job = (await store.get(`jobs/${id}`, { type: "json" })) as { name: string; role: Role | null } | null;
  const file = await store.get(`files/${id}`, { type: "arrayBuffer" });
  if (!job || !file) return;
  try {
    const result = await screen(job.name, Buffer.from(file), job.role);
    const { redactedText, ...rest } = result; // the page doesn't need the CV text back
    await store.setJSON(`jobs/${id}`, { status: result.ok ? "done" : "error", error: result.error, result: rest, finishedAt: new Date().toISOString() });
  } catch (e) {
    // Never log CV content; only the error type.
    console.error("screening failed:", e instanceof Error ? e.name : "unknown");
    await store.setJSON(`jobs/${id}`, { status: "error", error: "Screening failed. Try again." });
  } finally {
    await store.delete(`files/${id}`);
  }
};
