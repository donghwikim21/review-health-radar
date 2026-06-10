/**
 * Eval runner. Usage:
 *   npm run eval              # offline, deterministic stub provider
 *   npm run eval -- --live    # hit the real configured model (needs ANTHROPIC_API_KEY)
 *   npm run eval -- --update  # accept current stub output as the new snapshots
 *
 * We set safe defaults for env that the imported modules need (the store + config
 * load at import time) BEFORE dynamically importing the harness, so the suite runs
 * with no real GitHub token and an in-memory database.
 */
process.env.GITHUB_TOKEN ??= "eval-placeholder";
process.env.DATABASE_PATH ??= ":memory:";
process.env.LOG_LEVEL ??= "fatal";

const args = new Set(process.argv.slice(2));
const options = { live: args.has("--live"), update: args.has("--update") };

const { run } = await import("./harness.js");
const exitCode = await run(options);
process.exit(exitCode);

export {};
