# Architecture Research: electron-store to SQLite Migration

**Domain:** Electron desktop wallpaper browser — migrating persistent storage from electron-store (JSON file) to SQLite (node:sqlite)
**Researched:** 2026-05-03
**Confidence:** HIGH

## Executive Summary

This document describes the new components, data flow changes, and integration strategy for replacing electron-store with SQLite in the existing 5-layer Electron + Vue 3 + TypeScript application. The migration keeps the existing `Client -> Repository -> Service -> Composable -> View` architecture intact while replacing the storage backend and introducing domain-specific IPC channels in place of the current generic store channels.

**Key insight:** The current architecture already has good separation of concerns — repositories abstract storage behind `electronClient.storeGet/storeSet`. The migration preserves this pattern but replaces the IPC backend: instead of 4 generic store IPC channels that map to a JSON file, domain-specific IPC channels map to SQLite queries. The Database module in the main process replaces `electron-store` as the persistence layer, mirroring the existing `store.ts` singleton pattern but using Node.js's built-in `node:sqlite` module (available in Node.js 24.14+, which ships with Electron 41).

**Architectural principle:** The migration is a **backend swap**, not a layer restructuring. Every existing layer keeps its role. The repository API surface (method signatures, return types) remains identical so that services, composables, and views are completely unaware of the change.

**Technology choice:** `node:sqlite` (Node.js built-in) instead of `better-sqlite3`. The built-in module provides the same synchronous API with zero new dependencies, zero native module rebuild concerns, and zero build pipeline changes. Electron 41 ships Node.js 24.14+ which includes `node:sqlite` at Stability 1.1 with no experimental flag required. The only cost is a ~30-line custom TypeScript declaration file since `@types/node` does not include `node:sqlite` types.

---

## Current Architecture (Baseline)

### Storage Data Flow

```
Renderer Process                          Main Process
┌──────────────────┐                    ┌──────────────────────────┐
│  View            │                    │  store.ts                │
│  (uses composable)│                    │  ┌──────────────────┐   │
│       │          │                    │  │ new Store({       │   │
│       ▼          │                    │  │   name: 'wallhaven│   │
│  Composable      │                    │  │   -data'          │   │
│  (useSettings,   │                    │  └──────────────────┘   │
│   useDownload,   │                    │           │             │
│   useFavorites)  │                    │           ▼             │
│       │          │                    │  store.handler.ts       │
│       ▼          │                    │  ┌──────────────────┐   │
│  Service         │                    │  │ 'store-get'     │   │
│  (orchestrates)  │                    │  │ 'store-set'     │   │
│       │          │                    │  │ 'store-delete'  │   │
│       ▼          │                    │  │ 'store-clear'   │   │
│  Repository      │                    │  └──────────────────┘   │
│  (4 repos)       │                    │           │             │
│       │          │                    │           ▼             │
│       ▼          │                    │  electron-store         │
│  Client (IPC)    │  ◄── IPC ──────►  │  (JSON file on disk)    │
│  electronClient  │                    │                          │
└──────────────────┘                    │  Direct store imports:  │
                                        │  ┌──────────────────┐   │
                                        │  │ download-queue.ts│   │
                                        │  │ download.handler │   │
                                        │  │   .ts            │   │
                                        │  └──────────────────┘   │
                                        └──────────────────────────┘
```

### What Currently Uses electron-store

**Renderer-side (via 4 generic IPC channels):**

| Repository | electron-store Key | Data Shape | Operations | IPC Calls Per Op |
|------------|-------------------|------------|------------|------------------|
| `settings.repository.ts` | `appSettings` | `AppSettings` JSON | get, set, delete | 1 per call |
| `wallpaper.repository.ts` | `wallpaperQueryParams` | `CustomParams` JSON | get, set, delete | 1 per call |
| `download.repository.ts` | `downloadFinishedList` | `FinishedDownloadItem[]` | get, set, add, remove, clear | 2 for add/remove (get+set) |
| `favorites.repository.ts` | `favoritesData` | `FavoritesData` JSON (collections + favorites + version) | getData, setData, createCollection, renameCollection, deleteCollection, setDefaultCollection, getFavorites, addFavorite, removeFavorite, moveFavorite, isFavorite, getCollectionsForWallpaper | 2 per mutation (get+set) |

**Main process direct reads (synchronous `store.get()`):**

| File | What It Reads | Why Sync |
|------|--------------|----------|
| `download-queue.ts` (line 94) | `store.get('appSettings')` to read `maxConcurrentDownloads` | Queue processing is synchronous |
| `download.handler.ts` (line 1005) | `store.get('appSettings.downloadPath')` to find pending downloads | Handler init is synchronous |

**Redundant settings mechanism:**
- `settings.handler.ts` also handles `save-settings`/`load-settings` IPC channels that read/write a separate `settings.json` file in `userData`. This is a SECOND persistence path alongside electron-store's `appSettings` key. The repositories use the electron-store path. This redundancy should be consolidated during migration.

### Important: Preload Type Duplication

The preload script (`electron/preload/index.ts`) defines its own `ElectronAPI` interface with store methods typed manually:
```typescript
storeGet: (key: string) => Promise<{ success: boolean; value: any; error?: string }>
storeSet: (params: { key: string; value: any }) => Promise<{ success: boolean; error?: string }>
```

The `electronClient` (`src/clients/electron.client.ts`) wraps these with `IpcResponse<T>` typing. Both the preload types and IPC channel whitelist (`electron/preload/types.ts`) must be considered during migration.

---

## Recommended Target Architecture

### System Overview

```
Renderer Process                          Main Process
┌──────────────────┐                    ┌──────────────────────────────┐
│  View            │                    │  SQLite (node:sqlite)        │
│       │          │                    │  ┌────────────────────────┐ │
│       ▼          │                    │  │ database.ts            │ │
│  Composable      │                    │  │  ├── getDatabase()     │ │
│       │          │                    │  │  ├── withTransaction() │ │
│       ▼          │                    │  │  └── closeDatabase()   │ │
│  Service         │                    │  └────────────────────────┘ │
│       │          │                    │           │                 │
│       ▼          │                    │           ▼                 │
│  Repository      │                    │  store.handler.ts           │
│  (4 repos)       │                    │  ┌────────────────────────┐ │
│  UNCHANGED API   │                    │  │ 'store-get' → SQLite   │ │
│       │          │                    │  │ 'store-set' → SQLite   │ │
│       ▼          │                    │  │ 'store-delete' → SQLite│ │
│  Client (IPC)    │  ◄── IPC ──────►  │  │ 'store-clear' → SQLite │ │
│  electronClient  │                    │  └────────────────────────┘ │
│  UNCHANGED API   │                    │                             │
└──────────────────┘                    │  Direct DB access:          │
                                        │  import { getDatabase }     │
                                        │    from '../../database'    │
                                        │  ┌──────────────────┐      │
                                        │  │ download-queue.ts│      │
                                        │  │ download.handler │      │
                                        │  │   .ts            │      │
                                        │  └──────────────────┘      │
                                        └──────────────────────────────┘
```

### Key Difference from Current Architecture

| Aspect | Current | Target |
|--------|---------|--------|
| Storage backend | electron-store (JSON file) | node:sqlite (SQLite file, built-in) |
| IPC channels | 4 generic (store-get/set/delete/clear) | Same 4 channels (backward compatible) |
| IPC handler implementation | `store.get(key)` | `db.prepare('SELECT value FROM settings WHERE key = ?').get(key)` |
| Main-process data access | `store.get('key')` synchronous | `getDatabase().prepare(...).get(key)` synchronous |
| Data format | Full JSON blob per key | Relational tables with queries |
| Schema | Implicit (defaults in Store constructor) | Explicit (CREATE TABLE in database.ts init) |
| Data migration | N/A | One-time migration on first SQLite launch |
| Dependencies added | None (electron-store removed) | None (node:sqlite is built-in) |

---

## New / Modified Files

### 1. `electron/main/database.ts` — NEW

**Purpose:** Singleton accessor for `node:sqlite` DatabaseSync, schema initialization, and transaction helper. Replaces `electron/main/store.ts` as the persistence module.

```typescript
// electron/main/database.ts
import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { join } from 'path'

let db: DatabaseSync

export function getDatabase(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(join(app.getPath('userData'), 'wallhaven-data.db'), {
      enableForeignKeyConstraints: true,
      timeout: 5000
    })
    initializeSchema()
  }
  return db
}

function initializeSchema(): void {
  db.exec(`
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

export function withTransaction<T>(fn: () => T): T {
  const d = getDatabase()
  try {
    d.exec('BEGIN')
    const result = fn()
    d.exec('COMMIT')
    return result
  } catch (error) {
    d.exec('ROLLBACK')
    throw error
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = undefined as unknown as DatabaseSync
  }
}
```

### 2. `electron/main/sqlite.d.ts` — NEW

**Purpose:** TypeScript type declarations for `node:sqlite`. Required because `@types/node` does not include `node:sqlite` types (Stability 1.1, DefinitelyTyped skips experimental modules).

```typescript
// electron/main/sqlite.d.ts
declare module 'node:sqlite' {
  type BindParams = Record<string, unknown> | unknown[]

  interface RunResult {
    lastInsertRowid: number
    changes: number
  }

  interface DatabaseOptions {
    enableForeignKeyConstraints?: boolean
    timeout?: number
  }

  interface ColumnInfo {
    name: string
    column: string | null
    table: string | null
    database: string | null
    type: string | null
  }

  export class StatementSync<T extends Record<string, unknown> = Record<string, unknown>> {
    all(...params: BindParams[]): T[]
    get(...params: BindParams[]): T | undefined
    run(...params: BindParams[]): RunResult
    iterate(...params: BindParams[]): IterableIterator<T>
    columns(): ColumnInfo[]
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseOptions)
    close(): void
    exec(sql: string): void
    prepare<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string
    ): StatementSync<T>
    readonly isOpen: boolean
    readonly isTransaction: boolean
  }
}
```

### 3. `electron/main/migrate.ts` — NEW

**Purpose:** One-time startup migration that reads data from electron-store and inserts into SQLite. Runs before IPC handlers register, after database initialization.

```typescript
// electron/main/migrate.ts
import { store } from './store' // kept during migration
import { getDatabase, withTransaction } from './database'

export function migrateFromElectronStore(): boolean {
  const db = getDatabase()

  // Guard: skip if already migrated
  const row = db.prepare('SELECT 1 FROM settings WHERE key = ?').get('_migrated_from_store')
  if (row) return false

  return withTransaction(() => {
    // 1. Settings
    const appSettings = store.get('appSettings')
    if (appSettings !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('appSettings', JSON.stringify(appSettings))
    }

    // 2. Search params
    const searchParams = store.get('wallpaperQueryParams')
    if (searchParams !== undefined) {
      db.prepare('INSERT OR REPLACE INTO search_params (id, value) VALUES (1, ?)')
        .run(JSON.stringify(searchParams))
    }

    // 3. Download history
    const downloads = store.get('downloadFinishedList') as unknown[]
    if (Array.isArray(downloads)) {
      const stmt = db.prepare('INSERT INTO download_history (data) VALUES (?)')
      for (const item of downloads) stmt.run(JSON.stringify(item))
    }

    // 4. Collections + Favorites
    const favoritesData = store.get('favoritesData') as Record<string, unknown> | null
    if (favoritesData) {
      const collections = favoritesData['collections'] as Array<Record<string, unknown>> | undefined
      if (collections) {
        const stmt = db.prepare(
          'INSERT OR REPLACE INTO collections (id, name, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        for (const c of collections) {
          stmt.run(c['id'], c['name'], c['isDefault'] ? 1 : 0, c['sortOrder'] ?? 0,
            c['createdAt'] ?? new Date().toISOString(), c['updatedAt'] ?? new Date().toISOString())
        }
      }

      const favorites = favoritesData['favorites'] as Array<Record<string, unknown>> | undefined
      if (favorites) {
        const stmt = db.prepare(
          'INSERT OR REPLACE INTO favorites (collection_id, wallpaper_id, wallpaper_data, added_at) VALUES (?, ?, ?, ?)'
        )
        for (const f of favorites) {
          stmt.run(f['collectionId'], f['wallpaperId'],
            JSON.stringify(f['wallpaperData'] ?? f), f['addedAt'] ?? new Date().toISOString())
        }
      }
    }

    // 5. Mark migration complete
    db.prepare("INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')").run()
  })
}
```

### 4. `electron/main/store.ts` — REMOVED (after migration complete)

Kept during migration phases for the migration script to read from. Removed in final cleanup.

### 5. `electron/main/ipc/handlers/store.handler.ts` — MODIFIED

The IPC handler signatures remain unchanged (backward compatible). Only the implementation changes:

```typescript
// CURRENT (electron-store):
ipcMain.handle('store-get', (_event, key: string) => {
  const value = store.get(key)
  return { success: true, value }
})

// FUTURE (node:sqlite):
ipcMain.handle('store-get', (_event, key: string) => {
  const row = getDatabase()
    .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
    .get(key)
  const value = row ? JSON.parse(row.value) : null
  return { success: true, value }
})
```

### 6. `electron/main/ipc/handlers/download-queue.ts` — MODIFIED

```typescript
// CURRENT (electron-store):
import { store } from '../../store'
const appSettings = store.get('appSettings') as unknown as { maxConcurrentDownloads?: number } | undefined

// FUTURE (node:sqlite):
import { getDatabase } from '../../database'
const row = getDatabase()
  .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
  .get('appSettings')
const appSettings = row ? JSON.parse(row.value) : null
```

### 7. `electron/main/ipc/handlers/download.handler.ts` — MODIFIED

Same pattern: replace `store?.get('appSettings.downloadPath')` with a SQLite query via `getDatabase()`.

### 8. Renderer-side files — NO CHANGES

All renderer-side files (`repositories/*.ts`, `services/*.ts`, `composables/*.ts`, `views/*.vue`, `clients/*.ts`) remain **completely unchanged** during the migration. The IPC channel names and return shapes are identical:

- `store-get('appSettings')` → `{ success: true, value: { ... } }` (same shape)
- `store-set({ key: 'appSettings', value: { ... } })` → `{ success: true }` (same shape)

---

## Data Flow Diagrams

### Current Flow (Settings Read)

```
useSettings() → settingsService.getSettings()
  → settingsRepository.get()
    → electronClient.storeGet<AppSettings>('appSettings')
      → window.electronAPI.storeGet('appSettings')
        → IPC invoke('store-get', 'appSettings')
          → store.handler.ts: store.get('appSettings')
            → electron-store JSON read
```

### Target Flow (Settings Read)

```
useSettings() → settingsService.getSettings()
  → settingsRepository.get()                    [UNCHANGED]
    → electronClient.storeGet<AppSettings>('appSettings')  [UNCHANGED]
      → window.electronAPI.storeGet('appSettings')  [UNCHANGED]
        → IPC invoke('store-get', 'appSettings')  [UNCHANGED channel name]
          → store.handler.ts: getDatabase().prepare(...).get('appSettings')
            → SQLite SELECT query (node:sqlite, synchronous)
```

### Migration Startup Flow

```
app.whenReady()
  → registerLocalFileProtocol()
  → getDatabase()                   (lazy init on first call)
    → new DatabaseSync(...)         (creates wallhaven-data.db)
    → initializeSchema()            (CREATE TABLE IF NOT EXISTS for all tables)
  → migrateFromElectronStore()
    → Guard: '_migrated_from_store' key exists? → Skip
    → Read all 4 electron-store keys
    → SQLite INSERT within transaction
    → Mark migration complete
  → createWindow() (splash)
  → createWindow() (main)
  → registerAllHandlers()
    → store.handler.ts now calls getDatabase() instead of store
```

### Main Process Direct Read (Current vs Target)

**Current:**
```
download-queue.ts: store.get('appSettings')
  → electron-store JSON synchronous read
```

**Target:**
```
download-queue.ts: getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get('appSettings')
  → SQLite synchronous query
  → JSON.parse(row.value)
  → No IPC involved — both are main-process modules
```

---

## Build Order

### Phase 1: Database Foundation

**Files:**
- NEW: `electron/main/database.ts` — getDatabase(), withTransaction(), schema init
- NEW: `electron/main/sqlite.d.ts` — TypeScript type declarations
- NEW: `electron/main/migrate.ts` — One-time migration script
- MODIFY: `electron/main/index.ts` — Add database init + migration call
- MODIFY: `electron/main/ipc/handlers/store.handler.ts` — Replace store.get/set with SQLite
- MODIFY: `electron/main/ipc/handlers/download-queue.ts` — Replace store.get with SQLite
- MODIFY: `electron/main/ipc/handlers/download.handler.ts` — Replace store.get with SQLite

**Why foundation first:** Everything depends on the database existing and the migration running before handlers process requests.

**Key insight:** This phase includes BOTH the database module AND the handler updates because the app won't start correctly if handlers still call `store.get()` after the database is initialized. These changes are atomic — the app goes from fully electron-store to fully SQLite in one phase, with the migration as the bridge.

### Phase 2: Cleanup

**Files:**
- REMOVE: `electron/main/store.ts`
- REMOVE: `registerStoreHandlers` from handler index
- MODIFY: `package.json` — Remove `electron-store` dependency
- REMOVE: `src/utils/store.ts` (already dead code)
- REMOVE: Legacy `save-settings`/`load-settings` channels from `settings.handler.ts` (dead code)
- REMOVE: Old preload store methods if no longer referenced
- REMOVE: Old electronClient store methods if no longer referenced

**Why cleanup last:** Only after the app is verified working with SQLite can the old electron-store code be safely removed.

---

## Rollback Strategy

### If migration fails or there are issues:

1. The migration script is idempotent — re-running is safe
2. The electron-store file (`wallhaven-data.json`) is NOT deleted — it remains as a backup
3. To roll back completely:
   - Delete `wallhaven-data.db` from `userData`
   - Revert code changes (git revert)
   - Restart — app reads from electron-store as before

### If a specific domain has issues:

1. Delete the SQLite file
2. Fix the issue
3. Restart — migration re-runs from electron-store

---

## IPC Strategy

### Channel Preservation

The key architectural decision is to **keep the 4 generic IPC channels** (`store-get`, `store-set`, `store-delete`, `store-clear`) instead of introducing domain-specific channels. The reasons:

1. **Zero renderer-side changes** — Repositories, electronClient, and preload code remain untouched
2. **Backward compatibility** — Existing IPC calls continue to work without any renderer updates
3. **Reduced migration scope** — Only the handler implementation changes, not the IPC protocol
4. **Minimal testing burden** — The renderer side doesn't need re-testing

The handler implementation switches from `store.get(key)` to `db.prepare('SELECT value FROM settings WHERE key = ?').get(key)`, keeping the same request/response contract.

---

## Schema Design

```sql
-- Settings (key-value pairs, JSON values)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Search params (singleton row)
CREATE TABLE IF NOT EXISTS search_params (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value TEXT
);

-- Download history (max 50 items, newest first)
CREATE TABLE IF NOT EXISTS download_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,          -- JSON blob of FinishedDownloadItem
  created_at TEXT DEFAULT (datetime('now'))
);

-- Collections
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Favorites (junction table with wallpaper data snapshot)
CREATE TABLE IF NOT EXISTS favorites (
  collection_id TEXT NOT NULL,
  wallpaper_id TEXT NOT NULL,
  wallpaper_data TEXT NOT NULL,  -- JSON blob of WallpaperItem
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, wallpaper_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_favorites_wallpaper ON favorites(wallpaper_id);
CREATE INDEX IF NOT EXISTS idx_download_history_created ON download_history(created_at DESC);
```

### Schema Rationale

| Table | Design Choice | Why |
|-------|--------------|-----|
| `settings` | Key-value rows | Simple, matches current electron-store pattern. JSON values for the AppSettings blob. |
| `search_params` | Singleton row with CHECK(id=1) | Only one set of search params exists. Single row eliminates ambiguity. |
| `download_history` | Auto-increment PK, JSON data column | Download items have many fields (id, url, filename, path, resolution, size, time, etc.). A JSON column avoids a 10+ column table for a capped list of 50 items. Index on created_at for DESC sorting. |
| `collections` | UUID primary key | Matches current `crypto.randomUUID()` pattern. `is_default` and `sort_order` as columns for querying. |
| `favorites` | Composite PK on (collection_id, wallpaper_id) | Natural key — a wallpaper appears in a collection at most once. FK with CASCADE ensures collection delete removes all its favorites. `wallpaper_data` JSON column stores the API response snapshot for offline display. |

---

## Patterns to Follow

### Pattern 1: Backward-Compatible IPC Channel Modification

**What:** Keep the exact same IPC channel names and `IpcResponse<T>` return format. Only change the handler implementation to use SQLite instead of electron-store.

**When to use:** When the renderer-side code (repositories, client, preload) is working well and doesn't need re-architecture. This minimizes migration scope and testing burden.

**Why this pattern:**
- Repositories, services, composables, and views require zero changes
- The `electronClient.storeGet<T>(key)` pattern remains identical
- Preload context bridge methods remain identical
- Testing focuses only on the main process handler logic

```typescript
// BEFORE (store.handler.ts):
ipcMain.handle('store-get', (_event, key: string) => {
  const value = store.get(key)
  return { success: true, value }
})

// AFTER (store.handler.ts):
ipcMain.handle('store-get', (_event, key: string) => {
  const row = getDatabase()
    .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
    .get(key)
  const value = row ? JSON.parse(row.value) : null
  return { success: true, value }
})
```

### Pattern 2: Lazy Singleton with Module-Level Init

**What:** The database connection is initialized on first access via `getDatabase()`, not at module import time. This avoids startup ordering issues and allows test code to control the database lifecycle.

**When to use:** When the database module is imported by files that may be loaded during testing, building, or development (e.g., Vite/electron-vite might import the main process module during build).

```typescript
let db: DatabaseSync

export function getDatabase(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(...)
    initializeSchema()
  }
  return db
}

// NOT this (eager init):
export const db = new DatabaseSync(...)  // Breaks if app.getPath('userData') not ready
```

### Pattern 3: Manual Transaction Wrapper

**What:** Since `node:sqlite` lacks `better-sqlite3`'s built-in `transaction()` helper, write a simple wrapper using raw SQL.

```typescript
export function withTransaction<T>(fn: () => T): T {
  const d = getDatabase()
  try {
    d.exec('BEGIN')
    const result = fn()
    d.exec('COMMIT')
    return result
  } catch (error) {
    d.exec('ROLLBACK')
    throw error
  }
}
```

---

## Anti-Patterns to Avoid

### 1. Adding a Third-Party SQLite Library

**What people do:** `npm install better-sqlite3` or `npm install @photostructure/sqlite` when `node:sqlite` is already available.

**Why wrong:** Electron 41 ships Node.js 24.14+ which includes `node:sqlite` at Stability 1.1 with no experimental flag. Adding a third-party library means:
- Native module compilation + rebuild step
- `asarUnpack` configuration for packaging
- Tracking compatibility matrix with Electron version upgrades
- CI build failures from native module compilation
- `@types/better-sqlite3` being 5 major versions behind (v7 types for v12 library)

**Do this instead:** Use `node:sqlite` with a ~30-line custom type declaration and a 5-line `withTransaction()` helper.

### 2. Changing IPC Channel Names

**What people do:** Take the opportunity to "clean up" IPC channel names from generic (`store-get`) to domain-specific (`settings-get`, `favorites-get-data`, etc.).

**Why wrong:** This doubles the migration scope — you're changing the IPC protocol AND the storage backend simultaneously. Every repository, the electronClient, the preload, and potentially services need updates. Testing must verify the entire renderer-to-main IPC chain, not just the storage layer.

**Do this instead:** Keep the 4 generic channels. The storage backend change is invisible to the renderer. If channel naming needs cleanup, do it as a separate milestone after the storage migration is verified.

### 3. Generic Key-Value API on Top of SQLite

**What people do:** Create a generic `get(key)` / `set(key, value)` wrapper that stores everything in a single `kvstore` table, replicating electron-store's API exactly.

**Why wrong:** This loses all the benefits of SQLite — no relational queries, no foreign keys, no indexes, no partial updates. You get the worst of both worlds: SQLite's setup overhead with electron-store's JSON-blob limitations.

**Do this instead:** Design the schema relationally from the start. Favorites and collections get proper tables with FK constraints. Download history gets indexed timestamps. Only settings and search params use key-value patterns (because they're genuinely simple).

### 4. Dual-Write During Migration

**What people do:** Write to both electron-store AND SQLite during the migration period to ensure no data loss.

**Why wrong:** Dual-write doubles the persistence code paths, creates consistency issues (what if one write succeeds and the other fails?), and makes the code harder to reason about.

**Do this instead:** One-way migration (electron-store → SQLite) with the electron-store file retained as a backup. After migration is verified, remove the old code.

### 5. Async IPC for Main-Process Database Reads

**What people do:** Make `download-queue.ts` or `download.handler.ts` call IPC channels to read settings from the renderer process, adding an unnecessary round-trip.

**Why wrong:** These modules already run in the main process. Adding IPC would create a circular flow (main process → renderer → main process) and break synchronous execution in the queue processor. `node:sqlite` is synchronous — it can be called directly.

**Do this instead:** Call `getDatabase().prepare(...).get(...)` directly in the main process module. No IPC needed.

---

## Integration Points

### New Internal Dependencies

```
database.ts             (standalone, depends on node:sqlite only)
migrate.ts              (depends on: database.ts, store.ts)
sqlite.d.ts             (type declarations, no runtime dependency)
store.handler.ts        (depends on: database.ts) [MODIFIED]
download.handler.ts     (depends on: database.ts) [MODIFIED]
download-queue.ts       (depends on: database.ts) [MODIFIED]
```

### Layer Changes Summary

| Layer | Change | Type |
|-------|--------|------|
| **View** | None | UNCHANGED |
| **Composable** | None | UNCHANGED |
| **Service** | None | UNCHANGED |
| **Repository** | None (IPC channel names unchanged) | UNCHANGED |
| **Client** | None (storeGet/storeSet signatures unchanged) | UNCHANGED |
| **Preload** | None (storeGet/storeSet bridge methods unchanged) | UNCHANGED |
| **Handler (store)** | Implementation switches from `store.get()` to `SQLite` | MODIFIED |
| **Handler (settings)** | Legacy `settings.json` handlers removed (dead code) | REMOVED |
| **Main process (store.ts)** | Removed after migration verified | REMOVED |
| **Main process (database.ts)** | NEW singleton, replaces store.ts | ADD |
| **Main process (migrate.ts)** | NEW one-time migration script | ADD |
| **Main process (sqlite.d.ts)** | NEW type declarations for node:sqlite | ADD |
| **Main process (download-queue.ts)** | Replace `store.get()` with `getDatabase()` | MINIMAL MODIFY |
| **Main process (download.handler.ts)** | Replace `store.get()` with `getDatabase()` | MINIMAL MODIFY |
| **Package.json** | Remove `electron-store` dependency | MODIFY |

---

## Scalability Considerations

| Concern | Expected (this app) | Approach |
|---------|---------------------|----------|
| Database size | <50MB | SQLite handles GB without issue. |
| Concurrent readers | 1-5 (single user desktop app) | node:sqlite supports concurrent reads via shared cache. No concern for single-process Electron. |
| Concurrent writers | 1 (single user, single process) | Single process, serialized writes. No concern. |
| Migration time | <1 second for expected data volumes | Synchronous in main thread during splash. |
| Future schema changes | Minimal (2-3 migrations over app lifetime) | Custom version tracking via `_migration_from_store` marker. Can evolve to versioned `_migrations` table if needed. |
| Query complexity | Simple CRUD, favorites+collections join | Raw SQL with prepared statements is sufficient. |

---

## Sources

- [Electron 41.0.0 Release Announcement](https://az.electronjs.org/blog/electron-41-0) — Node.js v24.14.0 confirmed with `node:sqlite`
- [Node.js 24 `node:sqlite` Documentation](https://nodejs.org/download/nightly/v24.0.0-nightly20250503f552c86fec/docs/api/sqlite.html) — Official API reference
- Current codebase analysis: `electron/main/store.ts`, `electron/main/ipc/handlers/store.handler.ts`, 4 repository files, `download-queue.ts`, `download.handler.ts`, `electron.client.ts`, `preload/index.ts`, `settings.handler.ts`, `src/utils/store.ts`
- SQLite documentation: WAL mode, `PRAGMA foreign_keys`, `ON DELETE CASCADE`, prepared statements
- [TypeScript 6.0 Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6.0/) — Confirms TS 6.0 does not add Node built-in module types
- Previous architecture documents (v4.0 milestone)

---
*Architecture research for: v5.0 electron-store to SQLite migration*
*Researched: 2026-05-03*
