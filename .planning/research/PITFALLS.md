# Pitfalls Research: electron-store to SQLite Migration

**Domain:** Electron desktop wallpaper browser — migrating persistent storage from JSON-file (electron-store) to SQLite (node:sqlite)
**Researched:** 2026-05-03
**Confidence:** HIGH (based on codebase analysis + established SQLite migration patterns + node:sqlite official docs + real-world Electron + SQLite post-mortems)

---

## Critical Pitfalls

Mistakes that cause data loss or require rewrites.

### Pitfall 1: Non-Idempotent Migration (Data Duplication on Restart)

**What goes wrong:** The migration script runs on every app startup without checking if it already ran. Each restart doubles the data in SQLite — settings get duplicated rows, download history gets duplicate entries, favorites get duplicate wallpaper records.

**Why it happens:** The migration script is written as "read from electron-store, write to SQLite" without an idempotency guard. The developer tests once (works fine), then each subsequent restart adds duplicate data.

**Consequences:** Download history shows duplicates. Collections have duplicate entries. Total data corruption requiring manual SQLite file deletion.

**Prevention:** Guard the migration with TWO checks:
1. Check if SQLite already has migration record (e.g., `SELECT 1 FROM settings WHERE key = '_migrated_from_store'`)
2. Record migration marker in the settings table and check before running

```typescript
// Correct — idempotent
function migrateFromElectronStore(): boolean {
  const db = getDatabase()

  // Guard: skip if already migrated
  const row = db.prepare('SELECT 1 FROM settings WHERE key = ?').get('_migrated_from_store')
  if (row) return false

  // Guard: nothing to migrate from electron-store?
  const appSettings = store.get('appSettings')
  if (appSettings === undefined) return false // Fresh install — nothing to migrate

  // Run migration inside transaction
  withTransaction(() => {
    // ... migrate data ...
    db.prepare("INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')").run()
  })

  return true
}
```

**Detection:** Run the app twice. Check if settings, download history, or favorites have been duplicated on the second launch.

**Phase to address:** Phase 1 — Database Foundation (the migration script is created in this phase)

---

### Pitfall 2: Migration Fails Mid-Transaction, Leaving Partial Data

**What goes wrong:** The migration reads data from electron-store and starts writing to SQLite. Halfway through (e.g., after settings but before favorites), the migration crashes or throws. SQLite now has partial data — settings migrated but favorites lost. On restart, the migration check sees settings exist and skips, leaving favorites permanently missing.

**Why it happens:** Without a transaction wrapper, each INSERT commits independently. A crash between INSERT groups commits some data and loses the rest. The idempotency check on restart sees "has migration marker" and skips, never retrying the favorites migration.

**Consequences:** Permanent data loss for domains that were written after the crash point.

**Prevention:** Wrap ALL migration INSERTs in a single SQLite transaction using `withTransaction()`. If any INSERT fails, the entire migration is rolled back. The next startup sees no migration marker and retries from scratch.

```typescript
// Correct — all-or-nothing transaction using node:sqlite
withTransaction(() => {
  // Settings
  for (const [key, value] of Object.entries(settings)) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, JSON.stringify(value))
  }
  // Download history
  for (const item of history) {
    db.prepare('INSERT INTO download_history (data) VALUES (?)').run(JSON.stringify(item))
  }
  // Collections
  for (const c of collections) {
    db.prepare('INSERT INTO collections ...').run(...)
  }
  // Favorites
  for (const f of favorites) {
    db.prepare('INSERT INTO favorites ...').run(...)
  }
  // Record migration
  db.prepare("INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')").run()
})
```

**Detection:** Unit test: mock the favorites INSERT to throw, run migration, verify SQLite is empty (no partial data).

**Phase to address:** Phase 1 — Database Foundation

---

### Pitfall 3: Main Process Still Reads from electron-store After Migration

**What goes wrong:** The migration copies data from electron-store to SQLite. But the main process modules (`download-queue.ts`, `download.handler.ts`) still import `store` and call `store.get('appSettings')`. They never read the migrated data in SQLite. If the migration deleted or overwrote the electron-store file, settings are lost for the main process.

**Why it happens:** The migration only transfers data. It doesn't update import paths. The main process modules directly import `store` from `electron/main/store.ts` and have no awareness of the database.

**Critical specific case in this codebase:** `download-queue.ts` line 94 reads `appSettings` directly via:
```typescript
const appSettings = store.get('appSettings') as unknown as { maxConcurrentDownloads?: number } | undefined
```
This is a synchronous, direct electron-store read. After migration, the queue will keep reading stale electron-store data unless this import is changed to the SQLite database module. If electron-store is removed (or its file is deleted), this code path will crash or return `undefined`, causing `maxConcurrentDownloads` to silently fall back to the default of 3.

**Consequences:** Download queue uses default `maxConcurrentDownloads = 3` even though user set it to 5. Pending download scanner can't find the download path. User's settings don't apply to downloads.

**Prevention:** Update ALL main-process `store.get()` calls to use `getDatabase()` in the same phase as migration. The `download-queue.ts` and `download.handler.ts` must import `getDatabase` from `../../database` instead of `store` before the migration writes final data.

```typescript
// In download-queue.ts — BEFORE (reads from electron-store, WRONG after migration)
import { store } from '../../store'
const appSettings = store.get('appSettings') as any

// In download-queue.ts — AFTER (reads from SQLite, CORRECT)
import { getDatabase } from '../../database'
const row = getDatabase()
  .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
  .get('appSettings')
const appSettings = row ? JSON.parse(row.value) : null
```

**Detection:** Grep for `import.*store.*from.*store` in `electron/main/` directory after migration completion. Every match is a bug.

**Phase to address:** Phase 2 — Main Process Module Cutover (BEFORE Phase 3 IPC changes)

---

### Pitfall 4: IPC Channel Name Conflicts / Dual Registration Race

**What goes wrong:** During the migration period, both the old generic store handlers and the new domain handlers are registered. An old handler accidentally handles a request intended for a new handler (or vice versa), causing incorrect data routing or double registration errors from Electron.

**Why it happens:** The `store.handler.ts` registers `ipcMain.handle('store-get', ...)` while the new `settings.handler.ts` registers `ipcMain.handle('settings-get', ...)`. These are different channel names, so no conflict exists — UNLESS the preload script still maps the old channel names AND the repository has already switched to the new channels. The renderer sends to old channels but only new handlers exist, resulting in timeout errors.

**How this project avoids it:** The recommended architecture keeps the SAME 4 generic IPC channel names (`store-get`, `store-set`, `store-delete`, `store-clear`). Only the handler implementation changes (from `store.get()` to SQLite). This eliminates the dual-registration problem entirely — there is never a period where both old and new handlers exist for the same channel.

**Consequences (if channels were renamed):** Settings changes silently fail. The user adjusts `maxConcurrentDownloads` but it's never persisted because the IPC channel handler is missing or misrouted.

**Prevention:** Follow the backward-compatible IPC strategy:
1. Keep existing channel names unchanged
2. Modify handler implementation to use SQLite (same signature, new backend)
3. Repositories, electronClient, preload require zero changes
4. Only remove dead handler code after all migration phases are verified

**Detection:** After each change, verify: "Can the renderer read/write settings through the same channels as before?"

**Phase to address:** Phase 3 — Store Handler Migration (generic IPC)

---

### Pitfall 5: Misunderstanding That node:sqlite Needs Build Integration (It Does Not)

**What goes wrong:** A developer familiar with `better-sqlite3` assumes `node:sqlite` also needs `electron-rebuild`, `asarUnpack`, and `externalizeDepsPlugin()` configuration. They add unnecessary build pipeline changes, or worse, assume it won't work and add a third-party SQLite library.

**Why it happens:** The dominant Node.js SQLite library (`better-sqlite3`) is a native module that requires compilation for Electron's ABI. This pattern is well-known from many Electron + SQLite tutorials and StackOverflow answers. Developers unfamiliar with Node.js 24's built-in `node:sqlite` module apply the same mental model.

**Consequences:** Wasted effort adding build configuration that isn't needed. Risk of breaking the existing build pipeline by adding `asarUnpack` entries or external dependencies. Worse: choosing `better-sqlite3` instead of `node:sqlite`, introducing all the native module management burden.

**Prevention:** Understand that `node:sqlite` is a built-in Node.js module (like `fs`, `path`, `crypto`). It requires:
- **No** `npm install` — it ships with the runtime
- **No** `electron-rebuild` — no native `.node` binary
- **No** `asarUnpack` — nothing to unpack from ASAR
- **No** `electron.vite.config.ts` changes — built-in modules are handled natively

```typescript
// All that's needed for the database module:
import { DatabaseSync } from 'node:sqlite'  // Built-in, zero dependencies
```

**Detection:** Build pipeline changes that explicitly reference a SQLite library (asarUnpack entries, rollupOptions.external additions, postinstall rebuild commands) are a red flag. The project should have NO build changes for SQLite.

**Phase to address:** Phase 1 — Database Foundation (confirm zero build config changes at the start)

---

### Pitfall 6: Favorites Data Loss from FK Constraint Violations

**What goes wrong:** During migration, favorite items reference `collection_id` values that don't exist in the `collections` table. SQLite's foreign key enforcement rejects the INSERT with a FK violation. The migration throws, the transaction rolls back, and NO data is migrated. The app starts with an empty SQLite database.

**Why it happens:** The electron-store `FavoritesData` blob may contain favorites referencing collection IDs that don't exist in the `collections` array. This can happen from earlier bugs, manual data manipulation, or partial writes.

**Consequences:** Complete migration failure. All data appears lost (though electron-store backup still exists).

**Prevention:** Two approaches:
1. **Strict:** Filter orphaned favorites before migration
2. **Lenient:** Disable FK enforcement during migration (remove `enableForeignKeyConstraints: true` from DatabaseSync constructor) — then clean up orphans

**Recommendation: Strict approach (filter orphans):**
```typescript
const validCollectionIds = new Set(favoritesData.collections.map(c => c.id))
const validFavorites = favoritesData.favorites.filter(f =>
  validCollectionIds.has(f.collectionId)
)
if (validFavorites.length !== favoritesData.favorites.length) {
  console.warn(`Filtered ${favoritesData.favorites.length - validFavorites.length} orphaned favorites during migration`)
}
// Then insert validFavorites
```

**Detection:** Enable SQLite logging during migration development. If `FOREIGN KEY constraint failed` errors appear, check for orphaned favorites.

**Phase to address:** Phase 1 — Database Foundation (migration script must handle orphaned data)

---

### Pitfall 7: The Redundant settings.json Path Is Forgotten

**What goes wrong:** After migration, the team updates `settings.repository.ts` and `store.handler.ts` to use SQLite. They remove `electron-store`. But the legacy `settings.handler.ts` (which reads/writes `{userData}/settings.json`) is still registered. Some code path still calls `save-settings` IPC channel, writing settings to the JSON file instead of SQLite. Settings changes seem to work but are invisible to the SQLite-backed settings reader.

**Why it happens:** The `settings.handler.ts` registers IPC handlers for `save-settings` and `load-settings` channels. These channels exist in the preload as `window.electronAPI.saveSettings()` and `window.electronAPI.loadSettings()`. The `electronClient` also has `saveSettings()` and `loadSettings()` methods. If ANY code path calls these instead of the new SQLite-based methods, settings are persisted to the wrong location.

After migration, there would be THREE settings sources: the SQLite `settings` table, the `settings.json` file, and (if not yet removed) electron-store's `wallhaven-data.json`. Divergence between these three sources is inevitable if more than one path is active.

**Consequences:** Settings appear lost (or reverting to defaults). The user saves settings but they don't persist across restarts. Debugging is confusing because the two paths silently coexist.

**Prevention:**
1. Audit all callers of `electronClient.saveSettings()` and `electronClient.loadSettings()` — they are dead code (no current callers found)
2. In the migration, either:
   a. **Redirect** the old channels to SQLite (point `save-settings` handler at SQLite read/write)
   b. **Remove** the old handlers entirely (after confirming no callers)
3. Add a startup log message confirming the settings path: `console.log('[Settings] Using SQLite backend:', databasePath)`

**Phase to address:** Phase 2 — Cleanup (but mark with a TODO during Phase 1 to not forget)

---

### Pitfall 8: Migration Performance On Large Datasets

**What goes wrong:** The migration script runs synchronously on the main thread during app startup. If the user has thousands of favorites with large `wallpaperData` JSON blobs, the migration could take 5-10 seconds, freezing the splash screen and delaying app startup noticeably.

**Why it happens:** Each favorite INSERT processes the `wallpaperData` JSON (can be 1-5KB per item). 5000 favorites x 2KB = ~10MB of data. SQLite transactions batch writes efficiently, but the JSON serialization and JS loop overhead still takes time.

**Consequences:** Slow startup on first launch after migration. User sees a frozen splash screen with no progress indication.

**Prevention:**
1. Use a single transaction (not individual commits) — SQLite batches all writes
2. Use prepared statements outside the loop — less JS overhead per iteration
3. Estimate worst-case migration time: 5000 items at 1000 inserts/second = 5 seconds. Acceptable for a one-time migration.
4. If time becomes a concern, show a migration progress indicator on the splash screen

**Phase to address:** Phase 1 — Database Foundation

---

### Pitfall 9: Missing electron-store Defaults After Migration

**What goes wrong:** The electron-store `Store` constructor has `defaults` for some keys:
```typescript
const store = new Store({
  defaults: {
    wallpaperQueryParams: null,
    appSettings: null,
    downloadFinishedList: [],
  },
})
```
After migration, `store.get('downloadFinishedList')` returns `[]` (the default), not `undefined`. If the migration script checks `if (!data)` instead of `if (data !== undefined && data !== null)`, it interprets the empty array as "no data to migrate" and skips download history — even if the DOWNLOAD_FINISHED_LIST key was never explicitly set.

**Consequences:** Download history is silently not migrated. User loses their download history even though it existed in electron-store. The empty array default short-circuits the migration guard.

**Prevention:** Check for the presence of data with explicit null/undefined checks, not truthiness:

```typescript
// WRONG — empty array is falsy, interpreted as "no data"
if (!store.get('downloadFinishedList')) { /* skip */ }

// CORRECT — explicitly check for null/undefined
const history = store.get('downloadFinishedList')
if (history === undefined || history === null) { /* skip */ }
```

Or use the `store.get(key)` without second parameter and check:
```typescript
const history = store.get('downloadFinishedList')
if (Array.isArray(history) && history.length > 0) { /* migrate */ }
```

**Detection:** Test with a fresh install that has default settings but user data stored. Verify all 4 domains are migrated.

**Phase to address:** Phase 1 — Database Foundation

---

### Pitfall 10: Foreign Key Constraint in Favorites Prevents Collection Deletion

**What goes wrong:** The `favorites` table has `FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE`. When a collection is deleted via the repository's `deleteCollection()` method, the CASCADE should delete associated favorites. But if FK enforcement was not enabled, the CASCADE doesn't fire and orphaned favorites remain.

**Why it happens:** `PRAGMA foreign_keys` must be set on EVERY database connection. It's not a persistent setting. In `node:sqlite`, this is set via the `enableForeignKeyConstraints: true` constructor option. If this option is omitted, FK constraints are silently ignored — no error, no cascade.

**Consequences:** Deleting a collection leaves orphaned favorites in the database. These orphans are invisible to the user (no UI to show them) but accumulate over time. The `getData` method still returns them because it reads all `favorites` rows.

**Prevention:** Ensure FK enforcement is enabled in the database constructor:
```typescript
const db = new DatabaseSync(join(app.getPath('userData'), 'wallhaven-data.db'), {
  enableForeignKeyConstraints: true,  // CRITICAL — must be set on every connection
  timeout: 5000
})
```

Also set it explicitly as a runtime PRAGMA for redundancy (works in both `node:sqlite` and SQLite CLI):
```typescript
db.exec('PRAGMA foreign_keys = ON')
```

**Detection:** Write a unit test: create a collection with 3 favorites, delete the collection, verify `SELECT * FROM favorites WHERE collection_id = ?` returns empty.

**Phase to address:** Phase 1 — Database Foundation

---

### Pitfall M1 (Added): WAL Mode Checkpoint Starvation — Unbounded WAL File Growth

**What goes wrong:**
The SQLite database uses WAL (Write-Ahead Logging) mode for performance. In a long-running Electron app (which may stay open for days), the WAL file (`-wal`) grows without bound. Frequent favorites mutations and download persistence keep the WAL growing, but checkpoints only trigger when the WAL reaches 1000 pages (default threshold). If the app is force-closed, the last checkpoint is lost, and recovery on next open must replay the WAL — slowing startup.

Additionally, there is a known Electron bug: if a folder named `"databases"` exists inside `app.getPath('userData')`, Electron may delete it when creating a BrowserWindow (Electron Issue #45396). This can delete the SQLite database and its WAL/SHM files.

**Why it happens:**
- WAL mode is set (default in SQLite 3.51+, which ships with Node.js 24) but no periodic checkpointing is configured
- `PRAGMA wal_checkpoint()` is never called during app runtime — only on `db.close()`
- If the app crashes or is force-killed, the checkpoint on close never runs
- The `-wal` file accumulates changes until it reaches the auto-checkpoint threshold

**Prevention:**

1. **Periodic checkpointing in a background interval:**
   ```typescript
   const checkpointInterval = setInterval(() => {
     try {
       // TRUNCATE shrinks the WAL file; PASSIVE is non-blocking
       getDatabase().exec('PRAGMA wal_checkpoint(TRUNCATE)')
     } catch {
       // If TRUNCATE fails (active readers), try PASSIVE
       getDatabase().exec('PRAGMA wal_checkpoint(PASSIVE)')
     }
   }, 5 * 60 * 1000).unref() // .unref() so it doesn't keep process alive
   ```

2. **Checkpoint on app close:**
   ```typescript
   app.on('before-quit', () => {
     clearInterval(checkpointInterval)
     closeDatabase() // node:sqlite close() implicitly checkpoints
   })
   ```

3. **Monitor WAL file size and log a warning if it exceeds a threshold:**
   ```typescript
   setInterval(() => {
     try {
       const walPath = join(app.getPath('userData'), 'wallhaven-data.db-wal')
       const stat = fs.statSync(walPath)
       if (stat.size > 10 * 1024 * 1024) { // 10MB
         console.warn(`[SQLite] WAL file is ${stat.size} bytes — checkpointing`)
         getDatabase().exec('PRAGMA wal_checkpoint(TRUNCATE)')
       }
     } catch { /* WAL file doesn't exist yet */ }
   }, 60000).unref()
   ```

4. **Do NOT name your database folder "databases":**
   Store the SQLite file at `path.join(app.getPath('userData'), 'wallhaven-data.db')` — not in a subfolder called "databases".

5. **Use `BEGIN IMMEDIATE` for all multi-statement write transactions:**
   ```typescript
   // Custom immediate transaction pattern for node:sqlite
   function withImmediateTransaction<T>(fn: () => T): T {
     const db = getDatabase()
     try {
       db.exec('BEGIN IMMEDIATE')
       const result = fn()
       db.exec('COMMIT')
       return result
     } catch (error) {
       db.exec('ROLLBACK')
       throw error
     }
   }
   ```
   This prevents "database is locked" errors that can occur when a `BEGIN DEFERRED` transaction tries to upgrade to a write mid-flight while another read is active.

**Detection:**
- WAL file (`wallhaven-data.db-wal`) grows to 50MB+ — checkpoint starvation is happening
- Database file exists in a folder called "databases" inside `userData` — at risk of Electron deletion bug
- No `PRAGMA wal_checkpoint()` call anywhere in the database lifecycle
- `before-quit` handler closes the app but does not checkpoint or close the database

**Phase to address:** Phase 1 — Database Initialization and Infrastructure

---

### Pitfall M2 (Added): Type Safety Gap — SQLite Rows Are Untyped at Runtime

**What goes wrong:**
SQLite queries return plain JavaScript objects (`Record<string, unknown>`). A repository method might do `db.prepare('SELECT * FROM settings').get()` and return an untyped result. The caller accesses `result.maxConcurrentDownloads` as if it were a number, but at runtime the column might be `null`, `undefined`, or stored as a JSON string. TypeScript doesn't catch this because the type is `unknown` or cast with `as`.

After migration, the `FavoritesData` type (defined at `src/types/favorite.ts` with nested `collections[]` and `favorites[]`) is spread across relational tables. Each repository method must reconstruct objects from rows. Every `JSON.parse()` call and row-to-domain mapping is a potential silent failure point.

**Why it happens:**
`node:sqlite`'s type definitions (custom, since `@types/node` doesn't include them) return `Record<string, unknown>` for row data. Developers either cast with `as T` or skip typing entirely. The `as T` pattern bypasses runtime validation — if the actual SQLite schema differs from the TypeScript type, the mismatch is silent until runtime.

**Prevention:**

1. **Define per-table row types** separate from domain types:
   ```typescript
   // SQL row representation (what SQLite actually returns)
   interface SettingsRow {
     key: string
     value: string   // JSON serialized
   }

   interface CollectionRow {
     id: string
     name: string
     is_default: number  // 0/1 INTEGER
     sort_order: number
     created_at: string
     updated_at: string
   }

   interface FavoriteRow {
     wallpaper_id: string
     collection_id: string
     added_at: string
     wallpaper_data: string | null  // JSON serialized snapshot
   }
   ```

2. **Create explicit mapping functions — never cast directly:**
   ```typescript
   // BAD: No runtime validation
   const row = db.prepare('SELECT * FROM settings WHERE key = ?').get('appSettings') as SettingsRow

   // GOOD: Explicit mapping with validation
   function mapSettingsRow(row: unknown): AppSettings | null {
     if (!row || typeof row !== 'object') return null
     const r = row as Record<string, unknown>
     if (typeof r.value !== 'string') return null
     try {
       return JSON.parse(r.value) as AppSettings
     } catch {
       return null
     }
   }
   ```

3. **Maintain the existing `IpcResponse<T>` pattern** for repository methods. The codebase already uses this for all data access — SQLite repository methods should return `IpcResponse<T>` as well:
   ```typescript
   getSettings(): IpcResponse<AppSettings> {
     try {
       const row = db.prepare(
         'SELECT value FROM settings WHERE key = ?'
       ).get('appSettings') as SettingsRow | undefined
       if (!row) return { success: true, data: null }
       const parsed = JSON.parse(row.value)
       return { success: true, data: parsed as AppSettings }
     } catch (err) {
       return { success: false, error: { code: 'SQLITE_ERROR', message: String(err) } }
     }
   }
   ```

**Detection:**
- Repository methods use `as SomeType` casts on raw `db.prepare().get()` results without validation
- No per-table row type definitions — queries cast directly to domain types
- `JSON.parse()` results are used directly without try/catch

**Phase to address:** Phase 2 — Data Layer Abstractions (Repository pattern with row mapping)

---

### Pitfall M3 (Added): Favorites Blob Pattern Ported to SQLite — Missed Optimization

**What goes wrong:**
The current `favoritesRepository` follows a read-modify-write pattern:
```typescript
async addFavorite(item: FavoriteItem): Promise<IpcResponse<FavoriteItem>> {
  const result = await this.getData()  // Loads ALL collections + ALL favorites
  // ... validate and modify in memory ...
  return this.setData(updatedData)     // Writes ALL collections + ALL favorites
}
```

After migration to SQLite, if the repository layer keeps this same blob-oriented pattern (load everything, modify, write everything), the SQLite migration provides NO performance benefit. Every mutation still loads the entire dataset. Worse, SQLite's transaction overhead is wasted because the pattern recreates electron-store's "whole file rewrite" behavior.

**Why it happens:**
The existing `favoritesRepository` exposes `getData()` and `setData()` methods that operate on the entire `FavoritesData` object. If the migration simply replaces the underlying storage (electron-store -> SQLite) without redesigning the API surface, every mutation still reads and writes the full dataset.

**Prevention:**

1. **Design the repository API around atomic operations, not blob operations:**
   ```typescript
   // BAD — blob-oriented (electron-store pattern ported to SQLite)
   async addFavorite(item: FavoriteItem): Promise<IpcResponse<FavoriteItem>> {
     const data = await this.getData()  // Loads all collections + favorites
     const updatedData = { ...data, favorites: [...data.favorites, item] }
     return this.setData(updatedData)   // Writes all collections + favorites
   }

   // GOOD — atomic SQL operation
   async addFavorite(item: FavoriteItem): Promise<IpcResponse<FavoriteItem>> {
     try {
       getDatabase().prepare(`
         INSERT INTO favorites (wallpaper_id, collection_id, added_at, wallpaper_data)
         VALUES (?, ?, ?, ?)
       `).run(item.wallpaperId, item.collectionId, item.addedAt, JSON.stringify(item.wallpaperData))
       return { success: true, data: item }
     } catch (err: any) {
       if (err.message?.includes('UNIQUE constraint')) {
         return { success: false, error: { code: FavoritesErrorCodes.FAVORITE_ALREADY_EXISTS, message: '...' } }
       }
       return { success: false, error: { code: FavoritesErrorCodes.STORAGE_ERROR, message: String(err) } }
     }
   }
   ```

2. **Use SQL constraints instead of JS validation:**
   - `UNIQUE(collection_id, wallpaper_id)` (implied by PRIMARY KEY) replaces the `data.favorites.some(...)` check
   - `FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE` replaces manual collection existence check

3. **Keep `getFavoritesData()` only for initial page load,** not for mutation operations. Use two targeted queries:
   ```typescript
   async getFavoritesData(): Promise<IpcResponse<FavoritesData>> {
     const collections = getDatabase().prepare('SELECT * FROM collections ORDER BY name').all()
     const favorites = getDatabase().prepare('SELECT * FROM favorites ORDER BY added_at DESC').all()
     return { success: true, data: {
       collections: collections.map(mapCollectionRow),
       favorites: favorites.map(mapFavoriteRow),
       version: 2,
       defaultCollectionId: (collections as CollectionRow[]).find(c => c.is_default)?.id,
     }}
   }
   ```

**Detection:**
- Repository methods start with "load all data" on every mutation
- SQL queries use `SELECT *` from favorites without a `WHERE` clause on single-item operations
- No UNIQUE constraints on the favorites table
- `isFavorite()` still loads the entire favorites array and uses `.some()` in JS instead of `SELECT 1 FROM favorites WHERE ... LIMIT 1`

**Phase to address:** Phase 2 — Data Layer Abstractions (Repository pattern redesign)

---

### Pitfall M4 (Added): Startup Blocking — Synchronous DB Init Delays Window Creation

**What goes wrong:**
`node:sqlite` is synchronous by design. When the app starts, the main process does:
1. Import modules (which may call `getDatabase()` at top level)
2. `new DatabaseSync(dbPath)` — opens the file
3. `initializeSchema()` — runs `CREATE TABLE IF NOT EXISTS`
4. Check migration status, run migration if needed
5. Only then: `createWindow()`

Steps 1-4 can take hundreds of milliseconds to seconds, especially if a migration is needed. Users see a delayed window and splash screen, which feels sluggish.

**Why it happens:**
If `getDatabase()` is called at module import time (top-level of a module), it blocks the entire require chain. Even without migration, opening a database file and running schema initialization takes 10-50ms. With the current splash screen already in use, this delay is noticeable.

**Prevention:**

1. **Lazy-initialize the database — never call `getDatabase()` at module import level:**
   ```typescript
   // BAD: Top-level — blocks import
   export const db = new DatabaseSync(path)

   // GOOD: Lazy — first access triggers initialization
   let db: DatabaseSync | undefined
   export function getDatabase(): DatabaseSync {
     if (!db) {
       db = new DatabaseSync(getDbPath(), { enableForeignKeyConstraints: true, timeout: 5000 })
       initializeSchema()
     }
     return db
   }
   ```

2. **Defer database initialization to after window creation:**
   ```typescript
   app.on('ready', () => {
     // Create splash window immediately
     const splash = createSplashWindow()
     splash.show()

     // Initialize database on next tick
     setImmediate(() => {
       const db = getDatabase()
       splash.webContents.send('database-ready')
       loadMainApp()
     })
   })
   ```

3. **Use the splash screen for migration progress** if migration takes measurable time:
   ```typescript
   function migrateWithProgress(db: DatabaseSync, win: BrowserWindow): void {
     const steps = ['Backing up electron-store', 'Migrating settings', 'Migrating favorites', 'Migrating download history']
     steps.forEach((msg, i) => {
       win.webContents.send('migration-progress', { step: i + 1, total: steps.length, message: msg })
       // ... run migration step ...
     })
   }
   ```

**Detection:**
- `new DatabaseSync()` and `initializeSchema()` calls at module import level (top-level of a module)
- `createWindow()` appears after 50+ lines of database initialization and migration logic
- Importing `database.ts` immediately triggers database creation

**Phase to address:** Phase 1 — Database Foundation (lazy initialization as a hard requirement)

---

### Pitfall M5 (Added): Testing Blind Spot — System Node.js May Not Have `node:sqlite`

**What goes wrong:**
The project uses Vitest for unit tests (`"test:unit": "vitest"`). Vitest runs on the system's Node.js, not Electron's bundled Node.js. If the system Node.js is older than v24, `import { DatabaseSync } from 'node:sqlite'` will throw `ERR_MODULE_NOT_FOUND` because the built-in module doesn't exist in older Node.js versions.

**This is no longer a native module ABI issue** (as it was with `better-sqlite3`), but a Node.js version availability issue. `node:sqlite` ships as a built-in module starting with Node.js 22 (experimental) and Node.js 24 (Stability 1.1, no flag required).

**Why it happens:**
The test runner (Vitest) uses the system Node.js installed on the developer's machine (e.g., Node.js 20 or 22). If the system Node.js is below 24, `node:sqlite` is either unavailable (Node 20) or requires the `--experimental-sqlite` flag (Node 22-23). Tests that import `database.ts` at the top level will fail.

**Consequences:** ALL tests in the affected test file fail, even tests that don't directly use the database. Developers can't run unit tests without workarounds.

**Prevention:**

1. **Use lazy initialization** (same fix as M4) — prevents `node:sqlite` loading at import time:
   ```typescript
   // database.ts exports getDatabase(), not a module-level database instance
   // Tests that import database.ts but never call getDatabase() won't trigger node:sqlite loading
   ```

2. **Use in-memory SQLite for integration tests:**
   ```typescript
   function createTestDb(): DatabaseSync {
     const db = new DatabaseSync(':memory:')
     db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)')
     // ... other tables ...
     return db
   }
   ```
   Note: `import { DatabaseSync } from 'node:sqlite'` at the top of test files WILL fail under system Node.js < 24. Handle this:
   ```typescript
   // Test helper file
   let DatabaseSync: typeof import('node:sqlite')['DatabaseSync'] | null = null
   try {
     ({ DatabaseSync } = require('node:sqlite'))
   } catch {
     // Running under system Node.js < 24 — skip DB-dependent tests
   }
   ```

3. **Mock the database layer** in unit tests. The existing repository pattern (singleton object exports) makes this natural:
   ```typescript
   vi.mock('@/repositories/settings.repository', () => ({
     settingsRepository: {
       get: vi.fn().mockResolvedValue({ success: true, data: { maxConcurrentDownloads: 5 } }),
       set: vi.fn().mockResolvedValue({ success: true }),
     }
   }))
   ```

4. **Ensure system Node.js is v24+** for development:
   - Add `"node": ">=24"` to `package.json` `engines` field
   - Document in CONTRIBUTING.md: "This project requires Node.js 24+ for `node:sqlite`"
   - CI runners should use Node.js 24+

5. **For integration tests that must run under Electron,** use:
   ```json
   "scripts": {
     "test:unit": "vitest --project unit",
     "test:integration:db": "ELECTRON_RUN_AS_NODE=true npx electron node_modules/vitest/vitest.mjs --project integration"
   }
   ```

**Detection:**
- Running `npm run test:unit` fails with `ERR_MODULE_NOT_FOUND` for `node:sqlite`
- `import { DatabaseSync } from 'node:sqlite'` appears at the top level of any module that tests import
- System Node.js version is below 24 (`node -v`)
- No `"engines"` field enforcing Node.js 24+ in `package.json`

**Phase to address:** Phase 1 — Database Foundation (lazy initialization), Phase 2 — Data Layer (repository mocking)

---

### Pitfall M6 (Added): Schema Evolution Without Versioning — Breaking Changes on Update

**What goes wrong:**
The SQLite schema is created with `CREATE TABLE IF NOT EXISTS` on every app startup. Later, a new app version adds a column to the `favorites` table. The `IF NOT EXISTS` check passes (table already exists), and the new column is never added. The app crashes at runtime because it tries to insert into a column that doesn't exist.

Without schema versioning, it's impossible to distinguish between:
- Fresh install (no database exists — create tables from scratch)
- Existing install on schema v1 (already has data — run migration)
- Existing install on schema v2 (current — no action needed)

**Why it happens:**
`CREATE TABLE IF NOT EXISTS` provides no mechanism for `ALTER TABLE`, column additions/removals, constraint changes, or data transforms. It's a bootstrap pattern, not a migration pattern.

**Prevention:**

1. **Create a `schema_versions` table from the very first migration:**
   ```typescript
   function ensureSchemaTable(db: DatabaseSync): void {
     db.exec(`
       CREATE TABLE IF NOT EXISTS schema_versions (
         version INTEGER PRIMARY KEY,
         description TEXT NOT NULL,
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))
       )
     `)
   }
   ```

2. **Define migrations as ordered, immutable functions:**
   ```typescript
   const MIGRATIONS: Migration[] = [
     {
       version: 1,
       description: 'Import from electron-store',
       up(db) {
         db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`)
         db.exec(`CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT, is_default INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)`)
         db.exec(`CREATE TABLE favorites (wallpaper_id TEXT NOT NULL, collection_id TEXT NOT NULL, added_at TEXT, wallpaper_data TEXT, PRIMARY KEY (collection_id, wallpaper_id), FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE)`)
         // ... import data from electron-store ...
       }
     },
     {
       version: 2,
       description: 'Add thumbnail_url to favorites',
       up(db) {
         db.exec(`ALTER TABLE favorites ADD COLUMN thumbnail_url TEXT`)
       }
     },
   ]
   ```

3. **Apply migrations sequentially on startup:**
   ```typescript
   function runMigrations(db: DatabaseSync): void {
     ensureSchemaTable(db)
     const row = db.prepare<{ version: number }>(
       'SELECT COALESCE(MAX(version), 0) as version FROM schema_versions'
     ).get()!
     const currentVersion = row.version

     for (const m of MIGRATIONS) {
       if (m.version > currentVersion) {
         withTransaction(() => {
           m.up(db)
           db.prepare('INSERT INTO schema_versions (version, description) VALUES (?, ?)')
             .run(m.version, m.description)
         })
       }
     }
   }
   ```

4. **Never modify an existing migration.** Once applied to any user's database, it is immutable. Add new versions for schema changes.

**Detection:**
- Schema creation uses only `CREATE TABLE IF NOT EXISTS` with no versioning mechanism
- No `schema_versions` table in the database
- `ALTER TABLE` statements are executed unconditionally on every startup (will fail on fresh installs)
- Migration logic is mixed with normal startup code (not separated into versioned scripts)

**Phase to address:** Phase 1 — Database Foundation (schema versioning designed before any migration code)

---

### Pitfall M7 (Added): Dual-Write Inconsistency During Transition Period

**What goes wrong:**
During the transition period (some features migrated to SQLite, others still on electron-store), the app writes data to TWO storage backends. A code path writes to SQLite but a different code path reads from electron-store. Data is split across two stores, and neither has the complete picture.

The most dangerous case in this codebase: `store.handler.ts` triggers `getQueueInstance()?.processQueue()` when `appSettings` is saved (line 37). If the settings are saved to SQLite but the queue still reads from electron-store, the notification to re-evaluate the queue fires but reads stale settings.

**Why it happens:**
`download-queue.ts` reads `appSettings` directly from electron-store:
```typescript
const appSettings = store.get('appSettings') as unknown as { maxConcurrentDownloads?: number } | undefined
```

After settings writes are migrated to SQLite, this direct electron-store read returns stale data. The queue uses the old `maxConcurrentDownloads` value until the app is restarted (and the migration runs again).

**Prevention:**

1. **Migrate read paths before write paths:**
   - Phase A: Make all READS go through SQLite (switch import to `getDatabase()`)
   - Phase B: Make all WRITES go through SQLite (modify handler implementations)
   - Phase C: Remove electron-store reads (confirm no code still imports `store`)
   - Phase D: Remove electron-store dependency entirely

2. **For `download-queue.ts` specifically, change the settings read to go through SQLite:**
   ```typescript
   // BEFORE:
   import { store } from '../../store'
   const appSettings = store.get('appSettings') as any

   // AFTER:
   import { getDatabase } from '../../database'
   const row = getDatabase()
     .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
     .get('appSettings')
   const appSettings = row ? JSON.parse(row.value) : undefined
   ```

3. **Preserve the `processQueue()` trigger** when settings change — include it in the SQLite store handler:
   ```typescript
   ipcMain.handle('store-set', (_event, { key, value }) => {
     getDatabase()
       .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
       .run(key, JSON.stringify(value))
     // Preserve the queue re-evaluation notification
     if (key === 'appSettings') {
       getQueueInstance()?.processQueue()
     }
     return { success: true }
   })
   ```

**Detection:**
- `download-queue.ts` still calls `store.get('appSettings')` after migration
- `store.handler.ts` still has handlers for `store-get`, `store-set` after SQLite is the primary store
- Changing `maxConcurrentDownloads` has no effect on active downloads (queue reads stale value)
- No systematic audit of all `store.get()` and `store.set()` calls was performed

**Phase to address:** Phase 3 — Store Handler Migration (systematic store handler cutover)

---

## Moderate Pitfalls

### Pitfall 11: Preload Type Duplication with IPC Channels

**What goes wrong:** The preload script defines its own `ElectronAPI` interface with manually typed store methods. New domain channels get added to the preload with new method signatures. The old store methods remain. The preload HTML interface grows dual sets of methods, some of which are dead code.

**Prevention:** After Phase 2 cleanup, remove old preload store methods. Keep only the methods for channels that remain active.

**Detection:** The `electron/preload/index.ts` file should have store methods only during Phase 1. After Phase 2, no `storeGet`/`storeSet`/`storeDelete`/`storeClear` entries.

---

### Pitfall 12: IPC Channel Whitelist Not Updated

**What goes wrong:** The preload has a `VALID_INVOKE_CHANNELS` array (or equivalent) that whitelists allowed IPC channels. New domain channels are not added to this whitelist. Calls to the new channels are silently blocked or throw in the preload.

**Prevention:** Add all new domain channel names to the whitelist at the same time as creating the handler. Remove old channel names after Phase 2.

---

### Pitfall 13: JSON.parse / JSON.stringify Round-Trip on Settings Values

**What goes wrong:** Settings values are stored as JSON strings in SQLite (`value TEXT`). Every read does `JSON.parse(row.value)` and every write does `JSON.stringify(value)`. If a value is already a string (e.g., `apiKey: "abc123"`), the round-trip is correct. But if a value is `null`, `JSON.parse("null")` returns `null`, and the code might interpret this as "no setting" rather than "explicitly null".

**Prevention:** Use explicit null handling:
```typescript
getSetting(key: string): unknown | null {
  const row = getDatabase()
    .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
    .get(key)
  if (!row) return null  // Key doesn't exist
  return JSON.parse(row.value)  // Could be null, string, number, object, etc.
}
```

---

### Pitfall 14: Forgetting to Handle `defaultCollectionId` in Collections Migration

**What goes wrong:** The `FavoritesData` type has `defaultCollectionId?: string` field. During migration to SQLite, this field is represented by the `is_default` column on the `collections` table. But if the migration script only checks `collection.isDefault` and ignores `favoritesData.defaultCollectionId`, the old collection marked as default might not be marked correctly.

**Prevention:** During migration, set default collection via both markers:
```typescript
for (const c of favoritesData.collections) {
  const isDefault = c.isDefault || c.id === favoritesData.defaultCollectionId
  insertCollection.run(c.id, c.name, isDefault ? 1 : 0, c.createdAt, c.updatedAt)
}
```

---

### Pitfall 15: In-Memory Database for Tests Doesn't Match Production

**What goes wrong:** Unit tests use `new DatabaseSync(':memory:')` for fast, isolated testing. The schema matches. But `PRAGMA foreign_keys` behavior differs slightly — in-memory databases reset pragmas on disconnect differently. Also, the migration from electron-store can't use in-memory DB because it reads from the actual electron-store file.

**Prevention:** Use file-based test databases for integration tests that test migration logic. In-memory databases are fine for testing query behavior in isolation, but the migration script itself must be tested against a file-based database (or a temp file).

---

## Minor Pitfalls

### Pitfall 16: `src/utils/store.ts` Dead Code Left Behind

This file has zero imports in the current codebase but still exists. During cleanup, delete it. It creates confusion if left behind because it has the same name as the store pattern.

### Pitfall 17: Package.json Scripts Not Updated

The `postinstall` script already runs `electron-builder install-app-deps` which handles native rebuilds for `sharp`. With `node:sqlite`, no additional scripts are needed. Verify the postinstall still works correctly after removing `electron-store`.

### Pitfall 18: Migration Logging Too Verbose

The migration script logs each INSERT if not careful. For 5000 download history items and 2000 favorites, that's 7000 console.log lines. Bundle logs: log only summary stats (counts per domain) and any errors.

---

## Performance Traps (SQLite Migration)

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No index on `favorites.wallpaper_id` | `isFavorite()` queries are O(favorites) full table scan | `CREATE INDEX idx_favorites_wallpaper ON favorites(wallpaper_id)` | When favorites exceed ~1000 items |
| No index on `favorites.collection_id` | Filtering favorites by collection scans entire table | Covered by composite PK; separate index if querying by collection_id alone | When favorites exceed ~1000 items |
| WAL checkpoint running during user activity | UI jank from synchronous checkpoint | Run checkpoint during idle (`.unref()` interval, not during user interaction) | When checkpoint runs during typing/scrolling |
| Frequent favorites writes without batching | Multiple sequential INSERT/UPDATE/DELETE each commit separately | Batch related operations into a single `withTransaction()` | User rapidly adding/removing multiple favorites |
| No transaction wrapping for bulk import | 1000 individual INSERT statements during migration | Wrap the import loop in a single `withTransaction()` | During migration of large favorites datasets |

---

## Integration Gotchas (SQLite Migration)

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `download-queue.ts` reads `appSettings` from store | After migration, still reads from electron-store | Change to read from SQLite via `getDatabase().prepare(...)` |
| `store.handler.ts` triggers queue re-evaluation (line 37) | Notification lost when electron-store handler is replaced | Move the `processQueue()` call to the SQLite settings write path |
| `settings.handler.ts` writes to `settings.json` | Redundant third persistence path | Remove `settings.handler.ts`; settings live only in SQLite |
| `favorites.repository.ts` currently in renderer | After migration, SQLite is only accessible from main process | Move favorites data access to main process; renderer accesses via IPC |
| IPC channel `store-get` still registered | Renderer code may still call it | Channel names stay the same — handler implementation changes |
| Splash screen | May flash before DB migration completes | Use splash for migration progress; send IPC updates during migration |

---

## Security Mistakes (SQLite Migration)

| Mistake | Risk | Prevention |
|---------|------|------------|
| SQL injection via wallpaper filename | Malicious filename with `' OR 1=1 --` in query | Use parameterized queries exclusively — never string interpolation |
| API key stored in plain text in settings table | Key readable from disk by any process | Use Electron's `safeStorage` API to encrypt before storing. This is an existing concern; migration doesn't change it. |
| Renderer accesses SQLite directly | Bypasses IPC security; exposes DB to untrusted renderer | SQLite is main-process only; renderer accesses through IPC handlers |
| Database file in world-readable location | Other apps read the database | `app.getPath('userData')` already has appropriate permissions per platform |

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Phase 1: Database Foundation | Migration non-idempotent (P1), partial write (P2), FK violations (P6), defaults (P9), WAL starvation (M1), schema versioning (M6), startup blocking (M4), testing blind spot (M5) | Transactional idempotent migration with lazy init, schema_versions table, periodic WAL checkpointing, Node 24+ enforcement |
| Phase 2: Main Process Cutover | Main process still reads from electron-store (P3), type safety gap (M2), blob pattern ported (M3) | Replace all `store.get()` imports; use typed row mappers; design atomic SQL operations |
| Phase 3: Store Handler IPC | Channel name confusion (P4), dual-write (M7), processQueue() missed | Keep same IPC channel names; update handler implementation to SQLite; preserve queue notification |
| Phase 4: Cleanup | Legacy settings.json path (P7), dead code (P16) | Audit grep for dead imports; redirect or remove old handlers |
| Build pipeline | Unnecessary node:sqlite build config (P5 — none needed) | NO changes to electron.vite.config.ts, electron-builder.yml, or postinstall |
| Favorites FK | Orphaned favorites after collection delete (P10) | Ensure `enableForeignKeyConstraints: true` in DatabaseSync constructor |
| Testing | Vitest can't resolve node:sqlite (M5) | Lazy init; mock repositories; ensure system Node 24+; use `:memory:` SQLite for integration tests |

---

## Rollback Plan

### If the migration must be rolled back:

1. **Keep electron-store file** — Do NOT delete `wallhaven-data.json` in the migration script. Rename it to `.bak` at most. The file is the rollback source.

2. **Rollback code changes:**
   ```bash
   git revert <migration-commit>
   # OR restore specific files:
   git checkout HEAD~1 -- electron/main/database.ts
   git checkout HEAD~1 -- src/repositories/*.repository.ts
   ```

3. **Delete SQLite file** — `rm ~/Library/Application\ Support/wallhaven/wallhaven-data.db` (or equivalent path).
   The electron-store data is still intact and will be read on next launch.

4. **Verify** — Launch app. All settings, favorites, and download history should be restored from electron-store.

### The backup file:
- Location: `{userData}/wallhaven-data.json.bak` (created by migration script)
- File is the original electron-store config before migration
- Restore: copy `.bak` back to `wallhaven-data.json`, delete SQLite file, revert code

---

## "Looks Done But Isn't" Checklist

- [ ] **Migration idempotency:** Launch app twice. After second launch, verify SQLite data count matches (no duplication).
- [ ] **Main process reads:** Check `download-queue.ts` and `download.handler.ts` still import `store` from `../../store`. They should import `getDatabase` from `../../database` after migration.
- [ ] **Preload store channel cleanup:** After Phase 2 cleanup, verify old `storeGet`/`storeSet`/`storeDelete`/`storeClear` are removed from preload.
- [ ] **FK cascade:** Delete a collection with 3 favorites. Verify favorites are deleted too.
- [ ] **Migration on fresh install:** Install app on a machine with no electron-store data. Verify app starts without errors and creates empty SQLite tables.
- [ ] **Migration backup file:** Verify `wallhaven-data.json.bak` exists after migration.
- [ ] **`schema_versions` table (if implemented):** Verify version 1 is recorded after migration.
- [ ] **electron-store defaults:** Verify migration handles the `downloadFinishedList: []` default correctly.
- [ ] **Orphaned favorites:** Verify migration filters favorites with `collection_id` not in the collections list.
- [ ] **Settings persistence:** Change a setting, restart app, verify the change persists.
- [ ] **Download queue settings:** Verify `maxConcurrentDownloads` change takes effect (download queue reads from SQLite).
- [ ] **WAL checkpointing:** Run app for 30 minutes with favorites operations. Verify `-wal` file size stays bounded.
- [ ] **Lazy initialization:** Verify `import { getDatabase } from './database'` does NOT immediately open a database connection. Database opens on first `getDatabase()` call.
- [ ] **Vitest passes:** Run `npm run test:unit` without `node:sqlite` resolution errors. Verify repository tests use mocks or `:memory:` DB. Ensure system Node.js is v24+.
- [ ] **Favorites atomic operations:** Verify `addFavorite()` does one INSERT, not read-all -> modify -> write-all.
- [ ] **Settings JSON file removal:** Verify `settings.handler.ts` is removed or redirected. Verify `settings.json` is not written.
- [ ] **electron-store removed from package.json:** After all phases, `"electron-store": "11.0.2"` removed from `devDependencies`.
- [ ] **Zero build config changes:** Verify `electron.vite.config.ts` and `electron-builder.yml` have NO SQLite-related changes.
- [ ] **processQueue() preserved:** Verify changing `maxConcurrentDownloads` still triggers queue re-evaluation.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Migration non-idempotent (P1) | MEDIUM | Delete SQLite file, restore electron-store backup, fix migration guard, restart |
| Partial migration from crash (P2) | MEDIUM | Migration rolls back automatically (transaction). Retry is safe. |
| Main process still reads store (P3) | LOW | Change import in 2 files (download-queue.ts, download.handler.ts) |
| Channel name confusion (P4) | LOW | Channel names stay the same — no conflict possible |
| Unnecessary build config change (P5) | LOW | Revert electron.vite.config.ts and electron-builder.yml — no SQLite changes needed |
| FK violation during migration (P6) | LOW | Add orphan filtering to migration script |
| Legacy settings.json path (P7) | LOW | Redirect old channels to SQLite or remove dead code |
| Migration takes too long (P8) | LOW | Show progress indicator on splash screen |
| Default values not migrated (P9) | LOW | Fix migration check to handle store defaults |
| FK cascade not working (P10) | LOW | Ensure `enableForeignKeyConstraints: true` in DatabaseSync constructor |
| WAL file unbounded growth (M1) | LOW | Add periodic `PRAGMA wal_checkpoint(TRUNCATE)` — existing WAL can be checkpointed immediately |
| Type safety gap (M2) | MEDIUM | Add row type definitions and mapping functions — requires refactoring repository methods |
| Favorites blob pattern (M3) | MEDIUM | Redesign repository for atomic SQL operations — requires changing the API surface |
| Startup blocking (M4) | LOW | Lazy-init the database — move `getDatabase()` call out of module-level code |
| Testing blind spot (M5) | LOW | Mock repositories in unit tests; use `:memory:` SQLite in integration tests; enforce Node 24+ |
| Schema evolution (M6) | LOW | Add `schema_versions` table and migration runner — can be retrofitted |
| Dual-write inconsistency (M7) | MEDIUM | Systematic audit of all `store.get()`/`store.set()` calls; migrate read paths first |

---

## Sources

- Existing codebase analysis:
  - `electron/main/store.ts` — electron-store defaults: `{ wallpaperQueryParams: null, appSettings: null, downloadFinishedList: [] }`
  - `electron/main/ipc/handlers/store.handler.ts` — store-get/set/delete/clear IPC handlers; queue notification on settings change
  - `electron/main/ipc/handlers/settings.handler.ts` — legacy settings.json persistence (redundant third path)
  - `electron/main/ipc/handlers/download-queue.ts` — `store.get('appSettings')` direct read at line 94
  - `electron/main/ipc/handlers/download.handler.ts` — `store.get('appSettings.downloadPath')` usage
  - `src/repositories/favorites.repository.ts` — blob-oriented `getData()`/`setData()` pattern
  - `src/repositories/download.repository.ts` — `get()` uses null fallback: `result.data || []`
  - `src/utils/store.ts` — dead code (zero imports)
  - `src/types/favorite.ts` — `FavoritesData.defaultCollectionId` field
  - `src/clients/constants.ts` — `STORAGE_KEYS` enum (4 keys)
  - `electron.vite.config.ts` — `externalizeDepsPlugin()` used; no SQLite config needed
  - `package.json` — electron-store v11.0.2, postinstall: "electron-builder install-app-deps"
- [Node.js 24 `node:sqlite` Documentation](https://nodejs.org/download/nightly/v24.0.0-nightly20250503f552c86fec/docs/api/sqlite.html) — Official API reference for DatabaseSync, StatementSync — HIGH confidence
- [Electron 41.0.0 Release Announcement](https://az.electronjs.org/blog/electron-41-0) — Node.js v24.14.0 confirmed — HIGH confidence
- [SQLite WAL documentation](https://www.sqlite.org/wal.html) — WAL mode guarantees and checkpoint behavior — HIGH confidence
- [Electron Issue #45396](https://github.com/electron/electron/issues/45396) — "Databases Folder In User AppData Being Wiped" — MEDIUM confidence
- [canopy/canopy Issue #2707](https://github.com/canopyide/canopy/issues/2707) — real-world electron-store to SQLite migration post-mortem — MEDIUM confidence
- [SQLite schema versioning patterns](https://www.sqlite.org/lang_createtable.html) — `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` — HIGH confidence
- [Signal Desktop SQLite practices](https://github.com/signalapp/Signal-Desktop) — Production Electron + SQLite reference (migration guards, FK handling) — MEDIUM confidence
- [vitest-dev/vitest Discussion #2142](https://github.com/vitest-dev/vitest/discussions/2142) — `ELECTRON_RUN_AS_NODE` workaround for native modules — LOW confidence
- [electron-vite Dependency Handling](https://electron-vite.org/guide/dependency-handling) — Native module externalization docs (confirms no changes needed for `node:sqlite`) — HIGH confidence
- [TypeScript 6.0 Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) — Confirms TS 6.0 does not add Node built-in module types — HIGH confidence

---
*Pitfalls research for: v5.0 electron-store -> SQLite migration*
*Researched: 2026-05-03*

---

# v6.0 传统分页重构陷阱

**Domain:** 将无限滚动改为传统分页，SQL 层计算收藏状态，内存缓存分页数据
**Researched:** 2026-05-04
**Confidence:** HIGH

---

## 一、分页实现陷阱

### P-P1: 页码越界处理不完整

**问题描述：**
当用户删除最后一个收藏项后，当前页码可能超出有效范围（如共 3 页数据，用户在第 3 页删除最后一条，此时只剩 2 页但页码仍为 3）。

**症状：**
- 显示空白页面
- 侧边栏计数与实际显示不一致
- 无限加载状态

**预防策略：**
- 删除操作后检查当前页是否为空
- 若当前页为空且非第一页，自动跳转到前一页
- 在 Repository 层返回实际总数，由 Composable 决定页码调整

**应处理阶段：** 执行阶段 — 收藏项删除逻辑

---

### P-P2: TotalPageData 与 PageData 结构混用

**问题描述：**
当前代码使用 `TotalPageData` 结构（`sections: PageData[]`）支持无限滚动。切换到传统分页后，直接复用此结构可能导致：
- `sections` 数组冗余（传统分页每页独立，不需要 sections 累加）
- `currentPage` 与 `sections` 索引不同步
- 缓存逻辑复杂化

**症状：**
- 页码切换后数据错乱
- 内存缓存无法正确命中
- 组件 computed 计算错误

**预防策略：**
- 定义新的 `PageCache` 类型：`Map<number, PageData>` 存储已加载页面
- Store 中使用 `currentPageData: PageData` 而非 `TotalPageData`
- 保留 `TotalPageData` 仅用于"我的收藏"无限滚动场景

**应处理阶段：** 规划阶段 — 数据结构设计

---

### P-P3: 内存缓存失效策略缺失

**问题描述：**
实现"内存缓存已加载页面数据"需求时，若无明确失效策略：
- 收藏状态变更后缓存数据过期但仍被使用
- 缓存无限增长导致内存泄漏
- 刷新操作未清除缓存

**症状：**
- 收藏/取消收藏后，页面显示的 `is_favorite` 状态不更新
- 长时间使用后内存占用持续增长
- 强制刷新后数据仍为旧数据

**预防策略：**
- 定义明确的缓存键：`(queryParams, page)` 组合
- 收藏状态变更时，使相关缓存失效（或更新缓存中的 `is_favorite` 字段）
- 提供手动清除缓存的方法（供下拉刷新使用）
- 考虑 LRU 策略限制缓存大小

**应处理阶段：** 规划阶段 — 缓存策略设计

---

### P-P4: 并发请求竞态条件

**问题描述：**
快速点击页码切换时，多个请求可能并发发出，后发出的请求可能先返回：

```
用户点击: 第1页 → 第2页 → 第3页
请求发出: fetch(1) → fetch(2) → fetch(3)
响应返回: fetch(3) → fetch(1) → fetch(2)  // 乱序
显示结果: 第2页数据（错误！用户期望第3页）
```

**症状：**
- 页码指示器与实际内容不匹配
- 快速切换后显示错误页面内容

**预防策略：**
- 使用请求序列号或 AbortController 取消旧请求
- 在 Store 中记录当前请求 ID，响应时检查是否为最新请求
- 或使用请求锁，新请求发出时取消进行中的请求

**应处理阶段：** 执行阶段 — fetch 方法实现

---

## 二、SQL 层收藏状态计算陷阱

### P-P5: LEFT JOIN 导致数据重复

**问题描述：**
计算 `is_favorite` 需要将 Wallhaven API 返回的壁纸数据与 `favorites` 表关联。若一个壁纸存在于多个收藏夹：

```sql
-- 错误示例：一个壁纸在3个收藏夹中，返回3行
SELECT w.*, f.collection_id
FROM wallpapers w
LEFT JOIN favorites f ON w.id = f.wallpaper_id
```

**症状：**
- 同一壁纸在列表中出现多次
- 分页计数不准确
- UI 渲染异常

**预防策略：**
- 使用 `EXISTS` 子查询而非 `LEFT JOIN`：
  ```sql
  SELECT *,
    EXISTS(SELECT 1 FROM favorites WHERE wallpaper_id = ?) as is_favorite
  FROM wallpapers
  ```
- 或使用 `GROUP BY` + `GROUP_CONCAT` 合并收藏夹信息

**应处理阶段：** 规划阶段 — SQL 查询设计

---

### P-P6: API 数据与本地状态不一致

**问题描述：**
Wallhaven API 返回的壁纸数据不包含 `is_favorite` 字段。需要在前端或后端注入此信息。

当前架构中，API 数据在 Service 层获取，收藏状态在 Store 层计算（`favoriteIds: Set<string>`）。

**潜在问题：**
- Service 层返回的数据不包含 `is_favorite`，需在 Composable 层合并
- 合并时机不当会导致响应式失效
- 批量查询收藏状态可能阻塞渲染

**症状：**
- `is_favorite` 状态不响应收藏操作
- 首次加载时 `is_favorite` 全为 `false`，需等待二次查询
- 性能下降

**预防策略：**
- 方案 A（推荐）：在 API 响应处理时同步注入 `is_favorite`
  - Service 层返回数据后，Composable 层遍历设置 `is_favorite`
  - 利用现有 `favoriteIds` Set 进行 O(1) 查询
- 方案 B：IPC 查询时注入
  - 主进程收到 API 响应后，查询 SQLite 批量注入
  - 缺点：增加主进程职责，API 代理与数据库耦合

**应处理阶段：** 规划阶段 — 数据流设计

---

### P-P7: 收藏状态更新延迟

**问题描述：**
用户点击收藏后，`is_favorite` 应立即更新。但：
- 当前实现需等待 `favoritesService.add()` 完成后重新 `loadFavorites()`
- 重新加载全量收藏列表耗时
- 网络延迟可能导致状态更新滞后

**症状：**
- 点击收藏后小红心有短暂延迟
- 快速连续操作可能丢失状态
- 用户体验不佳

**预防策略：**
- 乐观更新：点击时立即更新本地 `is_favorite` 和 `favoriteIds`
- 失败时回滚状态
- 避免每次收藏操作后重新加载全量数据
- 使用 SQLite 的增量更新而非全量替换

**应处理阶段：** 执行阶段 — 收藏操作实现

---

## 三、SQLite 分页性能陷阱

### P-P8: OFFSET 大数据集性能问题

**问题描述：**
SQLite 的 `LIMIT/OFFSET` 分页在偏移量大时性能下降：

```sql
-- 当 offset = 10000 时，SQLite 需扫描前 10000 行再返回 24 行
SELECT * FROM favorites ORDER BY added_at DESC LIMIT 24 OFFSET 10000
```

**症状：**
- 深度分页响应时间显著增加
- 用户跳转到最后一页时卡顿

**预防策略：**
- 使用键集分页（keyset pagination）替代 OFFSET：
  ```sql
  -- 记住上一页最后一条的 added_at
  SELECT * FROM favorites
  WHERE added_at < ?  -- 上一页最后一条的时间
  ORDER BY added_at DESC
  LIMIT 24
  ```
- 缺点：不支持随机跳页，仅适用于无限滚动
- 本项目"我的收藏"使用无限滚动，可采用此方案
- "在线壁纸"使用传统分页，仍需 OFFSET（但数据来自 API，无此问题）

**应处理阶段：** 规划阶段 — 分页方案选择

---

### P-P9: COUNT(*) 查询性能

**问题描述：**
显示"共 X 张"需要 `COUNT(*)` 查询。在 `favorites` 表数据量大时：

```sql
SELECT COUNT(*) FROM favorites  -- 全表扫描
```

**症状：**
- 侧边栏计数加载慢
- 每次刷新都重新计数

**预防策略：**
- SQLite 对 `COUNT(*)` 无索引优化，但本项目的收藏数据量级（预期 < 10000）影响有限
- 可缓存 count 值，仅在增删操作后更新
- 或在 `collections` 表中维护 `item_count` 冗余字段

**应处理阶段：** 执行阶段 — 计数实现（可视数据量决定是否优化）

---

### P-P10: 复合查询索引缺失

**问题描述：**
"我的收藏"可能需要按收藏夹筛选 + 排序 + 分页：

```sql
SELECT * FROM favorites
WHERE collection_id = ?
ORDER BY added_at DESC
LIMIT 24 OFFSET ?
```

若无合适索引，查询效率低下。

**预防策略：**
- 确保存在复合索引：`CREATE INDEX idx_favorites_collection_added ON favorites(collection_id, added_at DESC)`
- 当前 schema 仅有 `idx_favorites_wallpaper`，需补充

**应处理阶段：** 执行阶段 — 数据库 schema 更新

---

## 四、UI/UX 相关陷阱

### P-P11: 分页条状态同步

**问题描述：**
传统分页条需要同步：
- 当前页码
- 总页数
- 是否有上一页/下一页
- 页码输入框的值

**潜在问题：**
- 输入页码后按回车，值未同步到查询参数
- 快速点击导致状态不一致
- 总页数变化（数据增删）后页码未重置

**预防策略：**
- 使用单向数据流：页码由 Store/Composable 管理，UI 仅展示
- 页码输入使用 `v-model.number` + `@change` 验证
- 数据变化时检查页码有效性

**应处理阶段：** 执行阶段 — 分页条组件实现

---

### P-P12: KeepAlive 与分页状态

**问题描述：**
当前 `OnlineWallpaper` 使用 `<KeepAlive>` 缓存组件状态。切换到传统分页后：
- 返回页面时应保持之前页码？还是重置到第一页？
- 缓存的 `wallpapers` 数据可能已过期

**症状：**
- 从详情页返回后显示旧数据
- 页码与 URL 参数不同步（若实现 URL 同步）

**预防策略：**
- 明确 KeepAlive 行为：保持当前页码和数据
- 提供"刷新"按钮清除缓存重新加载第一页
- 或在 `onActivated` 中检查数据新鲜度

**应处理阶段：** 规划阶段 — KeepAlive 行为定义

---

### P-P13: 侧边栏计数响应式更新

**问题描述：**
当前侧边栏显示 `{{ uniqueWallpaperCount }}` 和 `{{ getCollectionCount(collection.id) }}`，这些值依赖 `favorites` 数组。

传统分页下，`favorites` 不再全量加载，而是分页获取。

**症状：**
- 切换页码后，侧边栏计数消失或为 0
- 删除收藏后，计数未正确更新

**预防策略：**
- 分离"列表数据"与"元数据"：
  - 列表数据：分页查询 `favorites` 表，返回 `FavoriteItem[]`
  - 元数据：单独查询 `COUNT(*) GROUP BY collection_id`，返回计数
- 或在 `collections` 表维护 `item_count` 冗余字段
- 收藏增删时更新计数（SQL 触发器或应用层更新）

**应处理阶段：** 执行阶段 — 元数据查询实现

---

## 五、架构与代码质量陷阱

### P-P14: Composable 职责膨胀

**问题描述：**
`useWallpaperList` 当前职责：
- API 请求
- 分页逻辑（`fetch`, `loadMore`）
- 缓存管理
- 参数保存/加载

传统分页改造后，还需增加：
- 页码管理
- 缓存失效
- `is_favorite` 注入

**症状：**
- Composable 代码膨胀
- 难以测试
- 职责不清晰

**预防策略：**
- 提取 `usePageCache` 管理页面缓存
- 提取 `usePagination` 管理页码状态
- `useWallpaperList` 仅协调各子 composable

**应处理阶段：** 规划阶段 — 模块划分

---

### P-P15: 类型定义碎片化

**问题描述：**
当前 `PageData` 和 `TotalPageData` 类型共存。传统分页可能引入更多类型变体。

**症状：**
- 类型转换频繁
- 组件 props 类型不匹配
- TypeScript 类型推断失败

**预防策略：**
- 统一类型定义文件
- 明确各场景使用哪种类型
- 避免运行时类型转换

**应处理阶段：** 规划阶段 — 类型设计

---

## 六、测试与验证陷阱

### P-P16: 边界条件覆盖不足

**需要测试的边界条件：**

| 场景 | 预期行为 |
|------|----------|
| 空收藏夹 | 显示空状态提示 |
| 单页数据 | 分页条隐藏或禁用 |
| 删除当前页最后一项 | 跳转到前一页 |
| 快速切换页码 | 显示最后请求的页面 |
| 收藏后立即切换页码 | 缓存状态正确更新 |
| 网络错误 | 保持当前页数据，显示错误提示 |

**预防策略：**
- 执行阶段编写边界条件测试用例
- 验证阶段逐一验证

**应处理阶段：** 验证阶段

---

### P-P17: 现有功能回归

**需要回归测试的功能：**

| 功能 | 受影响原因 |
|------|------------|
| 收藏/取消收藏 | `is_favorite` 计算逻辑变更 |
| 收藏夹切换 | 数据结构变更 |
| ImagePreview 导航 | 列表数据结构变更 |
| 下载功能 | 依赖壁纸数据 |
| 设置背景 | 依赖壁纸数据 |

**预防策略：**
- 验证阶段运行完整回归测试
- 特别关注 KeepAlive 缓存的页面

**应处理阶段：** 验证阶段

---

## v6.0 关键阶段检查清单

### 规划阶段必须完成

- [ ] 确定 `PageData` vs `TotalPageData` 使用场景
- [ ] 设计内存缓存数据结构与失效策略
- [ ] 确定 `is_favorite` 注入时机与方式
- [ ] 评估是否需要 `item_count` 冗余字段
- [ ] 设计复合索引方案

### 执行阶段重点验证

- [ ] 页码越界处理
- [ ] 并发请求竞态处理
- [ ] 乐观更新实现
- [ ] 分页条状态同步

### 验证阶段必须覆盖

- [ ] 边界条件测试
- [ ] 现有功能回归测试
- [ ] 性能测试（深度分页、大收藏集）

---

*Pitfalls research for: v6.0 传统分页重构*
*Researched: 2026-05-04*
