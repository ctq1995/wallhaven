# Phase 43: Favorites & Collections Migration — Discussion Log

**Mode:** auto (fully autonomous)
**Date:** 2026-05-03

## Auto-Selected Gray Areas

All gray areas auto-selected per `--auto` mode.

### A — IPC 通路设计
- **Options considered:** 新专用 IPC handlers vs. 扩展通用 store IPC
- **Auto-selected:** 新专用 IPC handlers (`favorites.handler.ts`)
- **Rationale:** `collections`/`favorites` 是规范化关系表，通用 store IPC 的 key-value 模式无法处理定向 SQL 操作
- **Decisions captured:** D-01, D-02

### B — Repository 层改造
- **Options considered:** 重写现有 repository vs. 创建新的 repository 文件
- **Auto-selected:** 重写现有 `favorites.repository.ts`，公共 API 签名不变
- **Rationale:** 最小化外部影响，Pina store 和 View 层无需修改
- **Decisions captured:** D-03, D-04, D-05

### C — keyToTable() 移除
- **Auto-selected:** 移除 `'favoritesData'` 路由
- **Rationale:** 不再需要 blob 模式，所有操作通过新 IPC 通道
- **Decisions captured:** D-06

### D — 默认收藏夹初始化
- **Auto-selected:** 移至主进程 handler，首次读取 collections 表为空时自动创建
- **Rationale:** 与数据库初始化时机一致，消除 renderer 侧的初始化逻辑
- **Decisions captured:** D-07

### E — Service 层适配
- **Auto-selected:** 保持现有缓存模式，仅适配 repository 新签名
- **Rationale:** 最小化变更，缓存模式有效
- **Decisions captured:** D-08

## Claude's Discretion Items
- `electronClient` 方法添加
- Preload 桥接层更新
- 具体 SQL 实现细节
- Handler 错误处理
- `env.d.ts` 类型更新
- Handler 注册位置

## Deferred Ideas
None
