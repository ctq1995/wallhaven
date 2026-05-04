# Phase 48: Composable & Store Layer — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

实现 Composable 层的分页状态管理、缓存策略和响应式计数。这是 v6.0 传统分页重构的第三个阶段，承接 Phase 46-47 的基础设施，为 Phase 49-50 的 View 层提供数据和状态支持。

**范围内：**
- 在线壁纸页面的 `PageCache` 缓存管理（ONLPAG-06, ONLPAG-07）
- 收藏页面的传统分页逻辑（原计划无限滚动，已修改为传统分页）
- 侧边栏收藏计数响应式更新（SIDECT-01~04）
- WallpaperStore 和 FavoritesStore 的状态结构重构

**范围外：**
- 不修改 IPC handlers（Phase 47 已完成）
- 不修改 View 层 UI 组件（Phase 49/50）
- 不修改数据库 schema（v5.0 已完成）

**⚠️ ROADMAP 变更：**
- Phase 50 从"无限滚动"改为"传统分页"，与 Phase 49 保持一致
- 两个页面（在线壁纸、收藏）都使用 currentPageData + pageCache 结构
- 需要更新 ROADMAP.md 中 Phase 50 的描述

</domain>

<decisions>
## Implementation Decisions

### A — 页面缓存策略

**D-01:** 页面缓存存储在 Store 层（Pinia Store），使用 `shallowRef<Map<number, PageData>>` 包装以保持响应式

**D-02:** 缓存容量上限为最近 5 页，超过后删除最旧的页面数据（FIFO）

**D-03:** 搜索条件变更时清空全部缓存，用户下次访问需重新加载

### B — 分页实现（在线壁纸页面）

**D-04:** useWallpaperList 新增 `goToPage(page: number)` 方法，从缓存或 API 加载页面数据

**D-05:** WallpaperStore 新增字段：
- `currentPageData: shallowRef<PageData>` — 当前页数据
- `pageCache: shallowRef<Map<number, PageData>>` — 页面缓存
- `totalCount: Ref<number>` — 总条目数

**D-06:** 移除 WallpaperStore 的 `totalPageData` 字段，在线壁纸页面不再累积数据

### C — 分页实现（收藏页面）

**D-07:** 收藏页面从无限滚动改为传统分页，与在线壁纸页面保持一致

**D-08:** useFavorites 新增 `goToPage(page: number)` 方法，支持按收藏夹过滤的分页查询

**D-09:** FavoritesStore 新增字段（与 WallpaperStore 一致）：
- `currentPageData: shallowRef<PageData>` — 当前页数据
- `pageCache: shallowRef<Map<number, PageData>>` — 页面缓存
- `totalCount: Ref<number>` — 总条目数
- `currentCollectionId: Ref<string | null>` — 当前筛选的收藏夹

### D — 计数响应式更新

**D-10:** 收藏/取消收藏后调用 `getCounts()` 重新获取计数，确保数据一致性

**D-11:** 计数更新由 Composable 层触发：`useFavorites.add()/remove()` 成功后调用 `store.loadCounts()`

**D-12:** FavoritesStore 新增 `counts: Ref<Record<string, number>>` 字段，存储 `_total` 和各收藏夹计数

**D-13:** 计数数据在应用初始化时加载，与 `loadAll()` 一起调用

### E — Composable 方法设计

**D-14:** useWallpaperList 和 useFavorites 独立实现分页逻辑，不复用通用 Composable

**D-15:** useWallpaperList 新增方法：
- `goToPage(page: number)` — 跳转到指定页
- `refresh()` — 刷新当前页
- `clearCache()` — 清空缓存

**D-16:** useFavorites 新增方法（同上），额外支持 `collectionId` 过滤参数

### F — 路由切换行为

**D-17:** KeepAlive 保持数据和滚动位置，从详情页返回时直接显示缓存数据

### G — 收藏操作后数据同步

**D-18:** 收藏/取消收藏后更新 `currentPageData` 中对应项的 `is_favorite` 字段，不清空缓存

**D-19:** 数据同步仅影响在线壁纸页面的当前页数据，收藏页面数据独立管理

### Claude's Discretion

- 缓存的具体实现细节（如 Map 操作方法）
- computed 属性的设计（如 `hasPage(page)` 检查缓存是否存在）
- 错误处理和边界情况
- 类型定义的详细注释

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 46-47 产出（直接依赖）
- `src/types/domain/wallpaper.ts` — PageData, PageCache, WallpaperItem.is_favorite 类型
- `src/types/domain/favorite.ts` — PaginationParams, PaginatedFavoritesResult 类型
- `src/clients/electron.client.ts` — favoritesGetPaginated(), favoritesGetCounts() 方法
- `src/repositories/favorites.repository.ts` — getFavoritesPaginated(), getCounts() 方法
- `src/services/wallpaper.service.ts` — search() 方法已注入 is_favorite 字段

### 现有 Store 和 Composable（需要修改）
- `src/stores/modules/wallpaper/index.ts` — WallpaperStore 当前实现
- `src/stores/modules/favorites/index.ts` — FavoritesStore 当前实现
- `src/composables/wallpaper/useWallpaperList.ts` — 在线壁纸列表 Composable
- `src/composables/favorites/useFavorites.ts` — 收藏管理 Composable
- `src/composables/favorites/useCollections.ts` — 收藏夹管理 Composable

### 项目约束
- `.planning/PROJECT.md` — 硬约束：不修改用户操作逻辑、界面布局、UI 显示
- `.planning/ROADMAP.md` — Phase 48 需求定义（注意：Phase 50 需要更新）
- `.planning/REQUIREMENTS.md` — v6.0 需求列表

### 前序阶段参考
- `.planning/phases/46-infrastructure/46-CONTEXT.md` — Phase 46 上下文
- `.planning/phases/47-repository-service-layer/47-CONTEXT.md` — Phase 47 上下文

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/wallpaperApi.ts` — API 缓存模式（5 分钟 TTL，Map 存储）可参考
- `src/stores/modules/wallpaper/index.ts` — shallowRef 处理大数据的模式已验证
- `src/Main.vue` — KeepAlive 已配置，onActivated/onDeactivated 钩子可用

### Established Patterns
- Store 使用 Pinia composition API（`defineStore(() => {...})`）
- Composable 返回 `ComputedRef` 包装的 Store 状态，避免直接暴露 Store
- 状态重置使用工厂函数创建初始值
- Service 层返回 `IpcResponse<T>` 统一格式

### Integration Points
- `useWallpaperList` 被 `OnlineWallpaper.vue` 调用
- `useFavorites` 被 `OnlineWallpaper.vue` 和 `FavoritesPage.vue` 调用
- `useCollections` 被侧边栏组件调用获取收藏夹列表
- Store 层需要与 Phase 47 实现的 Repository 方法对接

</code_context>

<specifics>
## Specific Ideas

- 使用 `shallowRef` 包装 Map 类型，与现有 `totalPageData` 模式一致
- 计数字段使用 `_total` 键存储去重后的全部收藏计数
- 两页面（在线壁纸、收藏）分页状态结构保持一致，降低理解成本
- 收藏操作后局部更新 `is_favorite`，避免整页刷新

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### ROADMAP 变更记录
- Phase 50 从"无限滚动分页"改为"传统分页"，需要在 Phase 48 完成后更新 ROADMAP.md

</deferred>

---

*Phase: 48-composable-store-layer*
*Context gathered: 2026-05-04*
