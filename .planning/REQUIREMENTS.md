# Requirements: Wallhaven v5.0 — electron-store 到 SQLite 迁移

**Defined:** 2026-05-03
**Core Value:** 收藏管理，分类随心 — 将喜欢的壁纸添加到自定义收藏夹，按主题分类管理

## v5.0 Requirements

### Database Infrastructure

- [ ] **DBINFRA-01**: Create `electron/main/database.ts` with singleton `DatabaseSync` connection, lazy initialization, and proper shutdown
- [ ] **DBINFRA-02**: Add TypeScript declaration file (`electron/main/sqlite.d.ts`) for `node:sqlite` module covering used API surface
- [ ] **DBINFRA-03**: Define 5-table schema (`settings`, `search_params`, `download_history`, `collections`, `favorites`) with foreign keys, indexes, and WAL mode
- [ ] **DBINFRA-04**: Implement `withTransaction()` utility for atomic multi-write operations
- [ ] **DBINFRA-05**: Create one-time migration script that reads electron-store data and imports into SQLite in a single transaction
- [ ] **DBINFRA-06**: Migration script is idempotent — guarded by `_migrated_from_store` flag, safe to re-run if interrupted
- [ ] **DBINFRA-07**: Migration creates backup copy of electron-store file before any SQLite writes

### Main Process Direct Imports

- [ ] **MPDIR-01**: Replace `store.get('appSettings')` in `download-queue.ts` with SQLite query reading `maxConcurrentDownloads`
- [ ] **MPDIR-02**: Replace `store.get('appSettings.downloadPath')` in `download.handler.ts` with SQLite query reading `downloadPath`

### Storage IPC Layer

- [ ] **STIPC-01**: Modify `store.handler.ts` `store-get` handler to query SQLite instead of `store.get()`
- [ ] **STIPC-02**: Modify `store.handler.ts` `store-set` handler to upsert SQLite rows instead of `store.set()` (including `processQueue()` trigger for appSettings)
- [ ] **STIPC-03**: Modify `store.handler.ts` `store-delete` handler to delete from SQLite instead of `store.delete()`
- [ ] **STIPC-04**: Modify `store.handler.ts` `store-clear` handler to clear all SQLite tables instead of `store.clear()`

### Repository Layer

- [ ] **REPO-01**: `SettingsRepository` persists/reads `appSettings` via SQLite through generic store IPC — API unchanged
- [ ] **REPO-02**: `WallpaperRepository.getQueryParams()`/`setQueryParams()` routes through SQLite — API unchanged
- [ ] **REPO-03**: `DownloadRepository.get()`/`set()`/`add()`/`clear()` routes through SQLite with max-50 constraint enforced by SQL — API unchanged
- [ ] **REPO-04**: `FavoritesRepository` redesign: replace full-blob read-modify-write with targeted SQL operations (INSERT/UPDATE/DELETE per mutation)
- [ ] **REPO-05**: `FavoritesRepository` O(1) favorite existence check via SQL index instead of in-memory Set from full blob

### Cleanup

- [ ] **CLN-01**: Remove `electron-store` from `package.json` dependencies
- [ ] **CLN-02**: Delete `electron/main/store.ts` (no remaining consumers)
- [ ] **CLN-03**: Delete redundant `settings.handler.ts` and its IPC channels after confirming zero callers
- [ ] **CLN-04**: Delete unused `src/utils/store.ts`
- [ ] **CLN-05**: Remove legacy `electronClient.saveSettings()`/`loadSettings()` methods if confirmed unused
- [ ] **CLN-06**: Remove unused store handler IPC channels after all consumers migrated

### Verification & Testing

- [ ] **VER-01**: All existing functionality continues to work after each phase (settings, download, search, favorites)
- [ ] **VER-02**: Migration from existing electron-store data completes without data loss
- [ ] **VER-03**: App launches and initializes database within normal startup time (< 500ms overhead)
- [ ] **VER-04**: Favorites operations (add/remove/move/check) produce correct results via SQL queries
- [ ] **VER-05**: Application compiles and bundles without electron-store dependency

## Out of Scope

| Feature | Reason |
|---------|--------|
| ORM layer (Drizzle, Prisma) | 4-table schema doesn't justify ORM overhead. Repository layer already provides type-safe access. |
| Async SQLite driver | Main process needs synchronous access (download queue). `node:sqlite` is sync-first. |
| Dual-write to electron-store + SQLite | Adds complexity without safety benefit. One-time migration (idempotent) with cold backup is sufficient. |
| Schema-per-domain databases | Single `wallhaven-data.db` file. WAL mode handles concurrent access. One file simplifies backup. |
| Full normalization of wallpaper_data | Wallhaven API controls schema. Keep as JSON snapshot column, deserialize on read. |
| FTS5 full-text search | Valuable but not needed for migration. Trivial to add later with no dependency changes. |
| Data export/import feature | Enabled by SQLite but out of scope for this migration milestone. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DBINFRA-01 | 41 | Pending |
| DBINFRA-02 | 41 | Pending |
| DBINFRA-03 | 41 | Pending |
| DBINFRA-04 | 41 | Pending |
| DBINFRA-05 | 44 | Pending |
| DBINFRA-06 | 44 | Pending |
| DBINFRA-07 | 44 | Pending |
| MPDIR-01 | 42 | Pending |
| MPDIR-02 | 42 | Pending |
| STIPC-01 | 42 | Pending |
| STIPC-02 | 42 | Pending |
| STIPC-03 | 42 | Pending |
| STIPC-04 | 42 | Pending |
| REPO-01 | 42 | Pending |
| REPO-02 | 42 | Pending |
| REPO-03 | 42 | Pending |
| REPO-04 | 43 | Pending |
| REPO-05 | 43 | Pending |
| CLN-01 | 45 | Pending |
| CLN-02 | 45 | Pending |
| CLN-03 | 45 | Pending |
| CLN-04 | 45 | Pending |
| CLN-05 | 45 | Pending |
| CLN-06 | 45 | Pending |
| VER-01 | 45 | Pending |
| VER-02 | 44 | Pending |
| VER-03 | 45 | Pending |
| VER-04 | 43 | Pending |
| VER-05 | 45 | Pending |

**Coverage:**
- v5.0 requirements: 29 total
- Mapped to phases: 29/29 ✓

---
*Requirements defined: 2026-05-03*
