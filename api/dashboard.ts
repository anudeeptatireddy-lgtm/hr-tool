// Vercel wrapper; the logic is shared with Netlify in src/handlers/dashboard.ts.
import handler from "../src/handlers/dashboard.js";

export default { fetch: handler };
