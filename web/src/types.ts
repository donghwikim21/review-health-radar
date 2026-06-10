// Mirrors the slice of the API responses the UI renders.

export interface FactTrend {
  baselineValue: number;
  deltaAbsolute: number;
  zScore: number | null;
  direction: "up" | "down" | "flat";
}

export interface Fact {
  id: string;
  label: string;
  value: number;
  unit: string;
  display: string;
  sampleSize: number;
  reliable: boolean;
  trend: FactTrend | null;
}

export type HealthBand = "healthy" | "watch" | "at-risk";

export interface ReviewHealthReport {
  repo: { owner: string; name: string };
  window: { since: string; until: string };
  band: HealthBand;
  bandReasons: string[];
  anomalies: string[];
  facts: Fact[];
  population: { prsCreated: number; prsMerged: number; prsOpen: number; commits: number; linesChanged: number };
  baselineWindows: number;
  generatedAt: string;
}

export type Verdict = "supported" | "weak" | "refuted";

export interface Confidence {
  overall: number;
  statistical: number;
  reasoning: number;
  verification: { verdict: Verdict; multiplier: number } | null;
  method: string;
}

export interface EnrichedEvidence {
  factId: string;
  relevance: string;
  value: number;
  display: string;
  reliable: boolean;
  isAnomaly: boolean;
  zScore: number | null;
}

export interface Verification {
  verdict: Verdict;
  rationale: string;
  refutingEvidence: EnrichedEvidence[];
}

export interface NarrativeResult {
  band: HealthBand;
  headline: string;
  summary: string;
  hypothesis: { statement: string; confidence: Confidence; evidence: EnrichedEvidence[] };
  caveats: string[];
  verification: Verification | null;
  facts: Fact[];
  meta: { model: string; regenerations: number; cached: boolean; generatedAt: string };
}

export interface TrendPoint {
  window: { since: string; until: string };
  reviewCoverage: number;
  rubberStampRate: number;
  medianTimeToFirstReviewHours: number | null;
  medianTimeToMergeHours: number | null;
  reviewerTop1Share: number;
  prsCreated: number;
  prsMerged: number;
}

export interface ReviewHealthTrend {
  repo: { owner: string; name: string };
  window: { since: string; until: string };
  buckets: number;
  series: TrendPoint[];
}

export interface Attributes {
  velocity: number;
  collaboration: number;
  responsiveness: number;
  breadth: number;
  thoroughness: number;
}

export interface Badge {
  id: string;
  label: string;
  emoji: string;
  description: string;
  warning?: boolean;
}

export interface ContributorStats {
  login: string;
  prsAuthored: number;
  prsMerged: number;
  linesChanged: number;
  reviewsGiven: number;
  reviewCommentsGiven: number;
  authorsReviewed: number;
  medianResponsivenessHours: number | null;
  soleReviewerCount: number;
  totalCommits: number;
  nightCommits: number;
  earlyCommits: number;
}

export interface CharacterSheet {
  login: string;
  archetype: string;
  attributes: Attributes;
  badges: Badge[];
  stats: ContributorStats;
}

export interface ContributorReport {
  repo: { owner: string; name: string };
  window: { since: string; until: string };
  sheets: CharacterSheet[];
  badgeCounts: Record<string, number>;
  generatedAt: string;
}

export interface RecapEvidence {
  factId: string;
  label: string;
  display: string;
}

export interface RecapResult {
  title: string;
  highlights: { text: string; evidence: RecapEvidence[] }[];
  mvp: { login: string; reason: string; evidence: RecapEvidence[] } | null;
  meta: { model: string; regenerations: number; cached: boolean; generatedAt: string };
}

/** The radar axes in display order. */
export const ATTRIBUTE_AXES: { key: keyof Attributes; label: string }[] = [
  { key: "velocity", label: "Velocity" },
  { key: "collaboration", label: "Collaboration" },
  { key: "responsiveness", label: "Responsiveness" },
  { key: "breadth", label: "Breadth" },
  { key: "thoroughness", label: "Thoroughness" },
];

export interface ApiError {
  error: { code: string; message: string };
}

/** Maps a fact id to the trend-series accessor (and display scale) for its sparkline. */
export const TREND_ACCESSOR: Record<string, { get: (p: TrendPoint) => number | null; scale: number }> = {
  review_coverage: { get: (p) => p.reviewCoverage, scale: 100 },
  rubber_stamp_rate: { get: (p) => p.rubberStampRate, scale: 100 },
  time_to_first_review_median: { get: (p) => p.medianTimeToFirstReviewHours, scale: 1 },
  time_to_merge_median: { get: (p) => p.medianTimeToMergeHours, scale: 1 },
  reviewer_top1_share: { get: (p) => p.reviewerTop1Share, scale: 100 },
  prs_created: { get: (p) => p.prsCreated, scale: 1 },
  prs_merged: { get: (p) => p.prsMerged, scale: 1 },
};
