import type { Fact, ReviewHealthReport } from "../metrics/types.js";
import type { NarrativeInput } from "./provider.js";

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
