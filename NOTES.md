# Submission notes

## 1. How to run it locally

**Prerequisites:** Node 20+, a read-only GitHub token, and (for the narrative endpoint only) an Anthropic API key.

```bash
cp .env.example .env     # set GITHUB_TOKEN, and ANTHROPIC_API_KEY for narratives
npm install
npm run dev              # API + (if built) UI on http://localhost:3000
```

One-command alternative: `docker compose up --build` (serves UI + API on `:3000`, persists SQLite to a named volume).

Verify:
```bash
curl "http://localhost:3000/repos/facebook/react/review-health?since=2026-05-01&until=2026-06-01" | jq
curl -X POST "http://localhost:3000/repos/facebook/react/review-health/narrative?since=2026-05-01&until=2026-06-01" | jq
npm test && npm run eval
```

## 2. Architecture & main decisions

The pipeline is **GitHub (GraphQL) → SQLite cache → pure metrics → fact ledger → LLM narrative**, with clear module boundaries (`github` / `store` / `metrics` / `insight` / `api`). A few decisions worth calling out:

- **GraphQL backbone.** One nested query returns each PR with its reviews (author, state, timestamp, comment count) and commit additions/deletions inline. REST would have cost ~1 request per PR for reviews and per commit for line stats; GraphQL collapses that into a handful of paginated calls. The throttling + retry plugins honour GitHub's rate limits automatically.
- **PRs *created* in the window** as the cohort. It's bounded on both ends (so pagination terminates quickly even for historical windows) and is the standard throughput-cohort definition. The trade-off: a PR merged in-window but created earlier isn't counted; documented and intentional.
- **The metric is opinionated.** I chose *team review health* over individual leaderboards on purpose — commit/PR counts per person are Goodhart-prone and the eng-research consensus (DORA/SPACE, Swarmia, DX) treats them as anti-patterns. Every signal exposes its sample size and a `reliable` flag, and the health band comes from transparent thresholds, not a model.
- **The narrative is engineered to be trustworthy, not just fluent.** This is the part I'm most proud of. The LLM is treated as untrusted: it may only cite pre-computed facts by id (forced tool-use → Zod re-validation), a grounding validator rejects any out-of-ledger citation and regenerates, and the service — not the model — renders the authoritative numbers. Confidence is decomposed into a code-computed *statistical* part and the model's *reasoning* part, combined so overall can never exceed the statistical strength of the evidence. The eval harness then pins all of this: zero grounding violations, calibration direction, and snapshot regression.
- **Caching as an immutable snapshot.** I cache the normalised `(repo, window)` activity as a blob keyed by the query, plus narratives keyed by a hash of the ledger. The cohort *is* the window, so caching it as a unit means metrics are always computed over exactly what was fetched — no partial-window reconstruction ambiguity. (See "what's next" for the normalised-table version.)
- **Security.** Tokens load only from validated env and are redacted in logs (both pino and Fastify). Owner/repo are strictly validated and only ever passed as GraphQL *variables* (never string-interpolated), and the only host ever contacted is `api.github.com` — closing the obvious injection/SSRF paths. Windows are size-capped to bound upstream work.

## 3. What I'd do next (with another day)

- **Background sync worker** populating the store on a schedule instead of on-demand, with incremental fetch by `updatedAt`. The store is already the single choke point, so this is a drop-in.
- **Normalised tables** (`pull_request` / `review` / `commit`) behind the same repository interface, enabling cross-window queries and trend charts without re-fetching.
- **Second integration** (GitLab) behind a `GitProvider` interface — the domain types are already provider-agnostic.
- **Richer signals:** sampled bus-factor *by file*, PR-size vs. review-latency correlation, newcomer (first-time-contributor) time-to-first-review.
- **More eval depth:** an adversarial fixture set that tries to bait the model into citing numbers not in the ledger, run in `--live` CI before any prompt/model change.
- **API auth + per-client rate limiting** before this faced anything but a trusted reviewer.

## 4. What I used AI for

I built this with Claude Code as a pair. AI scaffolded the boilerplate (config, Fastify wiring, the Octokit/GraphQL plumbing, React components, Dockerfile) and drafted first passes of the metric and prompt code. I drove the **design decisions** — the fact-ledger grounding model, the decomposed-confidence rule, the cohort definition, the "don't rank individuals" stance — and reviewed/hardened the parts that matter: the metric math (which I pinned with hand-computed unit tests), the grounding validator, and the security surface. The eval harness caught a real bug in one of my own fixtures during development, which is exactly why it's there. Every line here is code I'd be comfortable shipping.
