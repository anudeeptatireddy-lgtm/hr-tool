// Netlify wrapper; the logic is shared with Vercel in src/handlers/decide.ts.
import type { Config } from "@netlify/functions";
export { default } from "../../src/handlers/decide.js";

export const config: Config = { path: "/api/decide" };
