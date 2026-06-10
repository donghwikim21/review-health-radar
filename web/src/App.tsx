import { useState, type ChangeEvent } from "react";
import { fetchContributors, fetchNarrative, fetchRecap, fetchReport, fetchTrend, type Query } from "./api";
import {
  TREND_ACCESSOR,
  type Badge,
  type ContributorReport,
  type NarrativeResult,
  type RecapResult,
  type ReviewHealthReport,
  type ReviewHealthTrend,
} from "./types";
import { HealthHero } from "./components/HealthHero";
import { SignalCard } from "./components/SignalCard";
import { NarrativePanel } from "./components/NarrativePanel";
import { Legend } from "./components/Legend";
import { ContributorCard } from "./components/ContributorCard";
import { RecapCard } from "./components/RecapCard";

const DEFAULT_QUERY: Query = { owner: "honojs", repo: "hono", since: "2026-04-01", until: "2026-06-01" };

type View = "health" | "contributors";
type Loading = "report" | "narrative" | "contributors" | "recap" | null;

function sparkFor(id: string, trend: ReviewHealthTrend | null): (number | null)[] {
  const accessor = TREND_ACCESSOR[id];
  if (!trend || !accessor) return [];
  return trend.series.map((p) => accessor.get(p));
}

/** Build an id→{emoji,label,warning} lookup from the badges present on the sheets. */
function badgeMeta(report: ContributorReport): Map<string, Badge> {
  const m = new Map<string, Badge>();
  for (const s of report.sheets) for (const b of s.badges) m.set(b.id, b);
  return m;
}

export function App() {
  const [view, setView] = useState<View>("health");
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [report, setReport] = useState<ReviewHealthReport | null>(null);
  const [trend, setTrend] = useState<ReviewHealthTrend | null>(null);
  const [narrative, setNarrative] = useState<NarrativeResult | null>(null);
  const [contributors, setContributors] = useState<ContributorReport | null>(null);
  const [recap, setRecap] = useState<RecapResult | null>(null);
  const [loading, setLoading] = useState<Loading>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const set = (k: keyof Query) => (e: ChangeEvent<HTMLInputElement>) => setQuery({ ...query, [k]: e.target.value });
  const busy = loading !== null;

  async function loadReport(): Promise<void> {
    const [rep, tr] = await Promise.all([fetchReport(query), fetchTrend(query, 8)]);
    setReport(rep); setTrend(tr);
  }
  const run = async (kind: Loading, fn: () => Promise<void>) => {
    setLoading(kind); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setLoading(null); }
  };

  const analyze = () => run("report", async () => { setNarrative(null); await loadReport(); });
  const explain = () => run("narrative", async () => { if (!report) await loadReport(); setNarrative(await fetchNarrative(query)); });
  const loadContributors = () => run("contributors", async () => { setRecap(null); setContributors(await fetchContributors(query)); });
  const generateRecap = () => run("recap", async () => { if (!contributors) setContributors(await fetchContributors(query)); setRecap(await fetchRecap(query)); });

  const primary = view === "health" ? analyze : loadContributors;
  const secondary = view === "health" ? explain : generateRecap;
  const primaryLabel = view === "health" ? (loading === "report" ? "Analyzing…" : "Analyze") : (loading === "contributors" ? "Loading…" : "Load contributors");
  const secondaryLabel = view === "health" ? (loading === "narrative" ? "Thinking…" : "Explain with AI") : (loading === "recap" ? "Wrapping…" : "Generate recap");

  const meta = contributors ? badgeMeta(contributors) : new Map<string, Badge>();

  return (
    <div className="app">
      <header className="masthead">
        <h1>Review Health Radar</h1>
        <p className="tagline">Team review-health + contributor character sheets, with grounded, adversarially-verified AI.</p>
      </header>

      <div className="tabs">
        <button className={`tab ${view === "health" ? "active" : ""}`} onClick={() => setView("health")}>Review Health</button>
        <button className={`tab ${view === "contributors" ? "active" : ""}`} onClick={() => setView("contributors")}>Contributors</button>
      </div>

      <form className="controls" onSubmit={(e) => { e.preventDefault(); void primary(); }}>
        <label>Owner<input value={query.owner} onChange={set("owner")} /></label>
        <label>Repo<input value={query.repo} onChange={set("repo")} /></label>
        <label>Since<input type="date" value={query.since} onChange={set("since")} /></label>
        <label>Until<input type="date" value={query.until} onChange={set("until")} /></label>
        <button type="submit" disabled={busy}>{primaryLabel}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void secondary()}>{secondaryLabel}</button>
      </form>

      {error && <div className="error">⚠ {error}</div>}

      {view === "health" && (
        <>
          {loading === "report" && !report && <div className="skeleton-hero card" />}
          {report && (
            <>
              <HealthHero report={report} narrative={narrative} />
              <Legend />
              <div className="signal-grid">
                {report.facts.map((f) => (
                  <SignalCard key={f.id} fact={f} spark={sparkFor(f.id, trend)} isAnomaly={report.anomalies.includes(f.id)} highlighted={highlight === f.id} onHover={setHighlight} />
                ))}
              </div>
            </>
          )}
          {loading === "narrative" && !narrative && <div className="skeleton-narrative card" />}
          {narrative && <NarrativePanel narrative={narrative} onHover={setHighlight} />}
          {!report && !narrative && !busy && !error && (
            <p className="hint">Enter a public repo and date range, then <strong>Analyze</strong> for the numbers or <strong>Explain with AI</strong> for the verified narrative.</p>
          )}
        </>
      )}

      {view === "contributors" && (
        <>
          {loading === "contributors" && !contributors && <div className="skeleton-hero card" />}
          {contributors && (
            <>
              {Object.keys(contributors.badgeCounts).length > 0 && (
                <div className="card badge-summary">
                  {Object.entries(contributors.badgeCounts).map(([id, count]) => {
                    const b = meta.get(id);
                    return <span key={id} className={`badge-chip ${b?.warning ? "badge-chip-warning" : ""}`} title={b?.description}>{b?.emoji} {b?.label ?? id} × {count}</span>;
                  })}
                </div>
              )}
              <div className="contributor-grid">
                {contributors.sheets.slice(0, 12).map((s) => <ContributorCard key={s.login} sheet={s} />)}
              </div>
            </>
          )}
          {loading === "recap" && !recap && <div className="skeleton-narrative card" />}
          {recap && <RecapCard recap={recap} />}
          {!contributors && !busy && !error && (
            <p className="hint">Multidimensional character sheets — there's no single score to farm. <strong>Load contributors</strong> for radars + badges, or <strong>Generate recap</strong> for a grounded "Repo Wrapped".</p>
          )}
        </>
      )}
    </div>
  );
}
