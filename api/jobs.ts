// Vercel wrapper; the logic is shared with Netlify in src/handlers/jobs.ts.
import handler from "../src/handlers/jobs.js";

export default { fetch: handler };
