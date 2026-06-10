import { buildUserPrompt } from "./prompt.js";
import type { RawNarrative, Verdict } from "./schema.js";
import type { InsightProvider, NarrativeInput, VerificationInput } from "./provider.js";

/**
 * Deterministic provider used by tests and the offline eval suite. It does no
 * network I/O: it picks the single most notable fact (largest |z|, else the
 * worst health-threshold signal) and emits a grounded narrative citing that
 * fact's real id. This lets us exercise the grounding/confidence pipeline — and
 * regression-test it — without spending tokens or depending on a live model.
 */
export class StubInsightProvider implements InsightProvider {
  readonly model = "stub-deterministic";

  // eslint-disable-next-line @typescript-eslint/require-await
  async generate(input: NarrativeInput): Promise<unknown> {
    // Touch the prompt builder so the stub fails if prompting breaks too.
    void buildUserPrompt(input.report);

    const facts = input.report.facts;
    const reliable = facts.filter((f) => f.reliable && f.unit !== "count");
    const pool = reliable.length > 0 ? reliable : facts;

    const notable = [...pool].sort((a, b) => {
      const za = a.trend?.zScore ? Math.abs(a.trend.zScore) : 0;
      const zb = b.trend?.zScore ? Math.abs(b.trend.zScore) : 0;
      return zb - za;
    })[0]!;

    const direction = notable.trend?.direction ?? "flat";
    const confidence = notable.trend?.zScore ? Math.min(0.8, Math.abs(notable.trend.zScore) / 5) : 0.4;

    const narrative: RawNarrative = {
      headline: `${notable.label} is ${notable.display} (${direction} vs. baseline)`,
      summary: `For ${input.report.repo.owner}/${input.report.repo.name}, the most notable review-health signal this window is ${notable.label.toLowerCase()}, currently ${notable.display}. The repository's computed health band is ${input.report.band}.`,
      rootCauseHypothesis: {
        statement: `The ${direction === "down" ? "drop" : direction === "up" ? "rise" : "level"} in this signal most plausibly reflects a change in how the team is handling reviews during this window.`,
        evidence: [{ factId: notable.id, relevance: `Primary signal: ${notable.display}.` }],
        reasoningConfidence: confidence,
      },
      caveats: [
        "Deterministic stub narrative (no LLM call); causal phrasing is illustrative.",
        "Short windows and small teams can produce swings with innocent explanations.",
      ],
    };
    return narrative;
  }

  /**
   * Deterministic skeptic: a hypothesis that rests on a reliable, genuinely
   * anomalous fact is 'supported'; one resting only on non-anomalous or
   * unreliable facts is 'weak'. Lets the verification + confidence path be
   * regression-tested offline without a live model.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async verify(input: VerificationInput): Promise<unknown> {
    const byId = new Map(input.report.facts.map((f) => [f.id, f]));
    const cited = input.citedFactIds.map((id) => byId.get(id)).filter((f) => f !== undefined);
    const restsOnReliableAnomaly = cited.some(
      (f) => f!.reliable && input.report.anomalies.includes(f!.id),
    );
    const verdict: Verdict = restsOnReliableAnomaly
      ? { verdict: "supported", rationale: "Hypothesis rests on a reliable, statistically anomalous signal.", refutingEvidence: [] }
      : {
          verdict: "weak",
          rationale: "Hypothesis does not rest on a statistically anomalous, reliable signal; could be noise or an innocent explanation.",
          refutingEvidence: [],
        };
    return verdict;
  }
}
