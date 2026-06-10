import { db } from "./db.js";
import type { RepoActivity, RepoRef, Window } from "../domain/types.js";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export function activityKey(repo: RepoRef, window: Window): string {
  return `${repo.owner}/${repo.name}@${window.since}..${window.until}`;
}

export function narrativeKey(
  repo: RepoRef,
  window: Window,
  ledgerHash: string,
  model: string,
): string {
  return `${activityKey(repo, window)}#${model}#${ledgerHash}`;
}

// --- Activity (upstream snapshot) cache -------------------------------------

const selectActivity = db.prepare<[string, number]>(
  "SELECT payload FROM activity_cache WHERE cache_key = ? AND expires_at > ?",
);
const upsertActivity = db.prepare<[string, string, string, number]>(
  `INSERT INTO activity_cache (cache_key, payload, fetched_at, expires_at)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(cache_key) DO UPDATE SET
     payload = excluded.payload,
     fetched_at = excluded.fetched_at,
     expires_at = excluded.expires_at`,
);

export function getCachedActivity(repo: RepoRef, window: Window): RepoActivity | null {
  const row = selectActivity.get(activityKey(repo, window), nowSeconds()) as
    | { payload: string }
    | undefined;
  return row ? (JSON.parse(row.payload) as RepoActivity) : null;
}

export function putCachedActivity(activity: RepoActivity, ttlSeconds: number): void {
  upsertActivity.run(
    activityKey(activity.repo, activity.window),
    JSON.stringify(activity),
    activity.fetchedAt,
    nowSeconds() + ttlSeconds,
  );
}

// --- Narrative cache --------------------------------------------------------
// Narratives are keyed by (repo, window, model, ledger hash). Because the hash
// changes whenever any underlying number changes, a cache hit is guaranteed to
// reflect the current data — and we never re-bill the LLM for identical inputs.

const selectNarrative = db.prepare<[string]>(
  "SELECT payload FROM narrative_cache WHERE cache_key = ?",
);
const upsertNarrative = db.prepare<[string, string, string]>(
  `INSERT INTO narrative_cache (cache_key, payload, created_at)
   VALUES (?, ?, ?)
   ON CONFLICT(cache_key) DO UPDATE SET
     payload = excluded.payload,
     created_at = excluded.created_at`,
);

export function getCachedNarrative<T>(key: string): T | null {
  const row = selectNarrative.get(key) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as T) : null;
}

export function putCachedNarrative<T>(key: string, value: T): void {
  upsertNarrative.run(key, JSON.stringify(value), new Date().toISOString());
}
