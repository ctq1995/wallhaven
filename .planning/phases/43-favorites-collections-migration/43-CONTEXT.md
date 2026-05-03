# Phase 43: Favorites & Collections Migration — Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign `FavoritesRepository` to use targeted SQL operations on the `collections` and `favorites` tables instead of full-blob read-modify-write against the `settings` table (key='favoritesData'). The `collections`/`favorites` tables already exist in the schema (Phase 41), and the current code routes 'favoritesData' through `keyToTable()` to the `settings` table (Phase 42). This phase ends the blob pattern and operates directly on normalized tables with INSERT/UPDATE/DELETE/SELECT queries.

**范围内：**
- `favorites.repository.ts` — 重写为针对 `collections`/`favorites` 表的定向 SQL 操作
- IPC 通路设计 — Renderer ↔ Main process 的收藏领域专用 IPC 通道
- `store.handler.ts` `keyToTable()` 中移除 `'favoritesData'` 路由（不再需要 blob 模式）
- 默认收藏夹初始化逻辑迁移到主进程侧
- `favorites.service.ts` — 适配新的 repository 模式
- VER-04 — 确保所有收藏操作通过 SQL 查询产生正确结果

**范围外：**
- 不修改 `favorites.service.ts` 以外其他 service（collectionsService 保持现有）
- 不涉及数据迁移脚本（Phase 44 负责从 electron-store JSON 导入）
- 不删除 `settings` 表中已有的 `favoritesData` 行（Phase 45 清理）
- 不修改 Pinia store（`useFavoritesStore` 通过 service 调用，API 不变）
- 不修改 View/UI 层（收藏功能用户操作逻辑不变）
- 不涉及 `collectionsService` 的重构（仅通过 repository 操作 `collections` 表）
</domain>

<decisions>
## Implementation Decisions

### A — IPC 通路设计

**D-01:** 新增收藏领域专用 IPC handler 模块 `electron/main/ipc/handlers/favorites.handler.ts`，注册为 `registerFavoritesHandlers()`，不与现有通用 store IPC 混用
- 遵循现有模块化 handler 模式（如 `registerStoreHandlers()`、`registerDownloadHandlers()`）
- 通过 `ipcMain.handle()` 注册领域专用通道，不走 `keyToTable()` 通用路由

**D-02:** 新增 IPC 通道列表（renderer → main）：
| 通道 | 参数 | 返回 |
|------|------|------|
| `favorites-get-collections` | 无 | `Collection[]` |
| `favorites-create-collection` | `{ name }` | `Collection` |
| `favorites-rename-collection` | `{ id, name }` | `Collection` |
| `favorites-delete-collection` | `{ id }` | `void` |
| `favorites-set-default-collection` | `{ id }` | `Collection` |
| `favorites-get-by-collection` | `{ collectionId? }` | `FavoriteItem[]` |
| `favorites-add` | `{ wallpaperId, collectionId, wallpaperData }` | `FavoriteItem` |
| `favorites-remove` | `{ wallpaperId, collectionId }` | `void` |
| `favorites-move` | `{ wallpaperId, fromCollectionId, toCollectionId }` | `FavoriteItem` |
| `favorites-is-favorite` | `{ wallpaperId }` | `boolean` |
| `favorites-get-collections-for-wallpaper` | `{ wallpaperId }` | `Collection[]` |

### B — Repository 层改造

**D-03:** `favorites.repository.ts` 重写为通过新 IPC 通道直接调用主进程的 SQL 操作，不再通过 `electronClient.storeGet`/`storeSet`
- 移除对 `STORAGE_KEYS.FAVORITES_DATA` 的引用
- 移除 `FavoritesData` blob 类型的读取和写入
- 每个方法对应一个 IPC 调用，而非"读全量→修改→写全量"

**D-04:** `favorites.repository.ts` 的公共 API 签名保持不变（保持向后兼容）
- `getData()` — 改为返回从 `collections` + `favorites` 表组合的 `FavoritesData`
- `getCollections()` — 调用 `favorites-get-collections`
- `createCollection(name)` — 调用 `favorites-create-collection`
- 其余方法一一对应映射到新 IPC 通道
- `setData()` — 保留签名但不再需要（或标记 deprecated）

**D-05:** 收藏夹存在性和名称唯一性检查移至主进程 SQL 查询层，而非应用层 `Array.some()`

### C — `keyToTable()` 移除 favoritesData 路由

**D-06:** `store.handler.ts` 的 `keyToTable()` 中移除 `'favoritesData'` 路由
- 此变更会导致通用 `store-get('favoritesData')` 抛出 `Unknown store key` 错误
- 确保所有消费代码已迁移到新 IPC 通道后实施此步骤

### D — 默认收藏夹初始化

**D-07:** 默认收藏夹初始化逻辑从 `favorites.repository.ts` 移至主进程 handler（首次读取 `collections` 表为空时自动创建）
- 在 `favorites-get-collections` handler 中实现：`SELECT COUNT(*) FROM collections` = 0 时创建默认收藏夹
- 保持与现有行为一致：默认收藏夹名为"收藏"，`is_default = 1`

### E — Service 层适配

**D-08:** `favorites.service.ts` 保持现有缓存模式不变，仅适配 repository 新签名
- `cachedFavorites` 内存缓存继续存在，清除缓存的时机不变（add/remove/move 后）
- `getAll()` 在缓存未命中时调用 `favoritesRepository.getFavorites()`

### Claude's Discretion
- `electronClient` 是否需要新增 `favoritesGetCollections()` 等对应方法
- Preload 桥接层的更新（`electron/preload/index.ts`）
- 具体 SQL 实现细节（INSERT/UPDATE/DELETE 语句）
- handler 错误处理和返回格式
- `type.d.ts`（`env.d.ts`）中类型声明的更新
- `registerFavoritesHandlers()` 在 `handlers.ts` 或 `index.ts` 中的注册位置
</decisions>

<specifics>
## Specific Ideas

- 新 IPC 通道命名使用 `favorites-` 前缀统一，不与通用 store IPC 混合
- `collections` 表已有字段：id, name, is_default, sort_order, created_at, updated_at
- `favorites` 表已有字段：collection_id, wallpaper_id, wallpaper_data, added_at，复合主键 + FK CASCADE
- 主进程 handler 使用 `getDatabase().prepare().run()/get()/all()` 直接操作，需要事务的操作包裹 `withTransaction()`
- 默认收藏夹检查：`SELECT COUNT(*) FROM collections` → 0 时 INSERT 默认收藏夹
- O(1) 收藏检查：`SELECT 1 FROM favorites WHERE wallpaper_id = ? LIMIT 1`（利用 `idx_favorites_wallpaper` 索引）
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 核心源文件
- `src/repositories/favorites.repository.ts` — 需重写的文件，当前使用全 blob 模式
- `src/services/favorites.service.ts` — 服务层，需适配新 repository
- `electron/main/ipc/handlers/store.handler.ts` — `keyToTable()` 需移除 favoritesData 路由
- `electron/main/database.ts` — `collections`/`favorites` 表 schema、`getDatabase()` API、`withTransaction()`

### 参考文件
- `electron/main/ipc/handlers/download.handler.ts` — 现有模块化 handler 模式（参考 `registerDownloadHandlers()`）
- `electron/main/ipc/handlers/base.ts` — `logHandler()` 日志工具
- `electron/preload/index.ts` — 预加载桥接，需添加新 IPC 通道（`electronAPI` 类型定义）
- `env.d.ts` — `ElectronAPI` 接口定义
- `src/clients/electron.client.ts` — 客户端封装，可选添加 favorites 专用方法
- `src/types/favorite.ts` — `Collection`、`FavoriteItem` 类型定义
- `src/stores/modules/favorites/index.ts` — Pinia store（直接使用 service，不应受影响）
- `src/clients/constants.ts` — STORAGE_KEYS 枚举

### 先前决策
- `.planning/phases/41-database-infrastructure/41-CONTEXT.md` — Phase 41 schema 和数据库决策
- `.planning/phases/42-main-process-store-handler-cutover/42-CONTEXT.md` — Phase 42 keyToTable 和 D-01/D-06

### 项目约束
- `.planning/REQUIREMENTS.md` §REPO-04, REPO-05, VER-04 — Phase 43 的 3 项需求定义
- `.planning/PROJECT.md` — 硬约束：已有功能外观行为不变、IPC 向后兼容
- `.planning/research/STACK.md` — `node:sqlite` API 参考
- `.planning/research/PITFALLS.md` — 陷阱清单
</canonical_refs>

<code_context>
## Existing Code Insights

### 可复用资产
- `electron/main/database.ts` — `getDatabase()` 单例、`withTransaction()` 原子写入、`collections`/`favorites` 表 schema 已存在
- `store.handler.ts` — 现有 `registerStoreHandlers()` 模块化 handler 注册模式可直接仿照
- `download.handler.ts` — 专用领域 handler 的参考实现（`registerDownloadHandlers()` + 独立文件）

### 确立的模式
- 模块化 handler 注册：每个领域一个 `registerXxxHandlers()` 函数，在 `electron/main/ipc/handlers.ts` 或 `index.ts` 中调用
- `IpcResponse<T>` 统一返回格式（`{ success, data }` 或 `{ success, error }`）
- 懒数据库初始化：handler 中调用 `getDatabase()` 而非 import 时初始化
- `logHandler(module, message, level)` 日志模式
- `electronClient.xxx()` 客户端封装模式

### 集成点
- `store.handler.ts` `keyToTable()` — 移除 `'favoritesData'` 路由和对应 `TableRoute` case
- `electron/main/ipc/handlers.ts` 或 `index.ts` — 注册新 `registerFavoritesHandlers()`
- `electron/preload/index.ts` — 添加 `contextBridge.exposeInMainWorld` 中的新 IPC 通道
- `env.d.ts` — 扩展 `ElectronAPI` 接口添加新方法
- `src/repositories/favorites.repository.ts` — 重写所有方法
- `src/clients/electron.client.ts` — 可选添加 `favoritesGetCollections()` 等方法

### 注意
- `favoritesData` 在 `settings` 表中有存量数据行（key='favoritesData' value='{...}'），Phase 44 迁移脚本会处理从旧行到规范化表的导入。Phase 43 只负责重写 repository 使用新表，不负责将旧数据迁移到新表。
- 新 IPC handler 在读 `collections` 表为空时需初始化默认收藏夹（D-07），这与 Phase 43 完成后首次运行时的场景对应（空数据库 + 尚未运行迁移脚本）
</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 43-favorites-collections-migration*
*Context gathered: 2026-05-03*
