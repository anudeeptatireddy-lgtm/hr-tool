// Vercel wrapper; the logic is shared with Netlify in src/handlers/audit.ts.
import handler from "../src/handlers/audit.js";

export default { fetch: handler };
