// Netlify background function (up to 15 minutes); the job itself is shared in src/handlers/runScreening.ts.
import { runScreening } from "../../src/handlers/runScreening.js";

export default async (req: Request) => {
  const { id } = (await req.json()) as { id: string };
  await runScreening(id);
};
