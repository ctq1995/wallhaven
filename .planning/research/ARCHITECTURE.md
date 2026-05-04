# Architecture Research: 传统分页重构

**Domain:** Wallhaven 壁纸浏览器 — 在线壁纸页面传统分页 + 我的收藏页面无限滚动分页
**Researched:** 2026-05-04
**Confidence:** HIGH

## Executive Summary

本文档分析传统分页功能如何与现有分层架构集成。v6.0 里程碑的核心变更是：
1. **在线壁纸页面**：从无限滚动改为传统分页条，内存缓存已加载页面
2. **我的收藏页面**：实现无限滚动分页，使用 SQLite LIMIT/OFFSET 查询
3. **收藏状态计算**：从渲染层移至 Service 层，API 返回时附加 `is_favorite` 字段

**架构原则：** 保持现有 5 层架构不变，仅在各层添加分页相关逻辑。数据流仍遵循 View → Composable → Service → Repository → Client 的单向流动。

---

## 现有架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     View Layer                                   │
│  (OnlineWallpaper, FavoritesPage)                               │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Composable Layer                                │
│  (useWallpaperList, useFavorites, useCollections)               │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Service Layer                                  │
│  (WallpaperService, FavoritesService, CollectionsService)       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Repository Layer                                 │
│  (WallpaperRepository, FavoritesRepository)                     │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Client Layer                                  │
│  (ElectronClient, ApiClient)                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 当前分页实现分析

### 在线壁纸页面（当前：无限滚动）

**数据结构：**
```typescript
// types/index.ts
interface PageData {
  totalPage: number
  currentPage: number
  data: WallpaperItem[]
}

interface TotalPageData {
  totalPage: number
  currentPage: number
  sections: PageData[]  // 每个 section 代表一个已加载的页面
}
```

**当前流程：**
1. `useWallpaperList.fetch()` — 获取首页，存入 `store.totalPageData.sections[0]`
2. `useWallpaperList.loadMore()` — 获取下一页，append 到 `sections`
3. `WallpaperList.vue` — 渲染所有 sections（无限滚动）
4. `OnlineWallpaper.vue` — 监听滚动事件，触发 `loadMore()`

**收藏状态计算：**
- 当前在 **渲染层** 计算：`OnlineWallpaper.vue` 构建 `wallpaperCollectionMap`
- 传入 `WallpaperList.vue` 作为 prop
- `WallpaperList.vue` 调用 `getHeartState()` 计算三态颜色

### 我的收藏页面（当前：无分页）

**数据结构：**
```typescript
// FavoritesPage.vue
const filteredFavorites = computed(() => {
  if (!selectedCollectionId.value) {
    // 全部收藏 — 去重
    const seen = new Set<string>()
    return favorites.value
      .slice()
      .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
      .filter((f) => {
        if (seen.has(f.wallpaperId)) return false
        seen.add(f.wallpaperId)
        return true
      })
  }
  return favorites.value
    .filter((f) => f.collectionId === selectedCollectionId.value)
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
})
```

**当前问题：**
- 一次性加载所有收藏项到内存
- 大量收藏时性能下降
- 侧边栏计数需要额外查询

---

## 目标架构设计

### 1. 在线壁纸页面 — 传统分页条

#### 数据结构变更

```typescript
// types/index.ts — PageData 新增 total 字段
interface PageData {
  totalPage: number
  currentPage: number
  data: WallpaperItem[]
  total?: number  // 新增：总条目数（用于显示"共 X 张"）
}

// WallpaperStore 结构变更
interface OnlineWallpaperState {
  // 替换 TotalPageData
  currentPageData: shallowRef<PageData | null>  // 当前页数据
  pageCache: Map<number, PageData>              // 页面缓存（composable 管理）

  // 分页状态
  currentPage: number
  totalPage: number
  total: number  // 总条目数

  // 其他保持不变
  loading: Ref<boolean>
  error: Ref<boolean>
  queryParams: Ref<GetParams | null>
  savedParams: Ref<CustomParams | null>
  settings: Reactive<AppSettings>
}
```

#### 各层职责

| 层级 | 职责 | 修改内容 |
|------|------|----------|
| **View** | 显示分页条 UI，响应页码点击 | `OnlineWallpaper.vue` 添加 `PaginationBar` 组件，移除滚动监听 |
| **Composable** | 管理分页状态，缓存逻辑 | `useWallpaperList` 新增 `goToPage()`, `pageCache` |
| **Service** | 调用 API，添加 is_favorite 字段 | `WallpaperService.search()` 返回带 `is_favorite` 的数据 |
| **Repository** | 无变更 | - |
| **Client** | 无变更 | - |

#### 页面缓存策略

```typescript
// useWallpaperList.ts
const pageCache = ref(new Map<number, PageData>())

const fetch = async (params: GetParams | null): Promise<boolean> => {
  // ... 现有逻辑

  // 清空缓存，缓存首页
  pageCache.value.clear()
  pageCache.value.set(1, pageData)
  store.currentPageData = pageData
  store.currentPage = 1
  store.totalPage = pageData.totalPage
  store.total = pageData.total || 0
}

const goToPage = async (page: number): Promise<boolean> => {
  // 1. 边界检查
  if (page < 1 || page > store.totalPage) return false

  // 2. 检查缓存
  if (pageCache.value.has(page)) {
    store.currentPageData = pageCache.value.get(page)!
    store.currentPage = page
    return true
  }

  // 3. 请求新页面
  store.loading = true
  const params = { ...store.queryParams, page }
  const result = await wallpaperService.search(params)

  if (result.success) {
    const pageData = toPageData(result.data!)
    pageCache.value.set(page, pageData)
    store.currentPageData = pageData
    store.currentPage = page
  }

  store.loading = false
  return result.success
}
```

#### 缓存失效条件

| 条件 | 行为 |
|------|------|
| 新搜索 | 清空整个缓存，重新获取首页 |
| 参数变更 | 清空缓存，重新获取首页 |
| 收藏/取消收藏 | **不重新请求** — 更新本地缓存中的 `is_favorite` 字段 |

---

### 2. 我的收藏页面 — 无限滚动分页

#### SQLite 分页查询

```sql
-- favorites.handler.ts 新增
SELECT
  f.collection_id,
  f.wallpaper_id,
  f.wallpaper_data,
  f.added_at
FROM favorites f
WHERE :collectionId IS NULL OR f.collection_id = :collectionId
ORDER BY f.added_at DESC
LIMIT :limit OFFSET :offset
```

#### 各层职责

| 层级 | 职责 | 修改内容 |
|------|------|----------|
| **View** | 滚动加载，显示已加载数据 | `FavoritesPage.vue` 添加滚动监听 |
| **Composable** | 管理分页状态，触发加载 | `useFavorites` 新增 `loadMore()`, `hasMore` |
| **Service** | 缓存已加载数据 | `FavoritesService` 添加分页逻辑 |
| **Repository** | 调用分页 IPC | `FavoritesRepository` 新增 `getFavoritesPaginated()` |
| **Client** | 调用 IPC | `ElectronClient` 新增 `favoritesGetPaginated()` |
| **Handler** | SQL 分页查询 | `favorites.handler.ts` 新增 handler |

#### IPC 通道设计

```typescript
// 新增 IPC 通道
'favorites-get-paginated': {
  collectionId?: string
  limit: number    // 每页条数，默认 24
  offset: number   // 偏移量
}

// 返回结构
interface PaginatedFavoritesResult {
  items: FavoriteItem[]
  total: number      // 总条目数
  hasMore: boolean   // 是否有更多
}
```

#### 侧边栏计数响应式更新

当前问题：`CollectionSidebar.vue` 显示的计数需要手动刷新

解决方案：
```typescript
// favorites.handler.ts 新增
'favorites-get-counts': {
  // 返回 { [collectionId: string]: number } 映射
}

// useCollections.ts
const counts = ref<Map<string, number>>(new Map())

const loadCounts = async () => {
  const result = await favoritesRepository.getCounts()
  if (result.success) {
    counts.value = new Map(Object.entries(result.data))
  }
}

// 添加/移除收藏后自动刷新
const add = async (...) => {
  await favoritesService.add(...)
  await loadCounts()  // 刷新计数
}
```

---

### 3. is_favorite 字段计算

#### 当前实现（渲染层）

```typescript
// OnlineWallpaper.vue
const wallpaperCollectionMap = computed(() => {
  const map = new Map<string, string[]>()
  for (const fav of favorites.value) {
    const ids = map.get(fav.wallpaperId)
    if (ids) ids.push(fav.collectionId)
    else map.set(fav.wallpaperId, [fav.collectionId])
  }
  return map
})

// WallpaperList.vue
const heartState = (id: string): HeartState => {
  return getHeartState(id, props.defaultCollectionId, props.wallpaperCollectionMap)
}
```

#### 目标实现（Service 层）

**方案：Service 层后处理**

```typescript
// WallpaperService.search()
async search(params: GetParams | null): Promise<IpcResponse<WallpaperSearchResult>> {
  // 1. 调用 API
  const result = await apiClient.get<WallpaperSearchResult>('/search', filteredParams, apiKey)

  if (result.success && result.data) {
    // 2. 获取所有收藏的 wallpaper ID（使用缓存的 Set）
    const favoriteIds = await this.getFavoriteIds()

    // 3. 为每个壁纸添加 is_favorite 字段
    const dataWithFavorite = result.data.data.map(item => ({
      ...item,
      is_favorite: favoriteIds.has(item.id)
    }))

    return {
      success: true,
      data: {
        data: dataWithFavorite,
        meta: result.data.meta
      }
    }
  }

  return result
}

// 使用 FavoritesService 的缓存
private async getFavoriteIds(): Promise<Set<string>> {
  // 复用 FavoritesService 的内存缓存
  const result = await favoritesService.getAll()
  if (result.success && result.data) {
    return new Set(result.data.map(f => f.wallpaperId))
  }
  return new Set()
}
```

#### 类型定义更新

```typescript
// types/index.ts
interface WallpaperItem {
  // ... 现有字段
  is_favorite?: boolean  // 新增：收藏状态
}
```

---

## 数据流图

### 在线壁纸 — 传统分页

```
┌──────────────────────────────────────────────────────────────────┐
│  User clicks page number                                          │
│      ↓                                                            │
│  OnlineWallpaper.vue                                              │
│  └── useWallpaperList.goToPage(page)                             │
│      ├── Check pageCache.has(page) → HIT: update store, return   │
│      └── MISS:                                                    │
│          └── WallpaperService.search({ ...params, page })        │
│              └── ApiClient.get('/search', { page })              │
│                  └── API returns { data, meta }                  │
│              └── Add is_favorite to each item                    │
│              └── Return WallpaperSearchResult                    │
│          └── Store in pageCache.set(page, data)                  │
│          └── Update store.currentPageData                        │
│      ↓                                                            │
│  WallpaperList.vue                                                │
│  └── Renders currentPageData.data                                │
│  PaginationBar.vue                                                │
│  └── Shows page numbers, total count                             │
└──────────────────────────────────────────────────────────────────┘
```

### 我的收藏 — 无限滚动

```
┌──────────────────────────────────────────────────────────────────┐
│  User scrolls near bottom                                         │
│      ↓                                                            │
│  FavoritesPage.vue                                                │
│  └── scrollListener triggers                                     │
│      └── useFavorites.loadMore()                                 │
│          ├── Check hasMore → false: return                       │
│          └── FavoritesService.getPaginated(offset, limit)        │
│              └── FavoritesRepository.getFavoritesPaginated()     │
│                  └── ElectronClient.favoritesGetPaginated()      │
│                      └── IPC: 'favorites-get-paginated'          │
│                          └── SQLite: LIMIT/OFFSET query          │
│                              └── Return { items, total, hasMore }│
│          └── Append items to store.favorites                     │
│          └── Update store.hasMore                                │
│      ↓                                                            │
│  FavoriteWallpaperCard.vue                                        │
│  └── Renders new items                                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 集成点清单

### 在线壁纸页面

| 组件 | 类型 | 说明 |
|------|------|------|
| `OnlineWallpaper.vue` | 修改 | 添加 `PaginationBar`，移除滚动监听 |
| `useWallpaperList.ts` | 修改 | 添加 `goToPage()`, `pageCache` |
| `WallpaperService.ts` | 修改 | 添加 is_favorite 后处理 |
| `WallpaperStore` | 修改 | 替换 `totalPageData` 为 `currentPageData` + `pageCache` |
| `PaginationBar.vue` | **新增** | 分页条组件 |
| `types/index.ts` | 修改 | `WallpaperItem` 添加 `is_favorite?` |

### 我的收藏页面

| 组件 | 类型 | 说明 |
|------|------|------|
| `FavoritesPage.vue` | 修改 | 添加滚动监听，分页显示 |
| `useFavorites.ts` | 修改 | 添加 `loadMore()`, `hasMore` |
| `FavoritesService.ts` | 修改 | 添加分页方法 |
| `FavoritesRepository.ts` | 修改 | 添加分页 IPC 调用 |
| `ElectronClient.ts` | 修改 | 添加 `favoritesGetPaginated()` |
| `favorites.handler.ts` | 修改 | 添加分页 SQL handler |
| `useCollections.ts` | 修改 | 添加响应式计数 |

---

## 构建顺序

考虑依赖关系，建议按以下顺序实施：

### Phase 1: 基础设施
1. `types/index.ts` — 添加 `is_favorite` 字段
2. `favorites.handler.ts` — 添加分页和计数 handlers
3. `ElectronClient.ts` — 添加新 IPC 调用

### Phase 2: Repository & Service
4. `FavoritesRepository.ts` — 添加分页方法
5. `FavoritesService.ts` — 添加分页逻辑
6. `WallpaperService.ts` — 添加 is_favorite 后处理

### Phase 3: Composable & Store
7. `WallpaperStore` — 替换数据结构
8. `useWallpaperList.ts` — 添加分页逻辑
9. `useFavorites.ts` — 添加无限滚动逻辑
10. `useCollections.ts` — 添加响应式计数

### Phase 4: View 层
11. `PaginationBar.vue` — 新建分页条组件
12. `OnlineWallpaper.vue` — 集成分页条
13. `FavoritesPage.vue` — 添加无限滚动
14. `CollectionSidebar.vue` — 响应式计数

---

## 风险与缓解

### 风险 1：Store 数据结构变更导致响应式断裂

**缓解：**
- 保留 `TotalPageData` 类型兼容性
- 使用计算属性桥接新旧结构
- 分阶段迁移，每阶段可独立验证

### 风险 2：is_favorite 状态同步延迟

**缓解：**
- 收藏操作后立即更新本地缓存中的 `is_favorite`
- 使用 Service 层的 `clearCache()` 确保下次请求获取最新数据
- `FavoritesService` 的内存缓存确保 `favoriteIds` 实时更新

### 风险 3：大量收藏时首次加载慢

**缓解：**
- 使用 LIMIT 24 分页
- 侧边栏计数使用独立 SQL 查询（不加载全部数据）
- 首屏加载仅请求第一页

### 风险 4：分页条组件 UI 状态管理

**缓解：**
- 参考现有组件风格（SearchBar、Alert）
- 使用 CSS 变量保持一致性
- 边界状态（首页/末页）禁用按钮

---

## 模式与反模式

### 模式 1：Service 层数据后处理

**何时使用：** API 返回数据需要与本地状态合并时

**示例：**
```typescript
// WallpaperService.search()
const dataWithFavorite = result.data.data.map(item => ({
  ...item,
  is_favorite: favoriteIds.has(item.id)
}))
```

**好处：**
- View 层保持纯粹，不处理数据转换
- 收藏逻辑集中在一处
- 便于测试和调试

### 模式 2：Composable 层缓存管理

**何时使用：** 需要跨页面保持数据缓存时

**示例：**
```typescript
// useWallpaperList.ts
const pageCache = ref(new Map<number, PageData>())

const goToPage = async (page: number) => {
  if (pageCache.value.has(page)) {
    return pageCache.value.get(page)!
  }
  // ... 请求并缓存
}
```

**好处：**
- 避免重复请求
- 用户体验流畅
- 内存可控（仅缓存已访问页面）

### 反模式 1：在 View 层处理数据转换

**问题：**
```typescript
// ❌ 错误：在组件中处理 is_favorite
const wallpaperWithFavorite = computed(() =>
  wallpapers.value.map(w => ({
    ...w,
    is_favorite: favoriteIds.value.has(w.id)
  }))
)
```

**正确做法：** 在 Service 层处理，View 层仅渲染

### 反模式 2：Store 中存储所有分页数据

**问题：**
```typescript
// ❌ 错误：Store 存储所有页面
interface Store {
  allPages: Map<number, PageData>  // 可能无限增长
}
```

**正确做法：** Composable 管理缓存，Store 仅存当前页

---

## 验收标准

### 在线壁纸页面
- [ ] 显示传统分页条（页码导航）
- [ ] 显示总条目数（"共 X 张"）
- [ ] 点击页码可跳转到对应页面
- [ ] 已访问页面有缓存，不重复请求
- [ ] 收藏状态正确显示（三态心形）
- [ ] 收藏操作后状态正确同步

### 我的收藏页面
- [ ] 支持无限滚动分页
- [ ] 侧边栏收藏数目实时更新
- [ ] 滚动到底部自动加载更多
- [ ] 加载完成显示"没有更多"

---

## Sources

- 现有代码分析：`useWallpaperList.ts`, `useFavorites.ts`, `WallpaperService.ts`, `FavoritesService.ts`, `favorites.handler.ts`
- 类型定义：`types/index.ts`, `types/favorite.ts`
- 架构文档：`.planning/codebase/ARCHITECTURE.md`

---

*Architecture research for: v6.0 传统分页重构*
*Researched: 2026-05-04*
