# Phase 42: Main Process + Store Handler Cutover — Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

All generic store access (direct imports + generic IPC handlers + repositories) backed by SQLite. This phase cuts over the electron-store backbone to SQLite while keeping all IPC channels, repository APIs, and preload bridges unchanged.

**范围内：**
- `download-queue.ts` — `store.get('appSettings')` → SQLite 查询 `maxConcurrentDownloads`（MPDIR-01）
- `download.handler.ts` — `store.get('appSettings.downloadPath')` → SQLite 查询 `downloadPath`（MPDIR-02）
- `store.handler.ts` — 4 个 IPC handler 改为查询/写入 SQLite（STIPC-01~04）
- 路由策略：通用 store IPC 按键映射到专用 SQLite 表
- `download_history` 表 max-50 约束由 SQL 级清理实现
- `src/repositories/settings.repository.ts` — 通过不变的 IPC 路由到 SQLite（REPO-01）
- `src/repositories/wallpaper.repository.ts` — 通过不变的 IPC 路由到 SQLite（REPO-02）
- `src/repositories/download.repository.ts` — 通过不变的 IPC 路由到 SQLite（REPO-03）

**范围外：**
- 不修改 FavoritesRepository（Phase 43）
- 不涉及迁移脚本（Phase 44）
- 不删除 electron-store（Phase 45）
- 不删除 `settings.handler.ts`（Phase 45）
- 不修改 `settings.repository.ts` 的 `selectFolder`/`clearAppCache`/`getCacheInfo` 等非 store 方法

</domain>

<decisions>
## Implementation Decisions

### A — store-get/store-set 表路由策略
- **D-01:** 按键路由到专用表，而非统一 `settings` 表
  - `appSettings` → `settings` 表（key='appSettings'）
  - `wallpaperQueryParams` → `search_params` 表（单行模式）
  - `downloadFinishedList` → `download_history` 表（关系型字段）
  - `favoritesData` → `settings` 表（key='favoritesData'，Phase 43 重构前暂用）
- **D-02:** `store.handler.ts` 中实现 `keyToTable()` 映射函数，根据 key 名分发表写入目标

### B — SQL 级 max-50 下载历史约束
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

### C — store-clear 作用范围
- **D-05:** `store-clear` 清空三张表：`settings`、`search_params`、`download_history`
- **D-06:** `collections` 和 `favorites` 表不受 `store-clear` 影响（由专门的收藏功能管理）
- **D-07:** 不清除不受数据库管理的 electron-store 标志（Phase 44 的 `_migrated_from_store` 在迁移脚本运行时设置，store-clear 不涉及）

### D — 主进程直接导入替换模式
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

</decisions>

<specifics>
## Specific Ideas

- `keyToTable()` 映射：
  ```
  'appSettings'           → { table: 'settings', keyField: 'key', valueField: 'value' }
  'wallpaperQueryParams'  → { table: 'search_params', keyField: null, valueField: 'value' }
  'downloadFinishedList'  → { table: 'download_history', keyField: null, valueField: null }
  'favoritesData'         → { table: 'settings', keyField: 'key', valueField: 'value' }
  ```
- `settings` 表无论 electron-store 还是 SQLite 都作为 key-value 存储（便于迁移脚本映射）
- `search_params` 表使用 `INSERT OR REPLACE` 维护单行模式（`id = 1`）
- `download_history` 表使用 `INSERT` 添加记录，每次写入后清理超出 50 条的旧记录
- `favoritesData` 暂存 `settings` 表保持向后兼容，Phase 43 再拆分到 `collections`/`favorites` 表

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 被修改的源文件
- `electron/main/ipc/handlers/store.handler.ts` — 4 个 IPC handler（store-get/set/delete/clear）改为 SQLite 操作
- `electron/main/ipc/handlers/download-queue.ts` — `processQueue()` 中 `store.get('appSettings')` 替换为 `getMaxConcurrentDownloads()`
- `electron/main/ipc/handlers/download.handler.ts` — `GET_PENDING_DOWNLOADS` 中 `store?.get('appSettings.downloadPath')` 替换为 `getDownloadPath()`
- `electron/main/database.ts` — 新增 `getAppSetting()`、`getDownloadPath()`、`getMaxConcurrentDownloads()` 辅助函数
- `src/repositories/settings.repository.ts` — 验证通过不变的 IPC 路由到 SQLite
- `src/repositories/wallpaper.repository.ts` — 验证通过不变的 IPC 路由到 SQLite
- `src/repositories/download.repository.ts` — 确认 max-50 约束由 SQL 层处理，移除应用层 `.slice(0, 50)`

### 参考文件（理解流程，不需要修改）
- `electron/main/store.ts` — 当前 electron-store 实例（将被替换但保留到 Phase 45）
- `electron/main/index.ts` — 启动生命周期（确认 `closeDatabase()` 已集成）
- `src/clients/electron.client.ts` — `storeGet`/`storeSet`/`storeDelete`/`storeClear` 方法（通过不变 IPC 调用）
- `src/clients/constants.ts` — `STORAGE_KEYS` 枚举（4 个 key 名）
- `src/repositories/download.repository.ts` — 当前 max-50 应用层实现（`.slice(0, 50)`），迁移后移除

### 研发文档
- `.planning/research/STACK.md` — `node:sqlite` API 参考
- `.planning/research/PITFALLS.md` — 陷阱清单（尤其是 M4 启动阻塞、M5 测试）
- `.planning/phases/41-database-infrastructure/41-CONTEXT.md` — Phase 41 决策（schema、getDatabase API）

### 项目约束
- `.planning/REQUIREMENTS.md` §MPDIR-01/02、STIPC-01~04、REPO-01~03 — Phase 42 的 9 项需求定义
- `.planning/PROJECT.md` — 硬约束：已有功能外观行为不变、IPC 向后兼容

</canonical_refs>

<code_context>
## Existing Code Insights

### 可复用资产
- `electron/main/database.ts` — 已实现的 `getDatabase()`、`withTransaction()`、`closeDatabase()` API
- `settings` 表 schema — `key TEXT PRIMARY KEY, value TEXT NOT NULL` 键值模式
- `search_params` 表 schema — 单行 `id = 1, value TEXT` 模式
- `download_history` 表 schema — 含完整字段和 `created_at DESC` 索引

### 确立的模式
- 懒单例：`getDatabase()` 首次调用时初始化连接
- `IpcResponse<T>` 统一返回格式（所有 handler 和 repository 使用）
- `logHandler(module, message, level)` 日志模式
- 模块化 handler 注册（`registerStoreHandlers()` 等独立注册函数）

### 集成点
- `download-queue.ts:94` — `store.get('appSettings')` → 替换为 `getMaxConcurrentDownloads()`
- `download-queue.ts:17` — `import { store } from '../../store'` → 移除
- `download.handler.ts:1005` — `store?.get('appSettings.downloadPath')` → 替换为 `getDownloadPath()`
- `download.handler.ts:12` — `import { store } from '../../store'` → 移除
- `store.handler.ts:10` — `import { store } from '../../store'` → 替换为 `import { getDatabase } from '../../database'`
- `store.handler.ts:20` — `store.get(key)` → 路由到对应表查询
- `store.handler.ts:33` — `store.set(key, value)` → 路由到对应表 UPSERT
- `store.handler.ts:54` — `store.delete(key)` → 路由到对应表 DELETE
- `store.handler.ts:67` — `store.clear()` → 清空 settings/search_params/download_history 三表
- `src/repositories/download.repository.ts` 第 41 行 — `.slice(0, MAX_FINISHED_ITEMS)` → 移除（由 SQL 层保证）

### 测试说明
- `src/repositories/download.repository.ts` 中 `get()` 和 `set()` 的测试可能需要移除 `.slice(0, 50)` 相关断言
- `download.repository.ts` 中 `add()` 的 max-50 测试逻辑不再需要——SQL 层保证约束
- `store.handler.ts` 的集成测试需要 SQLite 实例（可使用 `:memory:`）

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 42-main-process-store-handler-cutover*
*Context gathered: 2026-05-03*
