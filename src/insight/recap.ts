import { createHash } from "node:crypto";
import type { ZodError } from "zod";
import { AppError } from "../errors.js";
import type { Fact } from "../metrics/types.js";
import type { RepoRef, Window } from "../domain/types.js";
import { getCachedNarrative, putCachedNarrative } from "../store/repository.js";
import { unknownFactIds } from "./validator.js";
import { RecapSchema, type Recap } from "./schema.js";
import type { InsightProvider } from "./provider.js";
import type { RecapEvidence, RecapResult } from "./types.js";

export const MAX_RECAP_ATTEMPTS = 3;

function schemaFeedback(error: ZodError): string {
  const issues = error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  return `Your previous answer did not match the schema (${issues}). Fix and resubmit.`;
}

function citedIds(recap: Recap): string[] {
  return [...recap.highlights.flatMap((h) => h.evidence), ...(recap.mvp?.evidence ?? [])];
}

function enrich(ids: string[], byId: Map<string, Fact>): RecapEvidence[] {
  return ids
    .map((id) => byId.get(id))
    .filter((f): f is Fact => f !== undefined)
    .map((f) => ({ factId: f.id, label: f.label, display: f.display }));
}

function recapKey(repo: RepoRef, window: Window, facts: Fact[], model: string): string {
  const canonical = facts.map((f) => `${f.id}=${f.value}`).join("|");
  const hash = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `recap#${repo.owner}/${repo.name}@${window.since}..${window.until}#${model}#${hash}`;
}

/**
 * Generates the grounded "Repo Wrapped" recap. Same trust property as the main
 * narrative — every cited id must exist in the recap ledger (reusing
 * `unknownFactIds`), with bounded regeneration — but no confidence/skeptic, since a
 * recap is a celebration of real numbers, not a causal hypothesis.
 */
export async function generateRecap(
  repo: RepoRef,
  window: Window,
  facts: Fact[],
  provider: InsightProvider,
  useCache = true,
): Promise<RecapResult> {
  const key = recapKey(repo, window, facts, provider.model);
  if (useCache) {
    const hit = getCachedNarrative<RecapResult>(key);
    if (hit) return { ...hit, meta: { ...hit.meta, cached: true } };
  }

  const byId = new Map(facts.map((f) => [f.id, f]));
  let feedback: string | undefined;
  let regenerations = 0;
  let recap: Recap | null = null;

  for (let attempt = 0; attempt < MAX_RECAP_ATTEMPTS; attempt++) {
    const raw = await provider.recap({ facts, feedback });
    const parsed = RecapSchema.safeParse(raw);
    if (!parsed.success) {
      regenerations++;
      feedback = schemaFeedback(parsed.error);
      continue;
    }
    const unknown = unknownFactIds(citedIds(parsed.data), facts);
    if (unknown.length > 0) {
      regenerations++;
      feedback = `You cited fact id(s) that do not exist: ${unknown.join(", ")}. Valid ids: ${facts.map((f) => f.id).join(", ")}.`;
      continue;
    }
    recap = parsed.data;
    break;
  }

  if (!recap) {
    throw new AppError("INSIGHT_UNGROUNDED", `Could not produce a grounded recap after ${MAX_RECAP_ATTEMPTS} attempts.`);
  }

  const result: RecapResult = {
    repo,
    window,
    title: recap.title,
    highlights: recap.highlights.map((h) => ({ text: h.text, evidence: enrich(h.evidence, byId) })),
    mvp: recap.mvp ? { login: recap.mvp.login, reason: recap.mvp.reason, evidence: enrich(recap.mvp.evidence, byId) } : null,
    facts,
    meta: { model: provider.model, regenerations, cached: false, generatedAt: new Date().toISOString() },
  };

  if (useCache) putCachedNarrative(key, result);
  return result;
}
