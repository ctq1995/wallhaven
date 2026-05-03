# Feature Research: electron-store to SQLite Migration

**Domain:** Electron desktop wallpaper browser — migrating persistent storage from JSON-file (electron-store) to SQLite for data integrity, partial updates, and query capability
**Researched:** 2026-05-03
**Confidence:** HIGH (based on codebase analysis + established SQLite migration patterns)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = migration feels incomplete or causes data loss.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Data migration with zero loss | Existing app data (settings, search params, download history, favorites) must survive the migration intact. Users expect their configuration and collections to be preserved across the update. | MEDIUM | Transactional migration script handles all 4 domains in a single atomic operation. Idempotent — safe to re-run if interrupted. |
| App startup without regression | App launches normally, reads from SQLite instead of electron-store. No visible difference to the user. All existing functionality works. | LOW | Repository layer swaps backend. IPC handlers route through SQLite. The View/Composable/Service layers are unchanged. |
| Download queue still reads settings | The download queue in the main process reads `maxConcurrentDownloads` from storage on every `processQueue()` call. This must continue to work synchronously. | LOW | `node:sqlite` provides synchronous `getDatabase().prepare().get()` — direct replacement for `store.get('appSettings')`. |
| Favorites CRUD operations work | Create, rename, delete collections. Add, remove, move favorites. Check if a wallpaper is favorited. All continue to work through the repository layer. | MEDIUM | The favorites repository does full read-modify-write on a JSON blob today. SQLite replaces this with targeted INSERT/UPDATE/DELETE queries. The repository interface stays the same. |
| Download history add/remove/clear | Adding completed downloads, removing individual entries, clearing all history. | LOW | Max-50 constraint enforced by SQL query (`ORDER BY time DESC LIMIT 50`). Repository interface unchanged. |
| Settings read/write | Reading and saving all 4 settings fields (downloadPath, maxConcurrentDownloads, apiKey, wallpaperFit). | LOW | Settings stored as individual key-value rows for atomic access. Repository returns the full `AppSettings` object from a single query. |

### Differentiators (Competitive Advantage)

Features enabled by SQLite that were impractical with electron-store's JSON-blob pattern.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Partial settings read in main process | The download queue reads only `maxConcurrentDownloads` from storage. With electron-store this reads the entire `appSettings` blob and extracts one field. With SQLite, it reads one row: `SELECT value FROM settings WHERE key = 'maxConcurrentDownloads'`. | LOW | Already implemented as a prepared statement. Reduces data transfer and JSON parsing for the hot path (every `processQueue()` call). |
| O(1) favorites lookup | "Is this wallpaper favorited?" currently reads the entire `FavoritesData` blob (potentially hundreds of items), then does an array `.some()`. With SQLite: `SELECT 1 FROM favorites WHERE wallpaper_id = ? LIMIT 1` — index-only lookup. | LOW | Index on `favorites(wallpaper_id)`. Direct replacement for O(N) array scan. |
| Targeted collection queries | "Get all collections for wallpaper X" currently reads the full blob and filters in JavaScript. SQLite: `SELECT c.* FROM collections c JOIN favorites f ON c.id = f.collection_id WHERE f.wallpaper_id = ?`. | LOW | JOIN query offloads filtering to the database engine. No data transfer overhead for irrelevant rows. |
| Atomic delete with cascade | Delete a collection and all its favorites in one operation. Currently: read blob, filter array, write blob. With SQLite: `DELETE FROM collections WHERE id = ?` (CASCADE deletes favorites). No read-modify-write race. | LOW | Foreign key constraint with `ON DELETE CASCADE`. Eliminates the race condition where two operations could overwrite each other's changes. |
| Transactional multi-write operations | Operations that modify multiple rows (e.g., moving a favorite between collections) are wrapped in a SQLite transaction. If the app crashes mid-operation, the database is left in its previous consistent state. | MEDIUM | SQLite's WAL journaling and `BEGIN IMMEDIATE/COMMIT` transactions ensure crash safety. This is the primary motivation for the migration. |
| Future: full-text search | SQLite's FTS5 extension enables full-text search across collection names, wallpaper tags, or download history filenames. | LOW | Not needed now but trivial to add later. Requires no additional dependencies. |
| Future: data export/import | SQLite's `VACUUM INTO 'backup.db'` enables one-command full backup. JSON export for user-facing export feature. | LOW | Atomic, consistent backup. No risk of backing up a partially-written state. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for this migration.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| ORM layer (Drizzle, Prisma, TypeORM) | ORMs provide type-safe queries and migration tooling. Drizzle is popular in the 2025-2026 Electron ecosystem. | Adds 2-5MB to bundle, introduces build-time schema generation, complicates the simple 4-table schema. The existing repository layer already provides type-safe data access. An ORM adds abstraction without value for this scale. | Raw `node:sqlite` with typed repository methods. Each table gets an `interface` and the repository calls `getDatabase().prepare()` with those types. |
| Async SQLite driver (`sqlite3`) | Some developers prefer async APIs for consistency with the existing IPC-based pattern. | The main process needs synchronous access (download queue reading settings). `node:sqlite` is sync-first. Mixing sync and async in one process is confusing. | `node:sqlite` (synchronous, built-in). Repository calls are already awaited, so sync calls complete in the microtask queue without blocking the renderer. |
| Dual-write to electron-store + SQLite | "Keep writing to both during transition for safety." | Doubles write time, doubles code complexity, introduces sync bugs. Migration is a one-time idempotent script, not a permanent dual-write. | Run migration once on startup. After success, SQLite is the single source of truth. Keep electron-store file as cold backup (not read, not written). |
| Schema-per-domain databases | Separate `.db` files for settings, favorites, and downloads to reduce coupling. | Multiple database connections increase memory and complexity. All 4 domains fit comfortably in one file (< 1MB expected). One file simplifies backup, migration, and connection management. | Single `wallhaven-data.db` file. WAL mode ensures concurrent reads don't block writes. |
| Normalize wallpaper_data into columns | Full normalization of the `wallpaperData` JSON blob (12+ fields) into individual columns. | Wallpaper data comes from an external API. Its schema is controlled by Wallhaven, not us. Normalizing adds maintenance burden when the API changes. The snapshot pattern is correct for offline favorites viewing. | Store `wallpaper_data` as a JSON text column. The repository deserializes it into `WallpaperItem` on read. |

## Feature Dependencies

```
Migration Script
    ├──requires──> Database Connection (node:sqlite init + WAL mode)
    ├──requires──> Schema Definition (CREATE TABLE IF NOT EXISTS for all tables)
    ├──requires──> electron-store Data Access (read old data during migration)
    └──requires──> Migration Tracking (_migrated_from_store key in settings table)

Settings Domain
    ├──requires──> settings table with key-value rows
    └──requires──> Repository updated to query settings table instead of IPC store

Search Params Domain
    └──requires──> search_params table (single JSON row)

Download History Domain
    ├──requires──> download_history table with indexed columns
    └──requires──> Max-50 enforcement via SQL ORDER BY + LIMIT

Favorites Domain
    ├──requires──> collections table
    ├──requires──> favorites table with FK to collections
    └──requires──> Indexes on (wallpaper_id) and (collection_id)

Main Process Settings Direct Read
    ├──requires──> Database module export for main process handlers
    └──requires──> Prepared statement for synchronous settings key lookup

Cleanup
    └──requires──> All 4 domains migrated and verified → Remove electron-store dependency
```

### Dependency Notes

- **Migration requires all tables exist before data transfer** — Tables must be created in the correct order (collections before favorites due to FK constraint). The migration script creates tables first, then transfers data within a transaction.
- **Main process settings read depends on DB module** — The `download-queue.ts` and `download.handler.ts` currently import `store` from `../../store`. They must import `getDatabase` from the database module instead. The DB module must provide a synchronous API.
- **Favorites FK dependency** — The `favorites` table's `collection_id` column references `collections(id)`. Collection inserts must happen before favorite inserts during migration.
- **electron-store removal depends on all domains migrated** — The `electron-store` package cannot be removed until all 4 repository classes have been updated and the migration has been verified on existing user data.

## MVP Definition

### Launch With (v1 — Initial Migration)

Minimum viable migration — all 4 data domains work with SQLite, no data loss.

- [ ] **Database initialization** — `DatabaseSync` connection established on app startup (no npm dependency — `node:sqlite` is built-in), WAL mode enabled (default in SQLite 3.51+), `enableForeignKeyConstraints: true`
- [ ] **Schema creation** — All tables (`settings`, `search_params`, `download_history`, `collections`, `favorites`) created via `CREATE TABLE IF NOT EXISTS`
- [ ] **Migration script** — Idempotent one-time migration from electron-store JSON to SQLite. Reads all 4 keys, transforms data, inserts into SQLite within a transaction. Records migration in `_migrated_from_store` settings key.
- [ ] **Settings repository update** — `settingsRepository.get/set/delete()` reads from SQLite instead of IPC `storeGet/Set`. Backward-compatible return types.
- [ ] **Download repository update** — `downloadRepository.get/set/add/remove/clear()` reads from SQLite. `SELECT ... ORDER BY time DESC LIMIT 50` handles max-size enforcement.
- [ ] **Wallpaper repository update** — `wallpaperRepository.getQueryParams/setQueryParams/deleteQueryParams()` reads from SQLite. Single-row table with JSON column.
- [ ] **Favorites repository update** — `favoritesRepository` CRUD operations use SQL queries instead of read-modify-write on JSON blob. Collections and favorites in separate tables with FK constraint.
- [ ] **Main process settings read** — `download-queue.ts` and `download.handler.ts` read settings via SQLite prepared statement instead of `store.get('appSettings')`.
- [ ] **IPC handler simplification** — `store.handler.ts` no longer needs to handle `store-get`/`store-set`/`store-delete`/`store-clear` for the 4 migrated domains.

### Add After Validation (v1.x)

Features to add once core migration is verified.

- [ ] **Redundant settings.json cleanup** — Remove `settings.handler.ts` IPC handlers and the legacy `{userData}/settings.json` file. This is dead code that nobody calls through the current app flow.
- [ ] **electron-store dependency removal** — Remove `electron-store` from `package.json`, delete `electron/main/store.ts`, remove `store` imports. Only after confirming no code path still reads from electron-store.
- [ ] **Preload cleanup** — Remove `storeGet`/`storeSet`/`storeDelete`/`storeClear` from preload context bridge if no IPC handlers remain. Reduces preload surface area.

### Future Consideration (v2+)

Features to defer until data migration is stable.

- [ ] **Settings backup/restore** — Export settings to JSON file for user backup. Low priority since SQLite is already crash-safe with WAL.
- [ ] **Favorites full-text search** — Add FTS5 virtual table for searching collection names. Not needed until users have hundreds of favorites.
- [ ] **Data integrity verification** — `PRAGMA integrity_check` on startup to detect corruption. Only needed if users report data issues.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Data migration with zero loss | HIGH | MEDIUM (transactional script, 4 domains) | P0 |
| App startup without regression | HIGH | LOW (Repository swap at import level) | P0 |
| Settings read/write | HIGH | LOW (4 key-value rows with repository adapter) | P0 |
| Download queue reads settings | HIGH | LOW (synchronous prepared statement) | P0 |
| Favorites CRUD | MEDIUM | MEDIUM (collections + favorites tables, FK) | P0 |
| Download history | MEDIUM | LOW (single table with ORDER BY + LIMIT) | P0 |
| Search params | LOW | LOW (single JSON row) | P0 |
| Partial settings read (main process) | LOW | LOW (prepared statement by key) | P1 |
| O(1) favorites lookup | LOW | LOW (index on wallpaper_id) | P1 |
| Atomic collection delete with cascade | MEDIUM | LOW (ON DELETE CASCADE) | P1 |
| Redundant settings.json removal | LOW | LOW (dead code deletion) | P2 |
| electron-store dependency removal | LOW | LOW (package.json + import cleanup) | P2 |
| Preload cleanup | LOW | LOW (context bridge removal) | P2 |

**Priority key:**
- P0: Must have for launch (user data safety, no regression)
- P1: Should have for this milestone (enables SQLite's advantages)
- P2: Nice to have, cleanup after verification

## Data Migration Schema Mapping

```
electron-store (wallhaven-data.json)          SQLite (wallhaven-data.db)
========================================      ====================

appSettings: {                                settings table (key-value rows):
  downloadPath           ──────────────►        key='downloadPath' → value
  maxConcurrentDownloads ──────────────►        key='maxConcurrentDownloads' → value
  apiKey                 ──────────────►        key='apiKey' → value
  wallpaperFit           ──────────────►        key='wallpaperFit' → value

wallpaperQueryParams: {                       search_params table (singleton row):
  selector, keyword, etc.  ──────────────►      id=1, params=JSON({...})

downloadFinishedList: [                      download_history table (one row per item):
  { id, url, filename, path,                   id, wallpaper_id, url, filename,
    resolution, size, time, ... }               path, resolution, size, time
  ]                                             Note: state/progress/offset/speed/retry*
                                                only relevant for active downloads.

favoritesData: {                              collections table:
  collections: [                                id, name, is_default, created_at, updated_at
    { id, name, isDefault,                    favorites table:
      createdAt, updatedAt },                   wallpaper_id, collection_id, added_at,
    ...                                         wallpaper_data (JSON snapshot)
  ]                                             FK: collection_id → collections(id)
  favorites: [                                  ON DELETE CASCADE
    { wallpaperId, collectionId,              PK: (wallpaper_id, collection_id)
      addedAt, wallpaperData },               Indexes:
    ...                                         idx_favorites_wallpaper(wallpaper_id)
  }                                             idx_favorites_collection(collection_id)
}
```

## Sources

- Existing codebase analysis:
  - `electron/main/store.ts` — electron-store instance with defaults
  - `electron/main/ipc/handlers/store.handler.ts` — IPC bridge to electron-store
  - `electron/main/ipc/handlers/settings.handler.ts` — redundant legacy settings.json persistence (dead code)
  - `electron/main/ipc/handlers/download.handler.ts` — direct `store.get('appSettings')` at line 1005
  - `electron/main/ipc/handlers/download-queue.ts` — direct `store.get('appSettings')` at line 94
  - `src/repositories/settings.repository.ts` — IPC-based data access pattern
  - `src/repositories/download.repository.ts` — IPC-based data access with read-modify-write
  - `src/repositories/wallpaper.repository.ts` — IPC-based data access (simple)
  - `src/repositories/favorites.repository.ts` — IPC-based data access with full-blob read-modify-write
  - `src/clients/electron.client.ts` — storeGet/storeSet with JSON deep clone for IPC safety
  - `electron/preload/index.ts` — storeGet/storeSet context bridge methods
  - `src/types/favorite.ts` — Collection, FavoriteItem, FavoritesData type definitions
  - `src/types/index.ts` — AppSettings (4 fields), FinishedDownloadItem, CustomParams types
  - `src/clients/constants.ts` — STORAGE_KEYS mapping (APP_SETTINGS, DOWNLOAD_FINISHED_LIST, WALLPAPER_QUERY_PARAMS, FAVORITES_DATA)
  - `package.json` — electron-store v11.0.2 (current), no SQLite dependency yet
- Web research: electron-store to SQLite migration patterns (Canopy IDE issue #2707, ito issue #127)
- Web research: SQLite schema versioning with migrations table pattern
- Web research: WAL journaling `PRAGMA journal_mode=WAL` for crash safety in Electron apps
- SQLite documentation: `PRAGMA foreign_keys = ON`, `ON DELETE CASCADE`, transactions, indexes
- [Node.js 24 `node:sqlite` Documentation](https://nodejs.org/download/nightly/v24.0.0-nightly20250503f552c86fec/docs/api/sqlite.html) — Official API reference for DatabaseSync, StatementSync
- [Electron 41.0.0 Release Announcement](https://az.electronjs.org/blog/electron-41-0) — Confirms Node.js v24.14.0 with `node:sqlite`

---
*Feature research for: v5.0 electron-store to SQLite migration*
*Researched: 2026-05-03*
