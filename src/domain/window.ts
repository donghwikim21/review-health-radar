import { AppError } from "../errors.js";
import type { Window } from "./types.js";

const DAY_MS = 86_400_000;

/**
 * Parses and validates a [since, until) window from user input. Accepts either a
 * date (YYYY-MM-DD) or a full ISO-8601 instant. Throws AppError("BAD_REQUEST")
 * on anything malformed — never trusts the raw strings further.
 */
export function parseWindow(sinceRaw: string, untilRaw: string): Window {
  const sinceMs = Date.parse(sinceRaw);
  const untilMs = Date.parse(untilRaw);
  if (Number.isNaN(sinceMs)) throw new AppError("BAD_REQUEST", `Invalid 'since' date: ${sinceRaw}`);
  if (Number.isNaN(untilMs)) throw new AppError("BAD_REQUEST", `Invalid 'until' date: ${untilRaw}`);
  if (untilMs <= sinceMs) throw new AppError("BAD_REQUEST", "'until' must be after 'since'.");
  return {
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
  };
}

export function windowLengthDays(window: Window): number {
  return (Date.parse(window.until) - Date.parse(window.since)) / DAY_MS;
}

export function assertWithinLimit(window: Window, maxDays: number): void {
  if (windowLengthDays(window) > maxDays) {
    throw new AppError("WINDOW_TOO_LARGE", `Window exceeds the ${maxDays}-day maximum.`);
  }
}

/**
 * Generates `count` equal-length windows immediately preceding the given window.
 * These form the baseline used to compute trends and statistical anomalies — the
 * "is this number unusual for this repo?" signal feeding the confidence score.
 */
export function precedingWindows(window: Window, count: number): Window[] {
  const sinceMs = Date.parse(window.since);
  const untilMs = Date.parse(window.until);
  const lengthMs = untilMs - sinceMs;
  const windows: Window[] = [];
  for (let i = 1; i <= count; i++) {
    windows.push({
      since: new Date(sinceMs - i * lengthMs).toISOString(),
      until: new Date(untilMs - i * lengthMs).toISOString(),
    });
  }
  return windows;
}
