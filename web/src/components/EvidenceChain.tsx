import type { EnrichedEvidence } from "../types";

interface Props {
  evidence: EnrichedEvidence[];
  onHover: (id: string | null) => void;
  tone?: "support" | "refute";
}

/** The evidence chain rendered as connected nodes pointing back to ledger facts. */
export function EvidenceChain({ evidence, onHover, tone = "support" }: Props) {
  if (evidence.length === 0) return <p className="muted small">No facts cited.</p>;
  return (
    <div className={`chain chain-${tone}`}>
      {evidence.map((e, i) => (
        <div key={e.factId} className="chain-item">
          {i > 0 && <span className="chain-link" aria-hidden />}
          <button
            className={`chain-node ${e.isAnomaly ? "node-anomaly" : ""} ${!e.reliable ? "node-low" : ""}`}
            title={e.relevance}
            onMouseEnter={() => onHover(e.factId)}
            onMouseLeave={() => onHover(null)}
            onClick={() => document.getElementById(`fact-${e.factId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            <code>{e.factId}</code>
            <span className="chain-val">{e.display}{e.isAnomaly ? " ⚠" : ""}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
