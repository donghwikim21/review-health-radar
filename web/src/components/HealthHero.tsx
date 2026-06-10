import { BandBadge } from "./Badges";
import { RadialGauge } from "./RadialGauge";
import type { NarrativeResult, ReviewHealthReport } from "../types";

interface Props {
  report: ReviewHealthReport;
  narrative: NarrativeResult | null;
}

const fmtDate = (iso: string): string => iso.slice(0, 10);

/** Top-of-dashboard summary: band, repo/window, AI headline (if present), confidence gauge. */
export function HealthHero({ report, narrative }: Props) {
  return (
    <section className="hero card">
      <div className="hero-main">
        <div className="hero-top">
          <BandBadge band={report.band} />
          <span className="hero-repo">
            {report.repo.owner}/{report.repo.name}
          </span>
          <span className="muted small">
            {fmtDate(report.window.since)} → {fmtDate(report.window.until)}
          </span>
        </div>
        <h2 className="hero-headline">
          {narrative ? narrative.headline : report.bandReasons[0] ?? "Review health summary"}
        </h2>
        <ul className="hero-reasons">
          {report.bandReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <div className="hero-pop muted small">
          {report.population.prsCreated} PRs created · {report.population.prsMerged} merged ·{" "}
          {report.population.commits} commits · {report.baselineWindows} baseline windows
        </div>
      </div>
      {narrative && (
        <div className="hero-gauge">
          <RadialGauge value={narrative.hypothesis.confidence.overall} label="AI confidence" />
        </div>
      )}
    </section>
  );
}
