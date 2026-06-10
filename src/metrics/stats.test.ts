import { describe, it, expect } from "vitest";
import { mean, median, stddev, gini, zScore, round } from "./stats.js";

describe("stats", () => {
  it("mean/median handle empty and even/odd lengths", () => {
    expect(mean([])).toBe(0);
    expect(mean([2, 4, 6])).toBe(4);
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([3, 1, 2])).toBe(2); // odd
    expect(median([1, 2, 3, 4])).toBe(2.5); // even
  });

  it("stddev is population standard deviation", () => {
    expect(stddev([2, 2, 2])).toBe(0);
    expect(round(stddev([1, 2, 3]), 4)).toBe(0.8165);
  });

  it("gini is 0 for even load and rises with concentration", () => {
    expect(gini([])).toBe(0);
    expect(gini([5, 5, 5, 5])).toBe(0);
    expect(gini([1, 3])).toBeCloseTo(0.25, 5);
    expect(gini([0, 0, 10])).toBeGreaterThan(0.6); // one person carries everything
  });

  it("zScore returns null without enough baseline or variance", () => {
    expect(zScore(5, [])).toBeNull();
    expect(zScore(5, [3])).toBeNull();
    expect(zScore(5, [4, 4, 4])).toBeNull(); // zero variance
    expect(zScore(75, [95, 96, 94])).toBeLessThan(-2); // clear downward anomaly
  });
});
