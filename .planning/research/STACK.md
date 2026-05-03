# Technology Stack: electron-store to SQLite Migration

**Project:** Wallhaven Wallpaper Browser
**Researched:** 2026-05-03
**Mode:** Ecosystem comparison (SQLite libraries for Electron main process)
**Milestone:** v5.0 (electron-store to SQLite migration)

---

## Executive Recommendation

**Use `node:sqlite` (Node.js built-in) -- zero new dependencies.**

Electron 41 ships **Node.js v24.14.0+**, which includes `node:sqlite` at Stability 1.1 (Active development) with **no experimental flag required**. The entire API surface this project needs -- `new DatabaseSync()`, `.prepare()`, `.get()`, `.all()`, `.run()`, `.exec()` -- has been stable across Node.js 22 through 25 releases.

The previously considered alternative (`better-sqlite3`) adds native module compilation, `electron-rebuild`, `asarUnpack`, and outdated TypeScript types (`@types/better-sqlite3@7.6.13` locked to the v7 API, incompatible with v12). Given the project's small data volume and existing Repository abstraction layer, the built-in module provides everything needed with zero dependency overhead and zero build integration concerns.

---

## Recommended Stack

### Core Database Engine

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `node:sqlite` (built-in) | Node.js 24.14+ (ships with Electron 41) | SQLite database engine | Zero dependencies, no native compilation, synchronous API matches current `electron-store` pattern, no `asarUnpack` needed, no `electron-rebuild` required. Available at `import { DatabaseSync } from 'node:sqlite'` out of the box. |

### TypeScript Types

| File | Purpose |
|------|---------|
| `electron/main/sqlite.d.ts` (custom declaration, ~30 lines) | Provides `DatabaseSync` and `StatementSync` types. Required because `@types/node` does not include `node:sqlite` types (module is Stability 1.1, DefinitelyTyped skips experimental modules). |

### Database File

| File | Location | Purpose |
|------|----------|---------|
| `wallhaven-data.db` | `app.getPath('userData')` (same directory as the current `wallhaven-data.json`) | Replaces `electron-store` JSON blob storage with a proper relational database. |

---

## Installation

**No new packages to install.**

### Removals (after migration is complete and verified)

```bash
npm uninstall electron-store
```

The existing `electron-store` is currently in `devDependencies` and must be kept during migration phases for the migration script to read from. Remove in the final cleanup phase.

### No changes to existing build pipeline

| Config File | Change Needed | Reason |
|-------------|--------------|--------|
| `electron.vite.config.ts` | **None** | `externalizeDepsPlugin()` is already configured. `node:sqlite` is a built-in Node.js module -- Vite/Rollup handles it natively. No `rollupOptions.external` additions needed. |
| `electron-builder.yml` | **None** | No native `.node` binary to unpack from ASAR. The existing `asarUnpack` entries for `sharp` and `@img` remain unchanged. |
| `electron-builder.yml` (`npmRebuild`) | **None** | `npmRebuild: true` continues handling `sharp`. `node:sqlite` does not need rebuilding. |
| `postinstall` script | **None** | `electron-builder install-app-deps` continues working for `sharp`. No changes needed. |

This is the headline advantage over `better-sqlite3`: **zero configuration changes to the build pipeline.**

---

## Supported Data Patterns

| Pattern | Current (electron-store) | Future (node:sqlite) |
|---------|-------------------------|---------------------|
| **JSON config** (appSettings) | `store.get('appSettings')` | `db.prepare('SELECT value FROM settings WHERE key = ?').get('appSettings')` |
| **Singleton row** (wallpaperQueryParams) | `store.get('wallpaperQueryParams')` | `db.prepare('SELECT value FROM search_params WHERE id = 1').get()` |
| **Small capped array** (downloadFinishedList, max 50) | `store.get('downloadFinishedList')` | `db.prepare('SELECT data FROM download_history ORDER BY id DESC LIMIT 50').all()` |
| **Nested JSON** (favoritesData: collections + favorites) | `store.get('favoritesData')` - read full blob, modify in memory, write full blob | Separate `collections` and `favorites` tables with proper joins and indexes. Targeted INSERT/DELETE without reading the full blob. |
| **O(1) existence check** (favorites - isFavorited) | `favoriteIds.has(wallpaperId)` (in-memory Set, populated from full JSON blob) | `db.prepare('SELECT 1 FROM favorites WHERE wallpaper_id = ? LIMIT 1').get(id)` - SQL index lookup, no deserialization needed |

---

## Database Module Structure

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

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = undefined as unknown as DatabaseSync
  }
}
```

---

## API Surface Comparison

The `node:sqlite` API mirrors `better-sqlite3` closely. Both are synchronous.

| Operation | better-sqlite3 | node:sqlite |
|-----------|---------------|-------------|
| Open database | `new Database(path)` | `new DatabaseSync(path)` |
| Prepare statement | `db.prepare(sql)` | `db.prepare(sql)` |
| Get single row | `stmt.get(params)` | `stmt.get(params)` |
| Get all rows | `stmt.all(params)` | `stmt.all(params)` |
| Execute write | `stmt.run(params)` | `stmt.run(params)` |
| Execute raw SQL | `db.exec(sql)` | `db.exec(sql)` |
| Transaction | `db.transaction(fn)()` | Manual: `BEGIN`/`COMMIT`/`ROLLBACK` |
| Pragma | `db.pragma('key')` | `db.exec('PRAGMA key')` |
| Close | `db.close()` | `db.close()` |

**Key differences:**
- `node:sqlite` lacks a built-in `transaction()` helper -- use raw SQL (`BEGIN`/`COMMIT`/`ROLLBACK`)
- `node:sqlite` lacks a `pragma()` shortcut -- use `db.exec('PRAGMA ...')`
- `node:sqlite` uses `Record<string, unknown>` row types (identical to `better-sqlite3`) -- both are looser than an ORM but sufficient with type assertions in the Repository layer

---

## Transaction Wrapper

Since `node:sqlite` lacks `better-sqlite3`'s built-in `.transaction()` method, write a small utility:

```typescript
// electron/main/database.ts (add to file)

export function withTransaction<T>(fn: () => T): T {
  const db = getDatabase()
  try {
    db.exec('BEGIN')
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
```

This is used in the migration script and for writes that touch multiple tables (e.g., inserting a collection with initial favorites, or capping download_history at 50 entries).

---

## Migration Script Architecture

Keep `electron-store` as a readonly source during migration, running the script once on first launch after the upgrade:

```typescript
// electron/main/migrate.ts
import { store } from '../store' // kept during migration
import { getDatabase, withTransaction } from './database'

export function migrateFromElectronStore(): boolean {
  const db = getDatabase()

  // Guard: skip if already migrated
  const row = db.prepare('SELECT 1 FROM settings WHERE key = ?').get('_migrated_from_store')
  if (row) return false

  return withTransaction(() => {
    // 1. Migrate appSettings
    const appSettings = store.get('appSettings')
    if (appSettings !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
        .run('appSettings', JSON.stringify(appSettings))
    }

    // 2. Migrate search params
    const searchParams = store.get('wallpaperQueryParams')
    if (searchParams !== undefined) {
      db.prepare('INSERT OR REPLACE INTO search_params (id, value) VALUES (1, ?)')
        .run(JSON.stringify(searchParams))
    }

    // 3. Migrate download history
    const downloads = store.get('downloadFinishedList') as unknown[]
    if (Array.isArray(downloads)) {
      const stmt = db.prepare('INSERT INTO download_history (data) VALUES (?)')
      for (const item of downloads) {
        stmt.run(JSON.stringify(item))
      }
    }

    // 4. Migrate collections
    const favoritesData = store.get('favoritesData') as Record<string, unknown> | null
    if (favoritesData) {
      const collections = favoritesData['collections'] as Array<Record<string, unknown>> | undefined
      if (collections) {
        const stmt = db.prepare(
          'INSERT OR REPLACE INTO collections (id, name, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        for (const c of collections) {
          stmt.run(
            c['id'], c['name'], c['isDefault'] ? 1 : 0, c['sortOrder'] ?? 0,
            c['createdAt'] ?? new Date().toISOString(),
            c['updatedAt'] ?? new Date().toISOString()
          )
        }
      }

      // 5. Migrate favorites
      const favorites = favoritesData['favorites'] as Array<Record<string, unknown>> | undefined
      if (favorites) {
        const stmt = db.prepare(
          'INSERT OR REPLACE INTO favorites (collection_id, wallpaper_id, wallpaper_data, added_at) VALUES (?, ?, ?, ?)'
        )
        for (const f of favorites) {
          stmt.run(
            f['collectionId'], f['wallpaperId'],
            JSON.stringify(f['wallpaperData'] ?? f),
            f['addedAt'] ?? new Date().toISOString()
          )
        }
      }
    }

    // 6. Mark migration complete
    db.prepare("INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')").run()
  })
}
```

---

## Alternatives Considered

### Option A (Rejected): better-sqlite3 v12.9.0

| Factor | Assessment |
|--------|-----------|
| **API** | Excellent. Synchronous, built-in `transaction()` and `pragma()` helpers. The gold standard for Node.js SQLite ergonomics. |
| **TypeScript types** | **Critical weakness.** `@types/better-sqlite3@7.6.13` (latest on DefinitelyTyped, April 2025) covers the **v7 API only**. The current `better-sqlite3` is v12.x with different `pragma()` return types, `checkpoint()` API, and `Int64` -> `Integer` changes. The types are wrong for the installed version. Custom declarations are needed anyway, negating the "types included" advantage. |
| **Electron 41 compatibility** | Fixed in v12.8.0 via a `HolderV2()` V8 API patch. Must use >= v12.8.0. Earlier v12.7.x releases are **broken** for Electron 41. Requires tracking compatibility matrix on each Electron upgrade. |
| **electron-vite integration** | Must be in `dependencies` (not devDependencies) for `externalizeDepsPlugin()` to externalize it. Doable but requires awareness. |
| **electron-builder packaging** | Must add `asarUnpack: ['node_modules/better-sqlite3/**']` to `electron-builder.yml` alongside the existing `sharp` unpack entry. Must ensure `npmRebuild: true` rebuilds it. |
| **Build complexity** | Adds native compilation step that can fail on CI or locked-down environments. The project already has one native module (`sharp`); adding another multiplies the risk of version-specific build failures. |
| **Maintenance burden** | Each Electron major version upgrade requires verifying better-sqlite3 has updated its prebuilds. Past failures (v12.7.x broken for Electron 41, NODE_MODULE_VERSION mismatches) show this is not frictionless. |
| **Verdict** | **Not recommended.** The TypeScript type situation is the decisive negative: the official types are locked to v7, and writing custom declarations for `better-sqlite3` means you have the same effort as writing them for `node:sqlite` but with the added burden of native module management. The `node:sqlite` built-in avoids all build integration issues with no equivalent loss of functionality. |

### Option B (Rejected): @photostructure/sqlite

| Factor | Assessment |
|--------|-----------|
| **API** | Drop-in compatible with `node:sqlite` plus `enhance()` for `transaction()` and `pragma()` helpers. |
| **TypeScript types** | Excellent -- ships complete type definitions. |
| **Dependencies** | Zero dependencies. Prebuilt binaries for Windows/macOS/Linux (x64 + ARM64). |
| **Build integration** | Prebuilt binaries avoid compilation, but are still native `.node` binaries. May need `asarUnpack`. |
| **Maturity** | Young project (May 2025, ~7 stars on GitHub). Single maintainer (PhotoStructure / @mceachen). |
| **Verdict** | **Not recommended over built-in `node:sqlite`.** Since Electron 41 ships Node.js 24.14+ with `node:sqlite`, adding this package provides only `enhance()` helpers and TypeScript types -- both easily replicated with a ~30-line type declaration and a 5-line `withTransaction()` wrapper. Adding a third-party native dependency for marginal benefit is unnecessary. Worth knowing as a fallback if `node:sqlite` has issues. |

### Option C (Rejected): sql.js (WASM-based)

| Factor | Assessment |
|--------|-----------|
| **API** | Synchronous after async init. WASM-based, no native compilation. |
| **Persistence** | **Manual save required.** In-memory; must call `fs.writeFileSync()` on every write. Data loss risk if the app crashes before save. |
| **Performance** | WASM overhead. For the app's data volume (<500 rows), the difference is negligible, but the persistence risk is not. |
| **Verdict** | **Not recommended.** `node:sqlite` provides native disk persistence with ACID guarantees at zero cost. sql.js is best when native modules cannot be used (browser, locked-down platforms) -- neither constraint applies here. |

### Option D (Rejected): node-sqlite3 (a.k.a. sqlite3)

| Factor | Assessment |
|--------|-----------|
| **API** | Async callback-based. Does not match the synchronous `electron-store` pattern. |
| **Status** | **Deprecated as of December 2025.** |
| **Verdict** | **Not recommended.** Deprecated and async. Using it would require rewriting all store consumers for async access, adding significant migration scope. |

---

## TypeScript Type Declaration

Create `electron/main/sqlite.d.ts` with only the types actually used:

```typescript
// electron/main/sqlite.d.ts
// Custom type declarations for node:sqlite (built-in, Stability 1.1)
// @types/node does not include these due to experimental status.
// Minimal surface -- only what this project uses.

declare module 'node:sqlite' {
  type BindParams = Record<string, unknown> | unknown[]

  interface RunResult {
    lastInsertRowid: number
    changes: number
  }

  interface DatabaseOptions {
    open?: boolean
    readOnly?: boolean
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
    readonly sourceSQL: string
    readonly expandedSQL: string
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseOptions)
    close(): void
    exec(sql: string): void
    open(): void
    prepare<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string
    ): StatementSync<T>
    readonly isOpen: boolean
    readonly isTransaction: boolean
  }
}
```

---

## Wiring into the Existing Architecture

### File Changes

```
electron/main/
  store.ts              -- REMOVE (after migration verified)
  database.ts           -- ADD (SQLite connection + schema init + withTransaction)
  migrate.ts            -- ADD (one-time data migration from electron-store)
  sqlite.d.ts           -- ADD (TypeScript type declarations for node:sqlite)
  ipc/handlers/
    store.handler.ts    -- MODIFY (replace store.get/set with SQLite queries)
```

### Store Handler Modification Pattern

The IPC handler signatures remain unchanged. Only the implementation changes:

```typescript
// Current (electron-store):
ipcMain.handle('store-get', (_event, key: string) => {
  const value = store.get(key)
  return { success: true, value }
})

// Future (node:sqlite):
ipcMain.handle('store-get', (_event, key: string) => {
  const row = getDatabase()
    .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
    .get(key)
  const value = row ? JSON.parse(row.value) : null
  return { success: true, value }
})
```

### Renderer Impact

**No changes.** The IPC channel signatures remain identical:
- `store-get` -> returns `{ success: true, value }` (same shape)
- `store-set` -> accepts `{ key, value }` (same shape)
- `store-delete` -> accepts `key` (same shape)
- `store-clear` -> no args (same shape)

The `ElectronClient`, repositories, services, composables, and views are entirely unaffected.

---

## Security Implications

| Concern | Mitigation |
|---------|------------|
| SQL injection | All queries use parameterized prepared statements (`?` placeholders). Never interpolate user input into SQL strings. |
| Database file access | Stored in `app.getPath('userData')`, which is user-private on all platforms (macOS: `~/Library/Application Support/`, Windows: `%APPDATA%`, Linux: `~/.config/`). |
| Extension loading | `allowExtension` defaults to `false` in the DatabaseSync constructor. Not set -- no extensions loaded. |
| Data integrity | WAL mode is the default in SQLite 3.51+ (the version in Node.js 24). `enableForeignKeyConstraints: true` ensures referential integrity between collections and favorites. |

---

## Confidence Assessment

| Aspect | Confidence | Reason |
|--------|------------|--------|
| `node:sqlite` availability in Electron 41 | HIGH | Official blog post confirms Node.js v24.14.0. Node.js 24 ships `node:sqlite` without experimental flag. |
| `node:sqlite` API stability for this project | HIGH | Only using prepare/get/all/run/exec -- the most stable part of the API. These have not changed across Node.js 22-25. |
| TypeScript custom declaration adequacy | MEDIUM | The declaration file covers only what is used. If `node:sqlite` types change in an edge case not tested here, the declaration may need adjustment. Mitigation: the Repository layer insulates most code from the declaration. |
| `@types/better-sqlite3` being outdated | HIGH | DefinitelyTyped shows v7.6.13 as latest. better-sqlite3 is on v12.x. The API surface has diverged. |
| electron-builder integration risk (node:sqlite) | HIGH (no risk) | No native module, no asarUnpack, no rebuild needed. Works identically in dev and packaged builds. |
| electron-builder integration risk (better-sqlite3) | MEDIUM | Known to cause "Cannot find module" errors after packaging (multiple SO threads). Requires asarUnpack + rebuild + external config. |

---

## Sources

- [Electron 41.0.0 Release Announcement](https://az.electronjs.org/blog/electron-41-0) -- Node.js v24.14.0 confirmed -- HIGH confidence
- [Node.js 24 `node:sqlite` Documentation (nightly)](https://nodejs.org/download/nightly/v24.0.0-nightly20250503f552c86fec/docs/api/sqlite.html) -- Official API reference -- HIGH confidence
- [SQLite library comparison (photostructure)](https://photostructure.github.io/node-sqlite/documents/library-comparison.html) -- Stability level matrix across Node.js versions -- MEDIUM confidence
- [TypeScript 6.0 Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6.0/) -- Confirms TS 6.0 does not add Node built-in module types -- HIGH confidence
- [@types/better-sqlite3 npm page](https://www.npmjs.com/package/@types/better-sqlite3) -- v7.6.13, indexed for v7 API -- HIGH confidence
- [better-sqlite3 v12.8.0 Release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.7.0) -- Electron 41 V8 fix (HolderV2) -- MEDIUM confidence
- [electron-vite Dependency Handling](https://electron-vite.org/guide/dependency-handling) -- Official docs on native module externalization -- HIGH confidence
- [electron-vite Distribution Guide](https://electron-vite.org/guide/distribution) -- asarUnpack configuration for native modules -- HIGH confidence
- Current codebase: `electron/main/store.ts`, `electron.vite.config.ts`, `electron-builder.yml`, `src/clients/electron.client.ts`, `src/clients/constants.ts`, `src/repositories/`, `package.json`

---

*Researched: 2026-05-03 for v5.0 milestone*
