import type { HealthBand, Verdict } from "../types";

const BAND_LABEL: Record<HealthBand, string> = { healthy: "Healthy", watch: "Watch", "at-risk": "At risk" };

export function BandBadge({ band }: { band: HealthBand }) {
  return <span className={`badge badge-${band}`}>{BAND_LABEL[band]}</span>;
}

const VERDICT_META: Record<Verdict, { label: string; cls: string; icon: string }> = {
  supported: { label: "Supported", cls: "verdict-supported", icon: "✓" },
  weak: { label: "Weak", cls: "verdict-weak", icon: "~" },
  refuted: { label: "Refuted", cls: "verdict-refuted", icon: "✗" },
};

/** The adversarial skeptic's verdict, color-coded. */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict];
  return (
    <span className={`badge ${m.cls}`} title="Adversarial skeptic verdict">
      <span className="verdict-icon">{m.icon}</span> Skeptic: {m.label}
    </span>
  );
}
