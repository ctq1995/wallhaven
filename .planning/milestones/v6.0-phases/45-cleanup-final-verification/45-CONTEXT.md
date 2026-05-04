# Phase 45: Cleanup & Final Verification — Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Final phase of v5.0 milestone: remove all electron-store code and dependencies, fix critical issues from Phase 44 REVIEW, and verify build integrity and feature completeness. This phase concludes the electron-store to SQLite migration.

**范围内：**
- 修复 Phase 44 REVIEW.md 中的两个 CRITICAL issues（CR-01: 数据库连接重置；CR-02: wallpaperData 序列化）
- 从 `package.json` 移除 `electron-store` 依赖（CLN-01）
- 删除 `electron/main/store.ts`（CLN-02）
- 删除 `electron/main/ipc/handlers/settings.handler.ts` 及其 IPC 通道（CLN-03）
- 删除 `src/utils/store.ts`（CLN-04）
- 移除 `electronClient.saveSettings()`/`loadSettings()` 方法（CLN-05）
- 清理 preload 中未使用的 IPC 桥接（CLN-06）
- 验证应用构建成功（VER-05）
- 手动功能验证：设置、下载、搜索、收藏功能正常（VER-01）
- 启动性能验证：数据库初始化 < 500ms 开销（VER-03）

**范围外：**
- 不修改任何用户操作逻辑、界面布局或 UI 显示（硬约束）
- 不添加新功能（清理阶段仅移除死代码）
- 不修改数据库 schema（Phase 41-44 已完成）
- 不修改 Repository 层的核心逻辑（仅移除遗留方法）
- 不涉及 electron-store 数据迁移（Phase 44 已完成）
</domain>

<decisions>
## Implementation Decisions

### A — Phase 44 Critical Issues 修复

**D-01:** Phase 44 的两个 CRITICAL issues 在 Phase 45 开头修复，作为第一个计划项
- **CR-01 修复:** `database.ts` 中迁移失败时已重置 `db = undefined`，允许下次 `getDatabase()` 重试。需验证此逻辑是否完整
- **CR-02 修复:** `migration.ts` 中 `wallpaperData` 序列化需统一为 `JSON.stringify()`，与 `favorites.handler.ts` 的 `JSON.parse()` 读取保持一致

### B — 清理范围

**D-02:** 全部清理推荐范围，不保留任何 electron-store 相关代码
- `electron-store` 依赖从 `package.json` 移除
- `electron/main/store.ts` 删除
- `electron/main/ipc/handlers/settings.handler.ts` 删除（包括 `save-settings`、`load-settings` 通道）
- `src/utils/store.ts` 删除
- `electron/preload/index.ts` 中移除 `saveSettings`/`loadSettings` 桥接
- `src/clients/electron.client.ts` 中移除 `saveSettings()`/`loadSettings()` 方法
- `src/shared/types/ipc.ts` 中移除 `SAVE_SETTINGS`/`LOAD_SETTINGS` 枚举值

**D-03:** 清理顺序：先修复 CRITICAL issues，再移除文件，最后清理依赖和类型定义

### C — 验证策略

**D-04:** 使用手动功能测试验证，确认：
- 设置功能：修改设置、保存、重启后读取
- 下载功能：启动下载、暂停、恢复、完成
- 搜索功能：搜索壁纸、翻页
- 收藏功能：添加收藏、移除收藏、切换收藏夹

**D-05:** 构建验证运行 `npm run build` 确认无编译错误

**D-06:** 启动性能通过观察 console 日志中 `[Migration]` 输出时间确认 < 500ms

### D — 注册表和类型清理

**D-07:** `electron/main/ipc/handlers/index.ts` 中移除 `registerSettingsHandlers()` 调用和 `settings.handler.ts` 导入

**D-08:** `REGISTERED_CHANNELS` 数组中移除 `'save-settings'`、`'load-settings'`

### E — index.ts 中的 store 导出

**D-09:** `electron/main/index.ts` 中移除 `import { store } from './store'` 和 `export { store }`
- 这是 `store.ts` 的唯一剩余消费者
- `migration.ts` 已在 Phase 44 运行，不再需要 `store` 导入

### Claude's Discretion
- 具体文件删除的顺序和提交粒度
- 类型定义清理的完整程度（是否清理 `env.d.ts` 中的 ElectronAPI 接口）
- 验证步骤的具体执行方法
- 是否需要保留 `wallhaven-data.json.bak` 备份文件的说明文档
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 44 修复参考
- `.planning/phases/44-migration-script/44-REVIEW.md` — CR-01/CR-02 的具体问题描述和修复建议
- `electron/main/database.ts:174-202` — `getDatabase()` 中迁移调用和 db 赋值逻辑
- `electron/main/migration.ts:156-158` — wallpaperData 序列化逻辑
- `electron/main/ipc/handlers/favorites.handler.ts:327` — `JSON.parse(row.wallpaper_data)` 读取逻辑

### 需要删除的文件
- `electron/main/store.ts` — electron-store 单例实例
- `electron/main/ipc/handlers/settings.handler.ts` — save-settings/load-settings handlers
- `src/utils/store.ts` — renderer 侧的 store 工具封装

### 需要修改的文件
- `package.json` — 移除 electron-store 依赖
- `electron/main/index.ts` — 移除 store 导入/导出
- `electron/main/ipc/handlers/index.ts` — 移除 settings handler 注册
- `electron/preload/index.ts` — 移除 saveSettings/loadSettings 桥接
- `src/clients/electron.client.ts` — 移除 saveSettings/loadSettings 方法
- `src/shared/types/ipc.ts` — 移除 SAVE_SETTINGS/LOAD_SETTINGS 枚举

### 项目约束
- `.planning/REQUIREMENTS.md` §CLN-01/02/03/04/05/06, VER-01/03/05 — Phase 45 的 9 项需求定义
- `.planning/PROJECT.md` — 硬约束：已有功能外观行为不变、IPC 向后兼容
- `.planning/phases/44-migration-script/44-CONTEXT.md` — Phase 44 决策背景
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `electron/main/database.ts` — 完整的 SQLite 基础设施，包括 `getDatabase()`、`withTransaction()`、`getAppSetting()` 等工具
- Phase 42/43 已完成的 store.handler.ts 和 favorites.handler.ts — 这些是迁移后的正确实现

### Established Patterns
- 模块化 handler 注册：每个领域一个 `registerXxxHandlers()` 函数
- `IpcResponse<T>` 统一返回格式
- 懒数据库初始化：handler 中调用 `getDatabase()` 而非 import 时初始化
- Preload 桥接模式：`contextBridge.exposeInMainWorld()` 中的 IPC 通道

### Integration Points
- `electron/main/index.ts` — 需要移除 store 相关导入
- `electron/main/ipc/handlers/index.ts` — 需要移除 settings handler 注册
- `electron/preload/index.ts` — 需要移除 saveSettings/loadSettings 桥接
- `src/clients/electron.client.ts` — 需要移除 saveSettings/loadSettings 方法

### 注意事项
- `migration.ts` 中仍导入 `store`，但迁移只运行一次（幂等守卫），之后不再需要
- `wallhaven-data.json.bak` 备份文件在迁移后保留在 userData 目录，无需代码清理
- `_migrated_from_store` 标志在 settings 表中永久保留，不删除
</code_context>

<specifics>
## Specific Ideas

- 删除顺序建议：先修复 CRITICAL issues（提交），再删除 handler 文件（提交），最后删除 store.ts 和依赖（提交）
- 每个 Plan 对应一个逻辑分组的提交
- 验证步骤在所有清理完成后执行
- 备份文件 `wallhaven-data.json.bak` 可在用户文档中说明，不通过代码处理
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 45-cleanup-final-verification*
*Context gathered: 2026-05-03*
