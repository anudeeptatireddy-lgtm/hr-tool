// Settings come from the environment (.env locally, Netlify env vars in production).
export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-3.6-flash";
export const GEMINI_API_KEY = () => process.env.GEMINI_API_KEY || "";
// Safe default: anything but an explicit "false" is demo mode (never email real addresses).
export const DEMO_MODE = () => (process.env.DEMO_MODE ?? "true").trim().toLowerCase() !== "false";
