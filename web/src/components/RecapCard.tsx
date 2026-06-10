import type { RecapResult } from "../types";

/** "Repo Wrapped" recap — playful, but every claim shows the facts it cites. */
export function RecapCard({ recap }: { recap: RecapResult }) {
  return (
    <section className="card recap">
      <h3 className="eyebrow">Repo Wrapped</h3>
      <h2 className="recap-title">{recap.title}</h2>

      <ul className="recap-highlights">
        {recap.highlights.map((h, i) => (
          <li key={i}>
            <span>{h.text}</span>
            <span className="recap-cites">
              {h.evidence.map((e) => (
                <code key={e.factId} title={`${e.label}: ${e.display}`}>{e.display}</code>
              ))}
            </span>
          </li>
        ))}
      </ul>

      {recap.mvp && (
        <div className="recap-mvp">
          <div className="recap-mvp-head">🏆 MVP — <strong>{recap.mvp.login}</strong></div>
          <p>{recap.mvp.reason}</p>
          <div className="recap-cites">
            {recap.mvp.evidence.map((e) => (
              <code key={e.factId} title={e.label}>{e.label}: {e.display}</code>
            ))}
          </div>
        </div>
      )}

      <p className="meta">model <code>{recap.meta.model}</code> · every line cites a real ledger fact{recap.meta.cached && " · cached"}</p>
    </section>
  );
}
