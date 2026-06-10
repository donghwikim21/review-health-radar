import type { Fact, ReviewHealthReport } from "../metrics/types.js";

export interface NarrativeInput {
  report: ReviewHealthReport;
  /**
   * Set on a regeneration attempt to tell the model what was wrong with its last
   * answer (e.g. an unknown fact id it cited). Lets the grounding loop self-correct.
   */
  feedback?: string;
}

export interface VerificationInput {
  report: ReviewHealthReport;
  /** The hypothesis statement the skeptic must try to refute. */
  hypothesis: string;
  /** Fact ids the hypothesis cited, so the skeptic can scrutinise them. */
  citedFactIds: string[];
}

export interface RecapInput {
  /** The recap fact ledger — the only numbers/names the recap may cite. */
  facts: Fact[];
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
  /**
   * Adversarial pass: a skeptic that tries to refute the hypothesis and returns a
   * raw verdict payload (validated by the caller). Same "return raw" contract as
   * generate().
   */
  verify(input: VerificationInput): Promise<unknown>;
  /** Season "Repo Wrapped" recap; returns a raw payload validated by the caller. */
  recap(input: RecapInput): Promise<unknown>;
}
