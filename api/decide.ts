// Vercel wrapper; the logic is shared with Netlify in src/handlers/decide.ts.
import handler from "../src/handlers/decide.js";

export default { fetch: handler };
