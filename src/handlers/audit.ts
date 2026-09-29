// GET /api/audit -> every decision and every email, newest first (hard rule 8: the log is part of the product).
import { auditLog } from "../db.js";

export default async () => Response.json(await auditLog(), { headers: { "Cache-Control": "no-store" } });
