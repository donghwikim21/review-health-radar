import { useState, type ChangeEvent } from "react";
import { fetchNarrative, fetchReport, fetchTrend, type Query } from "./api";
import { TREND_ACCESSOR, type NarrativeResult, type ReviewHealthReport, type ReviewHealthTrend } from "./types";
import { HealthHero } from "./components/HealthHero";
import { SignalCard } from "./components/SignalCard";
import { NarrativePanel } from "./components/NarrativePanel";
import { Legend } from "./components/Legend";

const DEFAULT_QUERY: Query = { owner: "honojs", repo: "hono", since: "2026-05-15", until: "2026-06-01" };

function sparkFor(id: string, trend: ReviewHealthTrend | null): (number | null)[] {
  const accessor = TREND_ACCESSOR[id];
  if (!trend || !accessor) return [];
  return trend.series.map((p) => accessor.get(p));
}

export function App() {
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [report, setReport] = useState<ReviewHealthReport | null>(null);
  const [trend, setTrend] = useState<ReviewHealthTrend | null>(null);
  const [narrative, setNarrative] = useState<NarrativeResult | null>(null);
  const [loading, setLoading] = useState<"report" | "narrative" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const set = (k: keyof Query) => (e: ChangeEvent<HTMLInputElement>) => setQuery({ ...query, [k]: e.target.value });

  async function loadReport(): Promise<ReviewHealthReport> {
    const [rep, tr] = await Promise.all([fetchReport(query), fetchTrend(query, 8)]);
    setReport(rep);
    setTrend(tr);
    return rep;
  }

  async function analyze() {
    setLoading("report"); setError(null); setNarrative(null);
    try { await loadReport(); }
    catch (e) { setError((e as Error).message); setReport(null); setTrend(null); }
    finally { setLoading(null); }
  }

  async function explain() {
    setLoading("narrative"); setError(null);
    try {
      if (!report) await loadReport();
      setNarrative(await fetchNarrative(query));
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(null); }
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>Review Health Radar</h1>
          <p className="tagline">Team review-health signals for a GitHub repo — with a grounded, adversarially-verified LLM narrative.</p>
        </div>
      </header>

      <form className="controls" onSubmit={(e) => { e.preventDefault(); void analyze(); }}>
        <label>Owner<input value={query.owner} onChange={set("owner")} /></label>
        <label>Repo<input value={query.repo} onChange={set("repo")} /></label>
        <label>Since<input type="date" value={query.since} onChange={set("since")} /></label>
        <label>Until<input type="date" value={query.until} onChange={set("until")} /></label>
        <button type="submit" disabled={loading !== null}>{loading === "report" ? "Analyzing…" : "Analyze"}</button>
        <button type="button" className="secondary" disabled={loading !== null} onClick={() => void explain()}>
          {loading === "narrative" ? "Thinking…" : "Explain with AI"}
        </button>
      </form>

      {error && <div className="error">⚠ {error}</div>}

      {loading === "report" && !report && <div className="skeleton-hero card" />}

      {report && (
        <>
          <HealthHero report={report} narrative={narrative} />
          <Legend />
          <div className="signal-grid">
            {report.facts.map((f) => (
              <SignalCard
                key={f.id}
                fact={f}
                spark={sparkFor(f.id, trend)}
                isAnomaly={report.anomalies.includes(f.id)}
                highlighted={highlight === f.id}
                onHover={setHighlight}
              />
            ))}
          </div>
        </>
      )}

      {loading === "narrative" && !narrative && <div className="skeleton-narrative card" />}
      {narrative && <NarrativePanel narrative={narrative} onHover={setHighlight} />}

      {!report && !narrative && loading === null && !error && (
        <p className="hint">Enter a public repo and date range, then <strong>Analyze</strong> for the numbers or <strong>Explain with AI</strong> for the verified narrative.</p>
      )}
    </div>
  );
}
