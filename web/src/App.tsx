import { useState } from "react";
import { fetchNarrative, fetchReport, type Query } from "./api";
import type { Confidence, Fact, HealthBand, NarrativeResult, ReviewHealthReport } from "./types";

const BAND_LABEL: Record<HealthBand, string> = { healthy: "Healthy", watch: "Watch", "at-risk": "At risk" };

function BandBadge({ band }: { band: HealthBand }) {
  return <span className={`badge badge-${band}`}>{BAND_LABEL[band]}</span>;
}

function trendText(fact: Fact): string {
  if (!fact.trend) return "—";
  const arrow = fact.trend.direction === "up" ? "▲" : fact.trend.direction === "down" ? "▼" : "▬";
  const z = fact.trend.zScore === null ? "" : ` (z=${fact.trend.zScore.toFixed(1)})`;
  return `${arrow} vs ${fact.trend.baselineValue}${z}`;
}

function FactsTable({ facts, anomalies, highlight }: { facts: Fact[]; anomalies: string[]; highlight: string | null }) {
  return (
    <table className="facts">
      <thead>
        <tr><th>Signal</th><th>Value</th><th>n</th><th>Trend</th></tr>
      </thead>
      <tbody>
        {facts.map((f) => (
          <tr
            key={f.id}
            id={`fact-${f.id}`}
            className={`${highlight === f.id ? "row-highlight" : ""} ${anomalies.includes(f.id) ? "row-anomaly" : ""}`}
          >
            <td>
              {f.label} {anomalies.includes(f.id) && <span className="tag tag-anomaly">anomaly</span>}
              {!f.reliable && <span className="tag tag-low">low n</span>}
            </td>
            <td className="num">{f.display}</td>
            <td className="num muted">{f.sampleSize}</td>
            <td className="muted small">{trendText(f)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="meter">
      <div className="meter-head"><span>{label}</span><span className="num">{value.toFixed(2)}</span></div>
      <div className="meter-track"><div className="meter-fill" style={{ width: `${Math.round(value * 100)}%` }} /></div>
    </div>
  );
}

function ConfidencePanel({ c }: { c: Confidence }) {
  return (
    <div className="confidence">
      <Meter label="Overall confidence" value={c.overall} />
      <div className="confidence-parts">
        <Meter label="Statistical (from the data)" value={c.statistical} />
        <Meter label="Reasoning (from the model)" value={c.reasoning} />
      </div>
      <p className="method">{c.method}</p>
    </div>
  );
}

function NarrativeCard({ narrative, onHover }: { narrative: NarrativeResult; onHover: (id: string | null) => void }) {
  return (
    <section className="card narrative">
      <div className="card-head">
        <h2>{narrative.headline}</h2>
        <BandBadge band={narrative.band} />
      </div>
      <p className="summary">{narrative.summary}</p>

      <h3>Root-cause hypothesis</h3>
      <p>{narrative.hypothesis.statement}</p>

      <h3>Evidence chain</h3>
      <div className="chips">
        {narrative.hypothesis.evidence.map((e) => (
          <button
            key={e.factId}
            className={`chip ${e.isAnomaly ? "chip-anomaly" : ""}`}
            onMouseEnter={() => onHover(e.factId)}
            onMouseLeave={() => onHover(null)}
            onClick={() => document.getElementById(`fact-${e.factId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
            title={e.relevance}
          >
            <code>{e.factId}</code> = {e.display}{e.isAnomaly ? " ⚠" : ""}
          </button>
        ))}
      </div>

      <ConfidencePanel c={narrative.hypothesis.confidence} />

      {narrative.caveats.length > 0 && (
        <>
          <h3>Caveats</h3>
          <ul className="caveats">{narrative.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      )}

      <p className="meta">
        model: <code>{narrative.meta.model}</code> · regenerations: {narrative.meta.regenerations}
        {narrative.meta.cached && " · cached"}
      </p>
    </section>
  );
}

const DEFAULT_QUERY: Query = { owner: "facebook", repo: "react", since: "2026-05-01", until: "2026-06-01" };

export function App() {
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [report, setReport] = useState<ReviewHealthReport | null>(null);
  const [narrative, setNarrative] = useState<NarrativeResult | null>(null);
  const [loading, setLoading] = useState<"report" | "narrative" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const set = (k: keyof Query) => (e: React.ChangeEvent<HTMLInputElement>) => setQuery({ ...query, [k]: e.target.value });

  async function analyze() {
    setLoading("report"); setError(null); setNarrative(null);
    try { setReport(await fetchReport(query)); }
    catch (e) { setError((e as Error).message); setReport(null); }
    finally { setLoading(null); }
  }

  async function explain() {
    setLoading("narrative"); setError(null);
    try {
      const n = await fetchNarrative(query);
      setNarrative(n);
      if (!report) setReport((r) => r ?? null);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(null); }
  }

  const facts = report?.facts ?? narrative?.facts ?? [];
  const anomalies = report?.anomalies ?? [];

  return (
    <div className="app">
      <header>
        <h1>Review Health Radar</h1>
        <p className="tagline">Team review-health signals for a GitHub repo, with a grounded LLM narrative over the numbers.</p>
      </header>

      <form className="controls" onSubmit={(e) => { e.preventDefault(); void analyze(); }}>
        <label>Owner<input value={query.owner} onChange={set("owner")} /></label>
        <label>Repo<input value={query.repo} onChange={set("repo")} /></label>
        <label>Since<input type="date" value={query.since} onChange={set("since")} /></label>
        <label>Until<input type="date" value={query.until} onChange={set("until")} /></label>
        <button type="submit" disabled={loading !== null}>{loading === "report" ? "Analyzing…" : "Analyze"}</button>
        <button type="button" className="secondary" disabled={loading !== null} onClick={() => void explain()}>
          {loading === "narrative" ? "Explaining…" : "Explain with AI"}
        </button>
      </form>

      {error && <div className="error">⚠ {error}</div>}

      {report && (
        <section className="card">
          <div className="card-head">
            <h2>{report.repo.owner}/{report.repo.name}</h2>
            <BandBadge band={report.band} />
          </div>
          <ul className="reasons">{report.bandReasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          <FactsTable facts={facts} anomalies={anomalies} highlight={highlight} />
          <p className="meta">
            {report.population.prsCreated} PRs created · {report.population.prsMerged} merged ·
            {" "}{report.population.commits} commits · baseline windows: {report.baselineWindows}
          </p>
        </section>
      )}

      {narrative && <NarrativeCard narrative={narrative} onHover={setHighlight} />}

      {!report && !narrative && !error && (
        <p className="hint">Enter a public repo and date range, then <strong>Analyze</strong> for the numbers or <strong>Explain with AI</strong> for the narrative.</p>
      )}
    </div>
  );
}
