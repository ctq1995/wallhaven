---
phase: 43-favorites-collections-migration
plan: 01
subsystem: ipc
tags: favorites, collections, sqlite, ipc, handlers, preload

# Dependency graph
requires:
  - phase: 42 (store handler cutover)
    provides: SQLite database module (getDatabase, withTransaction), handler registration pattern
provides:
  - 11 dedicated IPC channels for favorites and collections CRUD operations
  - Favorites IPC handler module with parameterized SQL queries
  - Preload bridge methods for all 11 favorites channels
  - IPC_CHANNELS constants for all favorites channels
  - VALID_INVOKE_CHANNELS whitelist entries for favorites channels
  - env.d.ts type declarations for favorites ElectronAPI methods
affects:
  - 43-02 (renderer-side repository rewrite)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SELECT 1 ... LIMIT 1 existence check pattern per D-05"
    - "JSON.stringify/JSON.parse wallpaper_data round-trip"
    - "isDefault: row.is_default === 1 boolean conversion"
    - "Auto-create default collection on empty table (D-07)"

key-files:
  created:
    - electron/main/ipc/handlers/favorites.handler.ts
  modified:
    - electron/main/ipc/handlers/index.ts
    - src/shared/types/ipc.ts
    - electron/preload/types.ts
    - electron/preload/index.ts
    - env.d.ts

key-decisions:
  - "All SQL uses parameterized prepared statements with ? placeholders -- no string interpolation (SQL injection prevention, T-43-01)"
  - "favorites-get-collections handler auto-creates default collection ('收藏') when collections table is empty"
  - "favorites-set-default-collection uses withTransaction() for atomic old-default unset / new-default set"
  - "Default collection deletion rejected with COLLECTION_IS_DEFAULT error (T-43-04)"
  - "Favorite removal returns FAVORITE_NOT_FOUND when changes === 0"

patterns-established:
  - "Collection SQL row mapping: { id, name, isDefault: is_default === 1, sortOrder, createdAt, updatedAt }"
  - "FavoriteItem SQL row mapping: { collectionId, wallpaperId, wallpaperData: JSON.parse(), addedAt }"
  - "Error responses use { success: false, error: { code, message } } shape matching IpcErrorInfo"

requirements-completed:
  - REPO-04
  - REPO-05
  - VER-04

# Metrics
duration: 8min
completed: 2026-05-03
---

# Phase 43 Plan 01: Favorites IPC Infrastructure

**11 dedicated IPC channels for favorites and collections with parameterized SQL queries on SQLite, wired through preload bridge, IPC_CHANNELS constants, whitelist validation, and env.d.ts type declarations**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-03T21:20:26+08:00
- **Completed:** 2026-05-03T21:28:00+08:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `favorites.handler.ts` with 11 `ipcMain.handle()` registrations (591 lines) -- all SQL uses parameterized prepared statements with `?` placeholders
- Each handler performs targeted SQL operations on `collections`/`favorites` tables: get-collections (with auto-create default), create/rename/delete/set-default collections, get-by-collection, add/remove/move favorites, is-favorite check, get-collections-for-wallpaper
- Set-default-collection uses `withTransaction()` for atomic update (unset old, set new)
- Default collection deletion rejected with COLLECTION_IS_DEFAULT error
- All 11 channels wired into REGISTERED_CHANNELS in index.ts with registerFavoritesHandlers() call
- All 11 FAVORITES_* constants added to IPC_CHANNELS in src/shared/types/ipc.ts
- All 11 channels added to VALID_INVOKE_CHANNELS whitelist in preload/types.ts
- All 11 bridge methods added to preload/index.ts interface and implementation
- All 11 typed methods added to env.d.ts ElectronAPI with IpcResponse<Collection|FavoriteItem> return types

## Task Commits

Each task was committed atomically:

1. **Task 1: Create favorites IPC handler module with all 11 channels** - `70136a0` (feat)
2. **Task 2: Wire favorites IPC channels into registration, preload bridges, typed exports** - `347a02c` (feat)

## Files Created/Modified

- `electron/main/ipc/handlers/favorites.handler.ts` (NEW) -- 11 IPC channel handlers with parameterized SQL queries on collections/favorites tables
- `electron/main/ipc/handlers/index.ts` -- registerFavoritesHandlers import + call + 11 REGISTERED_CHANNELS entries
- `src/shared/types/ipc.ts` -- 11 FAVORITES_* IPC_CHANNELS constants
- `electron/preload/types.ts` -- 11 IPC_CHANNELS.FAVORITES_* entries in VALID_INVOKE_CHANNELS
- `electron/preload/index.ts` -- 11 methods in ElectronAPI interface and electronAPI implementation
- `env.d.ts` -- 11 favorites methods with typed IpcResponse<Collection|FavoriteItem|boolean> return types

## Decisions Made

- Used `SELECT 1 ... LIMIT 1` pattern for all existence checks (per D-05 design decision) instead of `COUNT(*)` for consistent O(1) lookups
- `favorites-get-collections` auto-creates default collection only when table is empty, matching the pattern of existing store behavior
- `favorites-set-default-collection` wrapped in `withTransaction()` to atomically unset old default / set new default, preventing race conditions
- `favorites-remove` checks `result.changes === 0` after DELETE to detect non-existent entries (returns FAVORITE_NOT_FOUND)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. This is internal IPC infrastructure.

## Next Phase Readiness

- All 11 favorites IPC channels are registered in the main process and callable from the renderer via preload bridges
- Phase 43-02 can now rewrite the renderer-side repository to use these dedicated IPC channels instead of the generic store-get/store-set path
- The `favoritesData` key in `store.handler.ts` keyToTable() routing still exists for backward compatibility during migration

## Self-Check: PASSED

- [x] `favorites.handler.ts` exists at 591 lines (min 250) with `registerFavoritesHandlers()` export
- [x] Contains 11 `ipcMain.handle()` registrations (verified: 11)
- [x] All SQL uses parameterized `?` placeholders -- no string interpolation (verified: 0 occurrences)
- [x] Default collection auto-creation present in favorites-get-collections handler
- [x] `SELECT 1 ... LIMIT 1` pattern used for existence checks
- [x] `JSON.stringify`/`JSON.parse` used for wallpaper_data round-trip
- [x] `isDefault: row.is_default === 1` boolean conversion pattern
- [x] Error responses use `{ success: false, error: { code, message } }` shape
- [x] index.ts contains import and call of registerFavoritesHandlers()
- [x] REGISTERED_CHANNELS lists all 11 favorites channel names
- [x] IPC_CHANNELS has all 11 FAVORITES_* constants
- [x] VALID_INVOKE_CHANNELS includes all 11 favorites channels
- [x] preload/index.ts has 11 favorites methods in interface and implementation
- [x] env.d.ts has 11 favorites methods with typed IpcResponse return types
- [x] No post-commit deletions detected
- [x] No untracked files left behind

---
*Phase: 43-favorites-collections-migration*
*Completed: 2026-05-03*
