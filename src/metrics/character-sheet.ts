import { round } from "./stats.js";
import { awardBadges } from "./badges.js";
import type { Attributes, CharacterSheet, ContributorStats } from "./contributor-types.js";

/** Archetype label for each dominant attribute axis. */
const ARCHETYPE: Record<keyof Attributes, string> = {
  velocity: "The Sprinter",
  collaboration: "The Mentor",
  responsiveness: "The Responder",
  breadth: "The Connector",
  thoroughness: "The Guardian",
};

/** If the top two attributes are within this many points, the contributor is a Generalist. */
const GENERALIST_DELTA = 10;

const shareOfMax = (value: number, max: number): number => (max > 0 ? round((value / max) * 100, 0) : 0);

/** Faster reviewers score higher: 100 for the team's fastest, scaled by inverse ratio. */
function responsivenessScore(latency: number | null, fastest: number | null): number {
  if (latency === null || fastest === null) return 0;
  if (latency <= 0) return 100;
  return round(Math.min(100, (fastest / latency) * 100), 0);
}

function archetypeFor(attrs: Attributes): string {
  const entries = (Object.entries(attrs) as [keyof Attributes, number][]).sort((a, b) => b[1] - a[1]);
  const [top, second] = entries;
  if (!top || top[1] === 0) return "The Generalist";
  if (second && top[1] - second[1] < GENERALIST_DELTA) return "The Generalist";
  return ARCHETYPE[top[0]];
}

const activityScore = (s: ContributorStats): number => s.prsAuthored + s.reviewsGiven + s.totalCommits;

/**
 * Builds character sheets from raw contributor stats. Attributes are normalised
 * *within the team* (share-of-leader), so they describe shape, not an absolute
 * cross-person rank. Returns sheets sorted by overall activity plus team-wide
 * badge counts.
 */
export function buildCharacterSheets(stats: ContributorStats[]): {
  sheets: CharacterSheet[];
  badgeCounts: Record<string, number>;
} {
  const maxVelocity = Math.max(0, ...stats.map((s) => s.prsMerged));
  const maxCollab = Math.max(0, ...stats.map((s) => s.reviewsGiven));
  const maxBreadth = Math.max(0, ...stats.map((s) => s.authorsReviewed));
  const maxThorough = Math.max(0, ...stats.map((s) => (s.reviewsGiven > 0 ? s.reviewCommentsGiven / s.reviewsGiven : 0)));
  const latencies = stats.map((s) => s.medianResponsivenessHours).filter((l): l is number => l !== null);
  const fastest = latencies.length > 0 ? Math.min(...latencies) : null;

  const badgeCounts: Record<string, number> = {};

  const sheets: CharacterSheet[] = stats
    .map((s) => {
      const attributes: Attributes = {
        velocity: shareOfMax(s.prsMerged, maxVelocity),
        collaboration: shareOfMax(s.reviewsGiven, maxCollab),
        responsiveness: responsivenessScore(s.medianResponsivenessHours, fastest),
        breadth: shareOfMax(s.authorsReviewed, maxBreadth),
        thoroughness: shareOfMax(s.reviewsGiven > 0 ? s.reviewCommentsGiven / s.reviewsGiven : 0, maxThorough),
      };
      const badges = awardBadges(s);
      for (const b of badges) badgeCounts[b.id] = (badgeCounts[b.id] ?? 0) + 1;
      return { login: s.login, archetype: archetypeFor(attributes), attributes, badges, stats: s };
    })
    .sort((a, b) => activityScore(b.stats) - activityScore(a.stats));

  return { sheets, badgeCounts };
}
