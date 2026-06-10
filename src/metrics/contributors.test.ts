import { describe, it, expect } from "vitest";
import { computeContributors } from "./contributors.js";
import type { Commit, PullRequest, RepoActivity, Review } from "../domain/types.js";

const ISO = (s: string): string => new Date(s).toISOString();

function review(author: string, submittedAt: string, over: Partial<Review> = {}): Review {
  return { author, state: "APPROVED", submittedAt, commentCount: 0, ...over };
}

let n = 0;
function pr(author: string, reviews: Review[], over: Partial<PullRequest> = {}): PullRequest {
  n += 1;
  return {
    number: n,
    author,
    authorAssociation: "CONTRIBUTOR",
    createdAt: ISO("2026-05-01T00:00:00Z"),
    mergedAt: ISO("2026-05-02T00:00:00Z"),
    closedAt: null,
    reviews,
    reviewTotalCount: reviews.length,
    ...over,
  };
}

function activity(pullRequests: PullRequest[], commits: Commit[] = []): RepoActivity {
  return {
    repo: { owner: "acme", name: "widgets" },
    window: { since: ISO("2026-05-01T00:00:00Z"), until: ISO("2026-06-01T00:00:00Z") },
    pullRequests,
    commits,
    fetchedAt: ISO("2026-05-01T00:00:00Z"),
  };
}

describe("computeContributors", () => {
  const prs: PullRequest[] = [
    // PR1 by owner: alice (+2h) and bob (+4h) review; owner self-review (ignored)
    pr("owner", [
      review("alice", ISO("2026-05-01T02:00:00Z"), { commentCount: 2 }),
      review("bob", ISO("2026-05-01T04:00:00Z"), { state: "COMMENTED" }),
      review("owner", ISO("2026-05-01T00:30:00Z"), { state: "COMMENTED" }), // self → excluded
    ]),
    // PR2 by owner: alice only (+1h) → alice is sole reviewer
    pr("owner", [review("alice", ISO("2026-05-01T01:00:00Z"))]),
    // PR3 by alice: only a bot review → no human reviews
    pr("alice", [review("dependabot[bot]", ISO("2026-05-01T01:00:00Z"))]),
  ];
  const commits: Commit[] = [
    { oid: "a1", author: "alice", committedDate: ISO("2026-05-01T23:00:00Z"), additions: 10, deletions: 5 }, // night
    { oid: "a2", author: "alice", committedDate: ISO("2026-05-02T06:00:00Z"), additions: 1, deletions: 1 }, // early
    { oid: "b1", author: "dependabot[bot]", committedDate: ISO("2026-05-02T12:00:00Z"), additions: 9, deletions: 9 }, // bot → ignored
  ];
  const byLogin = Object.fromEntries(computeContributors(activity(prs, commits)).map((s) => [s.login, s]));

  it("excludes bots entirely", () => {
    expect(byLogin["dependabot[bot]"]).toBeUndefined();
  });

  it("credits reviews to the reviewer, excluding self-reviews", () => {
    expect(byLogin["alice"]!.reviewsGiven).toBe(2); // PR1 + PR2
    expect(byLogin["bob"]!.reviewsGiven).toBe(1); // PR1
    expect(byLogin["owner"]?.reviewsGiven ?? 0).toBe(0); // self-review didn't count
  });

  it("computes authoring, breadth, responsiveness and sole-reviewer counts", () => {
    const alice = byLogin["alice"]!;
    expect(alice.prsAuthored).toBe(1); // PR3
    expect(alice.authorsReviewed).toBe(1); // only reviewed owner's PRs
    expect(alice.medianResponsivenessHours).toBeCloseTo(1.5, 5); // [2h, 1h]
    expect(alice.soleReviewerCount).toBe(1); // PR2
    expect(byLogin["bob"]!.soleReviewerCount).toBe(0); // PR1 had two reviewers
  });

  it("aggregates commits and time-of-day buckets, ignoring bot commits", () => {
    const alice = byLogin["alice"]!;
    expect(alice.totalCommits).toBe(2);
    expect(alice.linesChanged).toBe(17);
    expect(alice.nightCommits).toBe(1);
    expect(alice.earlyCommits).toBe(1);
  });
});
