import { describe, it, expect } from "vitest";
import { validateGrounding } from "./validator.js";
import { computeConfidence } from "./confidence.js";
import type { Fact } from "../metrics/types.js";
import type { RawNarrative } from "./schema.js";

const window = { since: "2026-05-01T00:00:00Z", until: "2026-06-01T00:00:00Z" };

function fact(over: Partial<Fact> & { id: string }): Fact {
  return {
    label: over.id,
    value: 50,
    unit: "percent",
    display: "50%",
    sampleSize: 30,
    reliable: true,
    window,
    trend: null,
    ...over,
  };
}

function narrative(evidenceIds: string[], reasoning = 0.5): RawNarrative {
  return {
    headline: "h",
    summary: "s",
    rootCauseHypothesis: {
      statement: "st",
      evidence: evidenceIds.map((id) => ({ factId: id, relevance: "r" })),
      reasoningConfidence: reasoning,
    },
    caveats: ["c"],
  };
}

describe("validateGrounding", () => {
  const facts = [fact({ id: "review_coverage" }), fact({ id: "rubber_stamp_rate", reliable: false })];

  it("passes when every cited fact id exists", () => {
    const r = validateGrounding(narrative(["review_coverage"]), facts);
    expect(r.valid).toBe(true);
    expect(r.unknownFactIds).toEqual([]);
    expect(r.citesReliableFact).toBe(true);
  });

  it("fails and reports hallucinated fact ids", () => {
    const r = validateGrounding(narrative(["made_up_metric"]), facts);
    expect(r.valid).toBe(false);
    expect(r.unknownFactIds).toEqual(["made_up_metric"]);
  });

  it("detects when a hypothesis rests only on unreliable facts", () => {
    const r = validateGrounding(narrative(["rubber_stamp_rate"]), facts);
    expect(r.valid).toBe(true); // grounded...
    expect(r.citesReliableFact).toBe(false); // ...but not on solid ground
  });
});

describe("computeConfidence", () => {
  const facts = [fact({ id: "review_coverage", sampleSize: 30 })];

  it("caps overall at the statistical confidence; reasoning only scales it down", () => {
    const full = computeConfidence(narrative(["review_coverage"], 1), facts);
    expect(full.statistical).toBe(1);
    expect(full.overall).toBe(1); // reasoning=1 => overall == statistical

    const half = computeConfidence(narrative(["review_coverage"], 0.5), facts);
    expect(half.overall).toBe(0.75); // 1 * (0.5 + 0.5*0.5)

    const none = computeConfidence(narrative(["review_coverage"], 0), facts);
    expect(none.overall).toBe(0.5); // 1 * 0.5
  });

  it("holds statistical confidence low when no reliable fact is cited", () => {
    const unreliable = [fact({ id: "tiny", reliable: false, sampleSize: 1 })];
    const c = computeConfidence(narrative(["tiny"], 1), unreliable);
    expect(c.statistical).toBeLessThanOrEqual(0.3);
    expect(c.overall).toBeLessThanOrEqual(0.3);
  });
});
