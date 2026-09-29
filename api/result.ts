// Vercel wrapper; the logic is shared with Netlify in src/handlers/result.ts.
import handler from "../src/handlers/result.js";

export default { fetch: handler };
