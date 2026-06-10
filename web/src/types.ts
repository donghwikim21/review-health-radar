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

export interface Confidence {
  overall: number;
  statistical: number;
  reasoning: number;
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

export interface NarrativeResult {
  band: HealthBand;
  headline: string;
  summary: string;
  hypothesis: { statement: string; confidence: Confidence; evidence: EnrichedEvidence[] };
  caveats: string[];
  facts: Fact[];
  meta: { model: string; regenerations: number; cached: boolean; generatedAt: string };
}

export interface ApiError {
  error: { code: string; message: string };
}
