import type { Log } from "../logger.js";
import { config } from "../config.js";
import { fetchRepoActivity } from "../github/fetch.js";
import { getCachedActivity, putCachedActivity } from "../store/repository.js";
import { computeWindowMetrics } from "../metrics/review-health.js";
import { buildReport } from "../metrics/ledger.js";
import { precedingWindows, splitWindow } from "../domain/window.js";
import type { RepoActivity, RepoRef, Window } from "../domain/types.js";
import type { ReviewHealthReport } from "../metrics/types.js";

/** Number of preceding windows fetched to form the trend/anomaly baseline. */
export const DEFAULT_BASELINE_WINDOWS = 3;
export const DEFAULT_TREND_BUCKETS = 8;

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

/** One point in a trend series — the component values for a sub-window. */
export interface TrendPoint {
  window: Window;
  reviewCoverage: number;
  rubberStampRate: number;
  medianTimeToFirstReviewHours: number | null;
  medianTimeToMergeHours: number | null;
  reviewerTop1Share: number;
  prsCreated: number;
  prsMerged: number;
}

export interface ReviewHealthTrend {
  repo: RepoRef;
  window: Window;
  buckets: number;
  series: TrendPoint[];
}

/**
 * Splits the window into `buckets` contiguous sub-windows and returns each one's
 * component values as a time series (for the UI sparklines). Each sub-window is
 * fetched/cached independently, so this reuses any work the metrics endpoint did.
 */
export async function getReviewHealthTrend(
  repo: RepoRef,
  window: Window,
  buckets: number,
  log: Log,
): Promise<ReviewHealthTrend> {
  const subWindows = splitWindow(window, buckets);
  const activities = await Promise.all(subWindows.map((w) => getActivity(repo, w, log)));
  const series: TrendPoint[] = activities.map((activity) => {
    const m = computeWindowMetrics(activity);
    return {
      window: activity.window,
      reviewCoverage: m.reviewCoverage,
      rubberStampRate: m.rubberStampRate,
      medianTimeToFirstReviewHours: m.medianTimeToFirstReviewHours,
      medianTimeToMergeHours: m.medianTimeToMergeHours,
      reviewerTop1Share: m.reviewerTop1Share,
      prsCreated: m.prsCreated,
      prsMerged: m.prsMerged,
    };
  });
  return { repo, window, buckets, series };
}
