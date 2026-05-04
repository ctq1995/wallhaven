# Phase 47: Repository & Service Layer — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

实现 Repository 层分页查询和 Service 层收藏状态计算。这是 v6.0 传统分页重构的第二个阶段，承接 Phase 46 的类型系统和 IPC 通道基础设施，为 Phase 48-50 的 Composable/View 层提供数据支持。

**范围内：**
- 实现 `favorites-get-paginated` IPC handler（SQLite LIMIT/OFFSET 分页）
- 实现 `favorites-get-counts` IPC handler（收藏夹计数，全部收藏去重）
- 实现 `favorites-get-status-map` IPC handler（批量获取收藏状态映射）
- FavoritesRepository 新增三个方法调用新 IPC
- WallpaperService.search() 集成 is_favorite 注入逻辑

**范围外：**
- 不修改 Composable 层（Phase 48）
- 不修改 View 层 UI（Phase 49/50）
- 不修改数据库 schema（已在 v5.0 完成）
- 不修改 Store 数据结构（Phase 48）

</domain>

<decisions>
## Implementation Decisions

### A — is_favorite 注入策略

**D-01:** 新增 IPC 通道 `favorites-get-status-map`，使用 SQL JOIN 查询数据库获取收藏状态映射
- 参数: `{ wallpaperIds: string[] }`
- 返回: `IpcResponse<Record<string, 0 | 1 | 2>>`
- SQL 使用 `INNER JOIN collections ON favorites.collection_id = collections.id` 判断 is_default
- 数据实时一致，不依赖内存缓存状态

**D-02:** is_favorite 三态值语义定义
- `0`: 未收藏
- `1`: 收藏到默认收藏夹（优先）
- `2`: 仅收藏到其他收藏夹
- 如果同时存在于默认和其他收藏夹，返回 `1`（优先默认收藏夹）

**D-03:** WallpaperService.search() 内部调用 favoritesRepository.getFavoriteStatusMap()，合并到 API 数据后返回
- Service 层完成所有数据后处理
- Composable 层直接使用带 is_favorite 的数据

### B — 分页查询实现

**D-04:** `favorites-get-paginated` 和 `favorites-get-counts` 作为两个独立 IPC
- 分页查询使用 `LIMIT/OFFSET`
- 计数查询使用 `COUNT(*)`
- 不合并返回，保持 IPC 职责单一

**D-05:** 分页查询支持可选 collectionId 参数
- 传入 collectionId 时按收藏夹过滤
- 不传时返回全部收藏

### C — 计数去重逻辑

**D-06:** `favorites-get-counts` 返回结构
- 全部收藏计数: `SELECT COUNT(DISTINCT wallpaper_id) FROM favorites`
- 各收藏夹计数: `SELECT collection_id, COUNT(*) FROM favorites GROUP BY collection_id`
- 返回结构: `{ '_total': number, [collectionId: string]: number }`
- `_total` 键表示"全部收藏"的去重计数

### D — Repository 方法签名

**D-07:** FavoritesRepository 新增方法签名
```typescript
getFavoriteStatusMap(ids: string[]): Promise<IpcResponse<Record<string, 0 | 1 | 2>>>
getFavoritesPaginated(params: PaginationParams & { collectionId?: string }): Promise<IpcResponse<PaginatedFavoritesResult>>
getCounts(): Promise<IpcResponse<Record<string, number>>>
```

### Claude's Discretion
- IPC handler 的具体实现细节（错误处理、日志格式）
- 类型定义的详细注释
- Repository 方法的参数校验逻辑
- 是否需要为 getFavoriteStatusMap 提供空数组处理

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 46 产出（直接依赖）
- `src/types/domain/wallpaper.ts` — is_favorite 三态字段定义，PageCache 类型
- `src/types/domain/favorite.ts` — PaginationParams, PaginatedFavoritesResult 类型
- `src/shared/types/ipc.ts` — IPC_CHANNELS 常量（FAVORITES_GET_PAGINATED, FAVORITES_GET_COUNTS）
- `src/clients/electron.client.ts` — favoritesGetPaginated(), favoritesGetCounts() 方法（已定义）
- `electron/main/ipc/handlers/favorites.handler.ts` — 现有 handlers + NOT_IMPLEMENTED 占位

### 现有分层架构
- `src/repositories/favorites.repository.ts` — 现有 Repository 方法，需新增三个方法
- `src/services/favorites.service.ts` — FavoritesService 内存缓存模式参考
- `src/services/wallpaper.service.ts` — WallpaperService.search() 需修改

### 数据库结构
- `electron/main/database.ts` — getDatabase(), withTransaction() 工具函数
- favorites 表 schema: `(collection_id, wallpaper_id, wallpaper_data, added_at)`
- collections 表 schema: `(id, name, is_default, sort_order, created_at, updated_at)`

### 项目约束
- `.planning/PROJECT.md` — 硬约束：不修改用户操作逻辑、界面布局、UI 显示
- `.planning/ROADMAP.md` — Phase 47 需求定义（FAVSTA-02, FAVPAG-02）
- `.planning/research/ARCHITECTURE.md` — 分页架构设计参考

### 前序阶段参考
- `.planning/phases/46-infrastructure/46-CONTEXT.md` — Phase 46 上下文，了解类型定义决策

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `electron/main/database.ts` — getDatabase(), withTransaction() 工具函数
- `electron/main/ipc/handlers/favorites.handler.ts` — 现有 CRUD handlers，可参考 SQL 查询模式
- `src/shared/types/ipc.ts` — IpcResponse<T> 泛型接口，错误码模式

### Established Patterns
- IPC 通道命名：`favorites-{action}` 格式（如 favorites-get-collections）
- Handler 注册：`registerFavoritesHandlers()` 函数中集中注册
- Repository 方法返回：`IpcResponse<T>` 统一格式
- 错误处理：使用 logHandler 记录错误，返回标准错误响应

### Integration Points
- `electron/main/ipc/handlers/favorites.handler.ts` — 需要实现 favorites-get-paginated, favorites-get-counts, favorites-get-status-map
- `src/repositories/favorites.repository.ts` — 需要新增三个方法
- `src/services/wallpaper.service.ts` — search() 方法需要调用 getFavoriteStatusMap
- `electron/preload/index.ts` — 需要添加新 IPC 桥接（favoritesGetStatusMap）

</code_context>

<specifics>
## Specific Ideas

- SQL JOIN 查询返回三态值，一次查询获取收藏状态
- 优先默认收藏夹语义：壁纸同时在默认和其他收藏夹时返回 1
- `_total` 键表示全部收藏去重计数
- WallpaperService 内部完成 is_favorite 注入，Composable 层无需感知

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 47-repository-service-layer*
*Context gathered: 2026-05-04*
