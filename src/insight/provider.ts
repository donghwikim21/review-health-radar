import type { ReviewHealthReport } from "../metrics/types.js";

export interface NarrativeInput {
  report: ReviewHealthReport;
  /**
   * Set on a regeneration attempt to tell the model what was wrong with its last
   * answer (e.g. an unknown fact id it cited). Lets the grounding loop self-correct.
   */
  feedback?: string;
}

/**
 * Abstraction over the LLM. Swapping Anthropic for another provider — or the
 * deterministic StubInsightProvider used in tests/evals — is just a different
 * implementation of this one method. The eval harness is what makes such a swap
 * safe to do.
 */
export interface InsightProvider {
  readonly model: string;
  /**
   * Returns the model's raw structured payload (the tool-call input). It is
   * intentionally NOT schema-validated here — the orchestrator validates schema
   * AND grounding in one place so it can regenerate with feedback on either kind
   * of failure.
   */
  generate(input: NarrativeInput): Promise<unknown>;
}
