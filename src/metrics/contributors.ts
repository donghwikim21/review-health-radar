import type { PullRequest, RepoActivity, Review } from "../domain/types.js";
import { median } from "./stats.js";
import type { ContributorStats } from "./contributor-types.js";

const ENGAGED_STATES = new Set<Review["state"]>(["APPROVED", "CHANGES_REQUESTED", "COMMENTED"]);

/** GitHub bot accounts (e.g. "dependabot[bot]") — excluded from contributor stats. */
export function isBot(login: string | null): boolean {
  return login !== null && login.includes("[bot]");
}

interface Acc {
  prsAuthored: number;
  prsMerged: number;
  linesChanged: number;
  reviewsGiven: number;
  reviewCommentsGiven: number;
  authorsReviewed: Set<string>;
  responsiveness: number[];
  soleReviewerCount: number;
  totalCommits: number;
  nightCommits: number;
  earlyCommits: number;
}

const emptyAcc = (): Acc => ({
  prsAuthored: 0,
  prsMerged: 0,
  linesChanged: 0,
  reviewsGiven: 0,
  reviewCommentsGiven: 0,
  authorsReviewed: new Set(),
  responsiveness: [],
  soleReviewerCount: 0,
  totalCommits: 0,
  nightCommits: 0,
  earlyCommits: 0,
});

/** Reviews by a non-bot human other than the PR author that represent real engagement. */
function humanReviews(pr: PullRequest): Review[] {
  return pr.reviews.filter(
    (r) => r.author !== null && !isBot(r.author) && r.author !== pr.author && ENGAGED_STATES.has(r.state),
  );
}

/**
 * Per-contributor stats over the window cohort. Pure; bots and self-reviews are
 * excluded. "Reviews given", "breadth", and "responsiveness" deliberately surface
 * the *invisible* collaborative labor that commit counts miss.
 */
export function computeContributors(activity: RepoActivity): ContributorStats[] {
  const accs = new Map<string, Acc>();
  const get = (login: string): Acc => {
    let a = accs.get(login);
    if (!a) { a = emptyAcc(); accs.set(login, a); }
    return a;
  };

  for (const pr of activity.pullRequests) {
    if (pr.author && !isBot(pr.author)) {
      const a = get(pr.author);
      a.prsAuthored++;
      if (pr.mergedAt) a.prsMerged++;
    }

    const reviews = humanReviews(pr);
    // Group this PR's reviews by reviewer to derive each reviewer's first-review latency.
    const byReviewer = new Map<string, Review[]>();
    for (const r of reviews) {
      byReviewer.set(r.author!, [...(byReviewer.get(r.author!) ?? []), r]);
    }
    for (const [login, rs] of byReviewer) {
      const a = get(login);
      a.reviewsGiven += rs.length;
      a.reviewCommentsGiven += rs.reduce((s, r) => s + r.commentCount, 0);
      if (pr.author && pr.author !== login) a.authorsReviewed.add(pr.author);
      const submitted = rs.map((r) => r.submittedAt).filter((s): s is string => s !== null);
      if (submitted.length > 0) {
        const first = Math.min(...submitted.map((s) => Date.parse(s)));
        const hours = (first - Date.parse(pr.createdAt)) / 3_600_000;
        a.responsiveness.push(Math.max(0, hours));
      }
    }
    // Sole-reviewer (knowledge-silo) signal: exactly one distinct human reviewer.
    if (byReviewer.size === 1) {
      get([...byReviewer.keys()][0]!).soleReviewerCount++;
    }
  }

  for (const commit of activity.commits) {
    if (!commit.author || isBot(commit.author)) continue;
    const a = get(commit.author);
    a.totalCommits++;
    a.linesChanged += commit.additions + commit.deletions;
    const hour = new Date(commit.committedDate).getUTCHours();
    if (hour >= 22 || hour < 5) a.nightCommits++;
    else if (hour >= 5 && hour < 9) a.earlyCommits++;
  }

  return [...accs.entries()].map(([login, a]) => ({
    login,
    prsAuthored: a.prsAuthored,
    prsMerged: a.prsMerged,
    linesChanged: a.linesChanged,
    reviewsGiven: a.reviewsGiven,
    reviewCommentsGiven: a.reviewCommentsGiven,
    authorsReviewed: a.authorsReviewed.size,
    medianResponsivenessHours: median(a.responsiveness),
    soleReviewerCount: a.soleReviewerCount,
    totalCommits: a.totalCommits,
    nightCommits: a.nightCommits,
    earlyCommits: a.earlyCommits,
  }));
}
