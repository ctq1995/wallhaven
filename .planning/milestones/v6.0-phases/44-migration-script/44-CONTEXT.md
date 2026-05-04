# Phase 44: Migration Script — Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

One-time migration script that reads all 4 data domains from electron-store (`wallhaven-data.json`) and imports them into SQLite (`wallhaven-data.db`). The migration is transactional (all-or-nothing), idempotent (safe to re-run if interrupted), and creates a backup copy of the electron-store file before any writes.

**范围内：**
- `electron/main/migration.ts` — 迁移脚本主文件
- 读取 electron-store 的 4 个 key：`appSettings`、`wallpaperQueryParams`、`downloadFinishedList`、`favoritesData`
- 写入 SQLite 的 5 张表：`settings`、`search_params`、`download_history`、`collections`、`favorites`
- 迁移前创建 `wallhaven-data.json.bak` 备份
- `_migrated_from_store` 幂等守卫
- 单事务包裹确保原子性
- 在主进程初始化流程中触发，在 splash 窗口期间执行
- 迁移结果统计（各 domain 迁移行数）日志输出

**范围外：**
- 不修改 store.handler.ts 或 keyToTable()（Phase 42 已完成）
- 不修改 favorites.handler.ts 或任何 Repository 层（Phase 43 已完成）
- 不删除 electron-store 或 `electron/main/store.ts`（Phase 45）
- 不修改 `index.ts` 的启动流程结构（只在适当位置插入 migration 调用）
- 不添加 schema 版本化系统（Phase 41 决策 D-01：v5.0 期间使用 CREATE TABLE IF NOT EXISTS）
- 不涉及迁移后的数据校验（VER-01/VER-03 在 Phase 45 验证）
</domain>

<decisions>
## Implementation Decisions

### A — 脚本位置与结构
- **D-01:** 单文件 `electron/main/migration.ts`，不拆分为多文件
- **D-02:** 导出 `runMigration(): MigrationResult` — 返回是否执行了迁移、各 domain 行数统计
- **D-03:** `MigrationResult` 接口包含 `migrated: boolean`、`stats: { settings, searchParams, downloadHistory, collections, favorites }`、`backupPath: string | null`

### B — 迁移触发时机
- **D-04:** 迁移在 `getDatabase()` 首次调用后立即执行，作为数据库初始化的一部分
- **D-05:** 在 `initializeSchema()` 完成后调用 `runMigration()`，封装在 `getDatabase()` 的懒初始化流程中
- **D-06:** 不从 `index.ts` 显式调用——迁移逻辑与数据库初始化绑定，确保在第一个 handler 访问数据库前完成

### C — 幂等策略
- **D-07:** 迁移检查 `SELECT 1 FROM settings WHERE key = '_migrated_from_store'`，存在则直接返回 `{ migrated: false }`
- **D-08:** 迁移成功后，在事务内写入 `INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')`
- **D-09:** 幂等标志在设置表中持久化，即使后续 electron-store 被删除也不会丢失

### D — 备份策略
- **D-10:** 迁移前（在事务开始前）复制 electron-store 文件：`wallhaven-data.json` → `wallhaven-data.json.bak`
- **D-11:** 备份路径：与 `wallhaven-data.json` 同目录（`app.getPath('userData')`）
- **D-12:** 如果 `wallhaven-data.json.bak` 已存在则覆盖（最近一次迁移前的备份）
- **D-13:** 如果 `wallhaven-data.json` 不存在（fresh install），不创建备份，也不视为错误——迁移直接跳过

### E — 数据转换规则
- **E-01:** `appSettings` → `settings` 表，key='appSettings', value=JSON.stringify(完整 settings 对象)
  - 保持与 Phase 42 keyToTable 的 `{ table: 'settings', type: 'key_value' }` 一致
- **E-02:** `wallpaperQueryParams` → `search_params` 表，INSERT OR REPLACE INTO search_params (id, value) VALUES (1, ?)
  - 保持 Phase 42 的单行模式
- **E-03:** `downloadFinishedList` 数组 → `download_history` 表，每条记录一行
  - 字段映射：`id`、`url`、`filename`、`path`、`resolution`、`size`、`time`
  - `wallpaper_id` 优先使用已存在的 wallpaperId/id 字段
  - `data` 列存储完整原始 JSON（保留 electron-store 模式中存在的所有字段）
- **E-04:** `favoritesData.collections` → `collections` 表，每条收藏夹一行
  - 字段映射：`id`→`id`, `name`→`name`, `isDefault`→`is_default`, `createdAt`→`created_at`, `updatedAt`→`updated_at`
  - 同时检查 `favoritesData.defaultCollectionId` 和 `collection.isDefault` 两个标志设置 `is_default`
- **E-05:** `favoritesData.favorites` → `favorites` 表，每条收藏一行
  - 字段映射：`wallpaperId`→`wallpaper_id`, `collectionId`→`collection_id`, `addedAt`→`added_at`, `wallpaperData`→`wallpaper_data`
  - `wallpaper_data` 存储为 JSON.stringify 后的 TEXT
- **E-06:** 导入顺序严格按照 FK 依赖：collections → favorites → settings → search_params → download_history
  - collections 先于 favorites（FK 依赖）
  - settings/search_params/download_history 无 FK 依赖，可任意顺序

### F — 事务策略
- **F-01:** 所有写入操作在单个 `withTransaction()` 内执行
- **F-02:** 事务的执行顺序：INSERT collections → INSERT favorites → INSERT/UPDATE settings → INSERT search_params → INSERT download_history → INSERT _migrated_from_store
- **F-03:** 任何步骤失败（抛出异常）→ 整个事务回滚 → app 启动后重试

### G — 孤儿数据处理
- **G-01:** 导入 favorites 前，检查每个 favorite 的 `collectionId` 是否在已导入的 collections 中存在
- **G-02:** 过滤掉 `collectionId` 不在任何 collection 中的孤儿 favorite
- **G-03:** 日志记录过滤数量：`console.warn` 孤儿 favorite 数量

### H — 空数据 / Fresh Install 处理
- **H-01:** 如果 `store.get('appSettings')` 返回 `null` 或 `undefined`，跳过 settings 迁移
- **H-02:** 如果 `store.get('downloadFinishedList')` 返回空数组 `[]`，检查 `Array.isArray` 确认有数据后再迁移（避免 electron-store 默认值误判）
- **H-03:** 如果所有 4 个 domain 都没有数据（fresh install），仍然设置 `_migrated_from_store = true`，防止后续每次启动都重复检查
- **H-04:** 检查时使用显式 null/undefined 判断，而非 truthiness（Pitfall 9）

### I — 错误处理
- **I-01:** 迁移过程中捕获并记录的异常：JSON.parse 失败、FK 约束违反、磁盘写入失败
- **I-02:** 所有异常向上传播到 `withTransaction()` → 自动回滚
- **I-03:** 如果 `node:sqlite` 模块不可用（极低概率），捕获 `ERR_MODULE_NOT_FOUND` 并记录警告，app 正常使用 electron-store 继续运行

### Claude's Discretion
- 具体 SQL 语句实现细节
- 日志格式和详细程度
- `MigrationResult` 的具体 TypeScript 类型定义
- 迁移脚本在 `getDatabase()` 中的精确调用位置
- `download_history` 表中 `data` 列与单独列之间的字段映射策略
</decisions>

<specifics>
## Specific Ideas

- 迁移前日志：`[Migration] Starting migration from electron-store...`
- 迁移成功日志：`[Migration] Complete. Settings: 1, SearchParams: 1, DownloadHistory: N, Collections: N, Favorites: N`
- 迁移跳过日志：`[Migration] Already migrated (found _migrated_from_store)`
- 备份日志：`[Migration] Backup created: wallhaven-data.json.bak`
- 使用 `prepare().run()` 批量插入，prepared statement 在事务外创建，事务内只执行 `.run()`
- SQL 使用参数化查询（`?` 占位符），不使用字符串拼接
- `favoritesData.favorites` 中的 `wallpaperData` 已在 electron-store 中序列化为 JSON 对象，需要 `JSON.stringify` 后再写入 TEXT 列
</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 核心源文件（需要创建）
- `electron/main/migration.ts` — 迁移脚本（新文件）

### 数据源（读取 electron-store）
- `electron/main/store.ts` — electron-store 实例定义、defaults、`export { store }`
- `src/clients/constants.ts` — `STORAGE_KEYS` 枚举（4 个 key 名）

### 目标 schema（写入 SQLite）
- `electron/main/database.ts` — `getDatabase()`、`withTransaction()`、5 表 schema 定义
- `.planning/phases/41-database-infrastructure/41-CONTEXT.md` — Phase 41 schema 和数据库决策
- `.planning/phases/41-database-infrastructure/41-RESEARCH.md` — 数据库基础设施研究

### 数据格式参考
- `src/types/favorite.ts` — `Collection`、`FavoriteItem`、`FavoritesData` 类型定义
- `src/types/index.ts` — `AppSettings`、`FinishedDownloadItem`、`CustomParams` 类型定义

### 集成点
- `electron/main/database.ts` — `getDatabase()` 内需要添加 `runMigration()` 调用（懒初始化路径上）
- `electron/main/ipc/handlers/store.handler.ts` — 确认 `keyToTable()` 路由与迁移写入的数据格式一致

### 陷阱预防
- `.planning/research/PITFALLS.md` — 重点阅读 P1(幂等), P2(事务), P3(主进程直读), P6(孤儿数据), P9(默认值), M4(启动阻塞), M5(测试)
- `.planning/research/FEATURES.md` — `Data Migration Schema Mapping` 章节（domain 映射）

### 项目约束
- `.planning/REQUIREMENTS.md` §DBINFRA-05/06/07、VER-02 — Phase 44 的 4 项需求定义
- `.planning/PROJECT.md` — 硬约束：已有功能外观行为不变、IPC 向后兼容
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `electron/main/database.ts` — 完整的 `getDatabase()`（懒初始化 + schema + WAL checkpoints）、`withTransaction()`
- `electron/main/store.ts` — `export { store }` electron-store 单例，可直接被 migration.ts 导入使用
- `keyToTable()` in `store.handler.ts` — 定义了各个 key 的路由表，迁移写入需与之兼容

### Established Patterns
- 懒初始化：所有数据库模块使用 `getDatabase()` 而非顶层 import 触发初始化
- `withTransaction()`：原子写入的 `BEGIN IMMEDIATE` + COMMIT/ROLLBACK 模式
- `IpcResponse<T>`：统一返回格式（迁移脚本无 IPC，但数据格式兼容）
- 单文件领域模块：如 `database.ts`、`store.ts` 都是单文件模块

### Integration Points
- `electron/main/database.ts` — `getDatabase()` 中 `initializeSchema()` 之后添加 `runMigration()` 调用
- `electron/main/database.ts` — `_migrated_from_store` 从 `settings` 表读取，不影响其他模块
- 无需修改 `store.handler.ts`、`preload`、`electronClient` 或任何 Repository/Service/View 层

### 注意事项
- migration.ts 从 `./store` 导入 { store } 读取 electron-store 数据——这是 Phase 45 删除 electron-store 前最后一次使用此导入
- 迁移脚本在 `getDatabase()` 内运行，此时 splash 窗口已显示，数据库首次访问触发迁移
- 迁移后 `_migrated_from_store` 数据存在 settings 表中，Phase 45 不会删除此标志
- 无需修改 `electron.vite.config.ts`、`electron-builder.yml` 或 `package.json`
</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 44-migration-script*
*Context gathered: 2026-05-03*
