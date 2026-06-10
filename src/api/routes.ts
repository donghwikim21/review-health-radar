import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import {
  DEFAULT_TREND_BUCKETS,
  getContributors,
  getRecap,
  getReviewHealthReport,
  getReviewHealthTrend,
} from "../service/review-health-service.js";
import { generateNarrative } from "../insight/narrative.js";
import { getInsightProvider } from "../insight/factory.js";
import { parseRepoParams, parseWindowQuery } from "./validation.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));

  /**
   * Endpoint #1 — the numbers. Review Health metrics + fact ledger + anomaly
   * flags for a window. Cacheable (the heavy lifting is upstream + deterministic).
   */
  app.get("/repos/:owner/:repo/review-health", async (request, reply) => {
    const repo = parseRepoParams(request.params);
    const { window, baseline } = parseWindowQuery(request.query);
    const report = await getReviewHealthReport(repo, window, request.log, {
      baselineWindows: baseline,
    });
    reply.header("Cache-Control", `public, max-age=${config.cacheTtlSeconds}`);
    return report;
  });

  /**
   * Trend — the component signals as a time series over `buckets` sub-windows,
   * for sparklines / "trend lines over time". Cacheable like the metrics endpoint.
   */
  app.get("/repos/:owner/:repo/review-health/trend", async (request, reply) => {
    const repo = parseRepoParams(request.params);
    const { window, buckets } = parseWindowQuery(request.query);
    const trend = await getReviewHealthTrend(repo, window, buckets ?? DEFAULT_TREND_BUCKETS, request.log);
    reply.header("Cache-Control", `public, max-age=${config.cacheTtlSeconds}`);
    return trend;
  });

  /**
   * Contributor character sheets + behaviour badges (gamification). Deterministic,
   * cacheable. Multidimensional by design — no single rankable score.
   */
  app.get("/repos/:owner/:repo/contributors", async (request, reply) => {
    const repo = parseRepoParams(request.params);
    const { window } = parseWindowQuery(request.query);
    const result = await getContributors(repo, window, request.log);
    reply.header("Cache-Control", `public, max-age=${config.cacheTtlSeconds}`);
    return result;
  });

  /**
   * "Repo Wrapped" — a grounded, playful season recap. POST (billable LLM call).
   */
  app.post("/repos/:owner/:repo/recap", async (request, reply) => {
    const repo = parseRepoParams(request.params);
    const { window } = parseWindowQuery(request.query);
    const provider = getInsightProvider(); // 503 if no API key configured
    const result = await getRecap(repo, window, provider, request.log);
    reply.header("Cache-Control", "no-store");
    return result;
  });

  /**
   * Endpoint #2 — the narrative. An LLM synthesises a grounded story over the
   * same numbers. POST because it is a non-idempotent, potentially billable
   * action; window params travel on the query string for curl convenience.
   */
  app.post("/repos/:owner/:repo/review-health/narrative", async (request, reply) => {
    const repo = parseRepoParams(request.params);
    const { window, baseline } = parseWindowQuery(request.query);
    const provider = getInsightProvider(); // throws 503 if no API key configured
    const report = await getReviewHealthReport(repo, window, request.log, {
      baselineWindows: baseline,
    });
    const narrative = await generateNarrative(report, provider);
    reply.header("Cache-Control", "no-store");
    return narrative;
  });
}
