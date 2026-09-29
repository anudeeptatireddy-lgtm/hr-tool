import { describe, expect, it } from "vitest";
import { REVIEW_SPREAD, spreadOf } from "../src/consensus.js";

describe("inconsistent scoring is flagged, not silently resolved", () => {
  it("runs within 10 points are fine", () => {
    expect(spreadOf([55, 55, 65])).toMatchObject({ spread: 10, needsHumanReview: false });
    expect(spreadOf([80, 80, 80]).needsHumanReview).toBe(false);
  });
  it("more than 10 points apart needs a human", () => {
    expect(spreadOf([35, 35, 20])).toMatchObject({ spread: 15, needsHumanReview: true, range: [20, 35] });
    expect(spreadOf([35, 35, 10]).needsHumanReview).toBe(true);
  });
  it("the threshold is 10 points", () => expect(REVIEW_SPREAD).toBe(10));
  it("a single run can't disagree with itself", () => expect(spreadOf([40]).needsHumanReview).toBe(false));
});
