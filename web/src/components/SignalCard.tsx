import { Sparkline } from "./Sparkline";
import type { Fact } from "../types";

interface Props {
  fact: Fact;
  spark: (number | null)[];
  isAnomaly: boolean;
  highlighted: boolean;
  onHover: (id: string | null) => void;
}

function trendLabel(fact: Fact): string {
  if (!fact.trend) return "no baseline";
  const arrow = fact.trend.direction === "up" ? "▲" : fact.trend.direction === "down" ? "▼" : "▬";
  const z = fact.trend.zScore === null ? "" : ` · z=${fact.trend.zScore.toFixed(1)}`;
  return `${arrow} vs ${fact.trend.baselineValue}${z}`;
}

export function SignalCard({ fact, spark, isAnomaly, highlighted, onHover }: Props) {
  const color = isAnomaly ? "#e5484d" : "#6ea8fe";
  return (
    <div
      id={`fact-${fact.id}`}
      className={`signal-card ${highlighted ? "highlighted" : ""} ${isAnomaly ? "anomaly" : ""}`}
      onMouseEnter={() => onHover(fact.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="signal-head">
        <span className="signal-label" title={fact.label}>{fact.label}</span>
        <div className="signal-tags">
          {isAnomaly && <span className="tag tag-anomaly" title="≥2σ from baseline">anomaly</span>}
          {!fact.reliable && <span className="tag tag-low" title="Sample too small to trust">low n</span>}
        </div>
      </div>
      <div className="signal-value-row">
        <span className="signal-value">{fact.display}</span>
        <Sparkline values={spark} color={color} />
      </div>
      <div className="signal-foot">
        <span className="muted small">{trendLabel(fact)}</span>
        <span className="muted small">n={fact.sampleSize}</span>
      </div>
    </div>
  );
}
