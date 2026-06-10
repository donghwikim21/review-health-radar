import { describe, it, expect } from "vitest";
import { buildReport } from "./ledger.js";
import type { WindowMetrics } from "./types.js";

const repo = { owner: "acme", name: "widgets" };
const window = { since: "2026-05-01T00:00:00Z", until: "2026-06-01T00:00:00Z" };

function metrics(overrides: Partial<WindowMetrics> = {}): WindowMetrics {
  return {
    repo,
    window,
    prsCreated: 20,
    prsMerged: 16,
    prsOpen: 2,
    prsMergedReviewed: 15,
    commits: 50,
    linesChanged: 1200,
    reviewCoverage: 0.95,
    rubberStampRate: 0.05,
    medianTimeToFirstReviewHours: 4,
    medianTimeToMergeHours: 24,
    reviewerTop1Share: 0.3,
    reviewerGini: 0.2,
    totalHumanReviews: 40,
    reviewedCohortCount: 18,
    ...overrides,
  };
}

describe("buildReport", () => {
  it("classifies a healthy window and emits a full ledger", () => {
    const report = buildReport(metrics(), []);
    expect(report.band).toBe("healthy");
    expect(report.facts.map((f) => f.id)).toContain("review_coverage");
    expect(report.facts.every((f) => typeof f.value === "number")).toBe(true);
    // no baseline => no trends => no anomalies
    expect(report.anomalies).toEqual([]);
    expect(report.facts.find((f) => f.id === "review_coverage")?.trend).toBeNull();
  });

  it("escalates to at-risk on a high rubber-stamp rate and explains why", () => {
    const report = buildReport(metrics({ reviewCoverage: 0.75, rubberStampRate: 0.34 }), []);
    expect(report.band).toBe("at-risk");
    expect(report.bandReasons.some((r) => /rubber/i.test(r))).toBe(true);
  });

  it("marks low-sample facts unreliable and excludes them from the band", () => {
    // Only 2 merged PRs => coverage unreliable (minSample 3); a scary-looking 0%
    // coverage must NOT drive the band when n is too small.
    const report = buildReport(
      metrics({ prsMerged: 2, prsMergedReviewed: 0, reviewCoverage: 0, totalHumanReviews: 1 }),
      [],
    );
    const coverage = report.facts.find((f) => f.id === "review_coverage");
    expect(coverage?.reliable).toBe(false);
    expect(report.bandReasons.join(" ")).not.toMatch(/Only 0/);
  });

  it("flags a statistical anomaly against baseline windows", () => {
    const baselines = [
      metrics({ reviewCoverage: 0.95 }),
      metrics({ reviewCoverage: 0.96 }),
      metrics({ reviewCoverage: 0.94 }),
    ];
    const report = buildReport(metrics({ reviewCoverage: 0.75 }), baselines);
    expect(report.anomalies).toContain("review_coverage");
    const coverage = report.facts.find((f) => f.id === "review_coverage");
    expect(coverage?.trend?.direction).toBe("down");
    expect(coverage?.trend?.zScore).toBeLessThan(-2);
  });
});
