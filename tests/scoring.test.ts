import { describe, expect, it } from "vitest";
import { band, DEFAULT_WEIGHTS, forRole, gates, scoreSignals, total, WEIGHTS } from "../src/scoring";
import { ev } from "./helpers";

const CV = [
  "Prepared Bills of Lading and coordinated with CHA for 180+ shipments monthly",
  "Built a shipment tracker; adopted by the 12-person ops team in 2 weeks",
  "Built a PRD template adopted by the 4-person PM team",
  "Wrote a monitoring script for myself",
  "Sole PM for the platform",
  "Resolved a customs hold overnight before the vessel cut-off",
  "Killed 2 features after usage data showed low adoption",
  "Wrote a post-mortem on a lost deal that became standard practice",
  "Handled a production incident",
  "Integrated courier partner APIs",
].join("\n");

const opsRole = (over: any = {}) => ({ employer: "x", role_title: "Ops Exec", employer_type: "CHA", work_kind: "hands_on_operations", months: 30,
  hands_on_tasks: ["prepared Bills of Lading"], volume: "180+ shipments monthly", cv_quote: "Prepared Bills of Lading and coordinated with CHA for 180+ shipments monthly", ...over });

describe("S1 hands-on ops", () => {
  it("3 for 24+ months hands-on at an operator with volume", () => expect(scoreSignals(ev({ ops_roles: [opsRole()] }), CV).signals.S1.score).toBe(3));
  it("sums consecutive hands-on roles", () =>
    expect(scoreSignals(ev({ ops_roles: [opsRole({ months: 14 }), opsRole({ months: 12, volume: "" })] }), CV).signals.S1.score).toBe(3));
  it("2 for 6–23 months", () => expect(scoreSignals(ev({ ops_roles: [opsRole({ months: 12 })] }), CV).signals.S1.score).toBe(2));
  it("2 with low confidence for 24+ months but no volume", () => {
    const s = scoreSignals(ev({ ops_roles: [opsRole({ volume: "" })] }), CV);
    expect(s.signals.S1.score).toBe(2);
    expect(s.lowConfidence).toBe(true);
  });
  it("1 for software or integration work for logistics", () =>
    expect(scoreSignals(ev({ ops_roles: [opsRole({ employer_type: "software_vendor", work_kind: "software_or_sales_for_logistics", hands_on_tasks: [], cv_quote: "Integrated courier partner APIs" })] }), CV).signals.S1.score).toBe(1));
  it("a hands-on claim at a software vendor is not operator experience", () =>
    expect(scoreSignals(ev({ ops_roles: [opsRole({ employer_type: "software_vendor" })] }), CV).signals.S1.score).toBeLessThan(3));
  it("vocabulary with no doing-verb task scores no hands-on credit", () =>
    expect(scoreSignals(ev({ ops_roles: [opsRole({ hands_on_tasks: [] })] }), CV).signals.S1.score).toBeLessThan(2));
  it("0 with no logistics evidence", () => expect(scoreSignals(ev(), CV).signals.S1.score).toBe(0));
});

describe("hard rule 1: no quote, no credit", () => {
  it("an invented quote gets no credit and is flagged", () => {
    const s = scoreSignals(ev({ ops_roles: [opsRole({ cv_quote: "Ran the entire port of Mumbai for a decade" })] }), CV);
    expect(s.signals.S1.score).toBe(0);
    expect(s.flags[0].issue).toMatch(/not found/);
  });
  it("a sole-owner claim without a real quote gets no S3 credit", () => {
    const s = scoreSignals(ev({ ownership: { sole_owner: true, cv_quote: "I was the CEO", crisis: "", crisis_quote: "" } }), CV);
    expect(s.signals.S3.score).toBeLessThan(2);
    expect(s.flags.some((f) => f.field === "ownership.cv_quote")).toBe(true);
  });
});

describe("S2–S4 anchors", () => {
  const b = (users: string, adoption: string, cv_quote: string) => ({ trigger: "", built: "thing", users, adoption, cv_quote });
  it("S2: 3 for ops/customers with adoption, 2 own team, 1 no adoption", () => {
    expect(scoreSignals(ev({ unprompted_builds: [b("ops", "12 people in 2 weeks", "Built a shipment tracker; adopted by the 12-person ops team in 2 weeks")] }), CV).signals.S2.score).toBe(3);
    expect(scoreSignals(ev({ unprompted_builds: [b("own team", "4 PMs", "Built a PRD template adopted by the 4-person PM team")] }), CV).signals.S2.score).toBe(2);
    expect(scoreSignals(ev({ unprompted_builds: [b("self", "", "Wrote a monitoring script for myself")] }), CV).signals.S2.score).toBe(1);
    expect(scoreSignals(ev(), CV).signals.S2.score).toBe(0);
  });
  it("S3: 3 sole + crisis, 2 sole only, 1 layer above", () => {
    const own = { sole_owner: true, layer_above: "none", cv_quote: "Sole PM for the platform" };
    expect(scoreSignals(ev({ ownership: { ...own, crisis: "customs hold", crisis_quote: "Resolved a customs hold overnight before the vessel cut-off" } }), CV).signals.S3.score).toBe(3);
    expect(scoreSignals(ev({ ownership: { ...own, crisis: "", crisis_quote: "" } }), CV).signals.S3.score).toBe(2);
    expect(scoreSignals(ev({ ownership: { sole_owner: false, layer_above: "3 senior PMs", cv_quote: "", crisis: "", crisis_quote: "" } }), CV).signals.S3.score).toBe(1);
  });
  it("S4: 3 own kill, 2 lesson adopted, 1 incident, 0 wins only", () => {
    const k = (own_call: boolean, learning_adopted: boolean, cv_quote: string) => ({ what: "x", own_call, learning_adopted, cv_quote });
    expect(scoreSignals(ev({ kills_postmortems: [k(true, false, "Killed 2 features after usage data showed low adoption")] }), CV).signals.S4.score).toBe(3);
    expect(scoreSignals(ev({ kills_postmortems: [k(false, true, "Wrote a post-mortem on a lost deal that became standard practice")] }), CV).signals.S4.score).toBe(2);
    expect(scoreSignals(ev({ kills_postmortems: [k(false, false, "Handled a production incident")] }), CV).signals.S4.score).toBe(1);
    expect(scoreSignals(ev(), CV).signals.S4.score).toBe(0);
  });
});

describe("totals, weights, bands", () => {
  const sig = (a: number, b: number, c: number, d: number) => ({ S1: { score: a }, S2: { score: b }, S3: { score: c }, S4: { score: d } });
  it("total = sum(score/3 × weight), matching SPEC's worked examples", () => {
    expect(total(sig(3, 3, 3, 3), DEFAULT_WEIGHTS)).toBe(100);
    expect(total(sig(3, 3, 3, 1), DEFAULT_WEIGHTS)).toBe(93.3);
    expect(total(sig(3, 2, 3, 2), DEFAULT_WEIGHTS)).toBe(86.7);
    expect(total(sig(0, 2, 1, 0), DEFAULT_WEIGHTS)).toBe(26.7);
  });
  it("PM and Senior PM weights differ only on S3/S4", () => {
    expect(total(sig(3, 3, 0, 3), WEIGHTS.PM)).toBe(85);
    expect(total(sig(3, 3, 0, 3), WEIGHTS["Senior PM"])).toBe(80);
  });
  it("bands at 65 and 45", () => {
    expect(band(65)).toBe("Shortlist");
    expect(band(64.9)).toBe("Borderline");
    expect(band(45)).toBe("Borderline");
    expect(band(44.9)).toBe("Decline");
  });
});

describe("gates", () => {
  it("PM tenure counts adjacent roles at half weight, 1.5–5 years", () => {
    expect(gates(ev({ pm_years: 1, adjacent_years: 1 }), "PM", CV)[0].status).toBe("pass");
    expect(gates(ev({ pm_years: 1, adjacent_years: 0 }), "PM", CV)[0].status).toBe("fail");
    expect(gates(ev({ pm_years: 6 }), "PM", CV)[0].status).toBe("fail");
  });
  it("Senior PM needs 4–9 years and an owned integration area with a real quote", () => {
    const g = gates(ev({ pm_years: 6, integration_platform_ownership: true, integration_quote: "Sole PM for the platform" }), "Senior PM", CV);
    expect(g.map((x) => x.status)).toEqual(["pass", "pass", "pass"]);
    expect(gates(ev({ pm_years: 6, integration_platform_ownership: true, integration_quote: "made up" }), "Senior PM", CV)[1].status).toBe("fail");
  });
  it("location: Mumbai passes, relocation yes passes, no fails, unknown becomes a question", () => {
    const loc = (location: string, relocation_stated: boolean | null) => gates(ev({ candidate: { location, relocation_stated } }), "PM", CV).at(-1)!.status;
    expect(loc("Navi Mumbai", null)).toBe("pass");
    expect(loc("Bengaluru", true)).toBe("pass");
    expect(loc("Bengaluru", false)).toBe("fail");
    expect(loc("Bengaluru", null)).toBe("ask");
    expect(loc("", null)).toBe("ask");
  });
  it("a failed gate makes the recommendation Decline whatever the score", () => {
    const e = ev({ pm_years: 12, ops_roles: [opsRole()] });
    const r = forRole(scoreSignals(e, CV), e, "PM", CV);
    expect(r.gateFailed).toBe(true);
    expect(r.recommendation).toBe("Decline");
  });
});
