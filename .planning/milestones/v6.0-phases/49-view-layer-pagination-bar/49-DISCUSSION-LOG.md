# Phase 49: View Layer - Pagination Bar — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 49-view-layer-pagination-bar
**Areas discussed:** 分页条位置与组件结构, 页码显示策略, 页面切换滚动行为, 键盘导航作用域

---

## 分页条组件结构

| Option | Description | Selected |
|--------|-------------|----------|
| 独立组件 | 创建 src/components/PaginationBar.vue，可在其他页面复用。符合项目组件化风格。 | ✓ |
| 内嵌在 WallpaperList | 直接在 WallpaperList.vue 底部添加分页 HTML。减少文件数量，但耦合度高。 | |
| 内嵌在 OnlineWallpaper | 在 OnlineWallpaper.vue 中直接添加分页 HTML。与壁纸列表平级，布局更灵活。 | |

**User's choice:** 独立组件 (推荐)

---

## 分页条位置

| Option | Description | Selected |
|--------|-------------|----------|
| WallpaperList 底部 | 在 .thumbs-container 后、.main-bottom 前。语义上属于壁纸列表的一部分。 | ✓ |
| OnlineWallpaper 内部 | 与 WallpaperList 平级，在 <main> 标签内。可统一控制整体布局。 | |

**User's choice:** WallpaperList 底部 (推荐)

---

## 页码数量

| Option | Description | Selected |
|--------|-------------|----------|
| 显示 5 个页码 | 当前页左右各 2 个页码，如 1 ... 4 5 [6] 7 8 ... 20。适合中等页数场景。 | ✓ |
| 显示 7 个页码 | 当前页左右各 3 个页码，如 1 ... 3 4 5 [6] 7 8 9 ... 20。适合页数较多场景。 | |
| 简约模式 | 仅显示 Previous [当前页/X] Next，不显示具体页码。最简洁，但无法直接跳转。 | |

**User's choice:** 显示 5 个页码 (推荐)

---

## 省略号处理

| Option | Description | Selected |
|--------|-------------|----------|
| 智能显示 | 仅当前页与边界之间有间隔时显示省略号。避免冗余显示。 | ✓ |
| 始终显示 | 始终在首尾页码旁显示省略号（如 1 ... [3] ... 10）。视觉一致但可能冗余。 | |
| 跳转按钮代替 | 使用「<」「>」按钮表示跳转，代替省略号。可点击跳转 5 页。 | |

**User's choice:** 智能显示 (推荐)

---

## 滚动控制位置

| Option | Description | Selected |
|--------|-------------|----------|
| Composable 控制 | goToPage() 内部调用 window.scrollTo(0, 0)。逻辑封装，但耦合了 DOM 操作。 | |
| View 控制 | View 监听 currentPage 变化后滚动。关注点分离，但需要额外的 watch。 | ✓ |

**User's choice:** View 控制 (推荐)

---

## 滚动方式

| Option | Description | Selected |
|--------|-------------|----------|
| 瞬间滚动 | 立即跳转到顶部，无动画。最快响应，用户感知明确。 | |
| 平滑滚动 | 平滑滚动到顶部。视觉友好，但可能在快速翻页时造成拖沓感。 | ✓ |

**User's choice:** 平滑滚动

---

## 键盘导航作用域

| Option | Description | Selected |
|--------|-------------|----------|
| 仅在 ImagePreview 关闭时 | ImagePreview 打开时不响应分页导航，避免与图片切换冲突。行为清晰。 | ✓ |
| 在 WallpaperList 父级监听 | 在 OnlineWallpaper.vue 中监听，预览打开时不响应分页。需要额外的状态判断。 | |
| 用修饰键区分 | 使用 Ctrl+Left/Right 作为分页，保留单纯 Left/Right 给图片导航。语义明确。 | |

**User's choice:** 仅在 ImagePreview 关闭时 (推荐)

---

## 键盘事件监听位置

| Option | Description | Selected |
|--------|-------------|----------|
| PaginationBar 内部 | 在 PaginationBar.vue 中监听。组件自包含，但需要父组件传递 imgShow 状态。 | |
| OnlineWallpaper 中 | 在 OnlineWallpaper.vue 中监听。可直接访问 imgShow 状态，更直接。 | ✓ |

**User's choice:** OnlineWallpaper 中 (推荐)

---

## Claude's Discretion

以下领域用户选择让 Claude 自行决定：
- PaginationBar 组件的具体 CSS 样式细节（可复用 list.css 中的 .pagination 样式）
- 页码按钮的 hover/active/disabled 视觉状态
- 省略号的具体渲染方式（文本 "..." 或特殊元素）
- 键盘事件的防抖处理（如需要）
- 总条目数的格式化显示（如 "1,234 张"）

---

## Deferred Ideas

None — discussion stayed within phase scope.
