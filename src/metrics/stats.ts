/** Small, dependency-free numeric helpers. Pure and unit-tested. */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation. */
export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = mean(values.map((v) => (v - m) ** 2));
  return Math.sqrt(variance);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/**
 * Gini coefficient over a set of non-negative counts (e.g. reviews per reviewer).
 * 0 = perfectly even load, →1 = one person carries everything. A compact way to
 * express "review load balance" / bus-factor risk.
 */
export function gini(counts: number[]): number {
  const n = counts.length;
  if (n === 0) return 0;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  const sorted = [...counts].sort((a, b) => a - b);
  let cumulative = 0;
  for (let i = 0; i < n; i++) cumulative += (i + 1) * sorted[i]!;
  // Gini = (2 * Σ i*x_i) / (n * Σ x_i) - (n + 1) / n
  return (2 * cumulative) / (n * total) - (n + 1) / n;
}

/**
 * Z-score of `value` against a baseline sample. Returns null when there isn't
 * enough signal to be meaningful (fewer than 2 baseline points, or zero
 * variance) — we'd rather say "insufficient baseline" than fabricate a number.
 */
export function zScore(value: number, baseline: number[]): number | null {
  if (baseline.length < 2) return null;
  const sd = stddev(baseline);
  if (sd < 1e-9) return null;
  return (value - mean(baseline)) / sd;
}

export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
