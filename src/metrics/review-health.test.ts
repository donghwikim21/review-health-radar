import { describe, it, expect } from "vitest";
import { computeWindowMetrics } from "./review-health.js";
import type { Commit, PullRequest, RepoActivity, Review } from "../domain/types.js";

const T0 = Date.parse("2026-05-01T00:00:00Z");
const at = (ms: number): string => new Date(T0 + ms).toISOString();
const HOUR = 3_600_000;
const MIN = 60_000;

function review(partial: Partial<Review> & { author: string }): Review {
  return {
    state: "APPROVED",
    submittedAt: at(HOUR),
    commentCount: 0,
    ...partial,
  };
}

let prCounter = 0;
function pr(partial: Partial<PullRequest>): PullRequest {
  prCounter += 1;
  return {
    number: prCounter,
    author: `author${prCounter}`,
    authorAssociation: "CONTRIBUTOR",
    createdAt: at(0),
    mergedAt: null,
    closedAt: null,
    reviews: [],
    reviewTotalCount: 0,
    ...partial,
  };
}

function activity(pullRequests: PullRequest[], commits: Commit[] = []): RepoActivity {
  return {
    repo: { owner: "acme", name: "widgets" },
    window: { since: at(0), until: at(30 * 24 * HOUR) },
    pullRequests,
    commits,
    fetchedAt: at(0),
  };
}

describe("computeWindowMetrics", () => {
  it("returns zeroed, safe values for an empty cohort (no division by zero)", () => {
    const m = computeWindowMetrics(activity([]));
    expect(m.prsCreated).toBe(0);
    expect(m.reviewCoverage).toBe(0);
    expect(m.rubberStampRate).toBe(0);
    expect(m.medianTimeToFirstReviewHours).toBeNull();
    expect(m.reviewerTop1Share).toBe(0);
    expect(m.reviewerGini).toBe(0);
  });

  it("computes coverage, rubber-stamp, TTFR and reviewer load on a mixed cohort", () => {
    const prs: PullRequest[] = [
      // PR1: merged, reviewed by alice (APPROVED, 1 comment) at +2h, plus a self-review (ignored)
      pr({
        author: "owner",
        mergedAt: at(3 * HOUR),
        reviews: [
          review({ author: "alice", state: "APPROVED", commentCount: 1, submittedAt: at(2 * HOUR) }),
          review({ author: "owner", state: "COMMENTED", submittedAt: at(30 * MIN) }), // self-review excluded
        ],
      }),
      // PR2: merged, approved by bob in 2 min with no comments => rubber stamp
      pr({
        author: "owner",
        mergedAt: at(HOUR),
        reviews: [review({ author: "bob", state: "APPROVED", commentCount: 0, submittedAt: at(2 * MIN) })],
      }),
      // PR3: merged with NO reviews => counts against coverage
      pr({ author: "owner", mergedAt: at(HOUR), reviews: [] }),
      // PR4: merged, changes requested by alice at +10h, no comments => reviewed, not rubber (not approved)
      pr({
        author: "owner",
        mergedAt: at(11 * HOUR),
        reviews: [review({ author: "alice", state: "CHANGES_REQUESTED", commentCount: 0, submittedAt: at(10 * HOUR) })],
      }),
      // PR5: still open, commented by alice at +1h => contributes to TTFR + load, not coverage
      pr({
        author: "owner",
        reviews: [review({ author: "alice", state: "COMMENTED", submittedAt: at(HOUR) })],
      }),
    ];
    const m = computeWindowMetrics(activity(prs));

    expect(m.prsCreated).toBe(5);
    expect(m.prsMerged).toBe(4);
    expect(m.prsOpen).toBe(1);
    expect(m.prsMergedReviewed).toBe(3); // PR1, PR2, PR4 (PR3 unreviewed)
    expect(m.reviewCoverage).toBeCloseTo(0.75, 5); // 3 of 4 merged were reviewed

    expect(m.rubberStampRate).toBeCloseTo(1 / 3, 5); // PR2 of {PR1,PR2,PR4}

    // TTFR over reviewed cohort PRs: PR2(2min), PR5(1h), PR1(2h), PR4(10h) => median 1.5h
    expect(m.medianTimeToFirstReviewHours).toBeCloseTo(1.5, 5);

    // Human reviews: alice x3 (PR1,PR4,PR5), bob x1 (PR2) => top1 = 3/4
    expect(m.totalHumanReviews).toBe(4);
    expect(m.reviewerTop1Share).toBeCloseTo(0.75, 5);
    expect(m.reviewerGini).toBeCloseTo(0.25, 5);
  });

  it("computes median time to merge over the merged cohort", () => {
    const prs: PullRequest[] = [
      pr({ author: "owner", mergedAt: at(2 * HOUR) }), // 2h
      pr({ author: "owner", mergedAt: at(6 * HOUR) }), // 6h
      pr({ author: "owner", mergedAt: at(10 * HOUR) }), // 10h
      pr({ author: "owner" }), // open — excluded
    ];
    const m = computeWindowMetrics(activity(prs));
    expect(m.prsMerged).toBe(3);
    expect(m.medianTimeToMergeHours).toBeCloseTo(6, 5); // median of [2,6,10]
  });

  it("aggregates commit lines changed", () => {
    const commits: Commit[] = [
      { oid: "a", author: "x", committedDate: at(0), additions: 10, deletions: 2 },
      { oid: "b", author: "y", committedDate: at(0), additions: 5, deletions: 5 },
    ];
    const m = computeWindowMetrics(activity([], commits));
    expect(m.commits).toBe(2);
    expect(m.linesChanged).toBe(22);
  });
});
