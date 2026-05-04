---
wave: 1
depends_on: [47-PLAN.md]
files_modified:
  - src/stores/modules/wallpaper/index.ts
  - src/composables/wallpaper/useWallpaperList.ts
  - src/stores/modules/favorites/index.ts
  - src/composables/favorites/useFavorites.ts
  - src/composables/favorites/useCollections.ts
autonomous: true
---

# Phase 48: Composable & Store Layer — Execution Plan

**Created:** 2026-05-04
**Status:** Ready for execution

---

## Overview

实现 Composable 层的分页状态管理、缓存策略和响应式计数。

### Requirements Coverage

| ID | Description | Tasks |
|----|-------------|-------|
| ONLPAG-06 | Visited pages are cached in memory | T-01, T-03 |
| ONLPAG-07 | Cache is cleared when search filters change | T-03 |
| FAVPAG-01 | Traditional pagination for favorites | T-04, T-05 |
| FAVPAG-03 | Loading indicator while fetching | T-03, T-05 |
| FAVPAG-04 | "没有更多" message when complete | T-05 |
| FAVPAG-05 | Scroll position preserved on back | T-06 (KeepAlive 已配置) |
| SIDECT-01 | Sidebar count updates on add | T-02, T-05 |
| SIDECT-02 | Sidebar count updates on remove | T-02, T-05 |
| SIDECT-03 | "全部收藏" shows unique count | T-02 |
| SIDECT-04 | Per-collection counts displayed | T-02 |

### Success Criteria

1. Switching to a cached page loads instantly without API call
2. Changing search filters clears the page cache
3. useFavorites.goToPage() correctly loads specified page
4. Sidebar counts update immediately after favorite add/remove operations

---

## Wave 1: WallpaperStore 改造

### T-01: WallpaperStore 新增分页字段

**Goal:** 在 WallpaperStore 中新增 currentPageData, pageCache, totalCount 字段，保留 totalPageData 以兼容现有代码

<read_first>
- src/stores/modules/wallpaper/index.ts — 当前 WallpaperStore 实现
- src/types/domain/wallpaper.ts — PageData, PageCache 类型定义
</read_first>

<acceptance_criteria>
- `src/stores/modules/wallpaper/index.ts` 包含 `const currentPageData = shallowRef<PageData>({ data: [], totalPage: 0, currentPage: 0 })`
- `src/stores/modules/wallpaper/index.ts` 包含 `const pageCache = shallowRef<PageCache>(new Map())`
- `src/stores/modules/wallpaper/index.ts` 包含 `const totalCount = ref<number>(0)`
- `src/stores/modules/wallpaper/index.ts` 导出 `currentPageData`, `pageCache`, `totalCount`
- 保留现有 `totalPageData` 字段不变
- TypeScript 编译无错误
</acceptance_criteria>

<action>
在 `src/stores/modules/wallpaper/index.ts` 中：

1. 导入 `PageData`, `PageCache` 类型：
```typescript
import type { TotalPageData, GetParams, CustomParams, AppSettings, WallpaperFit, PageData, PageCache } from '@/types'
```

2. 在状态区域新增三个字段（在 `totalPageData` 定义之后）：
```typescript
/** 当前页数据（传统分页） */
const currentPageData = shallowRef<PageData>({
  data: [],
  totalPage: 0,
  currentPage: 0,
})

/** 页面缓存（最多 5 页） */
const pageCache = shallowRef<PageCache>(new Map())

/** 总条目数 */
const totalCount = ref<number>(0)
```

3. 新增辅助方法：
```typescript
/**
 * 创建空的页面数据
 */
function createEmptyPageData(): PageData {
  return { data: [], totalPage: 0, currentPage: 0 }
}

/**
 * 清空页面缓存
 */
function clearPageCache(): void {
  pageCache.value = new Map()
}

/**
 * 获取缓存的页面数据
 */
function getCachedPage(page: number): PageData | undefined {
  return pageCache.value.get(page)
}

/**
 * 设置页面缓存（FIFO 淘汰，上限 5 页）
 */
function setCachedPage(page: number, data: PageData): void {
  const cache = pageCache.value
  // FIFO 淘汰：超过 5 页且不是更新现有页面时删除最旧的
  if (cache.size >= 5 && !cache.has(page)) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      cache.delete(firstKey)
    }
  }
  cache.set(page, data)
  // 触发响应式更新
  pageCache.value = cache
}
```

4. 在 return 语句中导出新字段和方法：
```typescript
return {
  // 状态
  totalPageData,
  currentPageData,  // 新增
  pageCache,        // 新增
  totalCount,       // 新增
  loading,
  error,
  queryParams,
  savedParams,
  settings,

  // 方法
  resetState,
  loadSettings,
  createEmptyPageData,  // 新增
  clearPageCache,       // 新增
  getCachedPage,        // 新增
  setCachedPage,        // 新增
}
```
</action>

---

### T-02: FavoritesStore 新增分页和计数字段

**Goal:** 在 FavoritesStore 中新增分页字段和 counts 响应式计数

<read_first>
- src/stores/modules/favorites/index.ts — 当前 FavoritesStore 实现
- src/types/domain/favorite.ts — PaginationParams, PaginatedFavoritesResult 类型
- src/repositories/favorites.repository.ts — getCounts() 方法
</read_first>

<acceptance_criteria>
- `src/stores/modules/favorites/index.ts` 包含 `const currentPageData = shallowRef<PageData>({ data: [], totalPage: 0, currentPage: 0 })`
- `src/stores/modules/favorites/index.ts` 包含 `const pageCache = shallowRef<PageCache>(new Map())`
- `src/stores/modules/favorites/index.ts` 包含 `const totalCount = ref<number>(0)`
- `src/stores/modules/favorites/index.ts` 包含 `const currentCollectionId = ref<string | null>(null)`
- `src/stores/modules/favorites/index.ts` 包含 `const counts = ref<Record<string, number>>({ _total: 0 })`
- `src/stores/modules/favorites/index.ts` 包含 `async function loadCounts(): Promise<void>`
- `src/stores/modules/favorites/index.ts` 导出所有新字段和方法
- TypeScript 编译无错误
</acceptance_criteria>

<action>
在 `src/stores/modules/favorites/index.ts` 中：

1. 更新导入，添加 `shallowRef` 和新类型：
```typescript
import { ref, computed, shallowRef } from 'vue'
import type { FavoriteItem, Collection, PageData, PageCache } from '@/types'
import { favoritesService, collectionsService } from '@/services'
import { favoritesRepository } from '@/repositories'
```

2. 在状态区域新增字段（在 `error` 定义之后）：
```typescript
// ==================== 分页状态 ====================

/** 当前页数据 */
const currentPageData = shallowRef<PageData>({
  data: [],
  totalPage: 0,
  currentPage: 0,
})

/** 页面缓存（最多 5 页） */
const pageCache = shallowRef<PageCache>(new Map())

/** 总条目数 */
const totalCount = ref<number>(0)

/** 当前筛选的收藏夹 ID */
const currentCollectionId = ref<string | null>(null)

// ==================== 响应式计数 ====================

/** 收藏计数（_total 为去重后的全部计数，其他为各收藏夹计数） */
const counts = ref<Record<string, number>>({ _total: 0 })
```

3. 新增分页辅助方法：
```typescript
// ==================== 分页辅助方法 ====================

/**
 * 创建空的页面数据
 */
function createEmptyPageData(): PageData {
  return { data: [], totalPage: 0, currentPage: 0 }
}

/**
 * 清空页面缓存
 */
function clearPageCache(): void {
  pageCache.value = new Map()
}

/**
 * 获取缓存的页面数据
 */
function getCachedPage(page: number): PageData | undefined {
  return pageCache.value.get(page)
}

/**
 * 设置页面缓存（FIFO 淘汰，上限 5 页）
 */
function setCachedPage(page: number, data: PageData): void {
  const cache = pageCache.value
  if (cache.size >= 5 && !cache.has(page)) {
    const firstKey = cache.keys().next().value
    if (firstKey !== undefined) {
      cache.delete(firstKey)
    }
  }
  cache.set(page, data)
  pageCache.value = cache
}
```

4. 新增 `loadCounts()` 方法：
```typescript
/**
 * 加载收藏计数（从 Repository 获取）
 */
async function loadCounts(): Promise<void> {
  const result = await favoritesRepository.getCounts()
  if (result.success && result.data) {
    counts.value = result.data
  }
}
```

5. 更新 `uniqueWallpaperCount` 计算属性，使用 counts 替代原实现：
```typescript
/** 唯一壁纸数量（去重后）—— 从 counts 获取 */
const uniqueWallpaperCount = computed(() => counts.value._total ?? 0)
```

6. 更新 `getCollectionCount` 方法，使用 counts 替代遍历：
```typescript
/**
 * 获取收藏夹的壁纸数量（从 counts 获取）
 */
function getCollectionCount(collectionId: string): number {
  return counts.value[collectionId] ?? 0
}
```

7. 更新 `loadAll()` 方法，同时加载计数：
```typescript
/**
 * 加载所有数据
 */
async function loadAll(): Promise<void> {
  await Promise.all([loadFavorites(), loadCollections(), loadCounts()])
}
```

8. 在 return 语句中导出所有新字段和方法：
```typescript
return {
  // 状态
  favorites,
  collections,
  loading,
  error,

  // 分页状态
  currentPageData,
  pageCache,
  totalCount,
  currentCollectionId,

  // 响应式计数
  counts,

  // 计算属性
  favoriteIds,
  uniqueWallpaperCount,

  // 方法
  loadFavorites,
  loadCollections,
  loadAll,
  loadCounts,  // 新增
  isFavorite,
  isInCollection,
  getCollectionCount,
  getByCollection,
  getCollectionNamesForWallpaper,
  addFavorite,
  removeFavorite,
  moveFavorite,
  clearCache,

  // 分页辅助方法
  createEmptyPageData,
  clearPageCache,
  getCachedPage,
  setCachedPage,
}
```
</action>

---

## Wave 2: Composable 方法实现

### T-03: useWallpaperList 新增分页方法

**Goal:** 在 useWallpaperList 中新增 goToPage, refresh, clearCache 方法，支持页面缓存

<read_first>
- src/composables/wallpaper/useWallpaperList.ts — 当前实现
- src/stores/modules/wallpaper/index.ts — WallpaperStore（T-01 已修改）
- src/services/wallpaper.service.ts — wallpaperService.search() 方法
</read_first>

<acceptance_criteria>
- `src/composables/wallpaper/useWallpaperList.ts` 包含 `async function goToPage(page: number): Promise<boolean>`
- `src/composables/wallpaper/useWallpaperList.ts` 包含 `async function refresh(): Promise<boolean>`
- `src/composables/wallpaper/useWallpaperList.ts` 包含 `function clearCache(): void`
- goToPage 方法检查缓存，命中时直接返回不调用 API
- goToPage 方法检测搜索条件变化时清空缓存
- UseWallpaperListReturn 接口包含 `currentPageData`, `totalCount`, `goToPage`, `refresh`, `clearCache`
- TypeScript 编译无错误
</acceptance_criteria>

<action>
修改 `src/composables/wallpaper/useWallpaperList.ts`：

1. 更新接口定义：
```typescript
/**
 * useWallpaperList 返回值接口
 */
export interface UseWallpaperListReturn {
  // 状态（ComputedRef）
  wallpapers: ComputedRef<TotalPageData>
  currentPageData: ComputedRef<PageData>  // 新增
  totalCount: ComputedRef<number>          // 新增
  loading: ComputedRef<boolean>
  error: ComputedRef<boolean>
  queryParams: ComputedRef<GetParams | null>
  savedParams: ComputedRef<CustomParams | null>

  // 方法
  fetch: (params: GetParams | null) => Promise<boolean>
  goToPage: (page: number) => Promise<boolean>  // 新增
  loadMore: () => Promise<boolean>
  refresh: () => Promise<boolean>    // 新增
  clearCache: () => void             // 新增
  reset: () => void
  saveCustomParams: (params: CustomParams) => Promise<boolean>
  loadSavedParams: () => Promise<CustomParams | null>
}
```

2. 新增私有变量用于检测搜索条件变化：
```typescript
/** 上次查询参数（用于检测变化） */
let lastQueryParams: GetParams | null = null
```

3. 新增 `isParamsChanged` 辅助函数：
```typescript
/**
 * 检查搜索参数是否变化
 */
function isParamsChanged(params: GetParams | null): boolean {
  return JSON.stringify(lastQueryParams) !== JSON.stringify(params)
}
```

4. 新增 `goToPage` 方法：
```typescript
/**
 * 跳转到指定页
 * @param page - 页码（1-based）
 * @returns 是否成功
 */
const goToPage = async (page: number): Promise<boolean> => {
  // 边界检查
  if (page < 1) return false

  const cachedTotalPage = store.currentPageData.totalPage
  if (cachedTotalPage > 0 && page > cachedTotalPage) return false

  // 检查缓存
  const cached = store.getCachedPage(page)
  if (cached) {
    store.currentPageData = { ...cached }
    return true
  }

  // 从 API 加载
  store.loading = true
  store.error = false

  const params: GetParams = { ...store.queryParams, page } as GetParams
  const result = await wallpaperService.search(params)

  if (!result.success) {
    showError(result.error?.message || '获取壁纸失败')
    store.error = true
    store.loading = false
    return false
  }

  const pageData = toPageData(result.data!)
  store.setCachedPage(page, pageData)
  store.currentPageData = { ...pageData }
  store.totalCount = result.data!.meta.total
  store.loading = false
  return true
}
```

5. 修改 `fetch` 方法，增加缓存清空逻辑：
```typescript
const fetch = async (params: GetParams | null): Promise<boolean> => {
  // 检测搜索条件是否变化
  if (isParamsChanged(params)) {
    store.clearPageCache()
    lastQueryParams = params ? { ...params } : null
  }

  store.loading = true
  store.error = false

  const result = await wallpaperService.search(params)

  if (!result.success) {
    showError(result.error?.message || '获取壁纸失败')
    store.error = true
    store.loading = false
    return false
  }

  store.queryParams = params
  lastQueryParams = params ? { ...params } : null

  const pageData = toPageData(result.data!)
  store.totalPageData = {
    sections: [pageData],
    totalPage: pageData.totalPage,
    currentPage: pageData.currentPage,
  }

  // 同时更新分页状态
  store.setCachedPage(pageData.currentPage, pageData)
  store.currentPageData = { ...pageData }
  store.totalCount = result.data!.meta.total

  store.loading = false
  return true
}
```

6. 新增 `refresh` 方法：
```typescript
/**
 * 刷新当前页
 * @returns 是否成功
 */
const refresh = async (): Promise<boolean> => {
  const currentPage = store.currentPageData.currentPage
  if (currentPage < 1) return false

  // 清除当前页缓存
  const cache = store.pageCache
  cache.delete(currentPage)
  store.pageCache = cache

  return goToPage(currentPage)
}
```

7. 新增 `clearCache` 方法：
```typescript
/**
 * 清空页面缓存
 */
const clearCache = (): void => {
  store.clearPageCache()
}
```

8. 更新 return 语句：
```typescript
return {
  // 状态
  wallpapers: computed(() => store.totalPageData),
  currentPageData: computed(() => store.currentPageData),
  totalCount: computed(() => store.totalCount),
  loading: computed(() => store.loading),
  error: computed(() => store.error),
  queryParams: computed(() => store.queryParams),
  savedParams: computed(() => store.savedParams),

  // 方法
  fetch,
  goToPage,
  loadMore,
  refresh,
  clearCache,
  reset,
  saveCustomParams,
  loadSavedParams,
}
```
</action>

---

### T-04: useFavorites 新增分页方法

**Goal:** 在 useFavorites 中新增 goToPage, refresh, clearCache, loadCounts 方法

<read_first>
- src/composables/favorites/useFavorites.ts — 当前实现
- src/stores/modules/favorites/index.ts — FavoritesStore（T-02 已修改）
- src/repositories/favorites.repository.ts — getFavoritesPaginated() 方法
</read_first>

<acceptance_criteria>
- `src/composables/favorites/useFavorites.ts` 包含 `async function goToPage(page: number, collectionId?: string): Promise<boolean>`
- `src/composables/favorites/useFavorites.ts` 包含 `async function refresh(): Promise<boolean>`
- `src/composables/favorites/useFavorites.ts` 包含 `function clearCache(): void`
- `src/composables/favorites/useFavorites.ts` 包含 `async function loadCounts(): Promise<void>`
- UseFavoritesReturn 接口包含 `currentPageData`, `totalCount`, `counts`, `hasMore`, `goToPage`, `refresh`, `clearCache`, `loadCounts`
- TypeScript 编译无错误
</acceptance_criteria>

<action>
修改 `src/composables/favorites/useFavorites.ts`：

1. 更新导入：
```typescript
import { computed, type ComputedRef } from 'vue'
import { useFavoritesStore } from '@/stores/modules/favorites'
import { favoritesService, favoritesRepository } from '@/services'
import { useAlert } from '@/composables'
import type { FavoriteItem, WallpaperItem, PageData } from '@/types'
```

2. 更新接口定义：
```typescript
export interface UseFavoritesReturn {
  // 分页状态
  currentPageData: ComputedRef<PageData>
  totalCount: ComputedRef<number>
  hasMore: ComputedRef<boolean>
  loading: ComputedRef<boolean>
  error: ComputedRef<string | null>

  // 计数
  counts: ComputedRef<Record<string, number>>
  uniqueWallpaperCount: ComputedRef<number>

  // 分页方法
  goToPage: (page: number, collectionId?: string) => Promise<boolean>
  refresh: () => Promise<boolean>
  clearCache: () => void
  loadCounts: () => Promise<void>

  // 收藏操作（修改后触发计数更新）
  favorites: ComputedRef<FavoriteItem[]>
  favoriteIds: ComputedRef<Set<string>>
  add: (wallpaperId: string, collectionId: string, wallpaperData: WallpaperItem) => Promise<boolean>
  remove: (wallpaperId: string, collectionId: string) => Promise<boolean>
  move: (wallpaperId: string, fromCollectionId: string, toCollectionId: string) => Promise<boolean>
  isFavorite: (wallpaperId: string) => boolean
  isInCollection: (wallpaperId: string, collectionId: string) => boolean
  getCollectionsForWallpaper: (wallpaperId: string) => string[]
  getByCollection: (collectionId: string) => FavoriteItem[]
  getCollectionCount: (collectionId: string) => number
}
```

3. 新增 `goToPage` 方法：
```typescript
/**
 * 跳转到指定页
 * @param page - 页码（1-based）
 * @param collectionId - 可选，按收藏夹过滤
 * @returns 是否成功
 */
const goToPage = async (page: number, collectionId?: string): Promise<boolean> => {
  // 边界检查
  if (page < 1) return false

  const cachedTotalPage = store.currentPageData.totalPage
  if (cachedTotalPage > 0 && page > cachedTotalPage) return false

  // 检查收藏夹是否变化
  const targetCollectionId = collectionId ?? null
  if (store.currentCollectionId !== targetCollectionId) {
    store.clearPageCache()
    store.currentCollectionId = targetCollectionId
  }

  // 检查缓存
  const cached = store.getCachedPage(page)
  if (cached) {
    store.currentPageData = { ...cached }
    return true
  }

  // 从 Repository 加载
  store.loading = true
  store.error = null

  const limit = 24
  const offset = (page - 1) * limit
  const result = await favoritesRepository.getFavoritesPaginated({
    limit,
    offset,
    collectionId: targetCollectionId ?? undefined,
  })

  if (!result.success) {
    showError(result.error?.message || '获取收藏失败')
    store.error = result.error?.message || '获取收藏失败'
    store.loading = false
    return false
  }

  const { items, total, hasMore } = result.data!
  const totalPage = Math.ceil(total / limit)

  const pageData: PageData = {
    data: items.map((item) => item.wallpaperData),
    totalPage,
    currentPage: page,
  }

  store.setCachedPage(page, pageData)
  store.currentPageData = { ...pageData }
  store.totalCount = total
  store.loading = false
  return true
}
```

4. 新增 `refresh` 方法：
```typescript
/**
 * 刷新当前页
 * @returns 是否成功
 */
const refresh = async (): Promise<boolean> => {
  const currentPage = store.currentPageData.currentPage
  if (currentPage < 1) return false

  // 清除当前页缓存
  const cache = store.pageCache
  cache.delete(currentPage)
  store.pageCache = cache

  return goToPage(currentPage, store.currentCollectionId ?? undefined)
}
```

5. 新增 `clearCache` 方法：
```typescript
/**
 * 清空页面缓存
 */
const clearCache = (): void => {
  store.clearPageCache()
}
```

6. 新增 `loadCounts` 方法：
```typescript
/**
 * 加载收藏计数
 */
const loadCounts = async (): Promise<void> => {
  await store.loadCounts()
}
```

7. 更新 `add` 方法，添加计数更新：
```typescript
const add = async (
  wallpaperId: string,
  collectionId: string,
  wallpaperData: WallpaperItem,
): Promise<boolean> => {
  const result = await favoritesService.add(wallpaperId, collectionId, wallpaperData)
  if (result.success) {
    await loadCounts()
    showSuccess('已添加到收藏')
    return true
  }
  showError(result.error?.message || '添加收藏失败')
  return false
}
```

8. 更新 `remove` 方法，添加计数更新：
```typescript
const remove = async (wallpaperId: string, collectionId: string): Promise<boolean> => {
  const result = await favoritesService.remove(wallpaperId, collectionId)
  if (result.success) {
    await loadCounts()
    showSuccess('已从收藏移除')
    return true
  }
  showError(result.error?.message || '移除收藏失败')
  return false
}
```

9. 更新 `move` 方法，添加计数更新（移动时计数不变，但保持一致性）：
```typescript
const move = async (
  wallpaperId: string,
  fromCollectionId: string,
  toCollectionId: string,
): Promise<boolean> => {
  const result = await favoritesService.move(wallpaperId, fromCollectionId, toCollectionId)
  if (result.success) {
    await loadCounts()
    showSuccess('已移动到其他收藏夹')
    return true
  }
  showError(result.error?.message || '移动收藏失败')
  return false
}
```

10. 新增 `hasMore` 计算属性：
```typescript
const hasMore = computed(() => {
  const current = store.currentPageData.currentPage
  const total = store.currentPageData.totalPage
  return current > 0 && current < total
})
```

11. 更新 return 语句：
```typescript
return {
  // 分页状态
  currentPageData: computed(() => store.currentPageData),
  totalCount: computed(() => store.totalCount),
  hasMore,
  loading: computed(() => store.loading),
  error: computed(() => store.error),

  // 计数
  counts: computed(() => store.counts),
  uniqueWallpaperCount: computed(() => store.uniqueWallpaperCount),

  // 分页方法
  goToPage,
  refresh,
  clearCache,
  loadCounts,

  // 收藏操作
  favorites: computed(() => store.favorites),
  favoriteIds: computed(() => store.favoriteIds),
  add,
  remove,
  move,
  isFavorite,
  isInCollection,
  getCollectionsForWallpaper,
  getByCollection,
  getCollectionCount,
}
```
</action>

---

### T-05: useCollections 集成计数刷新

**Goal:** 在 useCollections 的删除收藏夹操作后刷新计数

<read_first>
- src/composables/favorites/useCollections.ts — 当前实现
- src/stores/modules/favorites/index.ts — FavoritesStore（T-02 已修改）
</read_first>

<acceptance_criteria>
- `src/composables/favorites/useCollections.ts` 中 `deleteCollection` 方法在删除成功后调用 `store.loadCounts()`
- TypeScript 编译无错误
</acceptance_criteria>

<action>
修改 `src/composables/favorites/useCollections.ts`：

1. 更新 `deleteCollection` 方法，添加计数刷新：
```typescript
const deleteCollection = async (id: string): Promise<boolean> => {
  const result = await collectionsService.delete(id)
  if (result.success) {
    await load()
    // 同时刷新收藏项（删除收藏夹会移除相关收藏项）
    await store.loadFavorites()
    // 刷新计数
    await store.loadCounts()
    showSuccess('收藏夹删除成功')
    return true
  }
  showError(result.error?.message || '删除收藏夹失败')
  return false
}
```
</action>

---

## Wave 3: 验证与测试

### T-06: TypeScript 编译验证

**Goal:** 验证所有修改后的文件能够通过 TypeScript 编译

<read_first>
- tsconfig.json — TypeScript 配置
</read_first>

<acceptance_criteria>
- 运行 `npm run type-check` 或 `npx tsc --noEmit` 无错误
- 所有新增类型正确导入和使用
</acceptance_criteria>

<action>
执行以下命令验证：
```bash
npx tsc --noEmit
```

如果有类型错误，根据错误信息修复。常见问题：
1. 类型导入缺失
2. 接口不匹配
3. 返回值类型不一致
</action>

---

## Verification Criteria

### 功能验证

| 验证项 | 验证方法 | 预期结果 |
|--------|----------|----------|
| 页面缓存命中 | 调用 goToPage(1) 后再调用 goToPage(2)，再调用 goToPage(1) | 第二次调用 goToPage(1) 不触发 API |
| 缓存清空 | 修改搜索条件后检查 pageCache.size | pageCache.size === 0 |
| 计数更新 | 添加收藏后检查 counts._total | counts._total 增加 1 |
| 分页导航 | goToPage(2) 后检查 currentPageData.currentPage | currentPage === 2 |

### 代码质量

- [ ] TypeScript 编译无错误
- [ ] 无 console.log 调试语句（除已有的日志）
- [ ] 所有方法有 JSDoc 注释
- [ ] 代码风格与现有代码一致

---

## Must Haves (Goal-Backward Verification)

为确保 Phase 48 目标达成，执行完成后必须满足：

1. **ONLPAG-06**: WallpaperStore.pageCache 存在且 goToPage 可读写缓存
2. **ONLPAG-07**: fetch() 中检测到 params 变化时调用 clearPageCache()
3. **SIDECT-01~04**: FavoritesStore.counts 存在，add/remove 后调用 loadCounts()
4. **FAVPAG-01**: useFavorites.goToPage() 存在并正常工作
5. **FAVPAG-03**: loading 状态在 goToPage 执行期间为 true
6. **FAVPAG-04**: hasMore 计算属性正确计算

---

## Dependencies

```
Phase 47 (Repository & Service Layer)
    ↓
T-01: WallpaperStore 新增字段
T-02: FavoritesStore 新增字段
    ↓
T-03: useWallpaperList 分页方法
T-04: useFavorites 分页方法
    ↓
T-05: useCollections 集成
    ↓
T-06: TypeScript 编译验证
```

---

## Risk Mitigation

| 风险 | 缓解措施 |
|------|----------|
| Map 响应式更新不触发 | 使用 `pageCache.value = cache` 触发更新 |
| 计数刷新延迟 | 先更新 UI，后台刷新计数 |
| 并发请求问题 | 保留 loading 状态检查 |
| 移除 totalPageData 破坏现有代码 | 保留 totalPageData，仅新增字段 |

---

*Plan created: 2026-05-04*
