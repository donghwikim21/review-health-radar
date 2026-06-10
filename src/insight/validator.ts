import type { Fact } from "../metrics/types.js";
import type { RawNarrative } from "./schema.js";

export interface GroundingResult {
  valid: boolean;
  /** Fact ids the model cited that do not exist in the ledger — the hallucination case. */
  unknownFactIds: string[];
  /** True if the hypothesis cites at least one reliable fact (soft signal, not a hard fail). */
  citesReliableFact: boolean;
}

/**
 * The core safety check. A narrative is "grounded" only if every fact id it cites
 * exists in the ledger. Because the model is constrained to cite ids (not restate
 * numbers) and we render the authoritative value ourselves, passing this check
 * makes a hallucinated statistic structurally impossible.
 */
export function validateGrounding(narrative: RawNarrative, facts: Fact[]): GroundingResult {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const cited = narrative.rootCauseHypothesis.evidence.map((e) => e.factId);
  const unknownFactIds = cited.filter((id) => !byId.has(id));
  const citesReliableFact = cited.some((id) => byId.get(id)?.reliable === true);
  return {
    valid: unknownFactIds.length === 0,
    unknownFactIds,
    citesReliableFact,
  };
}

/** Human-readable feedback used to prompt a regeneration when grounding fails. */
export function groundingFeedback(result: GroundingResult, facts: Fact[]): string {
  const validIds = facts.map((f) => f.id).join(", ");
  return `You cited fact id(s) that do not exist: ${result.unknownFactIds.join(", ")}. Valid ids are: ${validIds}.`;
}
