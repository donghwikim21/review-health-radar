import type { RepoRef, Window } from "../domain/types.js";
import type { Fact, HealthBand } from "../metrics/types.js";

/**
 * A decomposed confidence score. We never report a single opaque number: the
 * `statistical` part is computed in code from the cited facts (sample size +
 * anomaly strength), the `reasoning` part is the model's own confidence in the
 * causal story, and `overall` combines them by a fixed, documented rule so the
 * narrative can never sound more certain than the data supports.
 */
export interface Confidence {
  overall: number;
  statistical: number;
  reasoning: number;
  method: string;
}

/** An evidence item, enriched from the ledger so the value shown is authoritative. */
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
  repo: RepoRef;
  window: Window;
  band: HealthBand;
  headline: string;
  summary: string;
  hypothesis: {
    statement: string;
    confidence: Confidence;
    evidence: EnrichedEvidence[];
  };
  caveats: string[];
  /** The full ledger, so a reader can audit every number the narrative leans on. */
  facts: Fact[];
  meta: {
    model: string;
    /** How many times we had to regenerate to get a fully-grounded answer. */
    regenerations: number;
    cached: boolean;
    generatedAt: string;
  };
}
