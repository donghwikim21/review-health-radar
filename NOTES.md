# Submission notes

## 1. How to run it locally

**Prerequisites:** Node 20+, a read-only GitHub token, and (for the narrative endpoint only) an Anthropic API key.

```bash
cp .env.example .env     # set GITHUB_TOKEN, and ANTHROPIC_API_KEY for narratives
npm install
npm run dev              # API + (if built) UI on http://localhost:3000
```

One-command alternative: `docker compose up --build` (serves UI + API on `:3000`, persists SQLite to a named volume).

Verify (`jq` optional, just for pretty output):
```bash
B="http://localhost:3000/repos/honojs/hono"
curl "$B/review-health?since=2026-05-15&until=2026-06-01" | jq         # metric + fact ledger
curl "$B/review-health/trend?since=2026-05-15&until=2026-06-01" | jq   # sparkline series
curl "$B/contributors?since=2026-04-01&until=2026-06-01" | jq          # character sheets + badges
curl -X POST "$B/review-health/narrative?since=2026-05-15&until=2026-06-01" | jq  # grounded + verified narrative
curl -X POST "$B/recap?since=2026-04-01&until=2026-06-01" | jq         # "Repo Wrapped"
npm test && npm run eval        # 30 unit tests + the eval suite (offline; add -- --live to hit the model)
```

The first query for a given window is slower (cold cache: it fans out to the window + 3 baseline windows + 8 trend buckets, all fetched from GitHub); repeats are served from SQLite in ~1 ms. See the operability note below.

## 2. Architecture & main decisions

The pipeline is **GitHub (GraphQL) → SQLite cache → pure metrics → fact ledger → LLM narrative**, with clear module boundaries (`github` / `store` / `metrics` / `insight` / `api`). A few decisions worth calling out:

- **GraphQL backbone.** PRs are fetched via the GraphQL **Search API** with a server-side `created:` date filter, and each result carries its reviews (author, state, timestamp, comment count) inline; commits come from `defaultBranchRef.history(since, until)` with additions/deletions inline. REST would have cost ~1 request per PR for reviews and per commit for line stats; this collapses it into a handful of paginated calls. The throttling + retry plugins honour GitHub's rate limits automatically.
- **PRs *created* in the window** as the cohort. The Search `created:` filter means we only ever fetch in-window PRs (an early version paginated newest-first and discarded months of out-of-window PRs — slow on busy repos and prone to secondary-rate-limit backoff; switching to Search cut a cold historical query from ~70 s to a few seconds). Exact `[since, until)` bounds are still applied client-side since the search filter is day-granular. The trade-off: a PR merged in-window but created earlier isn't counted — documented and intentional.
- **The metric is opinionated.** I chose *team review health* over individual leaderboards on purpose — commit/PR counts per person are Goodhart-prone and the eng-research consensus (DORA/SPACE, Swarmia, DX) treats them as anti-patterns. Every signal exposes its sample size and a `reliable` flag, and the health band comes from transparent thresholds, not a model.
- **Gamification, done with a point of view (the second half of the thesis).** The flip side of "single-number leaderboards lie" is a constructive alternative: **contributor character sheets** (`GET /contributors`) that make *invisible collaborative labor* visible. Each contributor gets **multidimensional attributes** (Velocity, Collaboration, Responsiveness, Breadth, Thoroughness — a radar, not a rank) and **behaviour badges** that reward reviewing/unblocking/breadth rather than volume (Good Neighbor, Unblocker, Connector, Night Owl) plus a **warning** badge (Lone Guardian — sole reviewer on 3+ PRs, surfacing bus-factor risk). **There is deliberately no single XP/level number** — that would just recreate the farmable metric I argued against; the whole point is to reward the labor commit counts miss, not to invent a new thing to game. The **`POST /recap`** ("Repo Wrapped") is a playful season recap that reuses the *same grounding spine* — every claim cites a recap-ledger fact id (validated, regenerated on failure), so it can be fun without inventing numbers or naming the wrong person. Limitations I'm aware of: small windows are noisy, timezone makes Night Owl approximate, and per-contributor profiling is a lens not a verdict — all noted in-product and here.
- **The narrative is engineered to be trustworthy, not just fluent.** This is the part I'm most proud of. The LLM is treated as untrusted: it may only cite pre-computed facts by id (forced tool-use → Zod re-validation), a grounding validator rejects any out-of-ledger citation and regenerates, and the service — not the model — renders the authoritative numbers.
- **Adversarial self-verification.** After the narrative is grounded, a second LLM pass — a *skeptic* prompted to refute the hypothesis — returns a verdict (`supported` / `weak` / `refuted`) with grounded refuting facts. That verdict multiplies the confidence (`supported 1.0 / weak 0.6 / refuted 0.25`). So confidence is **decomposed three ways** — code-computed *statistical* strength, the model's *reasoning*, and an adversarial *verdict* — combined so overall can never exceed the statistical strength of the evidence, and is actively pulled down when a skeptic finds confounds. It's best-effort (a failed verification degrades to no-adjustment rather than failing the request). In practice the skeptic catches real over-reach — e.g. flagging that a "reviewer overload" story is undercut by the top reviewer's share actually trending *down*. The eval harness pins all of this: zero grounding violations, calibration direction, verdict sanity, and snapshot regression.
- **Caching as an immutable snapshot.** I cache the normalised `(repo, window)` activity as a blob keyed by the query, plus narratives keyed by a hash of the ledger. The cohort *is* the window, so caching it as a unit means metrics are always computed over exactly what was fetched — no partial-window reconstruction ambiguity. (See "what's next" for the normalised-table version.)
- **Performance & operability.** Per-window fetches run PRs and commits concurrently, and the report fetches its current + baseline windows concurrently. The cost that remains is *fan-out on a cold cache*: an "Analyze" touches the window + 3 baseline windows + 8 trend buckets (≈12 windows), each a GitHub round-trip. Warm, everything is served from SQLite in ~1 ms. The honest fix for the cold case is the background-sync worker (below); the cache + the Search-API narrowing keep it acceptable in the meantime.
- **Security.** Tokens load only from validated env and are redacted in logs (both pino and Fastify). Owner/repo are strictly validated (`^[A-Za-z0-9_.-]+$`) and only ever passed as GraphQL *variables* (never string-interpolated into the document or the search query), and the only host ever contacted is `api.github.com` — closing the obvious injection/SSRF paths. Windows are size-capped (`MAX_WINDOW_DAYS`) to bound upstream work.

## 3. What I'd do next (with another day)

- **Background sync worker** populating the store on a schedule instead of on-demand, with incremental fetch by `updatedAt`. The store is already the single choke point, so this is a drop-in.
- **Normalised tables** (`pull_request` / `review` / `commit`) behind the same repository interface, enabling cross-window queries and trend charts without re-fetching.
- **Second integration** (GitLab) behind a `GitProvider` interface — the domain types are already provider-agnostic.
- **Richer signals:** sampled bus-factor *by file*, PR-size vs. review-latency correlation, newcomer (first-time-contributor) time-to-first-review. (Time-to-merge and trend-lines-over-time are already in.)
- **More eval depth:** an adversarial fixture set that tries to bait the model into citing numbers not in the ledger, run in `--live` CI before any prompt/model change.
- **Integration tests** for the GitHub fetch/normalisation (mocked Octokit) and the route layer (Fastify `inject`) — I unit-tested the pure metric/grounding/badge logic but deliberately deferred wiring tests for the take-home.
- **API auth + per-client rate limiting** before this faced anything but a trusted reviewer.

## 4. What I used AI for

I built this with Claude Code as a pair. AI scaffolded the boilerplate (config, Fastify wiring, the Octokit/GraphQL plumbing, React components, Dockerfile) and drafted first passes of the metric and prompt code. I drove the **design decisions** — the fact-ledger grounding model, the decomposed-confidence rule, the adversarial-verification idea, the cohort definition, the "don't rank individuals" stance — and reviewed/hardened the parts that matter: the metric math (which I pinned with hand-computed unit tests), the grounding validator, and the security surface. Live testing caught two real issues I then fixed: the regeneration loop only retried *grounding* failures (not schema/length ones), and the verification rationale needed a larger cap; both are now handled. The eval harness also caught a bug in one of my own fixtures. Every line here is code I'd be comfortable shipping.

The product itself uses the LLM twice per narrative: once to **synthesize** the grounded story, once to **adversarially verify** it. There are two more "AI" surfaces worth noting in the eval harness: a deterministic stub provider (so the full pipeline is testable offline) and, in `--live` mode, the skeptic verdicts acting as an LLM-as-judge.
