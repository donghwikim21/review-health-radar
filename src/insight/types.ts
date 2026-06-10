import type { RepoRef, Window } from "../domain/types.js";
import type { Fact, HealthBand } from "../metrics/types.js";

/**
 * A decomposed confidence score. We never report a single opaque number: the
 * `statistical` part is computed in code from the cited facts (sample size +
 * anomaly strength), the `reasoning` part is the model's own confidence in the
 * causal story, and `overall` combines them by a fixed, documented rule so the
 * narrative can never sound more certain than the data supports.
 */
export type Verdict = "supported" | "weak" | "refuted";

export interface Confidence {
  overall: number;
  statistical: number;
  reasoning: number;
  /** The adversarial verdict and the multiplier it applied (null if verification was off/failed). */
  verification: { verdict: Verdict; multiplier: number } | null;
  method: string;
}

/** Output of the adversarial skeptic pass. */
export interface Verification {
  verdict: Verdict;
  rationale: string;
  /** Ledger facts the skeptic says undercut the hypothesis (grounded; may be empty). */
  refutingEvidence: EnrichedEvidence[];
}

/** A cited recap fact, enriched with its authoritative label + value. */
export interface RecapEvidence {
  factId: string;
  label: string;
  display: string;
}

export interface RecapResult {
  repo: RepoRef;
  window: Window;
  title: string;
  highlights: { text: string; evidence: RecapEvidence[] }[];
  mvp: { login: string; reason: string; evidence: RecapEvidence[] } | null;
  facts: Fact[];
  meta: { model: string; regenerations: number; cached: boolean; generatedAt: string };
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
  /** The adversarial skeptic's verdict over the hypothesis (null if verification disabled). */
  verification: Verification | null;
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
