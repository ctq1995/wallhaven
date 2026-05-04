# Phase 50: Favorites Page Pagination — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

实现收藏页面的传统分页 UI 和数据加载逻辑。这是 v6.0 传统分页重构的最后一个阶段，承接 Phase 46-49 的基础设施，将收藏页面从全量加载改为分页加载。

**范围内：**
- 集成 PaginationBar 组件到收藏页面
- 使用 useFavorites.goToPage() 加载分页数据
- 切换收藏夹筛选时重置分页
- 取消收藏后局部更新当前页数据
- 从详情页返回时保持滚动位置
- 添加键盘导航支持（ArrowLeft/ArrowRight）
- 更新 ROADMAP.md 标题（从"无限滚动"改为"传统分页"）

**范围外：**
- 不修改 Store 数据结构（Phase 48 已完成）
- 不修改 Composable 层逻辑（Phase 48 已完成）
- 不修改 PaginationBar 组件（Phase 49 已完成）
- 不修改侧边栏计数逻辑（Phase 48 已完成）
- 不修改数据库 schema（v5.0 已完成）

**ROADMAP 更新：**
- 原标题 "Favorites Page - Infinite Scroll" 改为 "Favorites Page - Pagination"
- 与 Phase 48 决策一致：两页面（在线壁纸、收藏）都使用传统分页

</domain>

<decisions>
## Implementation Decisions

### A — 分页模式

**D-01:** 收藏页面使用传统分页（与在线壁纸页面一致），复用 currentPageData + pageCache 结构

**D-02:** 理由：Phase 48 已完成传统分页基础设施，直接复用即可，无需额外开发

### B — 分页条组件

**D-03:** 复用 PaginationBar 组件，传递 currentPage、totalPages、totalCount props

**D-04:** 分页条放置在收藏网格底部，与在线壁纸页面布局一致

### C — 筛选切换行为

**D-05:** 切换收藏夹筛选时重置到第 1 页

**D-06:** 切换收藏夹时清空 pageCache，避免缓存污染

### D — 取消收藏后数据同步

**D-07:** 取消收藏后局部更新当前页数据，从 currentPageData.data 中移除该项

**D-08:** 同步更新 totalCount（减 1）和 counts（重新加载）

**D-09:** 不清空 pageCache，保持已访问页面缓存

### E — 滚动位置保持

**D-10:** 使用 KeepAlive 保持滚动位置（已配置）

**D-11:** 切换页面时滚动到顶部（与在线壁纸页面一致）

### F — 计数显示

**D-12:** 分页条显示 totalCount（总条目数），与在线壁纸页面一致

**D-13:** 内容头部显示 "X 张壁纸" 也使用 totalCount

### G — 键盘导航

**D-14:** 支持 ArrowLeft/ArrowRight 键盘导航（ImagePreview 关闭时）

**D-15:** 键盘事件监听在 FavoritesPage.vue 中，与 ImagePreview 互斥

**D-16:** 边界处理：第一页 ArrowLeft 不响应，最后一页 ArrowRight 不响应

### H — 加载时机

**D-17:** 懒加载：onActivated 时调用 goToPage(1) 加载首页数据

**D-18:** 移除当前全量加载逻辑 loadFavorites()，改用分页加载

### Claude's Discretion

- 空状态 UI 的具体文案和样式
- 加载中状态的视觉反馈
- 键盘事件的防抖处理（如需要）
- 取消收藏后动画效果（如需要）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 46-49 产出（直接依赖）
- `src/stores/modules/favorites/index.ts` — currentPageData, pageCache, totalCount, currentCollectionId, getCachedPage(), setCachedPage()
- `src/composables/favorites/useFavorites.ts` — goToPage(), refresh(), clearCache(), currentPageData, totalCount, hasMore
- `src/components/PaginationBar.vue` — 分页条组件（Phase 49 创建）
- `src/types/domain/wallpaper.ts` — PageData 类型
- `src/types/domain/favorite.ts` — PaginationParams, PaginatedFavoritesResult 类型

### 现有 View 和组件（需要修改）
- `src/views/FavoritesPage.vue` — 主页面，需要集成分页逻辑和 PaginationBar
- `src/components/favorites/CollectionSidebar.vue` — 侧边栏，触发收藏夹筛选
- `src/components/favorites/FavoriteWallpaperCard.vue` — 收藏卡片，触发取消收藏
- `src/components/ImagePreview.vue` — 已监听 ArrowLeft/ArrowRight，需要确认互斥逻辑

### 项目约束
- `.planning/PROJECT.md` — 硬约束：不修改用户操作逻辑、界面布局、UI 显示
- `.planning/ROADMAP.md` — Phase 50 需求定义（需更新标题）
- `.planning/REQUIREMENTS.md` — v6.0 需求列表（FAVPAG-01, 03, 04, 05）

### 前序阶段参考
- `.planning/phases/48-composable-store-layer/48-CONTEXT.md` — Phase 48 上下文（Store 和 Composable 设计）
- `.planning/phases/49-view-layer-pagination-bar/49-CONTEXT.md` — Phase 49 上下文（PaginationBar 组件）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/PaginationBar.vue` — 分页条组件，已支持 currentPage/totalPages/totalCount/loading props
- `src/composables/favorites/useFavorites.ts` — goToPage(), refresh(), currentPageData, totalCount, hasMore 已就绪
- `src/stores/modules/favorites/index.ts` — currentPageData, pageCache, counts 响应式状态已就绪
- `src/static/css/list.css` — .pagination 样式已存在

### Established Patterns
- 组件使用 `<script setup lang="ts">` 语法
- Props 使用 `defineProps<{}>()` 泛型语法
- 事件监听在 onMounted 中添加，onUnmounted 中移除
- KeepAlive 配置：需要在 Main.vue 中添加 FavoritesPage 到 include 列表
- 分页切换调用 window.scrollTo({ top: 0, behavior: 'smooth' })

### Integration Points
- CollectionSidebar 触发 handleCollectionSelect → 需要调用 goToPage(1, collectionId)
- FavoriteWallpaperCard 触发 handleCardUnfavorite → 需要更新 currentPageData
- useFavorites.goToPage() 已实现分页加载逻辑
- FavoritesStore.counts 已实现响应式计数

### 需要移除的逻辑
- FavoritesPage.vue 中的 filteredFavorites computed（改用 currentPageData.data）
- onActivated 中的 loadFavorites() 调用（改用 goToPage(1)）

</code_context>

<specifics>
## Specific Ideas

- 分页条样式复用 Phase 49 的 PaginationBar，保持两页面 UI 一致
- 键盘导航与 ImagePreview 互斥，确保无冲突
- 取消收藏后平滑移除卡片，避免突兀的 DOM 变化

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 50-favorites-page-pagination*
*Context gathered: 2026-05-04*
