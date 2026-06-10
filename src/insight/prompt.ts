import type { Fact, ReviewHealthReport } from "../metrics/types.js";
import type { NarrativeInput, VerificationInput } from "./provider.js";

export const SYSTEM_PROMPT = `You are a careful engineering-analytics assistant. You write a short, honest narrative over a set of pre-computed "Review Health" metrics for a software repository.

Hard rules:
- You may ONLY reference numbers that appear in the provided fact ledger, and you reference them by their exact "id". Never invent or recompute numbers; the service renders the authoritative value next to each fact you cite.
- Identify the SINGLE most notable signal in the window (often an anomaly vs. baseline, or a value crossing a health threshold) and build ONE root-cause hypothesis for it.
- Prefer facts marked reliable. If a striking value rests on a tiny sample (reliable=false), say so in caveats rather than building a strong hypothesis on it.
- Be conservative with reasoningConfidence. Many signals have innocent explanations (small team, holiday week, a few large refactors). Reflect that uncertainty.
- Always include at least one honest caveat or alternative explanation.
- Respond ONLY by calling the submit_narrative tool.`;

function factLine(f: Fact): string {
  const parts = [
    `id=${f.id}`,
    `value=${f.display}`,
    `n=${f.sampleSize}`,
    `reliable=${f.reliable}`,
  ];
  if (f.trend) {
    const z = f.trend.zScore === null ? "n/a" : f.trend.zScore.toFixed(2);
    parts.push(`trend=${f.trend.direction}`, `baseline=${f.trend.baselineValue}`, `z=${z}`);
  }
  return `- ${f.label}\n    ${parts.join("  ")}`;
}

export function buildUserPrompt(report: ReviewHealthReport): string {
  const ledger = report.facts.map(factLine).join("\n");
  const anomalies = report.anomalies.length > 0 ? report.anomalies.join(", ") : "none";
  return `Repository: ${report.repo.owner}/${report.repo.name}
Window: ${report.window.since} → ${report.window.until}
Baseline windows compared: ${report.baselineWindows}

Computed health band: ${report.band}
Why: ${report.bandReasons.join(" ")}
Statistically anomalous facts (|z| ≥ 2 vs. baseline): ${anomalies}

Fact ledger (the ONLY numbers you may cite, by id):
${ledger}

Write the narrative for this window. Cite the fact ids your hypothesis depends on.`;
}

export function buildMessages(input: NarrativeInput): { system: string; user: string } {
  let user = buildUserPrompt(input.report);
  if (input.feedback) {
    user += `\n\nIMPORTANT — your previous answer was rejected: ${input.feedback}\nOnly cite fact ids that appear in the ledger above.`;
  }
  return { system: SYSTEM_PROMPT, user };
}

export const VERIFICATION_SYSTEM_PROMPT = `You are a skeptical staff engineer doing a second-pass review of an automated hypothesis about a repository's review health. Your job is to try to REFUTE it, not to agree.

Scrutinise:
- Confounds and innocent explanations (release sprints, holidays, a few large refactors, bot PRs, tiny teams).
- Whether the cited facts are reliable (sufficient sample size) and whether any trend actually contradicts the claim (e.g. a metric the hypothesis calls "bad" is in fact improving vs. baseline).
- Over-reach: a causal story asserted from a value that merely crossed a threshold by a hair or has a near-zero z-score.

Return a verdict: 'supported' only if the facts genuinely back the causal claim; 'weak' if plausible but confounded or thin; 'refuted' if the data contradicts it or an innocent explanation is clearly more likely. Keep the rationale concise (2-4 sentences). Cite ledger fact ids (exact) for anything you point to. Respond ONLY by calling the submit_verdict tool.`;

export function buildVerificationMessages(input: VerificationInput): { system: string; user: string } {
  const user = `${buildUserPrompt(input.report)}

A first-pass analysis produced this hypothesis:
"${input.hypothesis}"
It cited these fact ids: ${input.citedFactIds.join(", ") || "(none)"}.

Try to refute it. Is the causal claim genuinely supported by the ledger, or is there a confound, contradiction, or innocent explanation?`;
  return { system: VERIFICATION_SYSTEM_PROMPT, user };
}
