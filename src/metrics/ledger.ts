import { round, zScore, mean } from "./stats.js";
import type {
  Fact,
  FactTrend,
  FactUnit,
  HealthBand,
  ReviewHealthReport,
  WindowMetrics,
} from "./types.js";

/** |z| at or above this flags a fact as a statistical anomaly vs. baseline. */
export const ANOMALY_Z = 2;
const FLAT_EPSILON = 1e-6;

interface MetricSpec {
  id: string;
  label: string;
  unit: FactUnit;
  value: (m: WindowMetrics) => number;
  sampleSize: (m: WindowMetrics) => number;
  /** Below this n the value is shown but marked unreliable (not reasoned over). */
  minSample: number;
  /** Some metrics are undefined (not just low-n) for the window, e.g. a null median. */
  defined?: (m: WindowMetrics) => boolean;
  display: (value: number) => string;
}

const pct = (v: number): string => `${round(v, 1)}%`;
const hrs = (v: number): string => `${round(v, 1)}h`;
const num = (v: number): string => `${Math.round(v)}`;

/**
 * The metric ledger definition. Health components come first, then context
 * counts. Order here is the order facts appear in the API response and prompt.
 */
const SPECS: MetricSpec[] = [
  {
    id: "review_coverage",
    label: "Review coverage (% of merged PRs with ≥1 human review)",
    unit: "percent",
    value: (m) => m.reviewCoverage * 100,
    sampleSize: (m) => m.prsMerged,
    minSample: 3,
    display: pct,
  },
  {
    id: "rubber_stamp_rate",
    label: "Rubber-stamp rate (reviewed-and-merged PRs approved instantly with no comments)",
    unit: "percent",
    value: (m) => m.rubberStampRate * 100,
    sampleSize: (m) => m.prsMergedReviewed,
    minSample: 3,
    display: pct,
  },
  {
    id: "time_to_first_review_median",
    label: "Median time to first review",
    unit: "hours",
    value: (m) => m.medianTimeToFirstReviewHours ?? 0,
    sampleSize: (m) => m.reviewedCohortCount,
    minSample: 3,
    defined: (m) => m.medianTimeToFirstReviewHours !== null,
    display: hrs,
  },
  {
    id: "reviewer_top1_share",
    label: "Top reviewer's share of all reviews",
    unit: "percent",
    value: (m) => m.reviewerTop1Share * 100,
    sampleSize: (m) => m.totalHumanReviews,
    minSample: 5,
    display: pct,
  },
  {
    id: "reviewer_load_gini",
    label: "Reviewer load imbalance (Gini; 0 even, →1 concentrated)",
    unit: "ratio",
    value: (m) => m.reviewerGini,
    sampleSize: (m) => m.totalHumanReviews,
    minSample: 5,
    display: (v) => `${round(v, 2)}`,
  },
  // --- context facts (always reliable; provide denominators for the narrative) ---
  { id: "prs_created", label: "Pull requests created in window", unit: "count", value: (m) => m.prsCreated, sampleSize: (m) => m.prsCreated, minSample: 0, display: num },
  { id: "prs_merged", label: "Pull requests merged in window", unit: "count", value: (m) => m.prsMerged, sampleSize: (m) => m.prsMerged, minSample: 0, display: num },
  { id: "commits_total", label: "Commits on default branch in window", unit: "count", value: (m) => m.commits, sampleSize: (m) => m.commits, minSample: 0, display: num },
  { id: "lines_changed_total", label: "Lines changed (additions + deletions)", unit: "count", value: (m) => m.linesChanged, sampleSize: (m) => m.linesChanged, minSample: 0, display: num },
];

function buildTrend(spec: MetricSpec, current: number, baselines: WindowMetrics[]): FactTrend | null {
  if (baselines.length === 0) return null;
  const baselineValues = baselines.map(spec.value);
  const baselineMean = mean(baselineValues);
  const delta = current - baselineMean;
  const direction = Math.abs(delta) < FLAT_EPSILON ? "flat" : delta > 0 ? "up" : "down";
  return {
    baselineValue: round(baselineMean, 2),
    deltaAbsolute: round(delta, 2),
    zScore: zScore(current, baselineValues),
    direction,
  };
}

function buildFact(spec: MetricSpec, current: WindowMetrics, baselines: WindowMetrics[]): Fact {
  const value = spec.value(current);
  const sampleSize = spec.sampleSize(current);
  const defined = spec.defined ? spec.defined(current) : true;
  const reliable = defined && sampleSize >= spec.minSample;
  return {
    id: spec.id,
    label: spec.label,
    value: round(value, 2),
    unit: spec.unit,
    display: defined ? spec.display(value) : "n/a",
    sampleSize,
    reliable,
    window: current.window,
    trend: buildTrend(spec, value, baselines),
  };
}

const SEVERITY: Record<HealthBand, number> = { healthy: 0, watch: 1, "at-risk": 2 };

function classifyBand(
  m: WindowMetrics,
  reliable: Record<string, boolean>,
): { band: HealthBand; reasons: string[] } {
  const reasons: string[] = [];
  let band: HealthBand = "healthy";
  const escalate = (to: HealthBand, reason: string) => {
    reasons.push(reason);
    if (SEVERITY[to] > SEVERITY[band]) band = to;
  };

  if (reliable.review_coverage) {
    if (m.reviewCoverage < 0.6) escalate("at-risk", `Only ${round(m.reviewCoverage * 100, 1)}% of merged PRs were reviewed (<60%).`);
    else if (m.reviewCoverage < 0.8) escalate("watch", `Review coverage is ${round(m.reviewCoverage * 100, 1)}% (<80%).`);
  }
  if (reliable.rubber_stamp_rate) {
    if (m.rubberStampRate > 0.3) escalate("at-risk", `${round(m.rubberStampRate * 100, 1)}% of reviewed merges look like rubber stamps (>30%).`);
    else if (m.rubberStampRate > 0.15) escalate("watch", `Rubber-stamp rate is ${round(m.rubberStampRate * 100, 1)}% (>15%).`);
  }
  if (reliable.time_to_first_review_median && m.medianTimeToFirstReviewHours !== null) {
    if (m.medianTimeToFirstReviewHours > 72) escalate("at-risk", `Median time to first review is ${round(m.medianTimeToFirstReviewHours, 1)}h (>72h).`);
    else if (m.medianTimeToFirstReviewHours > 24) escalate("watch", `Median time to first review is ${round(m.medianTimeToFirstReviewHours, 1)}h (>24h).`);
  }
  if (reliable.reviewer_top1_share) {
    if (m.reviewerTop1Share > 0.7) escalate("at-risk", `One reviewer handled ${round(m.reviewerTop1Share * 100, 1)}% of all reviews (>70%) — bus-factor risk.`);
    else if (m.reviewerTop1Share > 0.5) escalate("watch", `Top reviewer handled ${round(m.reviewerTop1Share * 100, 1)}% of reviews (>50%).`);
  }

  const anyReliable = Object.values(reliable).some(Boolean);
  if (!anyReliable) {
    return { band: "watch", reasons: ["Insufficient PR/review volume in this window to assess review health confidently."] };
  }
  if (reasons.length === 0) reasons.push("All measured review-health signals are within healthy thresholds.");
  return { band, reasons };
}

/**
 * Assembles the full report: the fact ledger (with trends vs. baseline windows),
 * the statistical anomaly flags, and a transparently-derived health band.
 */
export function buildReport(current: WindowMetrics, baselines: WindowMetrics[]): ReviewHealthReport {
  const facts = SPECS.map((spec) => buildFact(spec, current, baselines));
  const reliable = Object.fromEntries(facts.map((f) => [f.id, f.reliable]));
  const anomalies = facts
    .filter((f) => f.reliable && f.trend?.zScore !== null && f.trend !== null && Math.abs(f.trend.zScore!) >= ANOMALY_Z)
    .map((f) => f.id);
  const { band, reasons } = classifyBand(current, reliable);

  return {
    repo: current.repo,
    window: current.window,
    band,
    bandReasons: reasons,
    anomalies,
    facts,
    population: {
      prsCreated: current.prsCreated,
      prsMerged: current.prsMerged,
      prsOpen: current.prsOpen,
      commits: current.commits,
      linesChanged: current.linesChanged,
    },
    baselineWindows: baselines.length,
    generatedAt: new Date().toISOString(),
  };
}
