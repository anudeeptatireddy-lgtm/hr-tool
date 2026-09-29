// Netlify wrapper; the logic is shared with Vercel in src/handlers/result.ts.
import type { Config } from "@netlify/functions";
export { default } from "../../src/handlers/result.js";

export const config: Config = { path: "/api/result" };
