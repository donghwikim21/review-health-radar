import { buildReport } from "../src/metrics/ledger.js";
import type { ReviewHealthReport, WindowMetrics } from "../src/metrics/types.js";

const repo = { owner: "acme", name: "widgets" };
const window = { since: "2026-05-01T00:00:00Z", until: "2026-06-01T00:00:00Z" };

function wm(over: Partial<WindowMetrics> = {}): WindowMetrics {
  return {
    repo,
    window,
    prsCreated: 24,
    prsMerged: 20,
    prsOpen: 2,
    prsMergedReviewed: 19,
    commits: 60,
    linesChanged: 1500,
    reviewCoverage: 0.95,
    rubberStampRate: 0.05,
    medianTimeToFirstReviewHours: 5,
    reviewerTop1Share: 0.3,
    reviewerGini: 0.2,
    totalHumanReviews: 50,
    reviewedCohortCount: 22,
    ...over,
  };
}

/** Per-case assertions on the *system's* behaviour — deterministic, model-independent. */
export interface CaseExpectation {
  band?: ReviewHealthReport["band"];
  anomalyContains?: string;
  anomaliesEmpty?: boolean;
  minOverallConfidence?: number;
  maxOverallConfidence?: number;
}

export interface EvalCase {
  name: string;
  description: string;
  report: ReviewHealthReport;
  expect: CaseExpectation;
}

export const CASES: EvalCase[] = [
  {
    name: "coverage_collapse",
    description: "Review coverage falls from ~95% to 45% vs. a stable baseline — a strong, reliable anomaly.",
    report: buildReport(wm({ reviewCoverage: 0.45, prsMergedReviewed: 9 }), [
      wm({ reviewCoverage: 0.95 }),
      wm({ reviewCoverage: 0.94 }),
      wm({ reviewCoverage: 0.96 }),
    ]),
    expect: { band: "at-risk", anomalyContains: "review_coverage", minOverallConfidence: 0.5 },
  },
  {
    name: "healthy_steady",
    description: "All signals healthy and centred on a noisy baseline — nothing to over-claim.",
    report: buildReport(wm({ reviewCoverage: 0.93 }), [
      wm({ reviewCoverage: 0.9 }),
      wm({ reviewCoverage: 0.93 }),
      wm({ reviewCoverage: 0.96 }),
    ]),
    expect: { band: "healthy", anomaliesEmpty: true },
  },
  {
    name: "low_volume",
    description: "Only 2 merged PRs: a scary 0% coverage that is statistically meaningless — overall confidence must stay humble.",
    report: buildReport(
      wm({ prsCreated: 3, prsMerged: 2, prsMergedReviewed: 0, reviewCoverage: 0, totalHumanReviews: 1, reviewedCohortCount: 1, reviewerTop1Share: 1, reviewerGini: 0 }),
      [],
    ),
    expect: { maxOverallConfidence: 0.45 },
  },
];
