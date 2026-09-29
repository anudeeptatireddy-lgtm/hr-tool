// GET /api/audit -> every decision and every email, newest first (hard rule 8: the log is part of the product).
import type { Config } from "@netlify/functions";
import { auditLog } from "../../src/db";

export default async () => Response.json(await auditLog(), { headers: { "Cache-Control": "no-store" } });

export const config: Config = { path: "/api/audit" };
