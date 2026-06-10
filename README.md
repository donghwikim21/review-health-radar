# Review Health Radar

A small service that reads a public GitHub repo's collaboration data and surfaces **team Review Health** over a time window — then lets an LLM write a **grounded narrative** over those numbers: one root-cause hypothesis, a decomposed confidence score, and an evidence chain that points back to specific, machine-verified figures.

It deliberately does **not** rank individuals by commit count (a well-known Goodhart trap). It measures how the *team* reviews code.

```
┌─────────┐   GraphQL    ┌──────────┐   pure fns   ┌─────────────┐   grounded   ┌──────────┐
│ GitHub  │ ───────────▶ │  SQLite  │ ───────────▶ │ Fact ledger │ ───────────▶ │  Claude  │
│  API    │   (cached)   │  cache   │   metrics    │ + anomalies │   + verify   │ narrative│
└─────────┘              └──────────┘              └─────────────┘              └──────────┘
```

## 60-second quickstart

You need a **read-only GitHub token** (a fine-grained PAT with public-repo read access is enough). An **Anthropic API key** is only needed for the narrative endpoint.

```bash
git clone <this-repo> && cd review-health-radar
cp .env.example .env          # then put your GITHUB_TOKEN (and ANTHROPIC_API_KEY) in .env

# --- Option A: Docker (UI + API on http://localhost:3000) ---
docker compose up --build

# --- Option B: local dev ---
npm install
npm run dev                   # API on http://localhost:3000
# in another terminal, for the UI:
cd web && npm install && npm run dev   # UI on http://localhost:5173
```

Then hit it:

```bash
# Endpoint #1 — the numbers (no LLM, no key needed)
curl "http://localhost:3000/repos/facebook/react/review-health?since=2026-05-01&until=2026-06-01" | jq

# Endpoint #2 — the grounded narrative (needs ANTHROPIC_API_KEY)
curl -X POST "http://localhost:3000/repos/facebook/react/review-health/narrative?since=2026-05-01&until=2026-06-01" | jq
```

## The metric: what & why

**Review Health** is a composite of four signals computed over the cohort of pull requests **created** in the window (a clean, doubly-bounded set that paginates cheaply):

| Signal | Meaning | Why it matters |
|---|---|---|
| **Review coverage** | % of merged PRs with ≥1 human review | Unreviewed merges are a quality + knowledge risk |
| **Rubber-stamp rate** | merged PRs approved instantly (<5 min) with zero comments | "Review theater" — approval without engagement |
| **Time to first review (median)** | how long PRs wait for a first look | Team responsiveness / flow friction |
| **Time to merge (median)** | how long PRs take to land | Flow / cycle-time signal (also surfaced as a trend) |
| **Reviewer load balance** | top reviewer's share + Gini | Bus-factor and burnout risk on *reviewing* |

Each signal is compared against the **3 preceding windows** to flag statistical anomalies (|z| ≥ 2), and the repo gets an overall band — `healthy` / `watch` / `at-risk` — from **transparent thresholds in code** (`src/metrics/ledger.ts`), never a black box. Every number carries its sample size and a `reliable` flag, so a scary-looking value over 2 PRs is never treated as signal. See [`NOTES.md`](./NOTES.md) for the rationale and the documented false-positives of each signal.

## The narrative endpoint (the interesting part)

The hard requirement isn't "summarize JSON" — it's a narrative you can *trust*. So:

1. **Fact ledger.** Every number is a typed fact with a stable id. It is the only source of numbers in the system.
2. **The LLM may only cite facts by id** (forced via a single tool-use call → re-validated with Zod). A **grounding validator** rejects any answer that cites an id outside the ledger and triggers a bounded regeneration; we fail closed rather than return ungrounded content. The service renders the authoritative value next to each cited fact, so **a hallucinated statistic is structurally impossible**.
3. **Adversarial verification (the "skeptic").** After the narrative is grounded, a *second* LLM pass — a skeptic prompted to **refute** the hypothesis — returns a verdict (`supported` / `weak` / `refuted`) plus grounded refuting facts. Confidence is *earned through challenge*, not self-reported.
4. **Decomposed confidence.** `overall = statistical × (0.5 + 0.5 × reasoning) × verdict` — the statistical part is computed in code from sample size + reliability of the cited facts; the reasoning part is the model's; the verdict multiplier (`supported 1.0 / weak 0.6 / refuted 0.25`) comes from the skeptic. Overall is capped by statistical, so the prose can never sound more certain than the data — or the skeptic — allows. (Toggle with `VERIFY_NARRATIVE`.)

## Eval harness

```bash
npm run eval              # offline, deterministic stub provider (CI-safe)
npm run eval -- --live    # exercise the real model (needs ANTHROPIC_API_KEY)
npm run eval -- --update  # accept current stub output as new snapshots
```

It asserts **zero grounding violations**, valid output schema, **calibration direction** (a strong reliable anomaly out-scores thin-data noise), **skeptic verdicts** (a real anomaly is `supported`; a marginal signal is `weak`/`refuted` and the verdict actually lowers confidence), and **snapshot regression** — the suite you'd run before changing a prompt or swapping a model. In `--live` mode the verdict checks double as an LLM-as-judge over the real model.

## Tests

```bash
npm test         # vitest: metric math (the numbers add up) + grounding + confidence
npm run typecheck
```

## Endpoints

| Method | Path | Returns |
|---|---|---|
| `GET` | `/health` | liveness |
| `GET` | `/repos/:owner/:repo/review-health?since&until[&baseline]` | metrics + fact ledger + anomalies |
| `GET` | `/repos/:owner/:repo/review-health/trend?since&until[&buckets]` | per-signal time series (sparklines / trend lines) |
| `POST` | `/repos/:owner/:repo/review-health/narrative?since&until` | grounded, adversarially-verified LLM narrative |

Sensible status codes: `400` bad params · `422` window > `MAX_WINDOW_DAYS` · `404` repo not found · `429` upstream rate-limited (with `Retry-After`) · `502` upstream/grounding failure · `503` narrative key not configured.

## Configuration

All via env (validated at boot in `src/config.ts`). See [`.env.example`](./.env.example). Key ones: `GITHUB_TOKEN` (required), `ANTHROPIC_API_KEY` (narrative only), `INSIGHT_MODEL`, `VERIFY_NARRATIVE`, `CACHE_TTL_SECONDS`, `MAX_WINDOW_DAYS`.

## Project layout

```
src/
  github/    GraphQL client, queries, fetch + normalise
  store/     SQLite cache (activity snapshots + narratives)
  metrics/   pure metric fns, fact ledger, anomaly + band logic  (heavily tested)
  insight/   provider iface, Anthropic impl, stub, grounding validator, confidence, orchestrator
  api/       Fastify server, routes, validation, error mapping
  service/   fetch→cache→metrics→report wiring
evals/       fixtures + runner + snapshots
web/         Vite + React single-page UI
```

See [`NOTES.md`](./NOTES.md) for the architecture tour, trade-offs, what's next, and AI usage.
