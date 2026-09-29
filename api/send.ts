// Vercel wrapper; the logic is shared with Netlify in src/handlers/send.ts.
import handler from "../src/handlers/send.js";

export default { fetch: handler };
