// GET /api/result?id=... -> the job's status and, when done, the screening result.
import type { Config } from "@netlify/functions";
import { getJob } from "../../src/db";

export default async (req: Request) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(job, { headers: { "Cache-Control": "no-store" } });
};

export const config: Config = { path: "/api/result" };
