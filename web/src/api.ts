import type { ApiError, NarrativeResult, ReviewHealthReport, ReviewHealthTrend } from "./types";

export interface Query {
  owner: string;
  repo: string;
  since: string;
  until: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as ApiError;
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const qs = (q: Query): string =>
  `since=${encodeURIComponent(q.since)}&until=${encodeURIComponent(q.until)}`;

export function fetchReport(q: Query): Promise<ReviewHealthReport> {
  return call<ReviewHealthReport>(
    `/repos/${encodeURIComponent(q.owner)}/${encodeURIComponent(q.repo)}/review-health?${qs(q)}`,
  );
}

export function fetchNarrative(q: Query): Promise<NarrativeResult> {
  return call<NarrativeResult>(
    `/repos/${encodeURIComponent(q.owner)}/${encodeURIComponent(q.repo)}/review-health/narrative?${qs(q)}`,
    { method: "POST" },
  );
}

export function fetchTrend(q: Query, buckets = 8): Promise<ReviewHealthTrend> {
  return call<ReviewHealthTrend>(
    `/repos/${encodeURIComponent(q.owner)}/${encodeURIComponent(q.repo)}/review-health/trend?${qs(q)}&buckets=${buckets}`,
  );
}
