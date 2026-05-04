# Phase 44: Migration Script — Research

**Researched:** 2026-05-03
**Domain:** One-time data migration from electron-store (JSON) to SQLite (node:sqlite)
**Confidence:** HIGH (codebase analysis + existing CONTEXT.md with 10 locked decisions + existing PITFALLS.md + FEATURES.md + verified current code state)

## Summary

All 5 prerequisite phases (41: database infrastructure, 42: store handler cutover, 43: favorites/collections migration) are complete. The SQLite schema, `withTransaction()`, `getDatabase()`, and all IPC handlers already exist and operate on SQLite. The missing piece is the one-time migration script that reads legacy data from electron-store (`wallhaven-data.json`) and imports it into SQLite (`wallhaven-data.db`).

The electron-store and SQLite currently coexist. The migration script bridges them — it copies old data into SQLite once, records a `_migrated_from_store` flag, and never runs again. New writes since Phase 42/43 already go to SQLite, so there is no risk of conflicting writes during migration.

**Primary recommendation:** Single file `electron/main/migration.ts` with `runMigration(): MigrationResult`, called from `getDatabase()` after `initializeSchema()`. All writes inside a single `withTransaction()` call. Backup before any writes.

**Key finding — `store-clear` interaction concern:** `store-clear` (Phase 42 handler) does `DELETE FROM settings`, which would also delete the `_migrated_from_store` flag. If a user clears their data after migration, the next startup would re-migrate and restore old electron-store data over their cleared state. The store-clear handler must be updated to exclude the `_migrated_from_store` key.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### A — Script Location and Structure
- **D-01:** Single file `electron/main/migration.ts`, not split into multiple files
- **D-02:** Export `runMigration(): MigrationResult` — returns whether migration was performed, per-domain row counts
- **D-03:** `MigrationResult` interface includes `migrated: boolean`, `stats: { settings, searchParams, downloadHistory, collections, favorites }`, `backupPath: string | null`

#### B — Migration Trigger Timing
- **D-04:** Migration executes immediately after the first `getDatabase()` call, as part of database initialization
- **D-05:** After `initializeSchema()` completes, call `runMigration()`, encapsulated in `getDatabase()`'s lazy init flow
- **D-06:** Not called explicitly from `index.ts` — migration logic binds to database init, completes before the first handler accesses the database

#### C — Idempotency Strategy
- **D-07:** Migration checks `SELECT 1 FROM settings WHERE key = '_migrated_from_store'`, returns `{ migrated: false }` if exists
- **D-08:** After successful migration, within the transaction, `INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')`
- **D-09:** Idempotency flag persists in settings table, stays even after electron-store is deleted (Phase 45)

#### D — Backup Strategy
- **D-10:** Before migration (before transaction starts), copy electron-store file: `wallhaven-data.json` -> `wallhaven-data.json.bak`
- **D-11:** Backup path: same directory as `wallhaven-data.json` (`app.getPath('userData')`)
- **D-12:** If `wallhaven-data.json.bak` already exists, overwrite it (most recent pre-migration backup)
- **D-13:** If `wallhaven-data.json` does not exist (fresh install), do not create backup, do not treat as error — migration skips

#### E — Data Transformation Rules
- **E-01:** `appSettings` -> `settings` table, key='appSettings', value=JSON.stringify(full settings object)
- **E-02:** `wallpaperQueryParams` -> `search_params` table, `INSERT OR REPLACE INTO search_params (id, value) VALUES (1, ?)`
- **E-03:** `downloadFinishedList` array -> `download_history` table, one row per record. Field mapping: `id`, `url`, `filename`, `path`, `resolution`, `size`, `time`. `wallpaper_id` uses existing wallpaperId/id field. `data` column stores full raw JSON.
- **E-04:** `favoritesData.collections` -> `collections` table, one row per collection. Field mapping: `id`->`id`, `name`->`name`, `isDefault`->`is_default`, `createdAt`->`created_at`, `updatedAt`->`updated_at`. Check both `favoritesData.defaultCollectionId` and `collection.isDefault`.
- **E-05:** `favoritesData.favorites` -> `favorites` table, one row per favorite. Field mapping: `wallpaperId`->`wallpaper_id`, `collectionId`->`collection_id`, `addedAt`->`added_at`, `wallpaperData`->`wallpaper_data`. `wallpaper_data` stored as JSON.stringify TEXT.
- **E-06:** Import order strictly follows FK dependency: collections -> favorites -> settings -> search_params -> download_history

#### F — Transaction Strategy
- **F-01:** All writes in single `withTransaction()`
- **F-02:** Transaction execution order: INSERT collections -> INSERT favorites -> INSERT/UPDATE settings -> INSERT search_params -> INSERT download_history -> INSERT _migrated_from_store
- **F-03:** Any step failure (exception) -> entire transaction rolls back -> app retries on next startup

#### G — Orphan Data Handling
- **G-01:** Before importing favorites, check each favorite's `collectionId` exists in imported collections
- **G-02:** Filter out orphan favorites (collectionId not in any collection)
- **G-03:** Log count of filtered orphans: `console.warn`

#### H — Empty Data / Fresh Install Handling
- **H-01:** If `store.get('appSettings')` returns `null` or `undefined`, skip settings migration
- **H-02:** If `store.get('downloadFinishedList')` returns empty array `[]`, check `Array.isArray` to confirm data exists before migrating
- **H-03:** If all 4 domains have no data (fresh install), still set `_migrated_from_store = true` to prevent re-check on every startup
- **H-04:** Use explicit null/undefined checks, not truthiness (Pitfall 9)

#### I — Error Handling
- **I-01:** Catch and log: JSON.parse failures, FK constraint violations, disk write failures
- **I-02:** All exceptions propagate to `withTransaction()` -> auto rollback
- **I-03:** If `node:sqlite` module unavailable (very low probability), catch `ERR_MODULE_NOT_FOUND`, log warning, app continues using electron-store

### Claude's Discretion
- Specific SQL statement implementation details
- Log format and verbosity level
- `MigrationResult` specific TypeScript type definition
- Migration script's exact call location in `getDatabase()`
- Field mapping strategy between `download_history` individual columns and `data` column

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DBINFRA-05 | Create one-time migration script reading electron-store data and importing into SQLite in single transaction | All data domains mapped. SQL statements identified. `withTransaction()` already exists in Phase 41. |
| DBINFRA-06 | Migration idempotent — `_migrated_from_store` guard, safe to re-run if interrupted | D-07/D-08 specify exact guard mechanism. Guard runs before transaction. Migration marker written as last step inside transaction. |
| DBINFRA-07 | Migration creates backup copy of electron-store file before any SQLite writes | D-10/D-11/D-12 specify backup path and overwrite behavior. Backup before transaction, so a failed migration still has a valid backup. |
| VER-02 | Migration from existing electron-store data completes without data loss | Transactional atomicity + backup + idempotency guard + orphan filtering provide multi-layer data safety. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read electron-store data | Main process | — | electron-store is a main-process module. Migration reads from `store.ts` directly. |
| Write SQLite data | Main process | — | `node:sqlite` is synchronous and main-process only. `withTransaction()` is already defined in `database.ts`. |
| Backup file creation | Main process | — | `fs.copyFileSync` runs in main process. Path resolution uses `app.getPath('userData')`. |
| Migration trigger | Main process | — | Called from `getDatabase()` lazy init, which is a main-process singleton. |
| Migration result | Main process | — | `MigrationResult` stays in main process. Logged via `console.log`, not exposed to renderer. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:sqlite` | Built-in (Node 24.14+) | SQLite database writes via `DatabaseSync` | Phase 41 decision. Already used by database.ts, store.handler.ts, favorites.handler.ts |
| `electron-store` | v11.0.2 | Read source data for migration | Existing dependency. Migration reads from it one last time before Phase 45 removal. |

**No new npm dependencies.** The migration script uses only built-in Node.js modules and existing dependencies:
- `node:sqlite` — database writes and queries
- `node:fs` — `copyFileSync`, `existsSync` for backup
- `node:path` — `join` for path construction
- `electron` — `app.getPath('userData')`
- `./store` — `{ store }` electron-store instance for reading source data
- `./database` — `{ getDatabase, withTransaction }` for SQLite access

## Architecture Patterns

### Data Flow

```
electron-store (wallhaven-data.json)          SQLite (wallhaven-data.db)
================================               ========================
                                          
store.get('appSettings')                 ──>  settings (key='appSettings', value=JSON)
                                         
store.get('wallpaperQueryParams')         ──>  search_params (id=1, value=JSON)
                                         
store.get('downloadFinishedList')         ──>  download_history (individual columns + data JSON)
  [{ id, url, filename, path,                 One row per array element
     resolution, size, time, ... }]
                                         
store.get('favoritesData')                     collections (id, name, is_default, ...)
  { collections: [...],                   ──>  One row per collection
    favorites: [...] }                         +
  +                                       ──>  favorites (wallpaper_id, collection_id, ...)
  favoritesData.defaultCollectionId             One row per favorite item
                                               Filter orphan favorites
```

### Control Flow

```
app.whenReady()
  │
  ├── splashWindow.show()
  │
  ├── createWindow()
  │
  ├── First IPC handler call (e.g., favorites-get-collections)
  │     │
  │     └── handler calls getDatabase()
  │           │
  │           ├── new DatabaseSync(dbPath)       [first call only]
  │           ├── initializeSchema()             [CREATE TABLE IF NOT EXISTS]
  │           ├── runMigration(db)               [NEW — inserted here]
  │           │     │
  │           │     ├── Check _migrated_from_store — exists? return { migrated: false }
  │           │     ├── Check wallhaven-data.json exists — no? return { migrated: false }
  │           │     ├── copyFileSync -> .bak      [outside transaction]
  │           │     ├── withTransaction():
  │           │     │     ├── INSERT collections
  │           │     │     ├── INSERT favorites  (filter orphans)
  │           │     │     ├── INSERT settings   (appSettings)
  │           │     │     ├── INSERT search_params
  │           │     │     ├── INSERT download_history
  │           │     │     └── INSERT _migrated_from_store
  │           │     ├── Log migration stats
  │           │     └── Return MigrationResult
  │           │
  │           ├── startPeriodicCheckpoint()
  │           └── startWalMonitor()
  │
  └── Handler processes IPC request with migrated data
```

### Recommended Project Structure

No structural changes — single new file:

```
electron/main/
├── database.ts            # Existing — add runMigration(db) call after initializeSchema()
├── migration.ts           # NEW — migration script
├── store.ts               # Existing — electron-store instance (migration reads from it)
└── ...
```

### Pattern 1: Migration Script Structure

```typescript
// electron/main/migration.ts
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { store } from './store'
import { withTransaction } from './database'

export interface MigrationResult {
  migrated: boolean
  stats: {
    settings: number
    searchParams: number
    downloadHistory: number
    collections: number
    favorites: number
  }
  backupPath: string | null
}

export function runMigration(db: DatabaseSync): MigrationResult {
  // 1. Check if already migrated
  const flag = db.prepare(
    "SELECT 1 FROM settings WHERE key = '_migrated_from_store'"
  ).get()
  if (flag) {
    console.log('[Migration] Already migrated (found _migrated_from_store)')
    return { migrated: false, stats: { ... }, backupPath: null }
  }

  // 2. Check if electron-store file exists
  const userDataPath = app.getPath('userData')
  const storePath = join(userDataPath, 'wallhaven-data.json')
  if (!existsSync(storePath)) {
    console.log('[Migration] No electron-store file found (fresh install)')
    // Still mark as migrated to prevent re-check on every startup
    db.prepare("INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')").run()
    return { migrated: true, stats: { ... }, backupPath: null }
  }

  // 3. Create backup (outside transaction)
  const backupPath = join(userDataPath, 'wallhaven-data.json.bak')
  copyFileSync(storePath, backupPath)
  console.log(`[Migration] Backup created: wallhaven-data.json.bak`)

  // 4. Run migration inside transaction
  try {
    return withTransaction(() => {
      // Read data
      const appSettings = store.get('appSettings')
      const queryParams = store.get('wallpaperQueryParams')
      const downloadHistory = store.get('downloadFinishedList')
      const favoritesData = store.get('favoritesData')

      // ... migrate domains in order ...

      // Mark migration complete
      db.prepare("INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')").run()

      return {
        migrated: true,
        stats: { settings, searchParams, downloadHistory, collections, favorites },
        backupPath
      }
    })
  } catch (error) {
    console.error('[Migration] FAILED — transaction rolled back:', error)
    throw error
  }
}
```

### Pattern 2: Integration in `getDatabase()`

```typescript
// In electron/main/database.ts
export function getDatabase(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(getDbPath(), {
      enableForeignKeyConstraints: true,
      timeout: 5000
    })

    initializeSchema()

    // Run one-time migration from electron-store to SQLite
    // Must happen after schema creation, before any handler accesses the database
    const result = runMigration(db)
    if (result.migrated) {
      console.log(`[Migration] Complete. Settings: ${result.stats.settings}, ...`)
    }

    startPeriodicCheckpoint()
    startWalMonitor()
  }

  return db
}
```

### Anti-Patterns to Avoid
- **Calling `runMigration()` after handler invocations** — Migration must run before any IPC handler processes requests. Installing it inside `getDatabase()` guarantees correct ordering.
- **Running migration outside transaction** — Partial migration on crash leaves inconsistent state. `withTransaction()` ensures all-or-nothing.
- **Using truthiness checks for empty defaults** — `store.get('downloadFinishedList')` returns `[]` as default, which is falsy. Use explicit `Array.isArray` + `length` checks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic multi-table writes | Manual BEGIN/COMMIT with custom error handling | `withTransaction()` from `database.ts` | Already implements `BEGIN IMMEDIATE`, rollback on error, exception propagation. Phase 41 delivered this. |
| File backup | Create/read/verify backup manually | `copyFileSync` from `node:fs` | Built-in, synchronous, exactly what's needed for a one-time backup before migration. |
| SQL parameter binding | String concatenation for SQL values | Prepared statements with `?` placeholders | SQL injection prevention, built into `node:sqlite` `StatementSync.run(...)`. Already established pattern in Phase 41-43 code. |

**Key insight:** The migration script is a glue layer between two existing storage backends. It should use existing infrastructure (`withTransaction()`, `DatabaseSync`, `store.get()`) rather than introducing new patterns.

## Common Pitfalls

### Pitfall 1: `_migrated_from_store` Deleted by `store-clear` (REGRESSION RISK)

**What goes wrong:** After migration completes, `store-clear` (the Phase 42 handler for clearing user data) runs `DELETE FROM settings`. This also deletes the `_migrated_from_store` row. On next app startup, migration re-runs and re-imports old electron-store data, overwriting whatever was set post-migration.

**Root cause:** The `store-clear` handler has no awareness of the `_migrated_from_store` flag. It uses a blanket `DELETE FROM settings`. The comment in store.handler.ts says "D-07: _migrated_from_store flag is managed by migration script (Phase 44), not DB" but the SQL doesn't enforce this.

**Prevention (choose one):**
1. **In `store-clear` (store.handler.ts):** Change `DELETE FROM settings` to `DELETE FROM settings WHERE key != '_migrated_from_store'`
2. **In migration:** Use a separate guard mechanism that survives `DELETE FROM settings` — e.g., a separate `migration_flags` table, or check both `_migrated_from_store` and that electron-store has data that was written before a certain date (too complex, not recommended)
3. **Documentation fix:** Ensure the planner for Phase 44 or Phase 42 includes updating `store-clear` to exclude `_migrated_from_store`

**Recommendation:** Include `store-clear` fix in the Phase 44 plan. It's a one-line change in `store.handler.ts`.

### Pitfall 2: Backup File Collision on Fresh Install

**What goes wrong:** D-12 says "overwrite existing `.bak`". D-13 says "if JSON doesn't exist, no backup". But what if `.bak` exists from a previous installation but `.json` does not? This is a data recovery ambiguity — the `.bak` would be orphaned.

**Mitigation:** Migration only checks for original `.json` existence. If it doesn't exist, skip backup. Orphaned `.bak` from previous install is harmless (just occupies disk space) and will be overwritten next time migration runs with a `.json` file present.

### Pitfall 3: `defaultCollectionId` Conflict with Auto-Creation in `favorites-get-collections`

**What goes wrong:** The `favorites-get-collections` handler auto-creates a default collection when the collections table is empty (lines 35-54 of `favorites.handler.ts`). If the migration imports collections within the `getDatabase()` lazy init, this handler will find the newly imported collections and NOT auto-create. However, if there were NO collections in electron-store, the migration inserts zero collections, then `favorites-get-collections` will auto-create. This is correct behavior — the default collection is created on first access, not during migration.

**No action needed.** The interaction is naturally correct due to ordering: migration runs before handlers access the database.

### Pitfall 4: `download_history.time` vs `created_at` Column

The electron-store `FinishedDownloadItem.time` field is a string (ISO date), which maps naturally to `created_at` in SQLite. However, the download_history schema has `created_at TEXT DEFAULT (datetime('now'))`. When inserting migrated data, the migration should explicitly set `created_at` from the item's `time` field rather than relying on the default (which would be the current timestamp, losing the original download time).

**Correct approach:**
```sql
INSERT INTO download_history (wallpaper_id, url, filename, file_path, file_size, resolution, data, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
-- created_at = item.time || datetime('now')
```

### Pitfall 5: First `getDatabase()` Call Timing

**What goes wrong:** Currently, `getDatabase()` is first called by an IPC handler (e.g., `favorites-get-collections` or `store-get`). This means migration runs during the FIRST IPC request processing. The splash screen is visible during this time (3-second minimum). For large datasets, migration completion time is additive to the first IPC response.

**Mitigation:** The migration is one-time. For typical datasets (hundreds of favorites, not thousands), it completes within milliseconds. No special progress UI needed. If datasets are very large (>5000 favorites), the 3-second splash minimum provides a timing buffer.

## Code Examples

### Migration Script Skeleton

```typescript
// Source: Derived from CONTEXT.md decisions E-01 through E-06, F-01 through F-03
// Combined with verified codebase patterns from database.ts

import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { store } from './store'
import { withTransaction } from './database'

export interface MigrationResult {
  migrated: boolean
  stats: {
    settings: number
    searchParams: number
    downloadHistory: number
    collections: number
    favorites: number
  }
  backupPath: string | null
}

const defaultStats = {
  settings: 0,
  searchParams: 0,
  downloadHistory: 0,
  collections: 0,
  favorites: 0,
}

export function runMigration(db: DatabaseSync): MigrationResult {
  // ── Idempotency guard (D-07) ──────────────────────────────────────
  const alreadyMigrated = db.prepare(
    "SELECT 1 FROM settings WHERE key = '_migrated_from_store'"
  ).get()
  if (alreadyMigrated) {
    console.log('[Migration] Already migrated (found _migrated_from_store)')
    return { migrated: false, stats: { ...defaultStats }, backupPath: null }
  }

  // ── Check electron-store file exists (D-13) ───────────────────────
  const userDataPath = app.getPath('userData')
  const storePath = join(userDataPath, 'wallhaven-data.json')
  if (!existsSync(storePath)) {
    console.log('[Migration] No electron-store file found (fresh install)')
    // H-03: Mark as migrated to prevent re-check
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')"
    ).run()
    return {
      migrated: true,
      stats: { ...defaultStats },
      backupPath: null,
    }
  }

  // ── Backup (outside transaction — D-10) ───────────────────────────
  const backupPath = join(userDataPath, 'wallhaven-data.json.bak')
  copyFileSync(storePath, backupPath)
  console.log(`[Migration] Backup created: wallhaven-data.json.bak`)

  // ── Transactional migration (F-01) ────────────────────────────────
  try {
    return withTransaction(() => {
      const stats = { ...defaultStats }

      // Read all 4 keys from electron-store (H-04: explicit null checks)
      const appSettings = store.get('appSettings')
      const queryParams = store.get('wallpaperQueryParams')
      const downloadHistoryList = store.get('downloadFinishedList')
      const favoritesData = store.get('favoritesData')

      // ── Collections (E-04, E-06) ────────────────────────────────
      const rawCollections = favoritesData &&
        typeof favoritesData === 'object' &&
        Array.isArray((favoritesData as any).collections)
        ? (favoritesData as any).collections
        : []

      const collectionStmt = db.prepare(
        `INSERT INTO collections (id, name, is_default, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?)`
      )

      for (const c of rawCollections) {
        const isDefault = !!(c.isDefault || c.id === (favoritesData as any).defaultCollectionId)
        collectionStmt.run(c.id, c.name, isDefault ? 1 : 0, c.createdAt, c.updatedAt)
        stats.collections++
      }

      // ── Favorites (E-05, E-06, G-01/G-02) ───────────────────────
      const rawFavorites = rawCollections.length > 0 &&
        Array.isArray((favoritesData as any).favorites)
        ? (favoritesData as any).favorites
        : []

      const validCollectionIds = new Set(rawCollections.map((c: any) => c.id))
      const validFavorites = rawFavorites.filter((f: any) =>
        validCollectionIds.has(f.collectionId)
      )

      if (validFavorites.length !== rawFavorites.length) {
        const filtered = rawFavorites.length - validFavorites.length
        console.warn(`[Migration] Filtered ${filtered} orphaned favorites`)
      }

      const favoriteStmt = db.prepare(
        `INSERT INTO favorites (collection_id, wallpaper_id, wallpaper_data, added_at)
         VALUES (?, ?, ?, ?)`
      )

      for (const f of validFavorites) {
        const wallpaperData = typeof f.wallpaperData === 'string'
          ? f.wallpaperData
          : JSON.stringify(f.wallpaperData)
        favoriteStmt.run(f.collectionId, f.wallpaperId, wallpaperData, f.addedAt)
        stats.favorites++
      }

      // ── Settings (E-01) ─────────────────────────────────────────
      if (appSettings !== null && appSettings !== undefined) {
        db.prepare(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
        ).run('appSettings', JSON.stringify(appSettings))
        stats.settings++
      }

      // ── Search Params (E-02) ─────────────────────────────────────
      if (queryParams !== null && queryParams !== undefined) {
        db.prepare(
          'INSERT OR REPLACE INTO search_params (id, value) VALUES (1, ?)'
        ).run(JSON.stringify(queryParams))
        stats.searchParams++
      }

      // ── Download History (E-03) ──────────────────────────────────
      if (Array.isArray(downloadHistoryList) && downloadHistoryList.length > 0) {
        const historyStmt = db.prepare(
          `INSERT INTO download_history
           (wallpaper_id, url, filename, file_path, file_size, resolution, thumbnail_path, data, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )

        for (const item of downloadHistoryList) {
          historyStmt.run(
            item.wallpaperId || item.id || null,
            item.url || null,
            item.filename || null,
            item.path || null,
            typeof item.size === 'number' ? item.size : null,
            item.resolution || null,
            item.small || null,
            JSON.stringify(item),
            item.time || new Date().toISOString(),
          )
          stats.downloadHistory++
        }
      }

      // ── Mark migration complete (D-08) — LAST in transaction ────
      db.prepare(
        "INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')"
      ).run()

      console.log(
        `[Migration] Complete. Settings: ${stats.settings}, SearchParams: ${stats.searchParams}, ` +
        `DownloadHistory: ${stats.downloadHistory}, Collections: ${stats.collections}, ` +
        `Favorites: ${stats.favorites}`
      )

      return {
        migrated: true,
        stats,
        backupPath,
      }
    })
  } catch (error) {
    console.error('[Migration] FAILED — transaction rolled back:', error)
    throw error
  }
}
```

### Modified `getDatabase()` Integration

```typescript
// In electron/main/database.ts — add import and call
import { runMigration } from './migration'

export function getDatabase(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(getDbPath(), {
      enableForeignKeyConstraints: true,
      timeout: 5000,
    })

    initializeSchema()

    // One-time migration from electron-store to SQLite
    // Completes before any handler accesses the database
    const result = runMigration(db)
    if (result.migrated) {
      console.log(`[Migration] Migration executed. Backup at: ${result.backupPath}`)
    }

    startPeriodicCheckpoint()
    startWalMonitor()
  }

  return db
}
```

### `store-clear` Guard Fix (store.handler.ts)

```typescript
// Change this in electron/main/ipc/handlers/store.handler.ts:
// FROM:
getDatabase().exec('DELETE FROM settings')
// TO:
getDatabase().exec("DELETE FROM settings WHERE key != '_migrated_from_store'")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| electron-store is the sole data store | electron-store + SQLite coexist | Phase 41-43 | Migration reads from electron-store, writes to SQLite |
| No migration script | `electron/main/migration.ts` | Phase 44 | One-time bridge between storage backends |
| `_migrated_from_store` flag undefined | Settings table has guard flag | Phase 44 | Ensures migration runs exactly once |
| `store-clear` deletes all settings | `store-clear` must exclude `_migrated_from_store` | Phase 44 (fix) | Prevents re-migration on next startup |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getDatabase()` is first called by an IPC handler after splash window is shown | Migration Script Skeleton — Control Flow | If `getDatabase()` is called earlier in startup (e.g., by main process module import), migration still works correctly — it just runs earlier. No data risk. |
| A2 | `_migrated_from_store` deletion by `store-clear` will cause re-migration on restart | Pitfall 1 | Risk is classified. Fix is provided in Code Examples section. Include in plan tasks. |
| A3 | `copyFileSync` is available in the Electron main process | Backup Strategy | Part of `node:fs`. Available in Node.js 24.14+ which Electron 41 ships. HIGH confidence. |
| A4 | `app.getPath('userData')` is available when `getDatabase()` is called | Backup Strategy | `getDatabase()` is called lazily, never at module import time. `app.ready()` has already fired. HIGH confidence (proven by existing database.ts usage). |

## Open Questions

1. **Should `store-clear` fix be in Phase 44 or a separate issue?**
   - What we know: The fix is a one-line change in store.handler.ts: add `WHERE key != '_migrated_from_store'` to the `DELETE FROM settings` statement.
   - What's unclear: Whether this fix belongs in Phase 44 (migration script) or should be deferred to Phase 45 (cleanup). It's directly related to migration guard integrity.
   - Recommendation: Include the fix in Phase 44. It's a safety measure that protects the migration flag. The change is trivial and prevents a subtle data-loss scenario.

2. **What is the actual `DownloadItem` shape stored in `downloadFinishedList`?**
   - What we know: The TypeScript types define `FinishedDownloadItem extends DownloadItem` with fields like `id`, `url`, `filename`, `path`, `resolution`, `size`, `time`, `wallpaperId`, `small`, etc.
   - What's unclear: Whether all electron-store records have the same fields. Some older records might be missing fields like `wallpaperId`.
   - Recommendation: Migrate with null-safe field access (as shown in code example). The `data` column preserves the full raw object regardless of individual field mapping.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — uses existing `node:sqlite`, `node:fs`, `electron-store` which are already in the project)

## Validation Architecture

> nyquist_validation is explicitly disabled in config.json (`workflow.nyquist_validation: false`). Section omitted per protocol.

## Security Domain

**Applicable ASVS categories for this phase are minimal** — the migration script reads from one storage backend and writes to another within the same main process. No external input, no network, no renderer interaction.

| Threat | Mitigation |
|--------|------------|
| SQL injection via electron-store data | Parameterized queries (`?` placeholders) for ALL INSERT statements. No string concatenation anywhere in migration. |
| Data exposure via backup file | Backup path is in `app.getPath('userData')` (same permissions as original file). No change in exposure risk. |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase] `electron/main/database.ts` — schema definition, `withTransaction()`, `getDatabase()` — all verified
- [VERIFIED: codebase] `electron/main/store.ts` — electron-store defaults: `{ wallpaperQueryParams: null, appSettings: null, downloadFinishedList: [] }`
- [VERIFIED: codebase] `electron/main/ipc/handlers/store.handler.ts` — `keyToTable()` routing, `store-clear` SQL
- [VERIFIED: codebase] `electron/main/ipc/handlers/favorites.handler.ts` — auto-creates default collection when collections empty
- [VERIFIED: codebase] `src/types/favorite.ts` — `Collection`, `FavoriteItem`, `FavoritesData` types
- [VERIFIED: codebase] `src/types/index.ts` — `AppSettings`, `FinishedDownloadItem`, `CustomParams` types
- [VERIFIED: codebase] `src/clients/constants.ts` — `STORAGE_KEYS` enum (4 key names)
- [VERIFIED: codebase] `electron/main/sqlite.d.ts` — `DatabaseSync` type declarations

### Secondary (MEDIUM confidence)
- [CITED: CONTEXT.md] Phase 44 CONTEXT.md — 10 locked decisions, detailed data transformation rules
- [CITED: PITFALLS.md] Existing pitfalls research — P1 (idempotent), P2 (transactional), P6 (orphan FK), P9 (defaults) directly apply

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `node:sqlite` + `node:fs` are built-ins, `electron-store` is existing dependency
- Architecture: HIGH — Single file, single transaction, integration point in `getDatabase()` is well-understood
- Pitfalls: HIGH — All relevant pitfalls already documented in PITFALLS.md; one new regression risk identified (`store-clear` interaction)

**Research date:** 2026-05-03
**Valid until:** No expiry (phase is a one-time migration script, not a library dependency decision)
