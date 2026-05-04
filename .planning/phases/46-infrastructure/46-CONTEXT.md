# Phase 46: Infrastructure — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

建立分页功能的类型系统和 IPC 通信基础。这是 v6.0 传统分页重构的第一个阶段，为后续 Repository/Service 层和 View 层提供类型定义和 IPC 通道支持。

**范围内：**
- 将现有类型从 `src/types/index.ts` 完整迁移到 `src/types/domain/` 目录
- WallpaperItem 新增 `is_favorite` 三态字段（0=未收藏, 1=默认收藏夹, 2=其他收藏夹）
- 新增 PageCache 类型（Map<number, PageData>）用于在线壁纸页面缓存
- 新增 PaginationParams 类型（limit + offset 格式）用于收藏分页
- 新增 IPC 通道 `favorites-get-paginated`（分页查询收藏）
- 合并计数通道为单一 `favorites-get-counts`（返回所有收藏夹计数映射）
- ElectronClient 新增 `favoritesGetPaginated()` 和 `favoritesGetCounts()` 方法
- 在 `src/types/index.ts` 保留重导出以保持向后兼容

**范围外：**
- 不修改 Repository 层逻辑（Phase 47）
- 不修改 Service 层逻辑（Phase 47）
- 不修改 Composable 层逻辑（Phase 48）
- 不修改 View 层 UI（Phase 49/50）
- 不修改数据库 schema（已在 v5.0 完成）

</domain>

<decisions>
## Implementation Decisions

### A — 类型定义位置

**D-01:** 将所有类型从 `src/types/index.ts` 迁移到 `src/types/domain/` 目录，按领域分组
- `domain/wallpaper.ts` — WallpaperItem, WallpaperMeta, WallpaperThumb, WallpaperQuery, PageData, TotalPageData, PageCache
- `domain/favorite.ts` — Collection, FavoriteItem, PaginationParams, PaginatedFavoritesResult
- `domain/download.ts` — DownloadItem, DownloadState, FinishedDownloadItem
- `domain/settings.ts` — AppSettings, WallpaperFit
- `domain/index.ts` — 统一导出所有类型

**D-02:** 在 `src/types/index.ts` 保留重导出（`export * from './domain'`），保持现有代码无需修改导入路径

### B — is_favorite 三态定义

**D-03:** WallpaperItem 新增 `is_favorite?: 0 | 1 | 2` 可选字段
- `0` = 未收藏
- `1` = 收藏到默认收藏夹
- `2` = 收藏到其他收藏夹（非默认）
- 可选字段：API 返回的原始数据不包含此字段，由 Service 层后处理添加

**D-04:** 三态值在 Service 层后处理计算
- WallpaperService.search() 获取 API 数据后，查询 favorites 表
- 获取每个 wallpaperId 对应的 collectionIds
- 判断逻辑：无收藏记录 → 0；包含默认收藏夹 → 1；仅其他收藏夹 → 2

### C — 分页相关类型

**D-05:** PageCache 类型定义为 `Map<number, PageData>`
- key: 页码（1-based）
- value: 该页的壁纸数据（PageData 结构）
- 用于在线壁纸页面的内存缓存

**D-06:** PaginationParams 类型定义为 `{ limit: number, offset: number }`
- 与 SQLite LIMIT/OFFSET 语法直接对应
- limit: 每页条数（默认 24）
- offset: 偏移量（0-based）

**D-07:** PaginatedFavoritesResult 类型定义为 `{ items: FavoriteItem[], total: number, hasMore: boolean }`
- items: 当前页的收藏项数组
- total: 总条目数
- hasMore: 是否有更多数据

### D — IPC 通道设计

**D-08:** 新增 IPC 通道 `favorites-get-paginated`
- 请求参数：`{ collectionId?: string, limit: number, offset: number }`
- 返回结构：`IpcResponse<PaginatedFavoritesResult>`
- 不传 collectionId 时返回全部收藏

**D-09:** 合并计数通道为单一 `favorites-get-counts`
- 返回结构：`IpcResponse<{ [collectionId: string]: number }>`
- 包含所有收藏夹的计数
- 包含特殊键 `'_total'` 表示"全部收藏"的总数（去重后的唯一壁纸数）

**D-10:** 更新 `src/shared/types/ipc.ts` 添加新通道常量
- `IPC_CHANNELS.FAVORITES_GET_PAGINATED`
- `IPC_CHANNELS.FAVORITES_GET_COUNTS`

### E — Client 层接口

**D-11:** ElectronClient 新方法命名风格：`favorites` 前缀
- `favoritesGetPaginated(params: PaginationParams): Promise<IpcResponse<PaginatedFavoritesResult>>`
- `favoritesGetCounts(): Promise<IpcResponse<Record<string, number>>>`

**D-12:** ElectronClient 方法返回完整 `IpcResponse<T>`
- 与现有方法风格一致
- 由 Service 层处理 success/error 判断

### Claude's Discretion
- 类型迁移的具体提交粒度（可按领域文件分多次提交或一次提交）
- 类型定义的详细文档注释
- Handler 层 SQL 查询的具体实现方式
- 是否需要为 PaginationParams 提供默认值工厂函数

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 现有类型定义
- `src/types/index.ts` — 当前所有类型定义，需要迁移到 domain/
- `src/types/favorite.ts` — 收藏相关类型，需要合并到 domain/favorite.ts
- `src/types/domain/index.ts` — 空导出文件，需要填充

### IPC 通道定义
- `src/shared/types/ipc.ts` — IPC_CHANNELS 常量，需要添加新通道
- `electron/main/ipc/handlers/favorites.handler.ts` — 现有 favorites handlers，需要添加新 handler

### Client 层
- `src/clients/electron.client.ts` — Electron 封装，需要添加新方法

### 数据库结构
- `electron/main/database.ts:100-111` — favorites 表 schema（collection_id, wallpaper_id, wallpaper_data, added_at）

### 项目约束
- `.planning/PROJECT.md` — 硬约束：不修改用户操作逻辑、界面布局、UI 显示
- `.planning/ROADMAP.md` — Phase 46 需求定义（DATAREF-01, DATAREF-02, DATAREF-03, FAVSTA-01, FAVPAG-02）
- `.planning/research/ARCHITECTURE.md` — 分页架构设计参考

### 前序阶段参考
- `.planning/phases/45-cleanup-final-verification/45-CONTEXT.md` — Phase 45 上下文，了解 SQLite 迁移完成状态
- `.planning/phases/39-favorites-heart-status/39-CONTEXT.md` — HeartState 三态定义

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/shared/types/ipc.ts` — IPC_CHANNELS 常量模式和 IpcResponse<T> 泛型接口
- `electron/main/database.ts` — getDatabase(), withTransaction() 工具函数
- `electron/main/ipc/handlers/favorites.handler.ts` — 现有 CRUD handlers，可参考 SQL 查询模式

### Established Patterns
- IPC 通道命名：`favorites-{action}` 格式（如 favorites-get-collections）
- Handler 注册：`registerFavoritesHandlers()` 函数中集中注册
- 类型迁移：保持 index.ts 重导出以维持向后兼容
- IpcResponse 结构：`{ success: boolean, data?: T, error?: IpcErrorInfo }`

### Integration Points
- `src/types/index.ts` — 需要修改为重导出 domain/
- `src/shared/types/ipc.ts` — 需要添加新 IPC_CHANNELS 常量
- `electron/main/ipc/handlers/favorites.handler.ts` — 需要添加新 handler
- `electron/main/ipc/handlers/index.ts` — 已导入 registerFavoritesHandlers，无需修改
- `src/clients/electron.client.ts` — 需要添加新方法
- `electron/preload/index.ts` — 需要添加新 IPC 桥接

</code_context>

<specifics>
## Specific Ideas

- is_favorite 三态值与 Phase 39/40 的 HeartState 保持一致（0=无, 1=默认, 2=其他）
- PageCache 使用 Map<number, PageData> 而非对象，便于 Vue 响应式追踪
- 计数通道合并为一个，减少 IPC 调用次数
- 类型完整迁移到 domain/，保持代码组织清晰

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 46-infrastructure*
*Context gathered: 2026-05-04*
