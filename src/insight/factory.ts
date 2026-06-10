import { config } from "../config.js";
import { AppError } from "../errors.js";
import { AnthropicInsightProvider } from "./anthropic.js";
import type { InsightProvider } from "./provider.js";

let cached: InsightProvider | null = null;

/**
 * Resolves the configured insight provider. Throws a 503-mapped error when no
 * ANTHROPIC_API_KEY is set, so the metrics endpoints keep working even when the
 * narrative endpoint is unconfigured.
 */
export function getInsightProvider(): InsightProvider {
  if (cached) return cached;
  if (!config.anthropicApiKey) {
    throw new AppError("INSIGHT_UNAVAILABLE", "Narrative endpoint requires ANTHROPIC_API_KEY to be configured.");
  }
  cached = new AnthropicInsightProvider(config.anthropicApiKey, config.insightModel);
  return cached;
}
