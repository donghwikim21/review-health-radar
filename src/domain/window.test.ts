import { describe, it, expect } from "vitest";
import { parseWindow, splitWindow, precedingWindows, windowLengthDays } from "./window.js";
import { AppError } from "../errors.js";

describe("parseWindow", () => {
  it("normalises dates and enforces since < until", () => {
    const w = parseWindow("2026-05-01", "2026-06-01");
    expect(w.since).toBe("2026-05-01T00:00:00.000Z");
    expect(windowLengthDays(w)).toBe(31);
    expect(() => parseWindow("nope", "2026-06-01")).toThrow(AppError);
    expect(() => parseWindow("2026-06-01", "2026-05-01")).toThrow(AppError);
  });
});

describe("splitWindow", () => {
  it("splits into contiguous, gapless equal buckets covering the whole range", () => {
    const w = { since: "2026-05-01T00:00:00.000Z", until: "2026-06-01T00:00:00.000Z" };
    const buckets = splitWindow(w, 4);
    expect(buckets).toHaveLength(4);
    expect(buckets[0]!.since).toBe(w.since);
    expect(buckets[3]!.until).toBe(w.until); // last bucket absorbs remainder
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i]!.since).toBe(buckets[i - 1]!.until); // no gaps/overlaps
    }
  });
});

describe("precedingWindows", () => {
  it("returns equal-length windows immediately before, most-recent first", () => {
    const w = { since: "2026-05-01T00:00:00.000Z", until: "2026-05-08T00:00:00.000Z" };
    const prev = precedingWindows(w, 2);
    expect(prev).toHaveLength(2);
    expect(prev[0]!.until).toBe(w.since);
    expect(prev[0]!.since).toBe("2026-04-24T00:00:00.000Z");
    expect(prev[1]!.until).toBe(prev[0]!.since);
  });
});
