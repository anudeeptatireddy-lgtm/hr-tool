// Vercel wrapper: screening continues after the response with waitUntil (same function, up to maxDuration).
import { waitUntil } from "@vercel/functions";
import { makeSubmit } from "../src/handlers/submit.js";
import { runScreening } from "../src/handlers/runScreening.js";

const handler = makeSubmit(async (id) => {
  waitUntil(runScreening(id));
  return true;
});

export default { fetch: handler };
