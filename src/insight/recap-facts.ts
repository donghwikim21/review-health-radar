import type { Fact, ReviewHealthReport } from "../metrics/types.js";
import type { ContributorStats } from "../metrics/contributor-types.js";
import type { ReviewHealthTrend } from "../service/review-health-service.js";

const day = (iso: string): string => iso.slice(0, 10);

function fact(id: string, label: string, value: number, unit: Fact["unit"], display: string, window: Fact["window"]): Fact {
  return { id, label, value, unit, display, sampleSize: Math.round(value), reliable: true, window, trend: null };
}

function top<T>(items: T[], by: (t: T) => number): T | null {
  return items.reduce<T | null>((best, x) => (best === null || by(x) > by(best) ? x : best), null);
}

/**
 * Builds the recap fact ledger — the ONLY numbers the "Repo Wrapped" narrative may
 * cite. Person facts embed the login in the label (which we render authoritatively),
 * so the model can name an MVP without us trusting it to recall the right number.
 */
export function buildRecapFacts(
  report: ReviewHealthReport,
  contributors: ContributorStats[],
  trend: ReviewHealthTrend,
  badgeCounts: Record<string, number>,
): Fact[] {
  const w = report.window;
  const facts: Fact[] = [
    fact("recap.prs_merged", "PRs merged in the window", report.population.prsMerged, "count", `${report.population.prsMerged}`, w),
    fact("recap.commits", "Commits on the default branch", report.population.commits, "count", `${report.population.commits}`, w),
    fact("recap.active_contributors", "Active contributors (non-bot)", contributors.length, "count", `${contributors.length}`, w),
  ];

  const coverage = report.facts.find((f) => f.id === "review_coverage");
  if (coverage) facts.push(fact("recap.review_coverage", "Review coverage", coverage.value, "percent", coverage.display, w));

  const topReviewer = top(contributors, (c) => c.reviewsGiven);
  if (topReviewer && topReviewer.reviewsGiven > 0) {
    facts.push(fact("recap.top_reviewer", `Most reviews given: ${topReviewer.login}`, topReviewer.reviewsGiven, "count", `${topReviewer.reviewsGiven} reviews`, w));
  }
  const topAuthor = top(contributors, (c) => c.prsMerged);
  if (topAuthor && topAuthor.prsMerged > 0) {
    facts.push(fact("recap.top_author", `Most PRs merged: ${topAuthor.login}`, topAuthor.prsMerged, "count", `${topAuthor.prsMerged} PRs`, w));
  }

  const busiest = top(trend.series, (p) => p.prsMerged);
  if (busiest && busiest.prsMerged > 0) {
    facts.push(
      fact(
        "recap.busiest_stretch",
        `Busiest stretch: ${day(busiest.window.since)}–${day(busiest.window.until)}`,
        busiest.prsMerged,
        "count",
        `${busiest.prsMerged} PRs merged`,
        w,
      ),
    );
  }

  if (badgeCounts.good_neighbor) facts.push(fact("recap.good_neighbors", "Good Neighbor badges awarded", badgeCounts.good_neighbor, "count", `${badgeCounts.good_neighbor}`, w));
  if (badgeCounts.lone_guardian) facts.push(fact("recap.lone_guardians", "Lone Guardian (bus-factor) warnings", badgeCounts.lone_guardian, "count", `${badgeCounts.lone_guardian}`, w));

  return facts;
}
