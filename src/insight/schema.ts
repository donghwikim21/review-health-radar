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
  headline: z.string().min(1).max(200),
  summary: z.string().min(1).max(1500),
  rootCauseHypothesis: z.object({
    statement: z.string().min(1).max(1500),
    evidence: z.array(EvidenceItemSchema).min(1).max(8),
    reasoningConfidence: z.number().min(0).max(1),
  }),
  caveats: z.array(z.string().min(1).max(500)).max(6),
});

export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type RawNarrative = z.infer<typeof RawNarrativeSchema>;

/**
 * The skeptic's verdict in the adversarial verification pass. A second LLM call
 * tries to *refute* the hypothesis; this is what it returns. `refutingEvidence`
 * cites ledger fact ids that undercut the hypothesis (may be empty when supported).
 */
export const VerdictSchema = z.object({
  verdict: z.enum(["supported", "weak", "refuted"]),
  rationale: z.string().min(1).max(2000),
  refutingEvidence: z.array(EvidenceItemSchema).max(6),
});

export type Verdict = z.infer<typeof VerdictSchema>;

export const VERDICT_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    verdict: {
      type: "string",
      enum: ["supported", "weak", "refuted"],
      description:
        "'supported' = the cited facts genuinely back the causal claim; 'weak' = plausible but with real confounds or thin evidence; 'refuted' = the data contradicts it or an innocent explanation is more likely.",
    },
    rationale: { type: "string", maxLength: 2000, description: "Concise (2-4 sentences): why you reached this verdict — name the strongest confound or contradiction." },
    refutingEvidence: {
      type: "array",
      description: "Fact ids (from the ledger) that undercut or contradict the hypothesis. Empty if none.",
      items: {
        type: "object",
        properties: {
          factId: { type: "string", description: "An id from the fact ledger. Must match exactly." },
          relevance: { type: "string", description: "How this fact weakens the hypothesis." },
        },
        required: ["factId", "relevance"],
      },
    },
  },
  required: ["verdict", "rationale", "refutingEvidence"],
} as const;

/**
 * The "Repo Wrapped" season recap. A playful narrative, but every claim cites
 * recap-ledger fact ids (validated) — so it can't invent numbers or name the wrong
 * person. `evidence` is a list of fact ids.
 */
export const RecapSchema = z.object({
  title: z.string().min(1).max(120),
  highlights: z
    .array(z.object({ text: z.string().min(1).max(600), evidence: z.array(z.string().min(1)).min(1).max(4) }))
    .min(1)
    .max(6),
  mvp: z
    .object({ login: z.string().min(1).max(80), reason: z.string().min(1).max(500), evidence: z.array(z.string().min(1)).min(1).max(4) })
    .nullable(),
});

export type Recap = z.infer<typeof RecapSchema>;

const RECAP_EVIDENCE = { type: "array", description: "Fact ids from the recap ledger that back this claim.", items: { type: "string" } };

export const RECAP_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string", maxLength: 120, description: "A short, fun title for the period's recap." },
    highlights: {
      type: "array",
      description: "3–5 playful but accurate highlights. Each cites the fact ids it rests on.",
      items: {
        type: "object",
        properties: { text: { type: "string", maxLength: 600 }, evidence: RECAP_EVIDENCE },
        required: ["text", "evidence"],
      },
    },
    mvp: {
      type: ["object", "null"],
      description: "An MVP for the period, or null. Use the login from a cited person-fact's label; don't guess names.",
      properties: { login: { type: "string" }, reason: { type: "string", maxLength: 500 }, evidence: RECAP_EVIDENCE },
      required: ["login", "reason", "evidence"],
    },
  },
  required: ["title", "highlights", "mvp"],
} as const;

/** JSON Schema handed to Claude as the tool input schema (kept in sync with the Zod schema above). */
export const NARRATIVE_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    headline: { type: "string", maxLength: 200, description: "A short (<=200 char) title for the most notable thing in the data." },
    summary: {
      type: "string",
      maxLength: 1500,
      description:
        "1-3 neutral sentences (<=1500 chars) describing what stands out. Refer to signals qualitatively; do not invent numbers — the service renders authoritative values from the cited facts.",
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
