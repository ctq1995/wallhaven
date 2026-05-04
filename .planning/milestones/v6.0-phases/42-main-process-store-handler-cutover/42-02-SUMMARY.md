---
phase: 42-main-process-store-handler-cutover
plan: 02
type: execute
status: complete
execution_date: "2026-05-03"
---

# Plan 42-02 Summary: Store handler rewrite + download repo cleanup

## Objective

Rewrite store.handler.ts to route all 4 IPC handlers (store-get, store-set, store-delete, store-clear) through SQLite via a keyToTable() routing function. Remove application-layer max-50 slice from download.repository.ts.

## Changes Made

### electron/main/ipc/handlers/store.handler.ts
- Complete rewrite (74 → 186 lines)
- Added `keyToTable()` function mapping 4 known keys to 3 table types:
  - appSettings/favoritesData → settings table (key_value)
  - wallpaperQueryParams → search_params table (single_row)
  - downloadFinishedList → download_history table (relational)
- `store-get` reads from appropriate table, returns `{ success: true, value }` (backward compatible)
- `store-set` uses INSERT OR REPLACE for key_value/single_row, withTransaction() for relational
- `store-set` preserves processQueue() trigger when key === 'appSettings'
- `store-delete` deletes from correct table per key routing
- `store-clear` only touches settings, search_params, download_history (never collections/favorites)
- All SQL uses parameterized queries (`?` placeholders)

### src/repositories/download.repository.ts
- Removed `MAX_FINISHED_ITEMS = 50` constant
- Removed `.slice(0, MAX_FINISHED_ITEMS)` from set() and add() methods
- Max-50 constraint now enforced exclusively by SQL-level DELETE in store-set handler

## Verification

- Zero store imports remain in store.handler.ts
- keyToTable() correctly routes all 4 known keys
- store-get returns `value` field (not `data`) — confirmed backward compatible
- processQueue() trigger preserved on appSettings change
- MAX_FINISHED_ITEMS and .slice() completely removed from download.repository.ts
- All 4 IPC channels have unchanged names and response formats

## Key Files Created/Modified

- `electron/main/ipc/handlers/store.handler.ts` — SQLite-backed rewrite
- `src/repositories/download.repository.ts` — slice removal

## Decisions Applied

- D-01: Key routing to dedicated tables
- D-02: keyToTable() mapping function
- D-03: Application-layer SQL cleanup (not DB triggers)
- D-04: Exact SQL for max-50 constraint
- D-05/D-06: store-clear scope (settings/search_params/download_history only)
- D-07: \_migrated_from_store flag not managed by DB

## Pitfalls Avoided

- Pitfall 1: store-get returns `value` field name (not `data`) — backward compatible with electronClient
- Pitfall 2: keyToTable() throws for unknown keys, caught by handler try/catch
- Pitfall 3: download_history multi-row writes wrapped in withTransaction()
- Pitfall 4: processQueue() trigger preserved on appSettings change
