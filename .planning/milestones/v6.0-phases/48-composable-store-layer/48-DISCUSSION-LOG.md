# Phase 48: Composable & Store Layer — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 48-composable-store-layer
**Areas discussed:** 页面缓存策略, 无限滚动实现, 计数响应式更新, Store结构重构, Composable方法复用, 路由切换行为, 收藏操作后数据同步

---

## 1. 页面缓存策略 - Cache Storage Location

| Option | Description | Selected |
|--------|-------------|----------|
| Store 层 | 使用 Pinia Store 存储，自然响应式，但 Map 类型需要特殊处理 | ✓ |
| Composable 层局部状态 | 在 useWallpaperList 内部管理，不持久化，离开页面后丢失 | |
| 扩展 API 缓存 | 复用现有 wallpaperApi.ts 的缓存机制，基于 URL 参数生成 key | |

**User's choice:** Store 层 (推荐)
**Notes:** 与现有 Store 分层架构一致

---

## 2. 页面缓存策略 - Cache Size Limit

| Option | Description | Selected |
|--------|-------------|----------|
| 保留最近 5 页 | 内存可控，支持向后导航 5 页，适合大多数场景 | ✓ |
| 保留最近 3 页 | 保守方案，适合内存受限场景 | |
| 不设上限 | 无限增长直到搜索条件变更，可能导致内存问题 | |

**User's choice:** 保留最近 5 页 (推荐)

---

## 3. 页面缓存策略 - Cache Clear Timing

| Option | Description | Selected |
|--------|-------------|----------|
| 清空全部缓存 | 搜索条件变更时清空全部缓存，用户下次访问需重新加载 | ✓ |
| 不清空，让旧数据过期 | 不清空，但新搜索结果覆盖第 1 页，旧页面可能显示错误数据 | |

**User's choice:** 清空全部缓存 (推荐)

---

## 4. 无限滚动实现 - useFavorites Support

| Option | Description | Selected |
|--------|-------------|----------|
| 新增方法 | 新增 loadMore() 方法，保留现有 load() 作为初始加载 | ✓ |
| 替换现有方法 | 替换 load() 为 loadMore()，初始加载也使用分页 | |
| 新建 Composable | 新建专门的 useFavoritesInfinite composable，与现有 useFavorites 并存 | |

**User's choice:** 新增方法 (推荐)
**Notes:** 后续决定将收藏页面改为传统分页，loadMore() 变为 goToPage()

---

## 5. 无限滚动实现 - State Location

| Option | Description | Selected |
|--------|-------------|----------|
| FavoritesStore 新增字段 | currentPageData (当前页数据) + pageCache (Map 结构) + hasMore/loading | ✓ |
| Composable 局部状态 | 在 useFavorites 内部维护，不影响 Store | |

**User's choice:** FavoritesStore 新增字段 (推荐)

---

## 6. 无限滚动实现 - Data Accumulation

| Option | Description | Selected |
|--------|-------------|----------|
| sections 累积模式 | 符合现有 TotalPageData 模式，View 层无需修改 | ✓ |
| 单页模式 | 每次 loadMore 后替换 currentPageData，View 层需合并显示 | |

**User's choice:** sections 累积模式 (推荐)
**Notes:** 后续决定将收藏页面改为传统分页，此决策被覆盖

---

## 7. 计数响应式更新 - Update Method

| Option | Description | Selected |
|--------|-------------|----------|
| 重新获取计数 | 收藏/取消收藏后调用 getCounts() 重新获取，确保数据一致性 | ✓ |
| 本地计数增减 | 前端维护计数状态，收藏时 +1，取消时 -1，可能不同步 | |
| 延迟更新 | 仅侧边栏可见时重新获取，减少不必要的 API 调用 | |

**User's choice:** 重新获取计数 (推荐)

---

## 8. 计数响应式更新 - Trigger Point

| Option | Description | Selected |
|--------|-------------|----------|
| Composable 层触发 | useFavorites.add() 成功后调用 store.loadCounts()，与现有 load() 模式一致 | ✓ |
| Service 层触发 | 需要 Service 层提供回调或事件机制 | |
| View 层触发 | 组件自行监听收藏变化并刷新计数 | |

**User's choice:** Composable 层触发 (推荐)

---

## 9. 计数响应式更新 - Storage Location

| Option | Description | Selected |
|--------|-------------|----------|
| FavoritesStore 新增字段 | 新增 counts 字段（Record<string, number>），包括 _total 和各收藏夹计数 | ✓ |
| useCollections 局部状态 | 在 useCollections 内部维护，getCollectionCount() 改用 counts 数据 | |

**User's choice:** FavoritesStore 新增字段 (推荐)

---

## 10. 计数响应式更新 - Initialization Timing

| Option | Description | Selected |
|--------|-------------|----------|
| 初始化时加载 | 应用启动时加载，与 loadAll() 一起调用 | ✓ |
| 首次显示时加载 | 侧边栏组件挂载时加载，减少启动时间 | |

**User's choice:** 初始化时加载 (推荐)

---

## 11. Store 结构重构 - WallpaperStore Support

| Option | Description | Selected |
|--------|-------------|----------|
| 扩展现有 Store | 在现有 WallpaperStore 中新增字段，保持单一 Store | ✓ |
| 新建独立 Store | 新建 OnlineWallpaperStore，分离传统分页逻辑 | |
| 通用 PaginationStore | 新建 PaginationStore 泛型 Store，可复用于其他分页场景 | |

**User's choice:** 扩展现有 Store (推荐)

---

## 12. Store 结构重构 - State Shape

| Option | Description | Selected |
|--------|-------------|----------|
| 分离模式 | currentPageData (当前页数据), pageCache (Map<number, PageData>), totalCount | ✓ |
| 单一 pageCache 模式 | 仅保留 pageCache，currentPageData 通过 computed 从 pageCache 获取 | |

**User's choice:** 分离模式 (推荐)

---

## 13. Store 结构重构 - Map Reactivity

| Option | Description | Selected |
|--------|-------------|----------|
| shallowRef 包装 | 使用 shallowRef 存储整个 Map，适合大对象，与现有 totalPageData 模式一致 | ✓ |
| reactive Map | 使用 Vue 3 reactive Map，自动追踪每个 entry | |
| 普通对象 | 使用普通对象 { [page: number]: PageData }，简单但不支持顺序遍历 | |

**User's choice:** shallowRef 包装 (推荐)

---

## 14. Store 结构重构 - totalPageData Handling

| Option | Description | Selected |
|--------|-------------|----------|
| 保留并兼容 | 保留 totalPageData 字段，计算属性返回兼容格式，现有 View 无需修改 | |
| 直接替换 | 移除 totalPageData，View 层需要修改以使用新结构 | ✓ |

**User's choice:** 直接替换
**Notes:** 用户确认两个页面都使用传统分页

---

## 15. 范围变更确认 - Favorites Page Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| 遵循 ROADMAP (无限滚动) | 收藏页面使用无限滚动 + sections 累积模式 | |
| 修改 ROADMAP (传统分页) | 您有意更改收藏页面为传统分页，需要更新 ROADMAP | ✓ |

**User's choice:** 修改 ROADMAP (传统分页)
**Notes:** ⚠️ 这是项目范围变更，需要更新 ROADMAP.md

---

## 16. FavoritesStore 结构

| Option | Description | Selected |
|--------|-------------|----------|
| 与 WallpaperStore 一致 | 新增 currentPageData, pageCache, totalCount, hasMore, loadingMore 字段 | ✓ |
| 简化结构 | 仅新增 currentPageData 和 loading，无缓存 | |

**User's choice:** 与 WallpaperStore 一致 (推荐)

---

## 17. Composable 方法复用

| Option | Description | Selected |
|--------|-------------|----------|
| 独立实现 | 保持两个独立 Composable，各自实现分页逻辑，代码简单直接 | ✓ |
| 通用 usePagination | 提取通用 usePagination composable，两页面各自调用 | |
| 扩展现有 Composable | 扩展现有 useWallpaperList，添加收藏页面专用的方法 | |

**User's choice:** 独立实现 (推荐)

---

## 18. 路由切换行为

| Option | Description | Selected |
|--------|-------------|----------|
| 保持数据 | KeepAlive 保持数据和滚动位置，返回时直接显示缓存数据 | ✓ |
| 重新加载 | 每次返回重新加载第 1 页数据 | |
| 保持数据+滚动顶部 | 保持数据但滚动到顶部 | |

**User's choice:** 保持数据 (推荐)

---

## 19. 收藏操作后数据同步

| Option | Description | Selected |
|--------|-------------|----------|
| 更新当前页数据 | 收藏后更新 currentPageData 中对应项的 is_favorite，不清空缓存 | ✓ |
| 清空缓存重新加载 | 收藏后清空 pageCache，下次访问重新加载 | |
| 不更新，仅新页面生效 | 收藏后不做任何更新，依赖 Service 层的新数据 | |

**User's choice:** 更新当前页数据 (推荐)

---

## 20. 数据同步范围

| Option | Description | Selected |
|--------|-------------|----------|
| 仅在线壁纸页面 | 仅更新在线壁纸页面，收藏页面的数据独立管理 | ✓ |
| 两个页面都更新 | 同时更新两个页面的缓存数据 | |

**User's choice:** 仅在线壁纸页面 (推荐)

---

## Claude's Discretion

以下领域由 Claude 自行决定：
- 缓存的具体实现细节（如 Map 操作方法）
- computed 属性的设计（如 `hasPage(page)` 检查缓存是否存在）
- 错误处理和边界情况
- 类型定义的详细注释

## Deferred Ideas

None — discussion stayed within phase scope.

### ROADMAP 变更记录
- Phase 50 从"无限滚动分页"改为"传统分页"，需要在规划阶段更新 ROADMAP.md
