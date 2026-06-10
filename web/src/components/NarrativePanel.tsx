import { EvidenceChain } from "./EvidenceChain";
import { VerdictBadge } from "./Badges";
import type { NarrativeResult } from "../types";

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <div className="meter-head"><span>{label}</span><span className="num">{value.toFixed(2)}</span></div>
      <div className="meter-track"><div className="meter-fill" style={{ width: `${Math.round(value * 100)}%` }} /></div>
    </div>
  );
}

export function NarrativePanel({ narrative, onHover }: { narrative: NarrativeResult; onHover: (id: string | null) => void }) {
  const c = narrative.hypothesis.confidence;
  const v = narrative.verification;
  return (
    <section className="card narrative">
      <h3 className="eyebrow">AI narrative</h3>
      <p className="summary">{narrative.summary}</p>

      <h4>Root-cause hypothesis</h4>
      <p className="hypothesis">{narrative.hypothesis.statement}</p>

      <h4>Evidence chain</h4>
      <EvidenceChain evidence={narrative.hypothesis.evidence} onHover={onHover} tone="support" />

      <h4>Confidence breakdown</h4>
      <div className="conf-grid">
        <Meter label="Statistical (from the data)" value={c.statistical} />
        <Meter label="Reasoning (from the model)" value={c.reasoning} />
        {c.verification && <Meter label={`Skeptic multiplier (${c.verification.verdict})`} value={c.verification.multiplier} />}
      </div>
      <p className="method">{c.method}</p>

      {v && (
        <div className={`verify-block verify-${v.verdict}`}>
          <div className="verify-head">
            <h4>Adversarial verification</h4>
            <VerdictBadge verdict={v.verdict} />
          </div>
          <p className="rationale">{v.rationale}</p>
          {v.refutingEvidence.length > 0 && (
            <>
              <div className="muted small">Facts that undercut the hypothesis:</div>
              <EvidenceChain evidence={v.refutingEvidence} onHover={onHover} tone="refute" />
            </>
          )}
        </div>
      )}

      {narrative.caveats.length > 0 && (
        <>
          <h4>Caveats</h4>
          <ul className="caveats">{narrative.caveats.map((cav, i) => <li key={i}>{cav}</li>)}</ul>
        </>
      )}

      <p className="meta">
        model <code>{narrative.meta.model}</code> · regenerations {narrative.meta.regenerations}
        {narrative.meta.cached && " · cached"}
      </p>
    </section>
  );
}
