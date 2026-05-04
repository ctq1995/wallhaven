# Phase 42: Main Process + Store Handler Cutover — Research

**Researched:** 2026-05-03
**Domain:** Main process store access replacement (electron-store to SQLite)
**Confidence:** HIGH

## Summary

Phase 42 cuts over all main-process electron-store access to SQLite. There are exactly 5 remaining `store.get/set/delete/clear` calls in the main process: 4 in `store.handler.ts` (the generic IPC handlers) and 1 in `download-queue.ts`. Additionally, `download.handler.ts` reads `appSettings.downloadPath` through the `store` import.

The strategy is:
1. Add 3 helper functions to `database.ts`: `getAppSetting()`, `getDownloadPath()`, `getMaxConcurrentDownloads()`
2. Replace direct `store` imports in `download-queue.ts` and `download.handler.ts` with database helpers
3. Rewrite `store.handler.ts` to use a `keyToTable()` routing function that maps the 4 known keys to dedicated SQLite tables/queries
4. Remove application-layer `.slice(0, 50)` from `download.repository.ts` (SQL enforces max-50)
5. All IPC channel names remain unchanged — preload, ElectronClient, and repositories are untouched

**Primary recommendation:** Modify 4 source files and add 3 helper functions. All IPC contracts are preserved. Repository layer requires no IPC changes.

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### A — store-get/store-set 表路由策略
- **D-01:** 按键路由到专用表，而非统一 `settings` 表
  - `appSettings` → `settings` 表（key='appSettings'）
  - `wallpaperQueryParams` → `search_params` 表（单行模式）
  - `downloadFinishedList` → `download_history` 表（关系型字段）
  - `favoritesData` → `settings` 表（key='favoritesData'，Phase 43 重构前暂用）
- **D-02:** `store.handler.ts` 中实现 `keyToTable()` 映射函数，根据 key 名分发表写入目标

#### B — SQL 级 max-50 下载历史约束
- **D-03:** 使用应用层 SQL 清理，而非数据库触发器
- **D-04:** `store-set` handler 在写入 `download_history` 后执行：
  ```sql
  DELETE FROM download_history
  WHERE id NOT IN (
    SELECT id FROM download_history
    ORDER BY created_at DESC
    LIMIT 50
  )
  ```

#### C — store-clear 作用范围
- **D-05:** `store-clear` 清空三张表：`settings`、`search_params`、`download_history`
- **D-06:** `collections` 和 `favorites` 表不受 `store-clear` 影响（由专门的收藏功能管理）
- **D-07:** 不清除不受数据库管理的 electron-store 标志（Phase 44 的 `_migrated_from_store` 在迁移脚本运行时设置，store-clear 不涉及）

#### D — 主进程直接导入替换模式
- **D-08:** 在 `database.ts` 中提取辅助函数，而不是在内联写 SQL
- **D-09:** 新增导出函数：
  - `getAppSetting(key: string): unknown` — 读取 `settings` 表的通用查询
  - `getDownloadPath(): string` — 读取下载路径的专用查询（含默认值逻辑）
  - `getMaxConcurrentDownloads(): number` — 读取并发下载数（含默认值 3）
- **D-10:** `download-queue.ts` 和 `download.handler.ts` 中移除 `import { store }`，替换为 `import { getMaxConcurrentDownloads, getDownloadPath }`
- **D-11:** `download-queue.ts` 和 `download.handler.ts` 中 `store` 的 import 在此阶段移除（不推迟到 Phase 45）

### Claude's Discretion
- `keyToTable()` 映射函数的具体实现细节
- `store-get` 对 `search_params` 和 `download_history` 表的具体查询 SQL
- `store-delete` 处理各个表的 DELETE SQL 方式
- `download.handler.ts` 中 `GET_PENDING_DOWNLOADS` handler 的 `store?.get('appSettings.downloadPath')` 替换方式（同一模式）
- 错误处理和边界情况（表不存在、查询失败等）

### Deferred Ideas (OUT OF SCOPE)

None.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MPDIR-01 | Replace `store.get('appSettings')` in `download-queue.ts` with SQLite query reading `maxConcurrentDownloads` | Confirmed: line 94 in download-queue.ts reads `appSettings` for `maxConcurrentDownloads`. Replace with `getMaxConcurrentDownloads()` from database.ts. Remove line 17 store import. |
| MPDIR-02 | Replace `store.get('appSettings.downloadPath')` in `download.handler.ts` with SQLite query reading `downloadPath` | Confirmed: line 1005 in download.handler.ts reads `appSettings.downloadPath`. Replace with `getDownloadPath()` from database.ts. Remove line 12 store import. |
| STIPC-01 | Modify `store.handler.ts` `store-get` handler to query SQLite | Use `keyToTable()` routing. appSettings/favoritesData: settings table. wallpaperQueryParams: search_params single-row. downloadFinishedList: download_history ORDER BY id DESC LIMIT 50. |
| STIPC-02 | Modify `store.handler.ts` `store-set` handler to upsert SQLite rows | Use `keyToTable()` routing. appSettings/favoritesData: INSERT OR REPLACE into settings. wallpaperQueryParams: INSERT OR REPLACE into search_params (id=1). downloadFinishedList: DELETE all + INSERT each + SQL max-50 cleanup. Preserve processQueue() trigger. |
| STIPC-03 | Modify `store.handler.ts` `store-delete` handler to delete from SQLite | Use `keyToTable()` routing. appSettings/favoritesData: DELETE FROM settings WHERE key=?. wallpaperQueryParams: DELETE FROM search_params WHERE id=1. downloadFinishedList: DELETE FROM download_history. |
| STIPC-04 | Modify `store.handler.ts` `store-clear` handler to clear SQLite tables | DELETE FROM settings; DELETE FROM search_params; DELETE FROM download_history. collections and favorites untouched. |
| REPO-01 | `SettingsRepository` persists/reads `appSettings` via SQLite through generic store IPC — API unchanged | Verified: settings.repository.ts uses `electronClient.storeGet/set/delete/clear(STORAGE_KEYS.APP_SETTINGS)`. These IPC channels and response formats are unchanged. No modifications needed. |
| REPO-02 | `WallpaperRepository.getQueryParams()`/`setQueryParams()` routes through SQLite — API unchanged | Verified: wallpaper.repository.ts uses `electronClient.storeGet/set/delete(STORAGE_KEYS.WALLPAPER_QUERY_PARAMS)`. IPC channels unchanged. No modifications needed. |
| REPO-03 | `DownloadRepository.get()`/`set()`/`add()`/`clear()` routes through SQLite with max-50 constraint enforced by SQL | Verified: download.repository.ts lines 41 and 56 use `.slice(0, MAX_FINISHED_ITEMS)`. Remove these slices. SQL handles max-50 in store-set handler. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:sqlite` | Node.js 24.14+ (Electron 41) | SQLite database engine | Built-in module, zero external deps, synchronous API matches current electron-store pattern. Already used by Phase 41 database.ts. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `electron-store` | v11.0.2 | Current electron-store | Still installed but no longer accessed by these handlers. Kept for Phase 44 migration script. Removed in Phase 45. |

### Verification
```
npm view node:sqlite
```
`node:sqlite` is a built-in module — no npm package needed. Verified via Phase 41 infrastructure.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `database.ts` helpers | Inline SQL in each handler | Helpers are testable, DRY, and match D-08 decision |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Generic store IPC handlers | API / Backend | — | store.handler.ts runs in main process. IPC channel names unchanged. Only backend implementation changes (SQLite vs electron-store). |
| Settings read in download queue | API / Backend | — | download-queue.ts reads `maxConcurrentDownloads` from appSettings. Currently imports store directly. Will import `getMaxConcurrentDownloads()` from database.ts. |
| Download path read | API / Backend | — | download.handler.ts reads `downloadPath` from appSettings for pending download scanning. Will import `getDownloadPath()` from database.ts. |
| Max-50 constraint | Database / Storage | — | SQL-level DELETE after INSERT enforces the cap. Application layer slice removed. |
| Repository API | Browser / Client | API / Backend | Repositories (settings, wallpaper, download) in renderer process call IPC → main process handlers → SQLite. API unchanged. |

## Architecture Patterns

### Data Flow Diagram

```
Renderer Process (unchanged)          Main Process (modified)
=========================            ========================

SettingsRepository.get()             store.handler.ts (store-get)
  → electronClient.storeGet()          → keyToTable(key)
    → IPC invoke('store-get')            → settings: SELECT value FROM settings WHERE key=?
    ↓ IPC response {success, value}       → search_params: SELECT value FROM search_params WHERE id=1
                                          → download_history: SELECT data FROM download_history ORDER BY id DESC LIMIT 50
                                          → return { success: true, value: parsed_or_null }

SettingsRepository.set()             store.handler.ts (store-set)  
  → electronClient.storeSet()          → keyToTable(key)
    → IPC invoke('store-set')            → settings: INSERT OR REPLACE ...
    ↓                                    → search_params: INSERT OR REPLACE INTO search_params (id=1, value=?)
                                          → download_history: BEGIN IMMEDIATE → DELETE all → INSERT each → DELETE max-50 → COMMIT
                                          → if key='appSettings': getQueueInstance()?.processQueue()
                                          → return { success: true }

download-queue.ts (processQueue)     database.ts (getMaxConcurrentDownloads)
  → getMaxConcurrentDownloads()        → getDatabase().prepare('SELECT value FROM settings WHERE key=?').get('appSettings')
  ↓                                    → JSON.parse → extract .maxConcurrentDownloads → default 3

download.handler.ts (GET_PENDING)    database.ts (getDownloadPath)
  → getDownloadPath()                  → getDatabase().prepare('SELECT value FROM settings WHERE key=?').get('appSettings')
  ↓                                    → JSON.parse → extract .downloadPath → default undefined
```

### Recommended Change Structure

```
electron/main/database.ts
  ADD: getAppSetting(key): unknown
  ADD: getDownloadPath(): string
  ADD: getMaxConcurrentDownloads(): number

electron/main/ipc/handlers/store.handler.ts
  REMOVE: import { store } from '../../store'
  ADD:    import { getDatabase } from '../../database'
  ADD:    keyToTable(key) routing function (internal, not exported)
  MODIFY: store-get handler → SQLite query via keyToTable
  MODIFY: store-set handler → SQLite upsert via keyToTable (preserve processQueue())
  MODIFY: store-delete handler → SQLite delete via keyToTable
  MODIFY: store-clear handler → DELETE 3 tables

electron/main/ipc/handlers/download-queue.ts
  REMOVE: import { store } from '../../store'
  ADD:    import { getMaxConcurrentDownloads } from '../../database'
  MODIFY: line 94 → replace store.get('appSettings') with getMaxConcurrentDownloads()

electron/main/ipc/handlers/download.handler.ts
  REMOVE: import { store } from '../../store'
  ADD:    import { getDownloadPath } from '../../database'
  MODIFY: line 1005 → replace store?.get('appSettings.downloadPath') with getDownloadPath()

src/repositories/download.repository.ts
  REMOVE: .slice(0, MAX_FINISHED_ITEMS) on lines 41 and 56
  REMOVE: MAX_FINISHED_ITEMS constant (line 11)
```

### keyToTable() Routing Map

```typescript
type TableRoute = {
  table: string
  // For settings table: key-based lookup
  keyField?: string   // 'key' for settings table
  // For single-row tables: fixed ID
  fixedId?: number    // 1 for search_params
  // For relational tables: no key/id needed
  isRelational?: true // true for download_history
}

function keyToTable(key: string): TableRoute {
  switch (key) {
    case 'appSettings':
    case 'favoritesData':
      return { table: 'settings', keyField: 'key' }
    case 'wallpaperQueryParams':
      return { table: 'search_params', fixedId: 1 }
    case 'downloadFinishedList':
      return { table: 'download_history', isRelational: true }
    default:
      throw new Error(`Unknown store key: ${key}`)
  }
}
```

### Anti-Patterns to Avoid

- **Importing store in handlers after cutover:** After this phase, NO main-process module should import `store` from `../../store`. Every remaining import is a bug. [VERIFIED: grep shows exactly 5 store imports in main process -- store.ts exports, index.ts exports, store.handler.ts, download-queue.ts, download.handler.ts]
- **Slicing in application layer after SQL constraint:** The `.slice(0, 50)` in download.repository.ts creates a second cap that masks SQL-level bugs. Remove it. [VERIFIED: both .slice(0, MAX_FINISHED_ITEMS) sites in download.repository.ts]
- **Null vs undefined confusion in store-get response:** `electron.client.ts` reads `result.value` (not `result.data`). Must use `value` field name in store-get handler response. [VERIFIED: electron.client.ts line 58]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite connection management | Custom connection pool | Existing `getDatabase()` lazy singleton from Phase 41 | Already tested, handles WAL checkpointing, schema initialization, and FK constraints |
| Transaction wrapping for multi-row writes | Manual BEGIN/COMMIT | Existing `withTransaction()` from database.ts | Already uses `BEGIN IMMEDIATE`, handles rollback, propagates exceptions |
| SQL injection protection | String escaping | Parameterized prepared statements (`?` placeholders) | Preparing statements via `db.prepare()` is the standard SQLite approach. Never concatenate values. |

## Common Pitfalls

### Pitfall 1: Broken store-get Response Format
**What goes wrong:** The store-get handler currently returns `{ success: true, value }` (field named `value`). The `electronClient.storeGet()` reads `result.value` on line 58 of `electron.client.ts`. If the handler returns `{ success: true, data: ... }` instead, the renderer receives `undefined` and silently defaults to `null`.
**Why it happens:** The `IpcResponse<T>` type uses `data` field, but the store-get handler and electronClient use a legacy `value` field for this specific channel.
**How to avoid:** The store-get handler response MUST use `value` as the result field name (not `data`). All other handlers (store-set/delete/clear) use `{ success: true }` with no data field.
**Warning signs:** Settings fail to load silently. Store reads return `data: null` even when data exists.

### Pitfall 2: keyToTable() Missing Unknown Key Handling
**What goes wrong:** If a future or unknown key is passed to `store.get()`, the `keyToTable()` switch statement throws. The error isn't caught properly, and the handler returns `{ success: false, error: ..., value: null }`.
**Why it happens:** The switch/case has no `default` handler for unknown keys.
**How to avoid:** Either throw with a clear error message (caught by try/catch in handler) or return a fallback route. Since the 4 known keys are the complete set of storage keys, unknown keys should log a warning and return null for get, or throw for set/delete.
**Warning signs:** Consumer code uses a key not in STORAGE_KEYS, crashes at runtime.

### Pitfall 3: store-set download_history Without Transaction Wrapping
**What goes wrong:** The store-set handler for `downloadFinishedList` deletes all rows and inserts new ones across multiple statements. If a crash occurs between DELETE and INSERT, data loss results.
**Why it happens:** Multi-statement write without `withTransaction()`.
**How to avoid:** Wrap the DELETE + INSERT loop + max-50 cleanup inside a single `withTransaction()` call.
**Warning signs:** Partial data in download_history after app crash.

### Pitfall 4: `processQueue()` Notification Lost After store.handler.ts Rewrite
**What goes wrong:** The current `store.handler.ts` `store-set` handler (line 37-39) calls `getQueueInstance()?.processQueue()` when `appSettings` is updated. If this trigger is not preserved in the SQLite rewrite, changing `maxConcurrentDownloads` will not re-evaluate the queue.
**Why it happens:** The developer rewrites the handler body and forgets to keep the `processQueue()` call.
**How to avoid:** The `processQueue()` trigger MUST be preserved in the new handler, gated by `key === 'appSettings'`.
**Warning signs:** Setting the concurrency slider has no effect on active downloads until app restart.

## Code Examples

### Helper Functions for database.ts

```typescript
// Add to: electron/main/database.ts
// Source: Derived from Phase 42 requirements D-08/D-09

/**
 * Read a JSON-serialized value from the settings table by key.
 * Returns parsed value, or null if key doesn't exist or parsing fails.
 */
export function getAppSetting(key: string): unknown {
  try {
    const row = getDatabase()
      .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(key)
    if (!row) return null
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

/**
 * Get the download path from appSettings.
 * Returns the stored path, or undefined if not set.
 * NOTE: The caller (GET_PENDING_DOWNLOADS handler) already handles
 * the undefined case by returning an empty array.
 */
export function getDownloadPath(): string | undefined {
  const appSettings = getAppSetting('appSettings') as Record<string, unknown> | null
  if (appSettings && typeof appSettings.downloadPath === 'string') {
    return appSettings.downloadPath
  }
  return undefined
}

/**
 * Get the max concurrent downloads from appSettings.
 * Defaults to 3 if not set or unparseable.
 */
export function getMaxConcurrentDownloads(): number {
  const appSettings = getAppSetting('appSettings') as Record<string, unknown> | null
  if (appSettings && typeof appSettings.maxConcurrentDownloads === 'number') {
    return appSettings.maxConcurrentDownloads
  }
  return 3
}
```

### keyToTable() and Store Handler Rewrite Pattern

```typescript
// Source: Derived from CONTEXT.md D-01/D-02 specifics section
// File: electron/main/ipc/handlers/store.handler.ts

interface TableRoute {
  table: string
  type: 'key_value' | 'single_row' | 'relational'
}

function keyToTable(key: string): TableRoute {
  switch (key) {
    case 'appSettings':
    case 'favoritesData':
      return { table: 'settings', type: 'key_value' }
    case 'wallpaperQueryParams':
      return { table: 'search_params', type: 'single_row' }
    case 'downloadFinishedList':
      return { table: 'download_history', type: 'relational' }
    default:
      throw new Error(`Unknown store key: ${key}`)
  }
}

// store-get handler pattern:
ipcMain.handle('store-get', (_event, key: string) => {
  try {
    const route = keyToTable(key)
    let value: unknown = null

    switch (route.type) {
      case 'key_value': {
        const row = getDatabase()
          .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
          .get(key)
        value = row ? JSON.parse(row.value) : null
        break
      }
      case 'single_row': {
        const row = getDatabase()
          .prepare<{ value: string }>('SELECT value FROM search_params WHERE id = 1')
          .get()
        value = row ? JSON.parse(row.value) : null
        break
      }
      case 'relational': {
        const rows = getDatabase()
          .prepare<{ data: string }>('SELECT data FROM download_history ORDER BY id DESC LIMIT 50')
          .all()
        value = rows.map(r => JSON.parse(r.data))
        break
      }
    }

    return { success: true, value }
  } catch (error: any) {
    logHandler('store-get', `Error: ${error.message}`, 'error')
    return { success: false, error: error.message, value: null }
  }
})

// store-set handler pattern (with processQueue preservation):
ipcMain.handle('store-set', (_event, { key, value }: { key: string; value: any }) => {
  try {
    const route = keyToTable(key)
    const jsonValue = JSON.stringify(value)

    switch (route.type) {
      case 'key_value':
        getDatabase()
          .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run(key, jsonValue)
        break

      case 'single_row':
        getDatabase()
          .prepare('INSERT OR REPLACE INTO search_params (id, value) VALUES (1, ?)')
          .run(jsonValue)
        break

      case 'relational': {
        const items = Array.isArray(value) ? value : []
        withTransaction(() => {
          getDatabase().prepare('DELETE FROM download_history').run()
          const stmt = getDatabase().prepare('INSERT INTO download_history (data) VALUES (?)')
          for (const item of items) {
            stmt.run(JSON.stringify(item))
          }
          // SQL-level max-50 constraint (D-04)
          getDatabase().exec(`
            DELETE FROM download_history
            WHERE id NOT IN (
              SELECT id FROM download_history
              ORDER BY created_at DESC
              LIMIT 50
            )
          `)
        })
        break
      }
    }

    // DL-03: Live propagation of maxConcurrentDownloads setting
    if (key === 'appSettings') {
      getQueueInstance()?.processQueue()
    }

    return { success: true }
  } catch (error: any) {
    logHandler('store-set', `Error: ${error.message}`, 'error')
    return { success: false, error: error.message }
  }
})

// store-delete handler pattern:
ipcMain.handle('store-delete', (_event, key: string) => {
  try {
    const route = keyToTable(key)
    switch (route.type) {
      case 'key_value':
        getDatabase()
          .prepare('DELETE FROM settings WHERE key = ?')
          .run(key)
        break
      case 'single_row':
        getDatabase()
          .prepare('DELETE FROM search_params WHERE id = 1')
          .run()
        break
      case 'relational':
        getDatabase()
          .prepare('DELETE FROM download_history')
          .run()
        break
    }
    return { success: true }
  } catch (error: any) {
    logHandler('store-delete', `Error: ${error.message}`, 'error')
    return { success: false, error: error.message }
  }
})

// store-clear handler pattern (D-05):
ipcMain.handle('store-clear', () => {
  try {
    getDatabase().exec('DELETE FROM settings')
    getDatabase().exec('DELETE FROM search_params')
    getDatabase().exec('DELETE FROM download_history')
    // D-06: collections and favorites NOT cleared
    return { success: true }
  } catch (error: any) {
    logHandler('store-clear', `Error: ${error.message}`, 'error')
    return { success: false, error: error.message }
  }
})
```

### download-queue.ts Replacement Pattern

```typescript
// File: electron/main/ipc/handlers/download-queue.ts
// REMOVE: import { store } from '../../store'
// ADD:    import { getMaxConcurrentDownloads } from '../../database'

// Line 94 — replace:
// const appSettings = store.get('appSettings') as unknown as { maxConcurrentDownloads?: number } | undefined
// const maxConcurrent = appSettings?.maxConcurrentDownloads ?? 3
// With:
const maxConcurrent = getMaxConcurrentDownloads()
```

### download.handler.ts Replacement Pattern

```typescript
// File: electron/main/ipc/handlers/download.handler.ts
// REMOVE: import { store } from '../../store'
// ADD:    import { getDownloadPath } from '../../database'

// Line 1005 — replace:
// const downloadPath = store?.get('appSettings.downloadPath') as string | undefined
// With:
const downloadPath = getDownloadPath()
```

### download.repository.ts Slice Removal

```typescript
// File: src/repositories/download.repository.ts

// Remove line 11:
// const MAX_FINISHED_ITEMS = 50

// Line 41 — remove .slice():
// set(items: FinishedDownloadItem[]) {
//   const limitedItems = items.slice(0, MAX_FINISHED_ITEMS)   // REMOVE
//   return electronClient.storeSet(STORAGE_KEYS.DOWNLOAD_FINISHED_LIST, limitedItems)  // pass items directly
// }

// Line 56 — remove .slice():
// add(item: FinishedDownloadItem) {
//   const items = [item, ...(result.data ?? [])].slice(0, MAX_FINISHED_ITEMS)  // REMOVE
//   return this.set(items)
// }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `store.get(key)` direct call | SQLite query via `getDatabase().prepare()` | This phase | All store reads in main process now go through SQLite |
| `import { store }` in 3 handler files | Zero `store` imports in handlers | This phase | Clean store separation; electron-store only used by Phase 44 migration script |
| `.slice(0, 50)` in download.repository.ts | SQL-level DELETE capping | This phase | Single source of truth for max-50 constraint |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No other main-process modules outside the 5 identified call sites import `store` | Standard Stack | Low — confirmed by `grep -n "import.*store.*from" electron/main/` showing exactly 5 matches (index.ts exports, store.ts, store.handler.ts, download-queue.ts, download.handler.ts) |
| A2 | The download_history `data` column can store each `FinishedDownloadItem` as a JSON string | Code Examples | Low — column is `TEXT NOT NULL`, which handles any JSON-serialized object |
| A3 | `getMaxConcurrentDownloads()` returning default 3 is equivalent to current `?? 3` fallback | Code Examples | Low — verified identical to current `appSettings?.maxConcurrentDownloads ?? 3` |
| A4 | `getDownloadPath()` returning `undefined` is equivalent to current `store?.get('appSettings.downloadPath') as string \| undefined` | Code Examples | Low — verified that the caller handles `undefined` via `if (!downloadPath) return { success: true, data: [] }` |
| A5 | `store-delete` with unknown key should throw (handled by catch) | Code Examples | Low — consistent with current behavior where electron-store.delete() with unknown key is a no-op. Could silently ignore instead. |

## Open Questions

1. **Should `store-delete` for unknown keys silently no-op or throw?**
   - What we know: The current electron-store `store.delete()` on a non-existent key silently no-ops (no error, no exception).
   - What's unclear: The `keyToTable()` switch throws for unknown keys, which the handler catches and returns `{ success: false }`.
   - Recommendation: Match electron-store behavior — return `{ success: true }` even for unknown keys. Add a default case to `keyToTable()` that logs a warning and returns null-table/no-op.

2. **What default value should `getDownloadPath()` return when appSettings is missing?**
   - What we know: Current `store?.get('appSettings.downloadPath')` returns `undefined` when not set. The caller (GET_PENDING_DOWNLOADS) checks `if (!downloadPath)` and returns empty array.
   - What's unclear: Whether a sensible default like `join(app.getPath('home'), 'Pictures', 'wallhaven')` would be better.
   - Recommendation: Return `undefined` to match current behavior exactly. The default path is set by the renderer (AppSettings type has `downloadPath: string` required, so the frontend always initializes it). If the main process needs a fallback, add it when the caller needs it, not in the helper.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `node:sqlite` | database.ts helpers | Available via Electron 41 | Node.js 24.14+ | -- |
| Electron `ipcMain` | store.handler.ts | Available via Electron 41 | v41.2.2 | -- |

**Missing dependencies with no fallback:** None. All dependencies are built-in (node:sqlite) or already available (Electron APIs).

## Validation Architecture

Skipped — `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Parameterized SQL queries (`?` placeholders) prevent injection. All values JSON-serialized before storage. |
| V6 Cryptography | no | No encryption changes in this phase. API keys remain in plaintext in the settings table (existing behavior — `safeStorage` is a future enhancement). |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via store key/value | Tampering | All queries use `db.prepare('... ? ...').run(params)` — never string concatenation. `keyToTable()` switch/case restricts table names to a fixed set; user input never becomes a table/column name. |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase analysis] — Electron main process source files: `store.handler.ts`, `download-queue.ts`, `download.handler.ts`, `database.ts`, `electron.client.ts`, `download.repository.ts`
- [VERIFIED: codebase analysis] — `src/clients/constants.ts` STORAGE_KEYS: exactly 4 keys (appSettings, downloadFinishedList, wallpaperQueryParams, favoritesData)
- [VERIFIED: codebase analysis] — `download-queue.ts` line 94: `store.get('appSettings')` for maxConcurrentDownloads
- [VERIFIED: codebase analysis] — `download.handler.ts` line 1005: `store?.get('appSettings.downloadPath')` for download path
- [VERIFIED: CONTEXT.md] — D-01 through D-11 decisions and specifics
- [VERIFIED: CONTEXT.md] — Phase 41 database.ts schema includes all 5 tables (settings, search_params, download_history, collections, favorites)
- [VERIFIED: Phase 41 codebase] — `database.ts` exports `getDatabase()`, `withTransaction()`, `closeDatabase()`

### Secondary (MEDIUM confidence)
- [CITED: STACK.md] — `node:sqlite` API reference and patterns for each store type
- [CITED: PITFALLS.md] — Pitfall 3 (main process reads), Pitfall 7 (dual-write), Pitfall M2 (type safety gap)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified via codebase analysis
- Architecture: HIGH — patterns derived from existing Phase 41 codebase and CONTEXT.md decisions
- Pitfalls: HIGH — all pitfalls verified against actual code paths

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (30 days — stable infrastructure phase with locked decisions)
