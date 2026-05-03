/**
 * SQLite Database Module
 *
 * Singleton DatabaseSync connection with lazy initialization,
 * 5-table schema, withTransaction() utility, periodic WAL checkpointing,
 * and WAL file size monitoring.
 *
 * The database is NEVER opened at module import time — only on the first
 * call to getDatabase(). Importing closeDatabase or withTransaction does
 * not trigger initialization.
 */

import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'node:path'
import { statSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_FILENAME = 'wallhaven-data.db'
const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const WAL_MONITOR_INTERVAL_MS = 60 * 1000 // 1 minute
const WAL_SIZE_THRESHOLD_BYTES = 10 * 1024 * 1024 // 10 MB

/** Full path to the SQLite database file — computed once at module level. */
const DB_PATH = join(app.getPath('userData'), DB_FILENAME)

// ---------------------------------------------------------------------------
// Module-level state (private, not exported)
// ---------------------------------------------------------------------------

/** Singleton database instance — starts undefined, initialized lazily. */
let db: DatabaseSync | undefined

/** Periodic WAL checkpoint timer handle. */
let checkpointTimer: ReturnType<typeof setInterval> | null = null

/** WAL file size monitor timer handle. */
let walMonitorTimer: ReturnType<typeof setInterval> | null = null

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Initialize the database schema.
 *
 * Creates all 5 tables with their columns, foreign keys, and indexes.
 * Also enables WAL journal mode for better concurrent read performance.
 *
 * Safe to call multiple times — all DDL uses IF NOT EXISTS.
 */
function initializeSchema(): void {
  db!.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS search_params (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS download_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallpaper_id TEXT,
      url TEXT,
      filename TEXT,
      file_path TEXT,
      file_size INTEGER,
      thumbnail_path TEXT,
      resolution TEXT,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      collection_id TEXT NOT NULL,
      wallpaper_id TEXT NOT NULL,
      wallpaper_data TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (collection_id, wallpaper_id),
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_favorites_wallpaper
      ON favorites(wallpaper_id);

    CREATE INDEX IF NOT EXISTS idx_download_history_created
      ON download_history(created_at DESC);
  `)
}

/**
 * Start the periodic WAL checkpoint timer.
 *
 * Runs PRAGMA wal_checkpoint(PASSIVE) every 5 minutes.
 * If PASSIVE fails (active readers), falls back to TRUNCATE.
 *
 * Uses .unref() so the timer does not keep the process alive.
 */
function startPeriodicCheckpoint(): void {
  checkpointTimer = setInterval(() => {
    try {
      getDatabase().exec('PRAGMA wal_checkpoint(PASSIVE)')
    } catch {
      try {
        getDatabase().exec('PRAGMA wal_checkpoint(TRUNCATE)')
      } catch {
        // Both checkpoint modes failed — nothing more we can do
      }
    }
  }, CHECKPOINT_INTERVAL_MS).unref() as ReturnType<typeof setInterval>
}

/**
 * Start the WAL file size monitor.
 *
 * Checks the WAL file size every 1 minute. If it exceeds 10 MB,
 * logs a warning and triggers an immediate TRUNCATE checkpoint.
 *
 * Uses .unref() so the timer does not keep the process alive.
 */
function startWalMonitor(): void {
  walMonitorTimer = setInterval(() => {
    try {
      const walPath = join(app.getPath('userData'), 'wallhaven-data.db-wal')
      const stat = statSync(walPath)
      if (stat.size > WAL_SIZE_THRESHOLD_BYTES) {
        console.warn('[SQLite] WAL file is ' + stat.size + ' bytes — checkpointing')
        getDatabase().exec('PRAGMA wal_checkpoint(TRUNCATE)')
      }
    } catch {
      // WAL file doesn't exist yet (no writes have happened) — do nothing
    }
  }, WAL_MONITOR_INTERVAL_MS).unref() as ReturnType<typeof setInterval>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the singleton database instance.
 *
 * Creates the database connection on first call (lazy initialization).
 * Subsequent calls return the existing connection.
 *
 * Never call this at module level — only inside functions that need it.
 */
export function getDatabase(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH, {
      enableForeignKeyConstraints: true,
      timeout: 5000
    })

    initializeSchema()
    startPeriodicCheckpoint()
    startWalMonitor()
  }

  return db
}

/**
 * Close the database connection gracefully.
 *
 * Clears checkpoint and WAL monitor timers, runs a final TRUNCATE checkpoint,
 * closes the connection, and nullifies the reference.
 *
 * Safe to call multiple times (idempotent) and safe to call when the database
 * was never initialized (no-op).
 */
export function closeDatabase(): void {
  if (checkpointTimer !== null) {
    clearInterval(checkpointTimer)
    checkpointTimer = null
  }

  if (walMonitorTimer !== null) {
    clearInterval(walMonitorTimer)
    walMonitorTimer = null
  }

  if (db) {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      // Final checkpoint failure is non-fatal — close anyway
    }

    db.close()
    db = undefined
  }
}

/**
 * Execute a function within a database transaction.
 *
 * Uses BEGIN IMMEDIATE to prevent SQLITE_BUSY errors from concurrent writes.
 * Commits on success, rolls back on error, and propagates the original exception.
 *
 * @param fn - The function to execute within the transaction
 * @returns The return value of fn
 */
export function withTransaction<T>(fn: () => T): T {
  const database = getDatabase()

  try {
    database.exec('BEGIN IMMEDIATE')
    const result = fn()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

/**
 * Read a JSON-serialized value from the settings table by key.
 * Returns parsed value, or null if key doesn't exist or parsing fails.
 */
export function getAppSetting(key: string): unknown {
  try {
    const row = getDatabase()
      .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(key)
    if (!row) return null
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

/**
 * Get the download path from appSettings.
 * Returns the stored path, or undefined if not set.
 * NOTE: The caller (GET_PENDING_DOWNLOADS handler) already handles the undefined case
 * by returning an empty array.
 */
export function getDownloadPath(): string | undefined {
  const appSettings = getAppSetting('appSettings') as Record<string, unknown> | null
  if (appSettings && typeof appSettings.downloadPath === 'string') {
    return appSettings.downloadPath
  }
  return undefined
}

/**
 * Get the max concurrent downloads from appSettings.
 * Defaults to 3 if not set or unparseable.
 */
export function getMaxConcurrentDownloads(): number {
  const appSettings = getAppSetting('appSettings') as Record<string, unknown> | null
  if (appSettings && typeof appSettings.maxConcurrentDownloads === 'number') {
    return appSettings.maxConcurrentDownloads
  }
  return 3
}
