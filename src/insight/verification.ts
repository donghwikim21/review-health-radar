import { logger } from "../logger.js";
import type { ReviewHealthReport } from "../metrics/types.js";
import type { InsightProvider } from "./provider.js";
import { VerdictSchema, type RawNarrative } from "./schema.js";
import type { EnrichedEvidence, Verification } from "./types.js";

/**
 * Adversarial pass: asks the skeptic to refute the hypothesis, validates the
 * verdict, and grounds its refuting evidence against the ledger (unknown ids are
 * dropped). Best-effort: if the skeptic call or validation fails, returns null so
 * the (already valid, grounded) narrative is still served — just without a verdict
 * adjustment. The verdict, when present, feeds computeConfidence().
 */
export async function verifyHypothesis(
  report: ReviewHealthReport,
  narrative: RawNarrative,
  provider: InsightProvider,
): Promise<Verification | null> {
  const citedFactIds = narrative.rootCauseHypothesis.evidence.map((e) => e.factId);

  let raw: unknown;
  try {
    raw = await provider.verify({
      report,
      hypothesis: narrative.rootCauseHypothesis.statement,
      citedFactIds,
    });
  } catch (error) {
    logger.warn({ err: error }, "Verification pass failed; serving narrative without a verdict");
    return null;
  }

  const parsed = VerdictSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ err: parsed.error }, "Verification returned an invalid verdict; ignoring");
    return null;
  }

  const byId = new Map(report.facts.map((f) => [f.id, f]));
  const anomalies = new Set(report.anomalies);
  const refutingEvidence: EnrichedEvidence[] = parsed.data.refutingEvidence
    .map((item): EnrichedEvidence | null => {
      const fact = byId.get(item.factId);
      if (!fact) return null; // skeptic cited a non-existent fact — drop it
      return {
        factId: fact.id,
        relevance: item.relevance,
        value: fact.value,
        display: fact.display,
        reliable: fact.reliable,
        isAnomaly: anomalies.has(fact.id),
        zScore: fact.trend?.zScore ?? null,
      };
    })
    .filter((e): e is EnrichedEvidence => e !== null);

  return { verdict: parsed.data.verdict, rationale: parsed.data.rationale, refutingEvidence };
}
