// Netlify wrapper: screening runs in the screen-background function.
import type { Config } from "@netlify/functions";
import { makeSubmit } from "../../src/handlers/submit.js";

export default makeSubmit(async (id, req) => {
  // Background functions answer 202 straight away and keep running (up to 15 minutes).
  const res = await fetch(new URL("/.netlify/functions/screen-background", req.url), { method: "POST", body: JSON.stringify({ id }) });
  return res.status === 202;
});

export const config: Config = { path: "/api/submit" };
