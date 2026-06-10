import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";
import { logger } from "../logger.js";

/**
 * SQLite via better-sqlite3 (synchronous, in-process, zero-ops). We cache the
 * normalised upstream snapshot as an immutable blob keyed by (repo, window): the
 * cohort is *defined* by the window, so caching it as a unit guarantees metrics
 * are computed over exactly the data that was fetched — no reconstruction
 * ambiguity. See NOTES.md for how a fully normalised schema would extend this.
 */
function open(): Database.Database {
  if (config.databasePath !== ":memory:") {
    mkdirSync(dirname(config.databasePath), { recursive: true });
  }
  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_cache (
      cache_key   TEXT PRIMARY KEY,
      payload     TEXT NOT NULL,
      fetched_at  TEXT NOT NULL,
      expires_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS narrative_cache (
      cache_key   TEXT PRIMARY KEY,
      payload     TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
  `);
  logger.info({ path: config.databasePath }, "SQLite store ready");
  return db;
}

export const db = open();
