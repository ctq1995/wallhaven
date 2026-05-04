# Feature Research: 传统分页重构

**Domain:** Wallhaven 壁纸浏览器 — 将在线壁纸页面从无限滚动改为传统分页条，我的收藏页面实现无限滚动分页
**Researched:** 2026-05-04
**Confidence:** HIGH (基于现有代码库分析 + 分页 UI 模式研究)

## Feature Landscape

### Table Stakes (Users Expect These)

分页功能的基础特性，缺失会让用户感到困惑或体验受损。

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| 页码导航 | 用户需要快速跳转到任意页面，而非逐页加载。传统分页条提供明确的页码指示和跳转能力。 | MEDIUM | 需要新建 Pagination 组件，处理页码计算、省略号显示、边界情况 |
| 当前页高亮 | 用户需要知道自己在哪一页，视觉反馈是基本交互需求。 | LOW | CSS 类切换，已有类似的选中状态样式模式可复用 |
| 上一页/下一页按钮 | 用户期望顺序翻页，这是最基础的导航方式。 | LOW | 简单的条件禁用 + 点击处理 |
| 总条目数显示 | 用户想知道搜索结果有多少张壁纸，了解数据规模。 | LOW | 从 API meta.total 获取，UI 显示 "共 X 张" |
| 每页固定数量 | Wallhaven API 固定 24 张/页，用户预期一致的展示数量。 | LOW | 无需实现，API 已固定 |
| 页面切换时滚动到顶部 | 用户切换页面后期望从新页面的顶部开始浏览。 | LOW | `window.scrollTo(0, 0)` 简单实现 |

### Differentiators (Competitive Advantage)

由传统分页带来的改进特性，超越基础需求。

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 内存页面缓存 | 已访问页面的数据缓存在内存中，切换回已加载页面无需重新请求 API。用户感知为"瞬间加载"。 | MEDIUM | 用 Map<number, PageData> 替代 TotalPageData sections 数组。需要缓存失效策略（搜索条件变化时清空） |
| 收藏状态数据库计算 | 壁纸是否收藏由 SQLite 查询返回（is_favorite 字段），替代前端 Set 计算。减少前端计算负担，数据源一致。 | MEDIUM | 需要在 favorites 表上创建索引，API 返回数据与收藏状态 LEFT JOIN。需修改现有的 WallpaperService/WallpaperRepository |
| URL 参数可选同步 | 用户可分享带页码的 URL，便于书签和分享。但本 milestone 明确不同步 URL，后续可按需添加。 | LOW | 当前 milestone 不实现，但架构上预留扩展点 |
| 分页条响应式设计 | 小屏幕下显示省略页码，大屏幕显示完整页码列表。 | LOW | 已有响应式设计模式，复用现有 CSS 变量和媒体查询 |
| 键盘快捷键导航 | 左右方向键翻页，提升效率用户的使用体验。 | LOW | 监听 keydown 事件，调用翻页方法 |

### Anti-Features (Commonly Requested, Often Problematic)

看似合理但可能带来问题的功能。

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| 无限滚动 + 传统分页并存 | "让用户选择自己喜欢的方式" | 两种模式的交互逻辑冲突。无限滚动依赖 scroll event 触发加载，传统分页期望用户主动翻页。并存需要双倍状态管理，增加复杂度和 bug 风险。 | 本次 milestone 完全移除无限滚动，替换为传统分页 |
| URL 参数双向绑定 | "刷新页面保持当前页码" | Wallhaven API 返回的是当前页数据，URL 同步需要额外处理前进/后退按钮、搜索条件变化等边界情况。增加测试负担。 | 本 milestone 不同步 URL，数据存储在内存状态中 |
| 虚拟分页（前端截断） | "减少 API 请求" | Wallhaven API 每次返回 24 张，前端无法获取更多数据。虚拟分页需要一次性请求大量数据，增加首屏加载时间和内存占用。 | 遵循 API 设计，每页一个请求 |
| 页码输入框跳转 | "快速跳转到第 N 页" | 对于总页数有限（通常 < 100 页）的场景，点击页码或使用省略号跳转足够。输入框增加额外的 UI 复杂度和验证逻辑。 | 显示页码范围 1-5 页，超过时使用省略号和首尾页链接 |

## Feature Dependencies

```
在线壁纸页面传统分页
    ├──requires──> Pagination 组件 (新建)
    │       ├──requires──> 页码计算逻辑 (currentPage, totalPage, displayRange)
    │       └──requires──> 样式定义 (与现有 button/checkbox 风格一致)
    ├──requires──> PageData 替换 TotalPageData 数据结构
    │       ├──requires──> WallpaperStore 状态重构
    │       └──requires──> useWallpaperList composable 接口变更
    ├──requires──> 页面缓存 Map<number, PageData>
    │       └──requires──> 缓存失效策略 (搜索条件变化)
    └──requires──> 移除无限滚动逻辑
            └──requires──> 移除 scroll event listener

我的收藏页面无限滚动
    ├──requires──> SQLite LIMIT/OFFSET 分页查询
    │       ├──requires──> favorites 表索引优化
    │       └──requires──> 分页查询 Repository 方法
    ├──requires──> IntersectionObserver 或 scroll event 触发加载
    │       └──requires──> 复用现有 throttle 模式
    └──requires──> 侧边栏收藏数目响应式更新
            └──requires──> 已有 favorites composable 的 count computed

收藏状态数据库计算
    ├──requires──> SQLite 查询返回 is_favorite 字段
    │       ├──requires──> LEFT JOIN favorites 表
    │       └──requires──> wallpaper_id 索引
    ├──requires──> WallpaperService 接口变更
    │       └──requires──> 新增 is_favorite 参数传递
    └──requires──> 前端 favoriteIds Set 计算逻辑移除
            └──requires──> WallpaperList 组件接收 is_favorite 字段
```

### Dependency Notes

- **Pagination 组件是独立模块** — 不依赖现有组件，可独立开发测试。样式参考现有 `button` 和 `checkbox` 组件。
- **PageData 替换 TotalPageData 是破坏性变更** — 现有 `WallpaperList` 组件接收 `TotalPageData`，需要修改为接收单页 `PageData`。sections 数组概念移除。
- **页面缓存与缓存失效** — 搜索条件变化（`queryParams` 变化）时需要清空缓存。使用 Vue 的 `watch` 监听 `queryParams` 变化。
- **收藏状态数据库计算与前端计算互斥** — 两种方式同时存在会导致状态不一致。数据库计算后，前端的 `favoriteIds` Set 和 `wallpaperCollectionMap` 逻辑可移除（仅用于在线壁纸页面）。
- **我的收藏页面分页与现有全量显示互斥** — 当前 `FavoritesPage` 一次性加载全部收藏并使用 `filteredFavorites` computed 过滤。分页后需要改为数据库层面的 LIMIT/OFFSET 查询。

## MVP Definition

### Launch With (v6.0 — 传统分页重构)

最小可行产品 — 传统分页条可用，收藏状态正确显示。

- [ ] **Pagination 组件** — 显示页码列表、上一页/下一页按钮、当前页高亮、总页数显示。处理省略号逻辑（当前页 ± 2 页范围）。
- [ ] **OnlineWallpaper 页面集成** — 移除无限滚动 scroll listener，集成 Pagination 组件，点击页码触发数据加载。
- [ ] **PageData 数据结构** — 替换 `TotalPageData`，Store 仅存储当前页数据和缓存 Map。移除 `sections` 数组概念。
- [ ] **页面内存缓存** — `Map<number, PageData>` 缓存已加载页面。切换到已缓存页面时直接使用缓存数据。
- [ ] **总条目数显示** — 从 `meta.total` 获取并显示 "共 X 张"。位置在分页条左侧或 SearchBar 区域。
- [ ] **收藏状态数据库计算** — `is_favorite` 字段由 SQLite 查询返回。移除前端 `favoriteIds` Set 计算（仅针对在线壁纸页面）。
- [ ] **我的收藏页面无限滚动** — SQLite LIMIT/OFFSET 分页查询，滚动到底部加载更多。侧边栏数目响应式更新。

### Add After Validation (v6.x)

验证核心功能后的增强特性。

- [ ] **键盘快捷键导航** — 左右方向键翻页。需要在 Pagination 组件或页面级别监听 keydown 事件。
- [ ] **分页条可配置** — 每页显示数量可配置（需要 API 支持，当前 Wallhaven API 固定 24 张/页，暂不可配置）。
- [ ] **页面预加载** — 鼠标悬停页码时预加载该页数据。需要谨慎处理，避免过多请求。

### Future Consideration (v7+)

后续里程碑考虑的功能。

- [ ] **URL 参数同步** — 页码、搜索条件同步到 URL，支持分享和书签。需要处理前进/后退按钮。
- [ ] **高级分页模式** — 跳转到第一页/最后一页按钮，页码输入框直接跳转。
- [ ] **分页历史记录** — 记录用户浏览过的页面，便于回溯。

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Pagination 组件 | HIGH | MEDIUM (新组件 + 样式) | P0 |
| OnlineWallpaper 集成 | HIGH | MEDIUM (移除无限滚动 + 接入分页) | P0 |
| PageData 替换 TotalPageData | HIGH | MEDIUM (Store + Composable 重构) | P0 |
| 页面内存缓存 | MEDIUM | LOW (Map 数据结构 + 缓存失效) | P0 |
| 总条目数显示 | LOW | LOW (UI 显示) | P0 |
| 收藏状态数据库计算 | MEDIUM | MEDIUM (查询修改 + 接口变更) | P0 |
| 我的收藏无限滚动 | MEDIUM | MEDIUM (SQLite 分页 + UI 更新) | P0 |
| 键盘快捷键导航 | LOW | LOW (event listener) | P1 |
| 页面预加载 | LOW | MEDIUM (预加载逻辑 + 请求控制) | P2 |
| URL 参数同步 | MEDIUM | HIGH (路由 + 状态同步) | P2 |

**Priority key:**
- P0: Must have for launch (核心功能，用户可见变化)
- P1: Should have for this milestone (提升体验)
- P2: Nice to have, defer to next milestone

## User Experience Considerations

### 在线壁纸页面

**Before (无限滚动):**
```
用户搜索 → 首屏 24 张 → 滚动到底部 → 自动加载下一页 → 数据累积显示
```

**After (传统分页):**
```
用户搜索 → 首屏 24 张 + 分页条 → 点击页码 → 切换到新页面（滚动到顶部）→ 显示新数据
```

**用户体验变化:**
- ✅ 用户明确知道总页数和当前位置
- ✅ 可以快速跳转到任意页面
- ✅ 页面切换时滚动到顶部，不会迷失位置
- ⚠️ 不再有"无尽浏览"的沉浸感（但这是明确的产品决策）

### 我的收藏页面

**Before (全量显示):**
```
进入页面 → 加载全部收藏 → computed 过滤 → 全部显示
```

**After (无限滚动分页):**
```
进入页面 → 加载首批 24 张 → 滚动到底部 → 加载下一批 → 累积显示
```

**用户体验变化:**
- ✅ 大量收藏时首屏加载更快
- ✅ 内存占用更可控（不再一次性加载全部数据）
- ⚠️ 需要滚动才能看到全部收藏（但这是标准分页体验）

### 分页条设计

```
┌─────────────────────────────────────────────────────────────┐
│  共 288 张                                                    │
│                                                              │
│  [上一页]  [1]  [2]  [3]  ...  [10]  [11]  [12]  [下一页]      │
│            ^^^                                              │
│         当前页                                               │
└─────────────────────────────────────────────────────────────┘
```

**页码显示规则:**
- 总页数 ≤ 7: 显示全部页码
- 总页数 > 7: 显示首页 + 当前页 ± 2 + 尾页，中间用省略号
- 示例 (当前第 5 页，共 20 页): `1 ... 3 4 [5] 6 7 ... 20`

## Data Structure Changes

### 现有数据结构

```typescript
// 当前: TotalPageData (用于无限滚动累积)
interface TotalPageData {
  totalPage: number
  currentPage: number
  sections: PageData[]  // 累积的页面数据
}

interface PageData {
  totalPage: number
  currentPage: number
  data: WallpaperItem[]
}
```

### 新数据结构

```typescript
// 新增: PageCache (内存缓存)
type PageCache = Map<number, PageData>

// Store 状态
interface WallpaperStoreState {
  currentPageData: PageData | null       // 当前页数据
  pageCache: PageCache                   // 已加载页面缓存
  totalItems: number                     // 总条目数 (从 meta.total 获取)
  totalPage: number                      // 总页数
  currentPage: number                    // 当前页码
  loading: boolean
  error: boolean
  queryParams: GetParams | null          // 搜索条件变化时清空缓存
}
```

### 收藏状态查询变更

```typescript
// 当前: 前端计算收藏状态
const favoriteIds = computed(() => new Set(favorites.value.map(f => f.wallpaperId)))

// 新增: 数据库查询返回 is_favorite
interface WallpaperItemWithFavorite extends WallpaperItem {
  is_favorite: boolean
}

// SQLite 查询 (伪代码)
SELECT
  w.*,
  CASE WHEN f.wallpaper_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite
FROM wallhaven_response w
LEFT JOIN favorites f ON w.id = f.wallpaper_id
```

## Sources

- 现有代码库分析:
  - `src/views/OnlineWallpaper.vue` — 无限滚动实现，scroll event listener
  - `src/composables/wallpaper/useWallpaperList.ts` — fetch/loadMore 方法，TotalPageData 使用
  - `src/stores/modules/wallpaper/index.ts` — Store 状态定义
  - `src/components/WallpaperList.vue` — sections 数组渲染逻辑
  - `src/views/FavoritesPage.vue` — 全量收藏显示，filteredFavorites computed
  - `src/types/index.ts` — PageData, TotalPageData 类型定义
  - `.planning/PROJECT.md` — v6.0 milestone 目标定义
- 分页 UI 模式研究:
  - Wallhaven 官网分页条设计
  - Google 搜索分页条设计
  - GitHub Issues 分页条设计
- SQLite 分页最佳实践:
  - `LIMIT 24 OFFSET ?` 模式
  - 索引优化 `CREATE INDEX idx_favorites_wallpaper_id ON favorites(wallpaper_id)`
  - `COUNT(*) OVER()` 窗口函数获取总数（可选）

---
*Feature research for: v6.0 传统分页重构*
*Researched: 2026-05-04*
