---
phase: 42-main-process-store-handler-cutover
fixed_at: 2026-05-03T19:30:00Z
review_path: .planning/phases/42-main-process-store-handler-cutover/42-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 42: Code Review Fix Report

**Fixed at:** 2026-05-03T19:30:00Z
**Source review:** .planning/phases/42-main-process-store-handler-cutover/42-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (2 critical, 5 warning)
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Cancel handler emits `state: 'cancelled'` instead of `state: 'waiting'`

**Files modified:** `electron/main/ipc/handlers/download.handler.ts`
**Commit:** `907e832`
**Applied fix:** Changed `state: 'waiting'` to `state: 'cancelled'` in the download cancel progress event payload. The Chinese comment on line 921 says "notify renderer task has been cancelled" but the payload incorrectly said `waiting`, which would lead the renderer to display a phantom queued task.

### CR-02: Download repository `add()` / `remove()` — read-modify-write race condition

**Files modified:** `src/repositories/download.repository.ts`
**Commit:** `f643d5a`
**Applied fix:** Added a promise-based mutex (`serialMutex` / `withSerialAccess()`) that serializes concurrent `add()` and `remove()` calls. Each invocation chains behind the previous one, preventing the read-modify-write interleaving that would silently lose data under concurrent IPC calls.

### WR-01: `withTransaction()` — ROLLBACK error masks the original error

**Files modified:** `electron/main/database.ts`
**Commit:** `669a7a4`
**Applied fix:** Wrapped `database.exec('ROLLBACK')` in a try/catch block so that if the rollback itself throws (e.g., connection closed), the original error from `fn()` or `COMMIT` still propagates and is not masked.

### WR-02: `DB_PATH` computed at module load — crashes if imported before `app.ready()`

**Files modified:** `electron/main/database.ts`
**Commit:** `375fe3b`
**Applied fix:** Replaced the module-level `DB_PATH` constant (which called `app.getPath('userData')` at import time) with a `getDbPath()` function that computes the path lazily inside `getDatabase()`. This ensures `app.getPath('userData')` is only called after the `ready` event has fired.

### WR-03: `getAppSetting()` bare catch swallows runtime errors

**Files modified:** `electron/main/database.ts`
**Commit:** `5b9d4db`
**Applied fix:** Added error logging via `console.error()` in the catch block of `getAppSetting()`, so that unexpected runtime errors (e.g., SQLite driver failures, connection errors) are visible in the console and distinguishable from "key not found" scenarios. The function still returns `null` on error.

### WR-04: `store-clear` runs three DELETEs without a transaction

**Files modified:** `electron/main/ipc/handlers/store.handler.ts`
**Commit:** `7b2d145`
**Applied fix:** Wrapped the three sequential DELETE statements (settings, search_params, download_history) in `withTransaction()`, ensuring that either all three tables are cleared atomically or none are. Consistent with the `store-set` handler which already uses `withTransaction()` for the relational type.

### WR-05: Cancel handler omits `totalSize` in progress event

**Files modified:** `electron/main/ipc/handlers/download.handler.ts`
**Commit:** `5f75a39`
**Applied fix:** Added `totalSize: download.totalSize` to the cancel progress event payload, matching the pause handler which already includes this field. Without it, the renderer's progress handler would receive `undefined` for `totalSize`, potentially causing NaN in progress calculations.

---

_Fixed: 2026-05-03T19:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
