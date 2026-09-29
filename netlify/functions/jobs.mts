// Netlify wrapper; the logic is shared with Vercel in src/handlers/jobs.ts.
import type { Config } from "@netlify/functions";
export { default } from "../../src/handlers/jobs.js";

export const config: Config = { path: "/api/jobs" };
