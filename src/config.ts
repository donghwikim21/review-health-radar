import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

/**
 * Centralised, validated configuration. Reading process.env anywhere else in the
 * codebase is discouraged — import `config` from here so that (a) we fail fast on
 * misconfiguration at boot, and (b) secrets live in exactly one place.
 */
const EnvSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN is required (read-only PAT)"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  INSIGHT_MODEL: z.string().min(1).default("claude-sonnet-4-6"),
  CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(3600),
  VERIFY_NARRATIVE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DATABASE_PATH: z.string().min(1).default("./data/review-health.db"),
  MAX_WINDOW_DAYS: z.coerce.number().int().positive().default(180),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type AppConfig = {
  githubToken: string;
  anthropicApiKey: string | undefined;
  port: number;
  insightModel: string;
  cacheTtlSeconds: number;
  verifyNarrative: boolean;
  databasePath: string;
  maxWindowDays: number;
  logLevel: z.infer<typeof EnvSchema>["LOG_LEVEL"];
};

function load(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    // Note: we print the field names that failed, never their values.
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  return {
    githubToken: env.GITHUB_TOKEN,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    port: env.PORT,
    insightModel: env.INSIGHT_MODEL,
    cacheTtlSeconds: env.CACHE_TTL_SECONDS,
    verifyNarrative: env.VERIFY_NARRATIVE,
    databasePath: env.DATABASE_PATH,
    maxWindowDays: env.MAX_WINDOW_DAYS,
    logLevel: env.LOG_LEVEL,
  };
}

export const config = load();
