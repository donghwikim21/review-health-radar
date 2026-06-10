import type { RepoRef, Window } from "../domain/types.js";

/** Raw per-contributor stats computed from a window's activity (no new fetches). */
export interface ContributorStats {
  login: string;
  prsAuthored: number;
  prsMerged: number;
  linesChanged: number;
  reviewsGiven: number;
  reviewCommentsGiven: number;
  /** Distinct PR authors whose code this person reviewed (collaboration breadth). */
  authorsReviewed: number;
  /** Median hours from a PR opening to this person's first review on it. */
  medianResponsivenessHours: number | null;
  /** PRs on which this person was the only human reviewer (knowledge-silo risk). */
  soleReviewerCount: number;
  totalCommits: number;
  nightCommits: number;
  earlyCommits: number;
}

/**
 * Multidimensional attributes (0–100, normalised within the team). Deliberately
 * separate axes, NOT summed into one rankable score — different kinds of
 * contribution are different, and a single number would invite gaming.
 */
export interface Attributes {
  velocity: number;
  collaboration: number;
  responsiveness: number;
  breadth: number;
  thoroughness: number;
}

export interface Badge {
  id: string;
  label: string;
  emoji: string;
  description: string;
  /** True for warning badges (surface a risk, e.g. bus-factor) rather than praise. */
  warning?: boolean;
}

export interface CharacterSheet {
  login: string;
  archetype: string;
  attributes: Attributes;
  badges: Badge[];
  stats: ContributorStats;
}

export interface ContributorReport {
  repo: RepoRef;
  window: Window;
  sheets: CharacterSheet[];
  /** How many contributors hold each badge id (team view). */
  badgeCounts: Record<string, number>;
  generatedAt: string;
}
