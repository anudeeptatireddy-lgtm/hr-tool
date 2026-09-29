// Netlify wrapper; the logic is shared with Vercel in src/handlers/audit.ts.
import type { Config } from "@netlify/functions";
export { default } from "../../src/handlers/audit.js";

export const config: Config = { path: "/api/audit" };
