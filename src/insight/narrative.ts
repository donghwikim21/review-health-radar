import { createHash } from "node:crypto";
import type { ZodError } from "zod";
import { AppError } from "../errors.js";
import type { ReviewHealthReport } from "../metrics/types.js";
import { getCachedNarrative, narrativeKey, putCachedNarrative } from "../store/repository.js";
import { computeConfidence } from "./confidence.js";
import { groundingFeedback, validateGrounding } from "./validator.js";
import type { InsightProvider } from "./provider.js";
import type { EnrichedEvidence, NarrativeResult } from "./types.js";
import { RawNarrativeSchema, type RawNarrative } from "./schema.js";

/** Max attempts to coax a valid, grounded answer before failing closed. */
export const MAX_NARRATIVE_ATTEMPTS = 3;

/** Turns a Zod failure into terse, model-actionable feedback for a retry. */
function schemaFeedback(error: ZodError): string {
  const issues = error.issues
    .slice(0, 4)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return `Your previous answer did not match the required schema (${issues}). Fix those fields and resubmit.`;
}

/** Stable hash of the ledger so a cached narrative always matches its numbers. */
function ledgerHash(report: ReviewHealthReport): string {
  const canonical = report.facts
    .map((f) => `${f.id}=${f.value}:${f.reliable}:${f.trend?.zScore ?? "x"}`)
    .join("|");
  return createHash("sha256").update(`${report.band}|${canonical}`).digest("hex").slice(0, 16);
}

function enrichEvidence(narrative: RawNarrative, report: ReviewHealthReport): EnrichedEvidence[] {
  const byId = new Map(report.facts.map((f) => [f.id, f]));
  const anomalies = new Set(report.anomalies);
  const out: EnrichedEvidence[] = [];
  for (const item of narrative.rootCauseHypothesis.evidence) {
    const fact = byId.get(item.factId);
    if (!fact) continue; // already validated; defensive
    out.push({
      factId: fact.id,
      relevance: item.relevance,
      value: fact.value,
      display: fact.display,
      reliable: fact.reliable,
      isAnomaly: anomalies.has(fact.id),
      zScore: fact.trend?.zScore ?? null,
    });
  }
  return out;
}

export interface NarrativeOptions {
  useCache?: boolean;
}

/**
 * Produces a grounded narrative for a report. Flow:
 *   cache → generate → validate grounding → (regenerate with feedback)* → confidence → enrich.
 * If the model never produces a fully-grounded answer it fails closed with a 502
 * rather than returning content we can't stand behind.
 */
export async function generateNarrative(
  report: ReviewHealthReport,
  provider: InsightProvider,
  options: NarrativeOptions = {},
): Promise<NarrativeResult> {
  const useCache = options.useCache ?? true;
  const key = narrativeKey(report.repo, report.window, ledgerHash(report), provider.model);

  if (useCache) {
    const hit = getCachedNarrative<NarrativeResult>(key);
    if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };
  }

  let feedback: string | undefined;
  let regenerations = 0;
  let narrative: RawNarrative | null = null;

  for (let attempt = 0; attempt < MAX_NARRATIVE_ATTEMPTS; attempt++) {
    const raw = await provider.generate({ report, feedback });

    // 1) Schema: the model must return our exact structure.
    const parsed = RawNarrativeSchema.safeParse(raw);
    if (!parsed.success) {
      regenerations++;
      feedback = schemaFeedback(parsed.error);
      continue;
    }

    // 2) Grounding: every cited fact id must exist in the ledger.
    const grounding = validateGrounding(parsed.data, report.facts);
    if (!grounding.valid) {
      regenerations++;
      feedback = groundingFeedback(grounding, report.facts);
      continue;
    }

    narrative = parsed.data;
    break;
  }

  if (!narrative) {
    throw new AppError(
      "INSIGHT_UNGROUNDED",
      `The model could not produce a valid, grounded narrative after ${MAX_NARRATIVE_ATTEMPTS} attempts.`,
    );
  }

  const result: NarrativeResult = {
    repo: report.repo,
    window: report.window,
    band: report.band,
    headline: narrative.headline,
    summary: narrative.summary,
    hypothesis: {
      statement: narrative.rootCauseHypothesis.statement,
      confidence: computeConfidence(narrative, report.facts),
      evidence: enrichEvidence(narrative, report),
    },
    caveats: narrative.caveats,
    facts: report.facts,
    meta: {
      model: provider.model,
      regenerations,
      cached: false,
      generatedAt: new Date().toISOString(),
    },
  };

  if (useCache) putCachedNarrative(key, result);
  return result;
}
