# Phase 41: Database Infrastructure — Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Core database connection, schema initialization, and utility layer. Create `electron/main/database.ts` with singleton `DatabaseSync` connection (lazy init), 5-table schema, `withTransaction()` utility, and `electron/main/sqlite.d.ts` type declarations.

**范围内：**
- `electron/main/database.ts` — 单例 `DatabaseSync`，懒初始化，`initializeSchema()`，`closeDatabase()`
- 5 表模式（settings, search_params, download_history, collections, favorites）含外键、索引、WAL 模式
- `withTransaction()` 原子写入工具函数
- `electron/main/sqlite.d.ts` — 自定义 TypeScript 类型声明
- `electron/main/index.ts` — 集成 `closeDatabase()` 到 `before-quit`/`window-all-closed`
- `package.json` engines 字段添加 `node >=24`
- 周期性 WAL 检查点机制

**范围外：**
- 不修改 store.handler.ts 的 IPC 实现（Phase 42）
- 不修改 main process 直接导入的 store.get()（Phase 42）
- 不修改 Repository 层（Phase 42-43）
- 不涉及迁移脚本（Phase 44）
- 不删除 electron-store（Phase 45）
- 不需要 schema 版本化系统（schema_versions 表）

</domain>

<decisions>
## Implementation Decisions

### Schema 版本化策略
- **D-01:** 使用简单 `CREATE TABLE IF NOT EXISTS`，不引入 schema_versions 表或迁移运行器
- **D-02:** v5.0 期间 schema 基本稳定，未来需要变更时再补充版本化机制

### 数据库初始化时机
- **D-03:** 完全懒初始化 — 只在首次调用 `getDatabase()` 时打开数据库连接和初始化 schema
- **D-04:** `database.ts` 导出 `getDatabase()` 函数而非顶层实例，import 不会触发数据库打开
- **D-05:** 启动流程中不主动预初始化数据库，不需要修改 splash 或 createWindow 时序

### 错误处理模式
- **D-06:** 数据库操作统一使用 `IpcResponse<T>` 模式返回结果（`{ success, data }` 或 `{ success, error }`），与现有 Repository 层约定一致
- **D-07:** `withTransaction()` 遇到错误时 rollback 并向上传播原始异常

### 测试策略
- **D-08:** 在 `package.json` `engines` 字段添加 `"node": ">=24"`，确保开发环境和 CI 使用 Node.js 24+
- **D-09:** 单元测试可以直接导入 `node:sqlite`，使用 `:memory:` 数据库进行集成测试
- **D-10:** Repository 层 mock 不受影响（现有模式继续工作）

### Claude's Discretion
- WAL 检查点策略：使用 5 分钟间隔的定期 `PRAGMA wal_checkpoint(PASSIVE)` + `.unref()`，在 `closeDatabase()` 中最终检查点
- WAL 文件大小监控日志（超过 10MB 时自动 checkpoint）
- `withTransaction()` 使用 `BEGIN IMMEDIATE` 避免并发写入时的 `database is locked` 错误
- 数据库文件命名和路径细节
- `closeDatabase()` 的具体实现在 `before-quit` 和 `window-all-closed` 中的集成方式

</decisions>

<specifics>
## Specific Ideas

- 数据库文件路径：`join(app.getPath('userData'), 'wallhaven-data.db')` — 与现有 `wallhaven-data.json` 同一目录
- 使用 `enableForeignKeyConstraints: true` + `timeout: 5000` 的 DatabaseSync 选项
- WAL 模式通过 `PRAGMA journal_mode = WAL` 在 initializeSchema 中设置
- `BEGIN IMMEDIATE` 作为事务起始语句，防止并发导致的 `SQLITE_BUSY`

</specifics>

<canonical_refs>
## Canonical References

### 研发文档（必须阅读）
- `.planning/research/STACK.md` — `node:sqlite` 选型分析、API 对比、构建集成说明
- `.planning/research/PITFALLS.md` — 完整陷阱清单（18 项），尤其是 M1(WAL), M4(启动阻塞), M5(测试), M6(版本化)
- `.planning/research/SUMMARY.md` — 研究总结和阶段顺序原理

### 项目约束与需求
- `.planning/REQUIREMENTS.md` §DBINFRA-01~04 — Phase 41 的 4 项需求定义
- `.planning/PROJECT.md` — 硬约束：已有功能外观行为不变、IPC 向后兼容

### 现有代码参考
- `electron/main/store.ts` — 当前 electron-store 实例（将被替换）
- `electron/main/index.ts` — 启动流程（splash → createWindow 时序）
- `electron/main/ipc/handlers/store.handler.ts` — 当前 4 个 store IPC handlers（Phase 42 修改）
- `electron/main/ipc/handlers/download-queue.ts` — 直接 `store.get('appSettings')` 调用（Phase 42 修改）
- `electron/main/ipc/handlers/download.handler.ts` — 直接 `store.get('appSettings.downloadPath')` 调用（Phase 42 修改）
- `.planning/codebase/ARCHITECTURE.md` — 分层架构参考

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `electron/main/store.ts` — 当前 electron-store 单例模式（新建 database.ts 采用相似的单例模式）
- `src/clients/constants.ts` — `STORAGE_KEYS` 枚举（4 个 key 名，帮助确认表结构覆盖）
- `src/types/favorite.ts` — `FavoritesData` 类型定义（collections + favorites 结构，指导表设计）

### Established Patterns
- 单例导出模式（`electron/main/store.ts` → `export { store }`）
- `IpcResponse<T>` 统一返回格式（所有 handler 和 repository 使用）
- 模块化 handler 注册（`registerAllHandlers()` 在 `app.whenReady()` 中调用）
- lazy 初始化模式已用于部分功能

### Integration Points
- `electron/main/index.ts` — `app.whenReady()` 中集成 `closeDatabase()` 到 `before-quit`/`window-all-closed`
- `electron/main/index.ts` — 确认 database.ts 不在此文件顶层导入（保持懒初始化）
- `electron/main/store.ts` — 暂时保留，Phase 45 删除；Phase 41 只是新建 database.ts 并行存在
- `package.json` — 添加 `engines.node >=24`

### 构建说明
- **无需修改** `electron.vite.config.ts`、`electron-builder.yml`、`postinstall` 脚本
- `node:sqlite` 是内置模块，Vite/Rollup/electron-builder 原生支持
- 无 native module、无 asarUnpack、无 electron-rebuild

</code_context>

<deferred>
## Deferred Ideas

- Schema 版本化系统（schema_versions + migration runner）— 将来到需要 schema 变更时补充
- 迁移脚本（从 electron-store 导入数据）— Phase 44

</deferred>

---

*Phase: 41-database-infrastructure*
*Context gathered: 2026-05-03*
