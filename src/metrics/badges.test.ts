import { describe, it, expect } from "vitest";
import { awardBadges } from "./badges.js";
import type { ContributorStats } from "./contributor-types.js";

function stats(over: Partial<ContributorStats> = {}): ContributorStats {
  return {
    login: "x",
    prsAuthored: 0,
    prsMerged: 0,
    linesChanged: 0,
    reviewsGiven: 0,
    reviewCommentsGiven: 0,
    authorsReviewed: 0,
    medianResponsivenessHours: null,
    soleReviewerCount: 0,
    totalCommits: 0,
    nightCommits: 0,
    earlyCommits: 0,
    ...over,
  };
}

const ids = (s: ContributorStats): string[] => awardBadges(s).map((b) => b.id);

describe("awardBadges", () => {
  it("Good Neighbor: reviews more than authored (min 3)", () => {
    expect(ids(stats({ reviewsGiven: 5, prsAuthored: 2 }))).toContain("good_neighbor");
    expect(ids(stats({ reviewsGiven: 2, prsAuthored: 0 }))).not.toContain("good_neighbor"); // below min
  });

  it("Unblocker: fast median first review", () => {
    expect(ids(stats({ reviewsGiven: 4, medianResponsivenessHours: 3 }))).toContain("unblocker");
    expect(ids(stats({ reviewsGiven: 4, medianResponsivenessHours: 20 }))).not.toContain("unblocker");
  });

  it("Connector: reviews 4+ distinct authors", () => {
    expect(ids(stats({ authorsReviewed: 4 }))).toContain("connector");
    expect(ids(stats({ authorsReviewed: 3 }))).not.toContain("connector");
  });

  it("Lone Guardian is a warning badge for sole-reviewer concentration", () => {
    const badges = awardBadges(stats({ soleReviewerCount: 3 }));
    const lg = badges.find((b) => b.id === "lone_guardian");
    expect(lg?.warning).toBe(true);
  });

  it("Night Owl / Early Bird need ≥60% of ≥5 commits in the bucket", () => {
    expect(ids(stats({ totalCommits: 10, nightCommits: 7 }))).toContain("night_owl");
    expect(ids(stats({ totalCommits: 10, earlyCommits: 7 }))).toContain("early_bird");
    expect(ids(stats({ totalCommits: 3, nightCommits: 3 }))).not.toContain("night_owl"); // too few commits
  });
});
