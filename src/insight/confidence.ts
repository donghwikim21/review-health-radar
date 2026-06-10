import { round } from "../metrics/stats.js";
import type { Fact } from "../metrics/types.js";
import type { RawNarrative } from "./schema.js";
import type { Confidence, Verification } from "./types.js";

/** Sample size at which a fact's statistical confidence saturates near its max. */
export const SAMPLE_SATURATION = 30;

/** How the adversarial skeptic's verdict scales the final confidence. */
export const VERDICT_MULTIPLIER: Record<Verification["verdict"], number> = {
  supported: 1.0,
  weak: 0.6,
  refuted: 0.25,
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Confidence that a single cited fact reflects a real pattern rather than noise. */
function factStatConfidence(fact: Fact): number {
  if (!fact.reliable) return 0.2;
  return 0.4 + 0.6 * Math.min(1, fact.sampleSize / SAMPLE_SATURATION);
}

/**
 * Combines a code-computed statistical confidence with the model's self-reported
 * reasoning confidence. The combination rule is fixed and intentionally caps the
 * overall score at the statistical score: the narrative can never be more
 * confident than the data underneath it.
 */
export function computeConfidence(
  narrative: RawNarrative,
  facts: Fact[],
  verification?: Verification | null,
): Confidence {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const citedFacts = narrative.rootCauseHypothesis.evidence
    .map((e) => byId.get(e.factId))
    .filter((f): f is Fact => f !== undefined);

  const perFact = citedFacts.map(factStatConfidence);
  let statistical = perFact.length > 0 ? perFact.reduce((a, b) => a + b, 0) / perFact.length : 0.2;
  // If the hypothesis rests on no reliable fact at all, hold statistical confidence low.
  if (!citedFacts.some((f) => f.reliable)) statistical = Math.min(statistical, 0.3);

  const reasoning = clamp01(narrative.rootCauseHypothesis.reasoningConfidence);
  const multiplier = verification ? VERDICT_MULTIPLIER[verification.verdict] : 1.0;
  const overall = statistical * (0.5 + 0.5 * reasoning) * multiplier;

  return {
    overall: round(clamp01(overall), 2),
    statistical: round(clamp01(statistical), 2),
    reasoning: round(reasoning, 2),
    verification: verification ? { verdict: verification.verdict, multiplier } : null,
    method:
      "overall = statistical × (0.5 + 0.5 × reasoning) × verdict. Statistical confidence is derived in code from the sample size and reliability of the cited facts; reasoning is the model's own; verdict is the adversarial skeptic's multiplier (supported 1.0 / weak 0.6 / refuted 0.25). Overall is capped by statistical, so the narrative cannot sound more certain than the data — or than the skeptic — allows.",
  };
}
