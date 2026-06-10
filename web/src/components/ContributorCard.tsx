import { RadarChart } from "./RadarChart";
import { ATTRIBUTE_AXES, type Badge, type CharacterSheet } from "../types";

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <span className={`badge-chip ${badge.warning ? "badge-chip-warning" : ""}`} title={badge.description}>
      {badge.emoji} {badge.label}
    </span>
  );
}

export function ContributorCard({ sheet }: { sheet: CharacterSheet }) {
  const axes = ATTRIBUTE_AXES.map(({ key, label }) => ({ label, value: sheet.attributes[key] }));
  return (
    <div className="contributor-card">
      <div className="contributor-head">
        <span className="contributor-login">{sheet.login}</span>
        <span className="contributor-archetype">{sheet.archetype}</span>
      </div>
      <RadarChart axes={axes} />
      <div className="contributor-stats muted small">
        {sheet.stats.prsMerged} merged · {sheet.stats.reviewsGiven} reviews · {sheet.stats.authorsReviewed} teammates
      </div>
      {sheet.badges.length > 0 && (
        <div className="badge-chips">
          {sheet.badges.map((b) => (
            <BadgeChip key={b.id} badge={b} />
          ))}
        </div>
      )}
    </div>
  );
}
