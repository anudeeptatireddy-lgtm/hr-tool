import { normaliseEvidence, type Evidence } from "../src/extraction.js";
export const ev = (over: any = {}): Evidence => normaliseEvidence({ candidate: { location: "Mumbai" }, pm_years: 3, ...over });
