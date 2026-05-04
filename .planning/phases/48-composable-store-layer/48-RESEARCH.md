# Phase 48: Composable & Store Layer — Research

**Created:** 2026-05-04
**Status:** Research complete, ready for planning

---

## 研究目标

回答："What do I need to know to PLAN this phase well?"

**研究重点领域：**
1. PageCache 缓存策略
2. 分页状态管理
3. 响应式计数
4. Composable 方法设计
5. 数据同步策略

---

## 1. PageCache 缓存策略

### 1.1 现有缓存模式分析

**WallpaperService 缓存模式** (`src/services/wallpaper.service.ts`):
```typescript
// 使用 Map<string, CacheItem> 实现 5 分钟 TTL 缓存
private cache = new Map<string, CacheItem>()
private readonly CACHE_TTL = 5 * 60 * 1000
private readonly MAX_CACHE_SIZE = 50

// FIFO 淘汰策略
if (this.cache.size >= this.MAX_CACHE_SIZE) {
  const firstKey = this.cache.keys().next().value
  if (firstKey) this.cache.delete(firstKey)
}
```

**关键发现：**
- 现有模式使用 Map 存储 + FIFO 淘汰
- 使用 `shallowRef` 包装大数据结构已验证可行（WallpaperStore.totalPageData）
- 5 分钟 TTL 对于在线壁纸页面合理，但分页缓存建议使用更简单的"条件清空"策略

### 1.2 PageCache 实现方案

**CONTEXT.md 决策 D-01~D-03：**
- `shallowRef<Map<number, PageData>>` 包装
- 缓存上限 5 页（FIFO 淘汰）
- 搜索条件变更时清空

**实现建议：**

```typescript
// WallpaperStore 新增字段
const pageCache = shallowRef<PageCache>(new Map())
const currentPageData = shallowRef<PageData>({ data: [], totalPage: 0, currentPage: 0 })
const totalCount = ref(0)

// 缓存操作方法
function getCachedPage(page: number): PageData | undefined {
  return pageCache.value.get(page)
}

function setCachedPage(page: number, data: PageData): void {
  // FIFO 淘汰：超过 5 页时删除最旧的
  if (pageCache.value.size >= 5 && !pageCache.value.has(page)) {
    const firstKey = pageCache.value.keys().next().value
    if (firstKey) pageCache.value.delete(firstKey)
  }
  pageCache.value.set(page, data)
}

function clearPageCache(): void {
  pageCache.value.clear()
}
```

### 1.3 关键问题与答案

| 问题 | 答案 |
|------|------|
| Vue 响应式能否追踪 Map 内部变化？ | 不能。需要使用 `shallowRef` + 整体替换触发更新 |
| 如何避免频繁创建新 Map？ | 使用 `map.set()` 后，赋值 `pageCache.value = pageCache.value` 触发响应式 |
| 搜索条件如何检测变化？ | 使用 `queryParams` 引用比较或 JSON.stringify 深度比较 |

---

## 2. 分页状态管理

### 2.1 WallpaperStore 现状与目标

**当前状态：**
```typescript
// src/stores/modules/wallpaper/index.ts
const totalPageData = shallowRef<TotalPageData>({
  totalPage: 0,
  currentPage: 0,
  sections: [],  // 累积所有页面的数据
})
```

**目标状态（根据 D-05~D-06）：**
```typescript
const currentPageData = shallowRef<PageData>({
  data: [],        // 仅当前页数据
  totalPage: 0,
  currentPage: 0,
})
const pageCache = shallowRef<PageCache>(new Map())  // 页码 → PageData
const totalCount = ref(0)  // 总条目数，用于显示 "共 X 张"
```

**迁移影响：**
- 移除 `totalPageData` 字段
- 移除 `sections` 累积逻辑
- 新增 `currentPageData`, `pageCache`, `totalCount` 字段

### 2.2 FavoritesStore 现状与目标

**当前状态：**
```typescript
// src/stores/modules/favorites/index.ts
const favorites = ref<FavoriteItem[]>([])  // 全量加载
const collections = ref<Collection[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
```

**目标状态（根据 D-07~D-09）：**
```typescript
const currentPageData = shallowRef<PageData>({ ... })
const pageCache = shallowRef<PageCache>(new Map())
const totalCount = ref(0)
const currentCollectionId = ref<string | null>(null)  // 当前筛选的收藏夹
const counts = ref<Record<string, number>>({ _total: 0 })  // 收藏计数

// 保留现有字段用于其他用途
const favorites = ref<FavoriteItem[]>([])  // 可能用于兼容性
const collections = ref<Collection[]>([])
```

### 2.3 状态初始化与重置

**工厂函数模式（现有）：**
```typescript
// 现有 WallpaperStore 使用内联初始化
function resetState(): void {
  totalPageData.value = { totalPage: 0, currentPage: 0, sections: [] }
  queryParams.value = null
  error.value = false
}
```

**建议保持一致的模式：**
```typescript
function createEmptyPageData(): PageData {
  return { data: [], totalPage: 0, currentPage: 0 }
}

function resetPaginationState(): void {
  currentPageData.value = createEmptyPageData()
  pageCache.value = new Map()
  totalCount.value = 0
}
```

---

## 3. 响应式计数

### 3.1 现有计数实现

**FavoritesStore：**
```typescript
// 当前使用 computed 从 favorites 数组计算
const favoriteIds = computed(() => new Set(favorites.value.map(f => f.wallpaperId)))
const uniqueWallpaperCount = computed(() => favoriteIds.value.size)

function getCollectionCount(collectionId: string): number {
  return favorites.value.filter(f => f.collectionId === collectionId).length
}
```

**问题：**
- 需要加载全量数据才能计算计数
- 每次调用 `getCollectionCount()` 都需要遍历数组

### 3.2 新计数方案

**Phase 47 已实现：**
```typescript
// favoritesRepository.getCounts() 返回
// { _total: 123, [collectionId]: 45, ... }
```

**Store 集成（D-10~D-13）：**
```typescript
// FavoritesStore 新增
const counts = ref<Record<string, number>>({ _total: 0 })

async function loadCounts(): Promise<void> {
  const result = await favoritesRepository.getCounts()
  if (result.success && result.data) {
    counts.value = result.data
  }
}

// Computed 暴露
const uniqueWallpaperCount = computed(() => counts.value._total ?? 0)
const getCollectionCount = (id: string) => counts.value[id] ?? 0
```

### 3.3 计数更新时机

| 操作 | 触发方法 | 计数更新 |
|------|----------|----------|
| 添加收藏 | `useFavorites.add()` | 调用 `store.loadCounts()` |
| 移除收藏 | `useFavorites.remove()` | 调用 `store.loadCounts()` |
| 移动收藏 | `useFavorites.move()` | 计数不变（同壁纸） |
| 删除收藏夹 | `useCollections.delete()` | 调用 `store.loadCounts()` |
| 应用初始化 | `main.ts` | 与 `loadAll()` 一起调用 |

**关键问题：**
- 是否需要在 `loadCounts()` 前清空 `counts.value`？建议不需要，保持旧值直到新值返回
- 是否需要防抖？当前不需要，操作频率低

---

## 4. Composable 方法设计

### 4.1 useWallpaperList 现状

**当前方法：**
```typescript
interface UseWallpaperListReturn {
  wallpapers: ComputedRef<TotalPageData>
  loading: ComputedRef<boolean>
  error: ComputedRef<boolean>
  queryParams: ComputedRef<GetParams | null>
  savedParams: ComputedRef<CustomParams | null>

  fetch: (params: GetParams | null) => Promise<boolean>
  loadMore: () => Promise<boolean>  // 无限滚动加载更多
  reset: () => void
  saveCustomParams: (params: CustomParams) => Promise<boolean>
  loadSavedParams: () => Promise<CustomParams | null>
}
```

### 4.2 目标方法（D-14~D-15）

```typescript
interface UseWallpaperListReturn {
  // 状态（ComputedRef）
  currentPageData: ComputedRef<PageData>
  totalCount: ComputedRef<number>
  loading: ComputedRef<boolean>
  error: ComputedRef<boolean>
  queryParams: ComputedRef<GetParams | null>
  savedParams: ComputedRef<CustomParams | null>

  // 方法
  goToPage: (page: number) => Promise<boolean>  // 新增：跳转到指定页
  refresh: () => Promise<boolean>                // 新增：刷新当前页
  clearCache: () => void                         // 新增：清空缓存
  reset: () => void
  saveCustomParams: (params: CustomParams) => Promise<boolean>
  loadSavedParams: () => Promise<CustomParams | null>

  // 移除 fetch 和 loadMore（用 goToPage 替代）
}
```

### 4.3 goToPage 实现逻辑

```typescript
async function goToPage(page: number): Promise<boolean> {
  // 1. 边界检查
  if (page < 1 || (totalCount.value > 0 && page > totalPages.value)) {
    return false
  }

  // 2. 检查缓存
  const cached = store.pageCache.get(page)
  if (cached) {
    store.currentPageData = cached
    return true
  }

  // 3. 从 API 加载
  store.loading = true
  const params = { ...store.queryParams, page }
  const result = await wallpaperService.search(params)

  if (result.success && result.data) {
    const pageData: PageData = {
      data: result.data.data,
      totalPage: result.data.meta.last_page,
      currentPage: result.data.meta.current_page,
    }
    store.pageCache.set(page, pageData)
    store.currentPageData = pageData
    store.totalCount = result.data.meta.total
    store.loading = false
    return true
  }

  store.error = true
  store.loading = false
  return false
}
```

### 4.4 useFavorites 现状与目标

**当前方法：**
```typescript
interface UseFavoritesReturn {
  favorites: ComputedRef<FavoriteItem[]>
  favoriteIds: ComputedRef<Set<string>>
  loading: ComputedRef<boolean>
  // ... 其他方法
}
```

**目标方法（D-16）：**
```typescript
interface UseFavoritesReturn {
  // 分页状态
  currentPageData: ComputedRef<PageData>
  totalCount: ComputedRef<number>
  currentCollectionId: ComputedRef<string | null>
  hasMore: ComputedRef<boolean>  // 是否有更多数据
  loading: ComputedRef<boolean>

  // 计数
  counts: ComputedRef<Record<string, number>>
  uniqueWallpaperCount: ComputedRef<number>

  // 分页方法
  goToPage: (page: number, collectionId?: string) => Promise<boolean>
  refresh: () => Promise<boolean>
  clearCache: () => void
  loadCounts: () => Promise<void>  // 新增：加载计数

  // 收藏操作（修改后触发计数更新）
  add: (wallpaperId: string, collectionId: string, wallpaperData: WallpaperItem) => Promise<boolean>
  remove: (wallpaperId: string, collectionId: string) => Promise<boolean>
  // ...
}
```

---

## 5. 数据同步策略

### 5.1 收藏操作后的数据更新

**CONTEXT.md D-18~D-19：**
- 收藏/取消收藏后更新 `currentPageData` 中对应项的 `is_favorite` 字段
- 不清空缓存

**实现方案：**

```typescript
// useFavorites.add() 成功后
async function add(wallpaperId: string, collectionId: string, wallpaperData: WallpaperItem): Promise<boolean> {
  const result = await favoritesService.add(wallpaperId, collectionId, wallpaperData)
  if (result.success) {
    // 1. 更新计数
    await loadCounts()

    // 2. 更新当前页数据的 is_favorite
    updateFavoriteStatus(wallpaperId, collectionId, true)

    showSuccess('已添加到收藏')
    return true
  }
  showError(result.error?.message || '添加收藏失败')
  return false
}

function updateFavoriteStatus(wallpaperId: string, collectionId: string, isAdd: boolean): void {
  // 找到当前页中的壁纸
  const items = store.currentPageData.data
  const index = items.findIndex(item => item.id === wallpaperId)
  if (index === -1) return

  // 获取默认收藏夹 ID
  const defaultCollection = store.collections.find(c => c.isDefault)

  // 更新 is_favorite 状态
  // 0=未收藏, 1=默认收藏夹, 2=其他收藏夹
  if (isAdd) {
    items[index].is_favorite = (collectionId === defaultCollection?.id) ? 1 : 2
  } else {
    // 移除时需要检查是否还在其他收藏夹中
    // 简化处理：设为 0（实际应检查其他收藏夹）
    items[index].is_favorite = 0
  }

  // 触发响应式更新
  store.currentPageData = { ...store.currentPageData }
}
```

### 5.2 is_favorite 三态更新复杂性

**问题：**
- `is_favorite` 有三个值：0（未收藏）、1（默认收藏夹）、2（其他收藏夹）
- 移除收藏时，如果壁纸还在其他收藏夹中，状态需要更新而非直接置 0

**解决方案：**
1. **简化方案（推荐）：** 操作后重新查询该壁纸的状态
2. **完整方案：** 维护所有收藏夹状态，计算最终值

```typescript
async function updateFavoriteStatus(wallpaperId: string): Promise<void> {
  const items = store.currentPageData.data
  const index = items.findIndex(item => item.id === wallpaperId)
  if (index === -1) return

  // 重新查询该壁纸的收藏状态
  const result = await favoritesRepository.getFavoriteStatusMap([wallpaperId])
  if (result.success && result.data) {
    items[index].is_favorite = result.data[wallpaperId] ?? 0
    store.currentPageData = { ...store.currentPageData }
  }
}
```

### 5.3 搜索条件变更时清空缓存

**触发时机：**
- `goToPage()` 时检测到 `queryParams` 变化
- 用户主动触发新搜索

**实现：**
```typescript
async function search(params: GetParams | null): Promise<boolean> {
  // 检测搜索条件是否变化
  const isParamsChanged = !isEqual(store.queryParams, params)

  if (isParamsChanged) {
    clearCache()
    store.queryParams = params
  }

  return goToPage(1)
}

function isEqual(a: GetParams | null, b: GetParams | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
```

---

## 6. 与 Phase 47 的集成点

### 6.1 已实现的可依赖项

| 方法 | 位置 | 用途 |
|------|------|------|
| `favoritesRepository.getFavoritesPaginated()` | Repository 层 | 分页获取收藏项 |
| `favoritesRepository.getCounts()` | Repository 层 | 获取收藏计数 |
| `favoritesRepository.getFavoriteStatusMap()` | Repository 层 | 批量获取收藏状态 |
| `wallpaperService.search()` | Service 层 | 已注入 `is_favorite` |

### 6.2 数据流确认

```
useWallpaperList.goToPage(page)
    ↓
wallpaperService.search({ ...params, page })
    ↓
favoritesRepository.getFavoriteStatusMap(wallpaperIds)
    ↓
返回带 is_favorite 的 WallpaperItem[]
    ↓
存入 WallpaperStore.pageCache
```

```
useFavorites.goToPage(page, collectionId)
    ↓
favoritesRepository.getFavoritesPaginated({ limit: 24, offset: (page-1)*24, collectionId })
    ↓
返回 PaginatedFavoritesResult { items, total, hasMore }
    ↓
转换为 PageData 存入 FavoritesStore.pageCache
```

---

## 7. 边界情况与错误处理

### 7.1 并发请求处理

**问题：** 用户快速点击分页按钮可能触发多个并发请求

**解决方案：**
```typescript
// 使用请求锁或 AbortController
let currentRequestId = 0

async function goToPage(page: number): Promise<boolean> {
  const requestId = ++currentRequestId
  store.loading = true

  const result = await wallpaperService.search({ ...params, page })

  // 忽略过期的请求结果
  if (requestId !== currentRequestId) {
    return false
  }

  // 处理结果...
}
```

### 7.2 缓存一致性

**问题：** 收藏操作后，其他页面的缓存可能过期

**决策（D-18~D-19）：** 只更新当前页数据，不清空其他缓存
- 这是简化的权衡决策
- 用户切换到其他页面时会重新加载最新数据
- 如果需要更严格的缓存一致性，可以考虑标记缓存为"可能过期"

### 7.3 空状态处理

**场景：**
- 搜索结果为空
- 收藏夹为空
- 网络错误

**建议：**
- `PageData.data = []` 表示空结果
- `PageData.totalPage = 0` 表示无数据
- `error = true` 表示请求失败

---

## 8. 类型定义确认

### 8.1 已有类型（Phase 46 定义）

```typescript
// src/types/domain/wallpaper.ts
interface PageData {
  totalPage: number
  currentPage: number
  data: WallpaperItem[]
}

type PageCache = Map<number, PageData>

interface WallpaperItem {
  // ...
  is_favorite?: 0 | 1 | 2  // 收藏状态
}
```

```typescript
// src/types/domain/favorite.ts
interface PaginationParams {
  limit: number
  offset: number
}

interface PaginatedFavoritesResult {
  items: FavoriteItem[]
  total: number
  hasMore: boolean
}
```

### 8.2 可能需要补充的类型

```typescript
// 收藏计数返回类型
interface FavoritesCounts {
  _total: number  // 去重后的全部收藏计数
  [collectionId: string]: number
}
```

---

## 9. 测试要点

### 9.1 功能测试

| 测试项 | 验证方法 |
|--------|----------|
| 缓存命中 | 切换到已访问页面，检查是否无 API 调用 |
| 缓存清空 | 修改搜索条件，检查缓存是否清空 |
| 计数更新 | 收藏/取消收藏后检查侧边栏计数 |
| is_favorite 更新 | 收藏后检查当前页数据状态 |
| 分页边界 | 第一页禁用"上一页"，最后一页禁用"下一页" |

### 9.2 性能测试

| 测试项 | 预期结果 |
|--------|----------|
| 缓存大小限制 | 第 6 页缓存后，第 1 页缓存被淘汰 |
| 响应式更新 | currentPageData 更新触发视图更新 |
| 大数据渲染 | shallowRef 确保 24 项渲染流畅 |

---

## 10. 关键决策摘要

| 决策 ID | 内容 | 来源 |
|---------|------|------|
| D-01 | `shallowRef<Map<number, PageData>>` 包装 | CONTEXT.md |
| D-02 | 缓存上限 5 页 FIFO | CONTEXT.md |
| D-03 | 搜索条件变更清空缓存 | CONTEXT.md |
| D-04~D-06 | WallpaperStore 新字段结构 | CONTEXT.md |
| D-07~D-09 | FavoritesStore 新字段结构 | CONTEXT.md |
| D-10~D-13 | 计数由 Repository 获取，操作后刷新 | CONTEXT.md |
| D-14~D-16 | Composable 方法设计 | CONTEXT.md |
| D-17 | KeepAlive 保持数据和滚动位置 | CONTEXT.md |
| D-18~D-19 | 收藏操作后局部更新 is_favorite | CONTEXT.md |

---

## 11. 规划建议

### 11.1 实现顺序

1. **Wave 1: Store 层改造**
   - WallpaperStore: 新增字段 + 重置方法
   - FavoritesStore: 新增字段 + loadCounts() 方法

2. **Wave 2: Composable 方法实现**
   - useWallpaperList: goToPage(), refresh(), clearCache()
   - useFavorites: goToPage(), refresh(), clearCache(), loadCounts()

3. **Wave 3: 数据同步逻辑**
   - 收藏操作后更新 currentPageData
   - is_favorite 状态同步

### 11.2 风险点

| 风险 | 缓解措施 |
|------|----------|
| 移除 totalPageData 破坏现有逻辑 | 先添加新字段，确认功能正常后再移除旧字段 |
| Map 响应式更新问题 | 使用 `map = map` 触发更新，测试验证 |
| is_favorite 三态计算错误 | 简化处理：移除后重新查询状态 |

---

## 12. 研究结论

Phase 48 的实现需要：

1. **清晰的 Store 字段映射**：从 totalPageData 迁移到 currentPageData + pageCache
2. **一致的缓存操作模式**：get/set/clear 方法 + FIFO 淘汰
3. **可靠的计数更新机制**：操作后调用 loadCounts()，避免全量加载
4. **简化的数据同步策略**：局部更新 is_favorite，不清空缓存
5. **并发请求处理**：使用请求 ID 或 AbortController

**可以开始规划阶段。**

---

*Research completed: 2026-05-04*
