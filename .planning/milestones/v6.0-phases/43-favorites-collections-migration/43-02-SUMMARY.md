---
phase: 43-favorites-collections-migration
plan: 02
subsystem: renderer, repository, ipc
tags: favorites, collections, ipc-migration, repository, electron-client

# Dependency graph
requires:
  - phase: 43-01
    provides: 11 dedicated favorites IPC channels in main process, preload bridges, IPC_CHANNELS constants
provides:
  - Renderer-side favorites repository rewritten to use dedicated IPC channels (no blob operations)
  - Electron client with 11 favorites* wrapper methods
  - keyToTable() no longer routes 'favoritesData' (D-06 completion)
affects:
  - Phase 44 (migration script)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "electronClient.favorites*() delegation pattern for IPC calls"
    - "IPC error code to FavoritesErrorCodes mapping for backward compatibility"
    - "isAvailable() + try/catch wrapper pattern for all IPC methods"

key-files:
  created: []
  modified:
    - src/clients/electron.client.ts
    - src/repositories/favorites.repository.ts
    - electron/main/ipc/handlers/store.handler.ts

key-decisions:
  - "FavoritesRepository no longer reads/writes FavoritesData blob via storeGet/storeSet"
  - "Default collection initialization removed from repository (handled by main process per D-07)"
  - "All existence checks use SQL index query via IPC, not in-memory Array.some()"
  - "keyToTable() favoritesData removal catches any missed migration references with 'Unknown store key' error"

patterns-established:
  - "electronClient favorites methods follow existing storeGet/storeSet IpcResponse wrapping pattern"
  - "Repository error mapping: IPC error codes (COLLECTION_NOT_FOUND, etc.) mapped to FavoritesErrorCodes"
  - "FavoritesData type no longer referenced anywhere in favorites repository"

requirements-completed:
  - REPO-04
  - REPO-05
  - VER-04

# Metrics
duration: 8min
completed: 2026-05-03
---

# Phase 43 Plan 02: Renderer-Side Repository Migration to Dedicated IPC

**Complete rewrite of the renderer-side favorites repository and electron client to use 11 dedicated IPC channels, replacing the old full-blob read-modify-write pattern with targeted SQL operations**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-03T21:20:00+08:00
- **Completed:** 2026-05-03T21:28:00+08:00
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added 11 new favorites* methods to `electron.client.ts` under a new Favorites & Collections section -- each method checks `isAvailable()`, wraps in try/catch, and returns `IpcResponse<T>` shape matching the existing pattern
- Added `Collection`, `FavoriteItem`, `WallpaperItem` type imports to `electron.client.ts` from `@/types`
- Completely rewrote `favorites.repository.ts`:
  - Removed `getData()` and `setData()` methods (no more FavoritesData blob operations)
  - Removed `createDefaultCollection()` function (main process handles this per D-07)
  - Removed `STORAGE_KEYS` import and dependency
  - Each method now calls `electronClient.favorites*()` IPC method directly
  - IPC error codes are mapped to `FavoritesErrorCodes` for backward compatibility
  - 80 lines added, 308 lines removed -- net deletion of 228 lines of old blob code
- Removed `case 'favoritesData':` from `keyToTable()` in `store.handler.ts` -- any lingering storeGet/storeSet('favoritesData') will now throw "Unknown store key" error, intentionally catching missed migration references (D-06 completion)
- All public API signatures in `favorites.repository.ts` remain identical -- `favorites.service.ts` requires no changes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 11 favorites* methods to electronClient** - `d6028c1` (feat)
2. **Task 2: Rewrite favorites.repository.ts to use dedicated IPC channels** - `3dd28ea` (feat)
3. **Task 3: Remove 'favoritesData' from keyToTable() in store.handler.ts** - `e740978` (fix)

## Files Created/Modified

- `src/clients/electron.client.ts` -- 11 new favorites* methods (281 lines added) wrapping window.electronAPI calls in IpcResponse<T> format
- `src/repositories/favorites.repository.ts` -- Complete rewrite (80 lines added, 308 lines removed) using electronClient.favorites*() calls, no storeGet/storeSet for FavoritesData
- `electron/main/ipc/handlers/store.handler.ts` -- Removed `case 'favoritesData':` from keyToTable() switch and updated JSDoc

## Decisions Made

- Error code mapping from IPC responses to `FavoritesErrorCodes` is straightforward since the main process handlers use the same error code strings (`COLLECTION_NOT_FOUND`, `COLLECTION_NAME_EXISTS`, etc.)
- The `FAVORITES_ERROR` code is used in electronClient methods as a generic fallback when no specific error is provided by the IPC response
- `isFavorite` returns `data: false` on failure (consistent with existing pattern where the boolean result defaults to false on error)

## Deviations from Plan

None - plan executed exactly as written.

The only adjustment was updating the JSDoc comment in `store.handler.ts` that listed `favoritesData` among the known keys -- changed from "4 known keys" to "3 known keys" to match the actual state after removal.

## Issues Encountered

None

## Stub Tracking

No stubs found. The repository implementation is a direct mapping from IPC calls to repository methods with proper error handling. The electron client methods follow the established pattern with no empty/mock data.

## Threat Surface Scan

No new threat surface introduced. The threat model T-43-06 (Spoofing via error mapping), T-43-07 (Information Disclosure improvement), and T-43-08 (DoS via keyToTable) are all mitigated or accepted per the plan.

## Next Phase Readiness

- All 11 dedicated favorites IPC channels are now fully wired from renderer repository -> electron client -> preload bridge -> main process handler -> SQLite
- The old `favoritesData` blob path in keyToTable() has been removed as a safety net
- `favorites.service.ts` needs no changes -- all repository method signatures are identical
- Phase 44 can now implement the data migration script to transfer existing electron-store favorites data to SQLite tables

## Self-Check: PASSED

- [x] Repository no longer uses storeGet/storeSet for FavoritesData
- [x] Repository delegates to electronClient favorites methods (11 calls)
- [x] keyToTable no longer routes favoritesData (grepped, 0 matches)
- [x] All 11 electronClient methods exist (22 total occurrences across definitions + usages)
- [x] Service API unchanged -- favoritesService methods still identical
- [x] No accidental file deletions in any commit
- [x] No untracked files left behind
- [x] Working tree is clean

---
*Phase: 43-favorites-collections-migration*
*Completed: 2026-05-03*
