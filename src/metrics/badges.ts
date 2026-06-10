import type { Badge, ContributorStats } from "./contributor-types.js";

/** Threshold below which a median first-review counts as "fast" (Unblocker). */
export const UNBLOCKER_MAX_HOURS = 8;

interface BadgeRule extends Badge {
  test: (s: ContributorStats) => boolean;
}

/**
 * Behaviour-based badges. Each is ONE testable rule, and they reward *good and
 * interesting behaviour* (reviewing, unblocking, breadth) rather than raw volume —
 * so they resist gaming. "Lone Guardian" is a warning badge: gamification used to
 * surface a risk (knowledge silo), not to praise.
 */
export const BADGE_RULES: BadgeRule[] = [
  {
    id: "good_neighbor",
    label: "Good Neighbor",
    emoji: "🤝",
    description: "Reviews more PRs than they author — carries hidden review load.",
    test: (s) => s.reviewsGiven >= 3 && s.reviewsGiven > s.prsAuthored,
  },
  {
    id: "unblocker",
    label: "Unblocker",
    emoji: "⚡",
    description: `Median first review under ${UNBLOCKER_MAX_HOURS}h — keeps others moving.`,
    test: (s) => s.reviewsGiven >= 3 && s.medianResponsivenessHours !== null && s.medianResponsivenessHours <= UNBLOCKER_MAX_HOURS,
  },
  {
    id: "connector",
    label: "Connector",
    emoji: "🌉",
    description: "Reviews code from 4+ different teammates — bridges the team.",
    test: (s) => s.authorsReviewed >= 4,
  },
  {
    id: "lone_guardian",
    label: "Lone Guardian",
    emoji: "⚠️",
    description: "Sole reviewer on 3+ PRs — a knowledge-silo / bus-factor risk.",
    warning: true,
    test: (s) => s.soleReviewerCount >= 3,
  },
  {
    id: "night_owl",
    label: "Night Owl",
    emoji: "🦉",
    description: "Most commits land late at night (UTC; timezone-approximate).",
    test: (s) => s.totalCommits >= 5 && s.nightCommits / s.totalCommits >= 0.6,
  },
  {
    id: "early_bird",
    label: "Early Bird",
    emoji: "🌅",
    description: "Most commits land in the early morning (UTC; timezone-approximate).",
    test: (s) => s.totalCommits >= 5 && s.earlyCommits / s.totalCommits >= 0.6,
  },
];

const stripTest = ({ id, label, emoji, description, warning }: BadgeRule): Badge => ({
  id, label, emoji, description, ...(warning ? { warning } : {}),
});

export function awardBadges(stats: ContributorStats): Badge[] {
  return BADGE_RULES.filter((rule) => rule.test(stats)).map(stripTest);
}
