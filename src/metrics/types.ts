import type { RepoRef, Window } from "../domain/types.js";

export type FactUnit = "percent" | "hours" | "count" | "ratio";

export interface FactTrend {
  /** Mean of the metric across the baseline (preceding) windows. */
  baselineValue: number;
  /** current − baseline. */
  deltaAbsolute: number;
  /** Standardised deviation from baseline; null when the baseline is too thin. */
  zScore: number | null;
  direction: "up" | "down" | "flat";
}

/**
 * A single, citable number. The fact ledger (a list of these) is the ONLY source
 * of numbers the LLM is allowed to reference — every hypothesis must point back to
 * a fact `id`, and the grounding validator enforces it.
 */
export interface Fact {
  id: string;
  label: string;
  value: number;
  unit: FactUnit;
  /** Pre-formatted for display so prose never has to restate the raw number. */
  display: string;
  /** Number of observations behind the value (n). */
  sampleSize: number;
  /** False when sampleSize is too small to reason about (e.g. 0 merged PRs). */
  reliable: boolean;
  window: Window;
  trend: FactTrend | null;
}

export type HealthBand = "healthy" | "watch" | "at-risk";

/** Per-window component values, before trend/baseline enrichment. */
export interface WindowMetrics {
  repo: RepoRef;
  window: Window;
  prsCreated: number;
  prsMerged: number;
  prsOpen: number;
  prsMergedReviewed: number;
  commits: number;
  linesChanged: number;
  reviewCoverage: number; // 0..1
  rubberStampRate: number; // 0..1
  medianTimeToFirstReviewHours: number | null;
  reviewerTop1Share: number; // 0..1
  reviewerGini: number; // 0..1
  totalHumanReviews: number;
  /** Number of cohort PRs that received at least one human review (n for TTFR). */
  reviewedCohortCount: number;
}

export interface ReviewHealthReport {
  repo: RepoRef;
  window: Window;
  band: HealthBand;
  bandReasons: string[];
  anomalies: string[]; // fact ids flagged as statistically unusual
  facts: Fact[];
  population: {
    prsCreated: number;
    prsMerged: number;
    prsOpen: number;
    commits: number;
    linesChanged: number;
  };
  baselineWindows: number;
  generatedAt: string;
}
