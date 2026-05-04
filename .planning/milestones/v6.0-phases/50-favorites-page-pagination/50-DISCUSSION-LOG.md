# Phase 50: Favorites Page Pagination - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 50-favorites-page-pagination
**Areas discussed:** 分页模式、分页条组件、筛选切换、数据同步、滚动保持、计数显示、键盘导航、加载时机

---

## 分页模式

| Option | Description | Selected |
|--------|-------------|----------|
| 传统分页 | Phase 48 已完成基础设施（currentPageData, pageCache, goToPage），直接复用即可，与在线壁纸页面保持一致 | ✓ |
| 无限滚动 | 需要修改 Store 和 Composable 实现，添加 loadMore 方法，移除 pageCache 相关逻辑 | |

**User's choice:** 传统分页（推荐）
**Notes:** 与 Phase 48 决策一致，ROADMAP 标题需要更新

---

## 分页条组件

| Option | Description | Selected |
|--------|-------------|----------|
| 复用 PaginationBar | 保持两页面 UI 一致，已实现 currentPage/totalPages/totalCount props，直接复用 | ✓ |
| 创建新的分页组件 | 需要新建组件，增加维护成本 | |

**User's choice:** 复用 PaginationBar（推荐）
**Notes:** 直接使用 Phase 49 创建的组件

---

## 筛选切换行为

| Option | Description | Selected |
|--------|-------------|----------|
| 重置到第1页 | 切换收藏夹时从第1页开始，清空 pageCache，符合用户预期 | ✓ |
| 保持当前页码 | 保留页码可能导致空白或数据混乱 | |

**User's choice:** 重置到第1页（推荐）
**Notes:** 切换收藏夹时调用 goToPage(1, collectionId)

---

## 数据同步

| Option | Description | Selected |
|--------|-------------|----------|
| 局部更新 | 仅更新当前页的 is_favorite，保持缓存一致性，与在线壁纸页面一致 | ✓ |
| 刷新当前页 | 简单但增加加载时间，用户体验差 | |
| 清空所有缓存 | 最简单但丢失缓存数据，切换收藏夹时需重新加载 | |

**User's choice:** 局部更新（推荐）
**Notes:** 取消收藏后从 currentPageData.data 中移除该项，同步更新 totalCount 和 counts

---

## 滚动保持

| Option | Description | Selected |
|--------|-------------|----------|
| 保持滚动位置 | 与在线壁纸页面一致，KeepAlive 已配置 | ✓ |
| 重置到顶部 | 每次进入收藏页面回到顶部 | |

**User's choice:** 保持滚动位置（推荐）
**Notes:** 需要在 Main.vue 中添加 FavoritesPage 到 KeepAlive include 列表

---

## 计数显示

| Option | Description | Selected |
|--------|-------------|----------|
| 使用 totalCount | 显示「共 X 张」，与在线壁纸页面一致 | ✓ |
| 使用当前页数据长度 | 显示已加载条目数而非总数 | |

**User's choice:** 使用 totalCount（推荐）
**Notes:** 分页条和内容头部都使用 totalCount

---

## 键盘导航

| Option | Description | Selected |
|--------|-------------|----------|
| 添加键盘导航 | 与在线壁纸页面一致，ArrowLeft/ArrowRight 切换页面 | ✓ |
| 不添加键盘导航 | 仅支持点击分页按钮 | |

**User's choice:** 添加键盘导航（推荐）
**Notes:** 键盘事件与 ImagePreview 互斥

---

## 加载时机

| Option | Description | Selected |
|--------|-------------|----------|
| 懒加载 | onActivated 时调用 goToPage(1)，触发分页加载，最小化初始加载时间 | ✓ |
| 应用启动时预加载 | 需要修改 useFavorites.loadAll()，增加初始化时间 | |

**User's choice:** 懒加载（推荐）
**Notes:** 移除当前全量加载逻辑 loadFavorites()

---

## Claude's Discretion

- 空状态 UI 的具体文案和样式
- 加载中状态的视觉反馈
- 键盘事件的防抖处理（如需要）
- 取消收藏后动画效果（如需要）

---

## Deferred Ideas

None — discussion stayed within phase scope.
