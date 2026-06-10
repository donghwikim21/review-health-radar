import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateNarrative } from "../src/insight/narrative.js";
import { StubInsightProvider } from "../src/insight/stub.js";
import { getInsightProvider } from "../src/insight/factory.js";
import type { InsightProvider } from "../src/insight/provider.js";
import type { NarrativeResult } from "../src/insight/types.js";
import { CASES, type CaseExpectation } from "./fixtures.js";

const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "snapshots");

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface RunOptions {
  live: boolean;
  update: boolean;
}

/** Grounding is the headline guarantee: zero invented fact ids, ever. */
function checkGrounding(result: NarrativeResult): Check {
  const validIds = new Set(result.facts.map((f) => f.id));
  const bad = result.hypothesis.evidence.filter((e) => !validIds.has(e.factId)).map((e) => e.factId);
  return {
    name: "grounding (no hallucinated fact ids)",
    pass: bad.length === 0 && result.hypothesis.evidence.length > 0,
    detail: bad.length ? `cited unknown ids: ${bad.join(", ")}` : undefined,
  };
}

function checkSchema(result: NarrativeResult): Check {
  const c = result.hypothesis.confidence;
  const ok =
    typeof result.headline === "string" &&
    result.headline.length > 0 &&
    typeof result.summary === "string" &&
    [c.overall, c.statistical, c.reasoning].every((v) => v >= 0 && v <= 1);
  return { name: "schema + confidence in [0,1]", pass: ok };
}

function checkExpectations(result: NarrativeResult, expect: CaseExpectation): Check[] {
  const checks: Check[] = [];
  if (expect.band) {
    checks.push({ name: `band == ${expect.band}`, pass: result.band === expect.band, detail: `got ${result.band}` });
  }
  if (expect.anomalyContains) {
    const anomalyIds = result.hypothesis.evidence.filter((e) => e.isAnomaly).map((e) => e.factId);
    checks.push({
      name: `anomaly surfaces ${expect.anomalyContains}`,
      pass: result.hypothesis.evidence.some((e) => e.factId === expect.anomalyContains && e.isAnomaly),
      detail: `evidence anomalies: ${anomalyIds.join(", ") || "none"}`,
    });
  }
  if (expect.anomaliesEmpty) {
    const anomalies = result.hypothesis.evidence.filter((e) => e.isAnomaly).map((e) => e.factId);
    checks.push({ name: "no anomalies over-claimed", pass: anomalies.length === 0, detail: anomalies.join(", ") });
  }
  if (expect.minOverallConfidence !== undefined) {
    checks.push({
      name: `overall confidence ≥ ${expect.minOverallConfidence}`,
      pass: result.hypothesis.confidence.overall >= expect.minOverallConfidence,
      detail: `got ${result.hypothesis.confidence.overall}`,
    });
  }
  if (expect.maxOverallConfidence !== undefined) {
    checks.push({
      name: `overall confidence ≤ ${expect.maxOverallConfidence} (thin data stays humble)`,
      pass: result.hypothesis.confidence.overall <= expect.maxOverallConfidence,
      detail: `got ${result.hypothesis.confidence.overall}`,
    });
  }
  return checks;
}

/** Deterministic subset of the result used for snapshot regression (stub only). */
function snapshotOf(result: NarrativeResult) {
  return {
    headline: result.headline,
    statement: result.hypothesis.statement,
    evidence: result.hypothesis.evidence.map((e) => ({ factId: e.factId, display: e.display, isAnomaly: e.isAnomaly })),
    confidence: result.hypothesis.confidence,
    band: result.band,
  };
}

function checkSnapshot(name: string, result: NarrativeResult, update: boolean): Check {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const path = join(SNAPSHOT_DIR, `${name}.json`);
  const current = JSON.stringify(snapshotOf(result), null, 2);
  if (!existsSync(path) || update) {
    writeFileSync(path, current + "\n");
    return { name: "snapshot", pass: true, detail: existsSync(path) && !update ? "created" : "updated" };
  }
  const saved = readFileSync(path, "utf8").trim();
  return {
    name: "snapshot regression",
    pass: saved === current,
    detail: saved === current ? undefined : "differs from saved snapshot (run with --update to accept)",
  };
}

export async function run(options: RunOptions): Promise<number> {
  const provider: InsightProvider = options.live ? getInsightProvider() : new StubInsightProvider();
  console.log(`\nReview Health — eval harness  [provider: ${provider.model}]\n`);

  const results: NarrativeResult[] = [];
  let failures = 0;

  for (const testCase of CASES) {
    const result = await generateNarrative(testCase.report, provider, { useCache: false });
    results.push(result);

    const checks: Check[] = [checkGrounding(result), checkSchema(result), ...checkExpectations(result, testCase.expect)];
    // Snapshot only the deterministic stub; a live model is non-deterministic.
    if (!options.live) checks.push(checkSnapshot(testCase.name, result, options.update));

    console.log(`▸ ${testCase.name} — ${testCase.description}`);
    for (const check of checks) {
      const mark = check.pass ? "  ✓" : "  ✗";
      console.log(`${mark} ${check.name}${check.detail ? `  (${check.detail})` : ""}`);
      if (!check.pass) failures++;
    }
    console.log("");
  }

  // Cross-case calibration: a strong, reliable anomaly must out-rank thin-data noise.
  const collapse = results.find((_, i) => CASES[i]!.name === "coverage_collapse")!;
  const lowVol = results.find((_, i) => CASES[i]!.name === "low_volume")!;
  const calibrationPass = collapse.hypothesis.confidence.overall > lowVol.hypothesis.confidence.overall;
  console.log("▸ calibration (cross-case)");
  console.log(
    `${calibrationPass ? "  ✓" : "  ✗"} coverage_collapse (${collapse.hypothesis.confidence.overall}) > low_volume (${lowVol.hypothesis.confidence.overall})`,
  );
  if (!calibrationPass) failures++;

  console.log(`\n${failures === 0 ? "All eval checks passed." : `${failures} eval check(s) FAILED.`}\n`);
  return failures === 0 ? 0 : 1;
}
