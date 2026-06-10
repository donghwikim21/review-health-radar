/**
 * Application error taxonomy. Routes translate these into HTTP status codes in a
 * single place (see api/server.ts error handler) so individual handlers can stay
 * focused on the happy path and never hand-roll status codes.
 */
export type AppErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "WINDOW_TOO_LARGE"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "INSIGHT_UNAVAILABLE"
  | "INSIGHT_UNGROUNDED";

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Optional seconds the client should wait (surfaced as Retry-After). */
  readonly retryAfterSeconds?: number;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { retryAfterSeconds?: number; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  WINDOW_TOO_LARGE: 422,
  UPSTREAM_RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 502,
  INSIGHT_UNAVAILABLE: 503,
  INSIGHT_UNGROUNDED: 502,
};

export function httpStatusFor(error: AppError): number {
  return STATUS_BY_CODE[error.code];
}
