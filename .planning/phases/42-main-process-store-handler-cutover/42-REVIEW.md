---
phase: 42-main-process-store-handler-cutover
reviewed: 2026-05-03T19:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - electron/main/database.ts
  - electron/main/ipc/handlers/download-queue.ts
  - electron/main/ipc/handlers/download.handler.ts
  - electron/main/ipc/handlers/store.handler.ts
  - src/repositories/download.repository.ts
findings:
  critical: 2
  warning: 5
  info: 5
  total: 12
status: issues_found
---

# Phase 42: Code Review Report

**Reviewed:** 2026-05-03T19:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed 5 source files implementing the store handler cutover to SQLite-backed storage and download queue infrastructure. Found 2 critical issues, 5 warnings, and 5 info items.

- **Critical:** (1) Cancel handler emits `state: 'waiting'` instead of a cancelled/failed state, which will mislead the renderer into believing a cancelled task is still queued. (2) The download repository `add()` and `remove()` methods have read-modify-write race conditions that can silently lose data under concurrent calls.
- **Warning:** ROLLBACK in `withTransaction()` can mask the original error; `DB_PATH` computed eagerly at module import time will crash if loaded before `app.ready()`; `getAppSetting()` swallows all errors including runtime ones; `store-clear` runs three DELETEs outside a transaction (partial-clear risk); cancel handler omits `totalSize` in its progress event.
- **Info:** Style nits, commented-out code, non-null assertion fragility, single-blob favorites storage, and an ordering dependency between singleton registration and handler invocation.

## Critical Issues

### CR-01: Cancel handler emits `state: 'waiting'` — renderer sees cancelled task as queued

**File:** `electron/main/ipc/handlers/download.handler.ts:927`

**Issue:** When an active download is cancelled, the progress event sent to the renderer sets `state: 'waiting'`:

```typescript
win.webContents.send('download-progress', {
  taskId,
  state: 'waiting',   // <-- semantically wrong
  progress: 0,
  offset: 0,
  speed: 0,
})
```

The Chinese comment on line 921 says "notify renderer task has been cancelled", but the payload says `state: 'waiting'`. The renderer will interpret this as the task being placed back in the queue (ready to be processed), when in fact the task has been permanently cancelled and its temp files deleted. This could cause the UI to display a phantom queued task, or the user may attempt to interact with a task that no longer exists.

The PAUSE handler (line 864) correctly sends `state: 'paused'`. The cancel handler should similarly send `state: 'cancelled'` or `state: 'failed'`.

**Fix:**
```typescript
win.webContents.send('download-progress', {
  taskId,
  state: 'cancelled',   // or 'failed'
  progress: 0,
  offset: 0,
  speed: 0,
})
```

### CR-02: Download repository `add()` / `remove()` — read-modify-write race condition causes data loss

**File:** `src/repositories/download.repository.ts:45-53, 59-67`

**Issue:** Both `add()` and `remove()` follow a read-modify-write pattern: they call `this.get()` (IPC to main process, async), modify the result in memory, then call `this.set()` (IPC to main process, async). There is no mutual exclusion, so concurrent invocations interleave and lose data:

- Caller A `add(x)` → gets `[existing]`, computes `[x, ...existing]`
- Caller B `add(y)` → gets `[existing]` (same snapshot), computes `[y, ...existing]`
- Caller A writes `[x, ...existing]`
- Caller B writes `[y, ...existing]` ← **x is lost**

The same race applies to concurrent `add`+`remove` and concurrent `remove`+`remove` calls. This is a silent data-loss bug on the download history list.

**Fix:** Either (a) introduce a main-process IPC handler that atomically prepends / removes individual items from the download_history table directly (no read-modify-write round-trip), or (b) implement a lock/mutex in the repository so concurrent callers serialize.

## Warnings

### WR-01: `withTransaction()` — ROLLBACK error masks the original error

**File:** `electron/main/database.ts:230-231`

**Issue:** In the catch block, if `database.exec('ROLLBACK')` throws (e.g., connection closed or no active transaction), the original error from `fn()` is lost and the ROLLBACK error propagates instead:

```typescript
} catch (error) {
  database.exec('ROLLBACK')  // if this throws, 'error' is lost
  throw error                // never reached
}
```

This makes debugging impossible when the real cause was inside `fn()` or the COMMIT. In pathological cases where `fn()` itself rolled back internally, the subsequent `COMMIT` would fail, and the ROLLBACK in the catch block would also fail, producing a confusing cascade of errors.

**Fix:** Suppress ROLLBACK errors so the original error always propagates:
```typescript
} catch (error) {
  try { database.exec('ROLLBACK') } catch { /* swallow rollback error */ }
  throw error
}
```

### WR-02: `DB_PATH` computed at module load — crashes if imported before `app.ready()`

**File:** `electron/main/database.ts:28`

**Issue:** `DB_PATH` calls `app.getPath('userData')` at module evaluation time. If `database.ts` is imported (directly or transitively) before the Electron `app` fires its `ready` event, `app.getPath()` throws. Since all handler files top-level-import from `database.ts` (via `import { ... } from '../../database'`), the database module is executed at import time, not lazily.

While in the current setup the handlers are registered after `app.ready()`, the module evaluation happens when the bundler loads the entry file, which may be before `app.ready()`. This is a latent crash bug that will surface if the import order changes or the module is loaded in a test environment.

**Fix:** Compute `DB_PATH` lazily inside `getDatabase()`:
```typescript
function getDbPath(): string {
  return join(app.getPath('userData'), DB_FILENAME)
}

// In getDatabase():
db = new DatabaseSync(getDbPath(), { ... })
```

### WR-03: `getAppSetting()` bare catch swallows runtime errors

**File:** `electron/main/database.ts:247`

**Issue:** The entire function body is wrapped in a bare `catch` that returns `null`. This swallows not just the expected `key not found` and `JSON.parse` failures but also unexpected runtime errors (e.g., `TypeError` from the SQLite driver, database connection failures). The callers (`getDownloadPath`, `getMaxConcurrentDownloads`) have no way to distinguish "setting does not exist" from "database is broken".

**Fix:** Differentiate expected errors from unexpected ones, or at minimum log the error:
```typescript
export function getAppSetting(key: string): unknown {
  try {
    const row = getDatabase()
      .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(key)
    if (!row) return null
    return JSON.parse(row.value)
  } catch (error) {
    logHandler('getAppSetting', `Failed to read setting "${key}": ${error}`, 'error')
    return null
  }
}
```

### WR-04: `store-clear` runs three DELETEs without a transaction — partial clear risk

**File:** `electron/main/ipc/handlers/store.handler.ts:174-177`

**Issue:** The `store-clear` handler executes three separate `DELETE` statements sequentially without wrapping them in a transaction:

```typescript
getDatabase().exec('DELETE FROM settings')
getDatabase().exec('DELETE FROM search_params')
getDatabase().exec('DELETE FROM download_history')
```

If the second or third `DELETE` fails (e.g., SQLITE_BUSY, schema error), the earlier tables have already been cleared. The database is left in a partially-cleared state. Compare with `store-set` for the `relational` type, which correctly uses `withTransaction()`.

**Fix:** Wrap all three DELETEs in `withTransaction()`:
```typescript
withTransaction(() => {
  getDatabase().exec('DELETE FROM settings')
  getDatabase().exec('DELETE FROM search_params')
  getDatabase().exec('DELETE FROM download_history')
})
```

### WR-05: Cancel handler omits `totalSize` in progress event

**File:** `electron/main/ipc/handlers/download.handler.ts:924-931`

**Issue:** The CANCEL handler's progress event does not include `totalSize`, while the PAUSE handler (line 864-869) correctly includes it:

```typescript
// CANCEL (no totalSize):
win.webContents.send('download-progress', {
  taskId,
  state: 'waiting',
  progress: 0,
  offset: 0,
  speed: 0,
  // totalSize missing
})

// PAUSE (has totalSize):
win.webContents.send('download-progress', {
  taskId,
  state: 'paused',
  offset: currentSize,
  totalSize: download.totalSize,  // <-- present
})
```

If the renderer's progress handler expects `totalSize`, it will receive `undefined`, which could cause NaN in progress calculations or UI rendering issues.

**Fix:** Include `totalSize` in the cancel progress event:
```typescript
win.webContents.send('download-progress', {
  taskId,
  state: 'cancelled',
  progress: 0,
  offset: 0,
  speed: 0,
  totalSize: download.totalSize,
})
```

## Info

### IN-01: `|| 0` instead of `?? 0` for null coalescing

**File:** `electron/main/ipc/handlers/download.handler.ts:837`

**Issue:** `download.downloadedSize || 0` uses logical OR, which would treat any falsy value (0, "", false) as needing the fallback. While `0` falling through to `0` is harmless here, the pattern masks potential bugs. Use the nullish coalescing operator `??` for intent clarity.

### IN-02: Commented-out legacy code block

**File:** `electron/main/ipc/handlers/download.handler.ts:22-31`

**Issue:** An entire commented-out `IPC_CHANNELS` const declaration remains in the file. These constants are now imported from `src/shared/types/ipc`. The dead code adds noise and could confuse maintainers about which definition is authoritative.

### IN-03: `db!` non-null assertion in `initializeSchema()`

**File:** `electron/main/database.ts:56`

**Issue:** `initializeSchema()` uses the non-null assertion `db!` on the module-level variable typed as `DatabaseSync | undefined`. While this function is currently only called from `getDatabase()` after initializing `db`, a future refactoring could call it from another context and trigger a runtime `TypeError`. A guard at the top of the function would be more defensive:
```typescript
if (!db) throw new Error('Database not initialized');
```

### IN-04: `favoritesData` stored as single JSON blob in `settings` table

**File:** `electron/main/ipc/handlers/store.handler.ts:31`

**Issue:** The `favoritesData` key maps to the `settings` table as a `key_value` type, meaning the entire favorites collection is serialized to a single JSON string. For large collections this is an O(n) read/write cost for any single favorite operation (add/remove). Consider using the `favorites` relational table instead, which already has the proper schema and FK constraints.

### IN-05: Download queue singleton registration order dependency

**File:** `electron/main/ipc/handlers/download.handler.ts:720`

**Issue:** `setQueueInstance(downloadQueue)` is called at module evaluation time in `download.handler.ts`. If `registerStoreHandlers()` is called before `registerDownloadHandlers()`, the queue instance will be `null` during the first `store-set` of `appSettings`. The `getQueueInstance()?.processQueue()` call on store.handler.ts:129 would be a silent no-op until the next settings change triggers it. This is low risk in practice but is an implicit ordering contract between modules that is not documented or enforced.

---

_Reviewed: 2026-05-03T19:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
