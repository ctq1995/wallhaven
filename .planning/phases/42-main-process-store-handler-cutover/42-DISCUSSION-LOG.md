# Phase 42: Main Process + Store Handler Cutover — Discussion Log

> **审计记录。** 不用于规划、研究或执行代理。
> 决策已记录在 CONTEXT.md 中 — 此日志仅保留讨论过程。

**日期：** 2026-05-03
**阶段：** 42-main-process-store-handler-cutover
**模式：** discuss (default)
**讨论的灰区：** A（表路由策略）、B（SQL max-50 约束）、C（store-clear 范围）、D（直接导入替换模式）

## 讨论记录

### A — store-get/store-set 表路由策略

**问题：** store-get/store-set 处理程序如何将键映射到 SQLite 表？

**选项：**
1. 方案 1：统一 settings 表 — 所有键通过 settings 表 key-value 存储
2. 方案 2：按键路由到专用表 — appSettings→settings，wallpaperQueryParams→search_params，downloadFinishedList→download_history

**选择：** 方案 2

**理由：** 更符合关系型设计，REPO-03 max-50 约束可在 SQL 层实现。favoritesData 暂存 settings 表，Phase 43 再拆分。

### B — SQL 级 max-50 下载历史约束

**问题：** 下载历史 max-50 约束用哪种 SQL 机制实现？

**选项：**
1. B1：INSERT 触发器 — 数据库自动清理
2. B2：应用层 SQL 清理 — store-set handler 中执行 DELETE + LIMIT

**选择：** B2

**理由：** 更显式，便于调试，在已知路径中执行。不引入触发器这种隐式行为。

### C — store-clear 作用范围

**问题：** store-clear 应该清空哪些 SQLite 表？

**选项：**
1. C1：仅 settings 表
2. C2：settings + search_params + download_history 三表
3. C3：全部清空

**选择：** C2

**理由：** collections 和 favorites 不属于通用 store，不应受 store-clear 影响。保留迁移标志位。

### D — 主进程直接导入替换模式

**问题：** 主进程中 store.get() 的替换方式？

**选项：**
1. D1：内联 getDatabase() + 内联 SQL
2. D2：提取辅助函数到 database.ts

**选择：** D2

**理由：** 更好的封装，调用方只需一行代码，SQL 细节隐藏在 database.ts 中。新增 getAppSetting()、getDownloadPath()、getMaxConcurrentDownloads()。

## 推迟的想法

无 — 讨论保持在阶段范围内。

---

*Phase: 42-main-process-store-handler-cutover*
*讨论日期：2026-05-03*
