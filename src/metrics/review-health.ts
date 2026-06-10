import type { PullRequest, RepoActivity, Review } from "../domain/types.js";
import { gini, median } from "./stats.js";
import type { WindowMetrics } from "./types.js";

/** A review counts as "rubber-stamp fast" if the first review landed within this many minutes. */
export const RUBBER_STAMP_MAX_MINUTES = 5;

const ENGAGED_STATES = new Set<Review["state"]>([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
]);

/** Reviews left by someone other than the PR author that represent real engagement. */
function humanReviews(pr: PullRequest): Review[] {
  return pr.reviews.filter(
    (r) => r.author !== null && r.author !== pr.author && ENGAGED_STATES.has(r.state),
  );
}

function isMerged(pr: PullRequest): boolean {
  return pr.mergedAt !== null;
}

/** Hours between PR creation and its first human review, or null if never reviewed. */
function timeToFirstReviewHours(pr: PullRequest): number | null {
  const reviews = humanReviews(pr).filter((r) => r.submittedAt !== null);
  if (reviews.length === 0) return null;
  const firstAt = Math.min(...reviews.map((r) => Date.parse(r.submittedAt!)));
  const createdAt = Date.parse(pr.createdAt);
  const hours = (firstAt - createdAt) / 3_600_000;
  return hours >= 0 ? hours : 0; // clamp clock-skew / pre-creation edge cases
}

/**
 * "Rubber stamp": a merged PR that was approved almost instantly with zero review
 * comments — an approval that very likely didn't engage with the change. Note the
 * documented false positive: small trivial PRs are legitimately fast.
 */
function isRubberStamp(pr: PullRequest): boolean {
  if (!isMerged(pr)) return false;
  const reviews = humanReviews(pr);
  const hasApproval = reviews.some((r) => r.state === "APPROVED");
  if (!hasApproval) return false;
  const totalComments = reviews.reduce((sum, r) => sum + r.commentCount, 0);
  if (totalComments > 0) return false;
  const ttfr = timeToFirstReviewHours(pr);
  return ttfr !== null && ttfr * 60 <= RUBBER_STAMP_MAX_MINUTES;
}

/**
 * Computes the four Review Health components plus context counts for one window.
 * Pure: same RepoActivity in → same WindowMetrics out. This is the function the
 * unit tests pin hardest, since every downstream number derives from it.
 */
export function computeWindowMetrics(activity: RepoActivity): WindowMetrics {
  const cohort = activity.pullRequests;
  const mergedPrs = cohort.filter(isMerged);
  const mergedReviewed = mergedPrs.filter((pr) => humanReviews(pr).length > 0);

  const reviewCoverage = mergedPrs.length > 0 ? mergedReviewed.length / mergedPrs.length : 0;

  const rubberStamps = mergedReviewed.filter(isRubberStamp);
  const rubberStampRate =
    mergedReviewed.length > 0 ? rubberStamps.length / mergedReviewed.length : 0;

  const ttfrValues = cohort
    .map(timeToFirstReviewHours)
    .filter((v): v is number => v !== null);
  const medianTimeToFirstReviewHours = median(ttfrValues);

  // Reviewer load distribution across every human review in the cohort.
  const reviewsByAuthor = new Map<string, number>();
  for (const pr of cohort) {
    for (const r of humanReviews(pr)) {
      reviewsByAuthor.set(r.author!, (reviewsByAuthor.get(r.author!) ?? 0) + 1);
    }
  }
  const counts = [...reviewsByAuthor.values()];
  const totalHumanReviews = counts.reduce((a, b) => a + b, 0);
  const reviewerTop1Share =
    totalHumanReviews > 0 ? Math.max(...counts) / totalHumanReviews : 0;
  const reviewerGini = gini(counts);

  const linesChanged = activity.commits.reduce((sum, c) => sum + c.additions + c.deletions, 0);

  return {
    repo: activity.repo,
    window: activity.window,
    prsCreated: cohort.length,
    prsMerged: mergedPrs.length,
    prsOpen: cohort.filter((p) => p.mergedAt === null && p.closedAt === null).length,
    prsMergedReviewed: mergedReviewed.length,
    commits: activity.commits.length,
    linesChanged,
    reviewCoverage,
    rubberStampRate,
    medianTimeToFirstReviewHours,
    reviewerTop1Share,
    reviewerGini,
    totalHumanReviews,
    reviewedCohortCount: ttfrValues.length,
  };
}
