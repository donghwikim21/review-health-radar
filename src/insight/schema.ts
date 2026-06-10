import { z } from "zod";

/**
 * The exact shape the LLM must return. We force this via a single-tool tool_use
 * call (see anthropic.ts), then re-validate with Zod so a malformed payload never
 * propagates. The schema is deliberately small: a headline, a neutral summary, ONE
 * root-cause hypothesis, and an evidence array of fact-id references.
 */
export const EvidenceItemSchema = z.object({
  factId: z.string().min(1),
  relevance: z.string().min(1).max(400),
});

export const RawNarrativeSchema = z.object({
  headline: z.string().min(1).max(140),
  summary: z.string().min(1).max(1000),
  rootCauseHypothesis: z.object({
    statement: z.string().min(1).max(1000),
    evidence: z.array(EvidenceItemSchema).min(1).max(8),
    reasoningConfidence: z.number().min(0).max(1),
  }),
  caveats: z.array(z.string().min(1).max(400)).max(6),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type RawNarrative = z.infer<typeof RawNarrativeSchema>;

/** JSON Schema handed to Claude as the tool input schema (kept in sync with the Zod schema above). */
export const NARRATIVE_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    headline: { type: "string", description: "A short (<140 char) title for the most notable thing in the data." },
    summary: {
      type: "string",
      description:
        "1-3 neutral sentences describing what stands out. Refer to signals qualitatively; do not invent numbers — the service renders authoritative values from the cited facts.",
    },
    rootCauseHypothesis: {
      type: "object",
      properties: {
        statement: {
          type: "string",
          description:
            "ONE plausible root-cause hypothesis for the most notable signal, phrased tentatively. Only assert a cause the cited facts actually support.",
        },
        evidence: {
          type: "array",
          description: "The fact ids this hypothesis rests on, each with a short note on how it supports the hypothesis.",
          items: {
            type: "object",
            properties: {
              factId: { type: "string", description: "An id from the provided fact ledger. Must match exactly." },
              relevance: { type: "string", description: "One phrase: how this fact supports the hypothesis." },
            },
            required: ["factId", "relevance"],
          },
        },
        reasoningConfidence: {
          type: "number",
          description:
            "0..1 — your confidence in the CAUSAL story (not the numbers). Be conservative: low when the signal is weak, ambiguous, or has innocent explanations.",
        },
      },
      required: ["statement", "evidence", "reasoningConfidence"],
    },
    caveats: {
      type: "array",
      description: "Honest caveats / alternative explanations a reader should keep in mind.",
      items: { type: "string" },
    },
  },
  required: ["headline", "summary", "rootCauseHypothesis", "caveats"],
} as const;
