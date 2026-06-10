import { pino } from "pino";
import { config } from "./config.js";

/**
 * Shared logger for code paths that run outside a request (boot, DB init, the
 * eval runner). Inside HTTP handlers prefer `request.log`, which carries the
 * request id. Redaction is configured here AND on the Fastify instance so a
 * token can never reach the logs from either path.
 */
export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      "githubToken",
      "anthropicApiKey",
      "*.authorization",
      "*.Authorization",
      "req.headers.authorization",
      "token",
      "*.token",
    ],
    censor: "[redacted]",
  },
});

/**
 * Minimal structural logger interface satisfied by both the pino root logger and
 * Fastify's per-request logger, so service/fetch code can accept either.
 */
export interface Log {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "token",
  "githubToken",
  "anthropicApiKey",
];
