// Netlify wrapper; the logic is shared with Vercel in src/handlers/dashboard.ts.
import type { Config } from "@netlify/functions";
export { default } from "../../src/handlers/dashboard.js";

export const config: Config = { path: "/api/dashboard" };
