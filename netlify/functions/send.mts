// Netlify wrapper; the logic is shared with Vercel in src/handlers/send.ts.
import type { Config } from "@netlify/functions";
export { default } from "../../src/handlers/send.js";

export const config: Config = { path: "/api/send" };
