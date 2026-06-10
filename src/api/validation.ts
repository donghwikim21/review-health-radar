import { z } from "zod";
import { AppError } from "../errors.js";
import { assertWithinLimit, parseWindow } from "../domain/window.js";
import { config } from "../config.js";
import type { RepoRef, Window } from "../domain/types.js";

// GitHub owner/repo names: letters, digits, hyphen, underscore, dot. We validate
// strictly (and reject . / ..) even though values only ever reach the API as
// GraphQL *variables* (never interpolated into a URL or query string).
const NAME = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, "must contain only letters, digits, '-', '_', '.'")
  .refine((v) => v !== "." && v !== "..", "invalid name");

const RepoParamsSchema = z.object({ owner: NAME, repo: NAME });

const WindowQuerySchema = z.object({
  since: z.string().min(1, "since is required (YYYY-MM-DD or ISO-8601)"),
  until: z.string().min(1, "until is required (YYYY-MM-DD or ISO-8601)"),
  baseline: z.coerce.number().int().min(0).max(6).optional(),
});

function fail(error: z.ZodError): never {
  const detail = error.issues.map((i) => `${i.path.join(".") || "(query)"}: ${i.message}`).join("; ");
  throw new AppError("BAD_REQUEST", detail);
}

export function parseRepoParams(params: unknown): RepoRef {
  const parsed = RepoParamsSchema.safeParse(params);
  if (!parsed.success) fail(parsed.error);
  return { owner: parsed.data.owner, name: parsed.data.repo };
}

export function parseWindowQuery(query: unknown): { window: Window; baseline: number | undefined } {
  const parsed = WindowQuerySchema.safeParse(query);
  if (!parsed.success) fail(parsed.error);
  const window = parseWindow(parsed.data.since, parsed.data.until);
  assertWithinLimit(window, config.maxWindowDays);
  return { window, baseline: parsed.data.baseline };
}
