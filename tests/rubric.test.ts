import { describe, expect, it } from "vitest";
import { genericGates, monthsFromRoles, normaliseGenericEvidence } from "../src/genericScreen";
import { normaliseRubric } from "../src/rubric";

const sig = (name: string, weight: number) => ({ name, weight, what: `looks for ${name}`, levels: { "0": "none", "1": "some", "2": "good", "3": "strong" }, probe: "?" });

describe("generated rubrics", () => {
  it("keeps 3–4 signals, keys them G1.., and forces weights to sum to exactly 100", () => {
    const r = normaliseRubric({ signals: [sig("A", 50), sig("B", 30), sig("C", 30)] }).rubric!;
    expect(r.signals.map((s) => s.key)).toEqual(["G1", "G2", "G3"]);
    expect(r.signals.reduce((a, s) => a + s.weight, 0)).toBe(100);
    expect(r.signals[0].weight).toBeGreaterThan(r.signals[1].weight);
  });
  it("rejects fewer than 3 signals or missing levels", () => {
    expect(normaliseRubric({ signals: [sig("A", 60), sig("B", 40)] }).rubric).toBeNull();
    expect(normaliseRubric({ signals: [sig("A", 40), sig("B", 30), { ...sig("C", 30), levels: { "0": "x" } }] }).rubric).toBeNull();
  });
  it("caps at 4 signals", () => {
    expect(normaliseRubric({ signals: [sig("A", 20), sig("B", 20), sig("C", 20), sig("D", 20), sig("E", 20)] }).rubric!.signals).toHaveLength(4);
  });
});

describe("deterministic tenure from dates", () => {
  const now = new Date("2026-09-01");
  it("counts months across roles and doesn't double-count overlaps", () => {
    expect(monthsFromRoles([{ start: "2020-01", end: "2020-12" }], now)).toBe(12);
    expect(monthsFromRoles([{ start: "2020-01", end: "2021-12" }, { start: "2021-01", end: "2022-06" }], now)).toBe(30);
    expect(monthsFromRoles([{ start: "2025-10", end: "present" }], now)).toBe(12);
  });
  it("ignores unparseable dates instead of guessing", () => {
    expect(monthsFromRoles([{ start: "", end: "present" }, { start: "sometime", end: "later" }], now)).toBe(0);
  });
});

describe("generic gates", () => {
  const ev = (location: string, relocation: boolean | null) => normaliseGenericEvidence({ candidate: { location, relocation_stated: relocation }, roles: [{ start: "2019-01", end: "present" }], evidence: {} }, []);
  it("Mumbai in Devanagari passes the location gate", () => {
    expect(genericGates(ev("मुंबई", null), { requireMumbai: true })[0].status).toBe("pass");
  });
  it("unknown location is a question, not a fail", () => {
    expect(genericGates(ev("", null), { requireMumbai: true })[0].status).toBe("ask");
  });
  it("minimum years uses the CV's dates", () => {
    expect(genericGates(ev("Mumbai", null), { minYears: 3 })[0].status).toBe("pass");
    expect(genericGates(ev("Mumbai", null), { minYears: 30 })[0].status).toBe("fail");
  });
});
