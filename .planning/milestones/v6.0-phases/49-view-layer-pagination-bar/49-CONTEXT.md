# Phase 49: View Layer - Pagination Bar — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

实现传统分页 UI 并集成到在线壁纸页面。这是 v6.0 传统分页重构的第四个阶段，承接 Phase 46-48 的基础设施和 Composable 层，实现 View 层的分页条组件和收藏状态同步。

**范围内：**
- 分页条 UI 组件（PaginationBar.vue）
- 页码导航和当前页高亮（ONLPAG-01, ONLPAG-02）
- Previous/Next 按钮及边界禁用状态（ONLPAG-03）
- 总条目数显示（ONLPAG-04）
- 切换页面时滚动到顶部（ONLPAG-05）
- 左右箭头键导航（ONLPAG-08）
- 收藏状态三态显示同步（FAVSTA-03, FAVSTA-04）

**范围外：**
- 不修改 IPC handlers（Phase 47 已完成）
- 不修改 Store 数据结构（Phase 48 已完成）
- 不修改 Composable 层逻辑（Phase 48 已完成）
- 不修改数据库 schema（v5.0 已完成）
- 不修改收藏功能的业务逻辑

</domain>

<decisions>
## Implementation Decisions

### A — 分页条组件结构

**D-01:** 创建独立组件 `src/components/PaginationBar.vue`，放置在 WallpaperList 组件底部（`<main>` 内，`.thumbs-container` 后）

**D-02:** 组件 Props 设计：
- `currentPage: number` — 当前页码
- `totalPages: number` — 总页数
- `totalCount: number` — 总条目数（用于显示 "共 X 张"）
- `loading: boolean` — 加载状态（禁用交互）

**D-03:** 组件 Emits：
- `go-to-page: [page: number]` — 跳转到指定页

### B — 页码显示策略

**D-04:** 显示 5 个页码按钮（当前页左右各 2 个），边界情况自适应：
- 当前页 = 1 时：[1] 2 3 4 5 ...
- 当前页 = 中间时：1 ... 4 [5] 6 ... 10
- 当前页 = 末页时：1 ... 6 7 8 9 [10]

**D-05:** 省略号智能显示 — 仅当前页与边界之间有间隔时显示：
- 间隔 > 1 页时显示省略号
- 省略号不可点击，仅作为视觉分隔符

**D-06:** 始终显示首页和末页按钮（如果总页数 > 1）

### C — 页面切换滚动行为

**D-07:** View 层控制滚动 — 在 OnlineWallpaper.vue 中 watch `currentPageData.currentPage` 变化

**D-08:** 使用平滑滚动：`window.scrollTo({ top: 0, behavior: 'smooth' })`

**D-09:** 滚动触发时机：页码变化后立即滚动（与数据加载并行）

### D — 键盘导航作用域

**D-10:** 键盘导航仅在 ImagePreview 关闭时生效（`imgShow === false`）

**D-11:** 键盘事件监听在 OnlineWallpaper.vue 中，与 ImagePreview 的键盘监听互斥

**D-12:** 使用 ArrowLeft/ArrowRight 键，无需修饰键

**D-13:** 边界处理：
- 第一页时 ArrowLeft 不响应
- 最后一页时 ArrowRight 不响应

### E — 收藏状态同步

**D-14:** 收藏/取消收藏后更新 `currentPageData` 中对应项的 `is_favorite` 字段（Phase 48 D-18 已锁定）

**D-15:** 三态显示逻辑（Phase 47 D-02 已锁定）：
- `is_favorite === 0`: 未收藏（空心心形）
- `is_favorite === 1`: 收藏到默认收藏夹（红色实心）
- `is_favorite === 2`: 仅收藏到其他收藏夹（蓝色实心）

### Claude's Discretion

- PaginationBar 组件的具体 CSS 样式细节（可复用 list.css 中的 .pagination 样式）
- 页码按钮的 hover/active/disabled 视觉状态
- 省略号的具体渲染方式（文本 "..." 或特殊元素）
- 键盘事件的防抖处理（如需要）
- 总条目数的格式化显示（如 "1,234 张"）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 46-48 产出（直接依赖）
- `src/stores/modules/wallpaper/index.ts` — currentPageData, pageCache, totalCount, getCachedPage(), setCachedPage()
- `src/composables/wallpaper/useWallpaperList.ts` — goToPage(), refresh(), currentPageData, totalCount
- `src/types/domain/wallpaper.ts` — PageData, WallpaperItem.is_favorite 类型
- `src/services/wallpaper.service.ts` — search() 方法返回带 is_favorite 的数据

### 现有 View 和组件（需要修改）
- `src/views/OnlineWallpaper.vue` — 主页面，需要集成 PaginationBar 和键盘监听
- `src/components/WallpaperList.vue` — 需要在底部放置 PaginationBar
- `src/components/ImagePreview.vue` — 已监听 ArrowLeft/ArrowRight，需要确认互斥逻辑

### 样式资源
- `src/static/css/list.css` — 已有 .pagination 样式（.pagination ul, .pagination li, .pagination li.active 等）

### 项目约束
- `.planning/PROJECT.md` — 硬约束：不修改用户操作逻辑、界面布局、UI 显示
- `.planning/ROADMAP.md` — Phase 49 需求定义
- `.planning/REQUIREMENTS.md` — v6.0 需求列表（ONLPAG-01~08, FAVSTA-03~04）

### 前序阶段参考
- `.planning/phases/46-infrastructure/46-CONTEXT.md` — Phase 46 上下文
- `.planning/phases/47-repository-service-layer/47-CONTEXT.md` — Phase 47 上下文（is_favorite 三态定义）
- `.planning/phases/48-composable-store-layer/48-CONTEXT.md` — Phase 48 上下文（Store 和 Composable 设计）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/static/css/list.css` — 已有完整的 .pagination 样式体系，包括 .pagination li.active, .pagination li.disabled 等
- `src/utils/heart.ts` — getHeartState() 函数实现三态显示逻辑
- `src/stores/modules/wallpaper/index.ts` — currentPageData, totalCount 响应式状态已就绪

### Established Patterns
- 组件使用 `<script setup lang="ts">` 语法
- Props 使用 `defineProps<{}>()` 泛型语法
- Emits 使用 `defineEmits<{}>()` 泛型语法
- 事件监听在 onMounted 中添加，onUnmounted 中移除
- KeepAlive 配置：OnlineWallpaper 在 KeepAlive include 列表中

### Integration Points
- WallpaperList 组件被 OnlineWallpaper.vue 使用
- useWallpaperList composable 提供 goToPage() 方法
- ImagePreview 已监听 ArrowLeft/ArrowRight，需要在预览关闭时由分页接管

### 已有滚动监听
- OnlineWallpaper.vue 已有 throttledScrollEvent 用于无限滚动
- 需要移除无限滚动逻辑，替换为分页导航

</code_context>

<specifics>
## Specific Ideas

- 使用平滑滚动提升用户体验
- 页码显示参考 Wallhaven 官网风格（已有 list.css 样式支持）
- 键盘导航与 ImagePreview 互斥，确保无冲突
- 分页条位置在 WallpaperList 底部，与 .main-bottom 区域区分

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 49-view-layer-pagination-bar*
*Context gathered: 2026-05-04*
