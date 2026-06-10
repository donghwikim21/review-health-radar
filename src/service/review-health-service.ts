import type { Log } from "../logger.js";
import { config } from "../config.js";
import { fetchRepoActivity } from "../github/fetch.js";
import { getCachedActivity, putCachedActivity } from "../store/repository.js";
import { computeWindowMetrics } from "../metrics/review-health.js";
import { buildReport } from "../metrics/ledger.js";
import { precedingWindows } from "../domain/window.js";
import type { RepoActivity, RepoRef, Window } from "../domain/types.js";
import type { ReviewHealthReport } from "../metrics/types.js";

/** Number of preceding windows fetched to form the trend/anomaly baseline. */
export const DEFAULT_BASELINE_WINDOWS = 3;

/**
 * Returns upstream activity for (repo, window), serving from the SQLite cache
 * when fresh and otherwise fetching and persisting it. This is the single choke
 * point that keeps us from re-hitting GitHub on every request.
 */
export async function getActivity(repo: RepoRef, window: Window, log: Log): Promise<RepoActivity> {
  const cached = getCachedActivity(repo, window);
  if (cached) {
    log.debug({ repo, window }, "activity cache hit");
    return cached;
  }
  const activity = await fetchRepoActivity(repo, window, log);
  putCachedActivity(activity, config.cacheTtlSeconds);
  return activity;
}

export interface ReportOptions {
  baselineWindows?: number;
}

/**
 * Computes the full Review Health report for a window, including trends against a
 * handful of preceding windows. Each window is fetched/cached independently, so
 * repeated or overlapping requests reuse work.
 */
export async function getReviewHealthReport(
  repo: RepoRef,
  window: Window,
  log: Log,
  options: ReportOptions = {},
): Promise<ReviewHealthReport> {
  const baselineCount = options.baselineWindows ?? DEFAULT_BASELINE_WINDOWS;
  const baselineWindowDefs = precedingWindows(window, baselineCount);

  const currentActivity = await getActivity(repo, window, log);
  const baselineActivities = await Promise.all(
    baselineWindowDefs.map((w) => getActivity(repo, w, log)),
  );

  const currentMetrics = computeWindowMetrics(currentActivity);
  const baselineMetrics = baselineActivities.map(computeWindowMetrics);

  return buildReport(currentMetrics, baselineMetrics);
}
