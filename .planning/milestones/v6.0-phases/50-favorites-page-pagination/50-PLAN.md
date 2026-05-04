---
wave: 1
depends_on: [48-composable-store-layer, 49-view-layer-pagination-bar]
files_modified:
  - src/views/FavoritesPage.vue (修改)
  - src/components/favorites/FavoriteWallpaperCard.vue (修改)
autonomous: true
requirements: [FAVPAG-01, FAVPAG-03, FAVPAG-04, FAVPAG-05]
---

# Phase 50: Favorites Page Pagination

**目标:** 实现收藏页面的传统分页 UI，复用 PaginationBar 组件，与在线壁纸页面保持一致

## 前置条件

- [x] Phase 48 完成 — useFavorites.goToPage(), currentPageData, totalCount, hasMore 已就绪
- [x] Phase 49 完成 — PaginationBar 组件已创建，OnlineWallpaper 分页集成参考
- [x] FavoritesStore.currentPageData, pageCache, totalCount 已就绪

---

## Tasks

### Task 1: 重构 FavoritesPage 数据源为分页模式

**目标:** 将 FavoritesPage 从全量加载改为分页加载，使用 useFavorites.goToPage() 加载数据

<read_first>
- src/views/FavoritesPage.vue (当前实现)
- src/composables/favorites/useFavorites.ts (goToPage, currentPageData, totalCount 方法)
- src/stores/modules/favorites/index.ts (currentPageData, totalCount 状态)
- src/views/OnlineWallpaper.vue (第 134-146 行，分页数据获取参考)
</read_first>

**实现要点:**

1. 修改 useFavorites 解构，移除 `load: loadFavorites`，添加分页相关属性：

```typescript
const {
  favorites,
  favoriteIds,
  // 移除: load: loadFavorites,
  // 新增分页属性:
  currentPageData,
  totalCount,
  loading,
  goToPage,
  refresh,
  clearCache,
  loadCounts,
  getCollectionsForWallpaper,
  remove,
} = useFavorites()
```

2. 修改数据源 computed：
   - 移除 `filteredFavorites` computed（基于全量 favorites 筛选）
   - 添加 `favoriteWallpaperList` 从 currentPageData.data 获取

```typescript
// 移除:
// const filteredFavorites = computed(() => { ... })

// 新增: 从当前页数据获取壁纸列表
const favoriteWallpaperList = computed<WallpaperItem[]>(() =>
  currentPageData.value.data
)

// 保留: 获取收藏夹名称（从 favorites 计算保持不变）
// 但需要改为调用 composable 方法
const getCollectionNamesForWallpaper = (wallpaperId: string): string[] => {
  return getCollectionsForWallpaper(wallpaperId)
}
```

3. 修改 handleCollectionSelect 函数：
   - 切换收藏夹时调用 goToPage(1, collectionId) 重置到第 1 页
   - 这会自动清空 pageCache（goToPage 内部处理）

```typescript
const handleCollectionSelect = async (collectionId: string | null): Promise<void> => {
  selectedCollectionId.value = collectionId
  // 跳转到第 1 页，并设置收藏夹筛选
  await goToPage(1, collectionId ?? undefined)
}
```

4. 修改 onActivated 生命周期：
   - 移除 loadFavorites() 调用
   - 改用 goToPage(1) 加载首页数据

```typescript
onActivated(async () => {
  await Promise.all([
    loadCollections(),
    goToPage(1, selectedCollectionId.value ?? undefined),
    loadCounts(),
  ])
})
```

5. 更新模板中的数据绑定：
   - `filteredFavorites` 替换为 `currentPageData.data`
   - 显示计数使用 `totalCount` 而非 `filteredFavorites.length`

<acceptance_criteria>
- useFavorites 解构中移除 `load: loadFavorites`
- 新增 `currentPageData, totalCount, loading, goToPage, refresh, clearCache, loadCounts, getCollectionsForWallpaper, remove` 解构
- 移除 `filteredFavorites` computed
- `favoriteWallpaperList` 改为从 `currentPageData.value.data` 获取
- `handleCollectionSelect` 调用 `goToPage(1, collectionId)`
- `onActivated` 调用 `goToPage(1)` 而非 `loadFavorites()`
- 模板中 `filteredFavorites` 替换为 `currentPageData.data`
- 计数显示使用 `totalCount`
</acceptance_criteria>

---

### Task 2: 适配 FavoriteWallpaperCard 组件

**目标:** 修改 FavoriteWallpaperCard 接收 WallpaperItem 而非 FavoriteItem

<read_first>
- src/components/favorites/FavoriteWallpaperCard.vue (当前实现，props 是 FavoriteItem)
- src/types/domain/wallpaper.ts (WallpaperItem 类型)
- src/types/domain/favorite.ts (FavoriteItem 类型)
</read_first>

**实现要点:**

1. 修改 props 定义，从 FavoriteItem 改为 WallpaperItem：

```typescript
// 修改前:
import type { FavoriteItem } from '@/types'

interface Props {
  favorite: FavoriteItem
  collectionNames: string[]
}

// 修改后:
import type { WallpaperItem } from '@/types'

interface Props {
  wallpaper: WallpaperItem  // 改为 WallpaperItem
  collectionNames: string[]
}
```

2. 修改 emit 类型定义：

```typescript
const emit = defineEmits<{
  preview: [wallpaperData: WallpaperItem]
  download: [wallpaperData: WallpaperItem]
  'set-bg': [wallpaperData: WallpaperItem]
  unfavorite: [wallpaperId: string]
}>()
```

3. 修改模板中的属性访问：
   - `favorite.wallpaperId` → `wallpaper.id`
   - `favorite.wallpaperData` → `wallpaper`
   - `favorite.wallpaperData.resolution` → `wallpaper.resolution`
   - `favorite.wallpaperData.thumbs?.small` → `wallpaper.thumbs?.small`
   - `favorite.wallpaperData.path` → `wallpaper.path`

```html
<template>
  <figure
    class="thumb"
    style="width: 300px; height: 200px"
  >
    <!-- Collection badge - top-left -->
    <div
      class="favorite-badge"
      :title="'点击取消收藏'"
      @click.stop="emit('unfavorite', props.wallpaper.id)"
    >
      <i class="fas fa-heart" />
      <span
        v-if="collectionCount > 1"
        class="badge-count"
      >{{ collectionCount }}</span>
    </div>

    <!-- Thumbnail -->
    <img
      :src="thumbnailSrc"
      :alt="wallpaper.id"
      loading="lazy"
      decoding="async"
    >
    <a
      class="preview"
      @click.prevent="emit('preview', wallpaper)"
    />

    <!-- Bottom info bar -->
    <figcaption class="thumb-info">
      <span class="wall-res">{{ formatResolution(wallpaper.resolution) }}</span>
      <a
        class="wall-favs"
        title="设为壁纸"
        @click="emit('set-bg', wallpaper)"
      >
        <i class="fas fa-fw fa-repeat-alt" />
      </a>
      <a
        class="thumb-tags-toggle tagged"
        title="下载"
        @click="emit('download', wallpaper)"
      >
        <i class="fas fa-fw fa-download" />
      </a>
    </figcaption>
  </figure>
</template>
```

4. 修改 computed 属性：

```typescript
const collectionCount = computed(() => props.collectionNames.length)

const thumbnailSrc = computed(() => {
  return props.wallpaper.thumbs?.small || props.wallpaper.path
})
```

<acceptance_criteria>
- FavoriteWallpaperCard props 从 `FavoriteItem` 改为 `WallpaperItem`
- emit 类型定义中参数类型改为 `WallpaperItem`
- 模板中所有 `favorite.wallpaperId` 改为 `wallpaper.id`
- 模板中所有 `favorite.wallpaperData` 改为 `wallpaper`
- `thumbnailSrc` computed 使用 `props.wallpaper.thumbs?.small`
- 组件功能正常（预览、下载、设为壁纸、取消收藏）
</acceptance_criteria>

---

### Task 3: 集成 PaginationBar 组件

**目标:** 在收藏网格底部添加分页条组件，显示页码和总条目数

<read_first>
- src/views/FavoritesPage.vue (模板部分)
- src/components/PaginationBar.vue (PaginationBar 组件 props)
- src/views/OnlineWallpaper.vue (第 92-100 行，PaginationBar 集成参考)
</read_first>

**实现要点:**

1. 导入 PaginationBar 组件：

```typescript
import PaginationBar from '@/components/PaginationBar.vue'
```

2. 添加分页导航处理函数：

```typescript
/**
 * 分页导航处理
 */
const handleGoToPage = async (page: number): Promise<void> => {
  await goToPage(page, selectedCollectionId.value ?? undefined)
}
```

3. 在模板中添加 PaginationBar（放在 favorites-grid 之后）：

```html
<!-- 分页条 -->
<PaginationBar
  v-if="currentPageData.totalPage > 0"
  :current-page="currentPageData.currentPage"
  :total-pages="currentPageData.totalPage"
  :total-count="totalCount"
  :loading="loading"
  @go-to-page="handleGoToPage"
/>
```

4. 更新空状态判断条件：
   - 原条件: `filteredFavorites.length === 0`
   - 新条件: `currentPageData.data.length === 0 && !loading`

```html
<div
  v-if="currentPageData.data.length === 0 && !loading"
  class="empty-collection"
>
```

5. 更新计数显示：
   - 原显示: `filteredFavorites.length`
   - 新显示: `totalCount`

```html
<span class="wallpaper-count">{{ totalCount }} 张壁纸</span>
```

6. 更新 v-for 迭代和 FavoriteWallpaperCard 绑定：
   - 原: `v-for="favorite in filteredFavorites"`
   - 新: `v-for="wallpaper in currentPageData.data"`

```html
<div
  v-else
  class="favorites-grid"
>
  <FavoriteWallpaperCard
    v-for="wallpaper in currentPageData.data"
    :key="wallpaper.id"
    :wallpaper="wallpaper"
    :collection-names="getCollectionNamesForWallpaper(wallpaper.id)"
    @preview="handlePreview"
    @download="handleDownload"
    @set-bg="handleSetBg"
    @unfavorite="handleCardUnfavorite"
  />
</div>
```

<acceptance_criteria>
- PaginationBar 组件正确导入
- PaginationBar 显示在 favorites-grid 之后
- PaginationBar 传递 `currentPage`, `totalPages`, `totalCount`, `loading` props
- 点击页码触发 `handleGoToPage`，调用 `goToPage` 方法
- 空状态判断使用 `currentPageData.data.length === 0 && !loading`
- 计数显示使用 `totalCount`
- v-for 迭代使用 `currentPageData.data`
- FavoriteWallpaperCard 传递 `:wallpaper` prop
</acceptance_criteria>

---

### Task 4: 实现取消收藏后数据同步

**目标:** 取消收藏后刷新当前页数据，同步更新 totalCount 和 counts

<read_first>
- src/views/FavoritesPage.vue (handleCardUnfavorite 函数)
- src/composables/favorites/useFavorites.ts (remove, refresh 方法)
- src/stores/modules/favorites/index.ts (currentPageData 状态)
</read_first>

**实现要点:**

1. 修改 handleCardUnfavorite 函数，取消收藏后刷新当前页：

```typescript
const handleCardUnfavorite = async (wallpaperId: string): Promise<void> => {
  await unfavoriteWallpaper(wallpaperId)
  // 刷新当前页数据（refresh 会从 Repository 重新加载）
  await refresh()
}
```

2. 推荐使用 refresh() 方案的理由：
   - `useFavorites.remove` 内部已调用 `loadCounts()` 更新计数
   - `refresh()` 会重新从 Repository 加载当前页数据
   - 实现简单，逻辑清晰
   - 自动处理边界情况（如当前页清空）

3. 确保在 useFavorites 解构中添加 refresh（Task 1 已包含）：

```typescript
const {
  // ... 其他属性
  refresh,
} = useFavorites()
```

4. 添加空页边界处理（当前页清空时跳转到上一页）：

```typescript
const handleCardUnfavorite = async (wallpaperId: string): Promise<void> => {
  await unfavoriteWallpaper(wallpaperId)

  // 边界处理：如果当前页清空，跳转到上一页
  const currentPage = currentPageData.value.currentPage
  const totalPage = currentPageData.value.totalPage

  if (currentPage > 1 && currentPage >= totalPage) {
    // 当前页可能是最后一页且已清空，跳转到上一页
    await goToPage(currentPage - 1, selectedCollectionId.value ?? undefined)
  } else {
    // 否则刷新当前页
    await refresh()
  }
}
```

<acceptance_criteria>
- `handleCardUnfavorite` 调用 `unfavoriteWallpaper` 后进行边界检查
- 当前页清空且为最后一页时，跳转到上一页
- 其他情况刷新当前页
- `totalCount` 和 `counts` 自动更新（由 `useFavorites.remove` 触发）
- 取消收藏后卡片从列表中移除
</acceptance_criteria>

---

### Task 5: 添加键盘导航支持

**目标:** 支持 ArrowLeft/ArrowRight 键盘导航，与 ImagePreview 互斥

<read_first>
- src/views/FavoritesPage.vue (当前键盘事件处理)
- src/views/OnlineWallpaper.vue (第 280-295 行，handleKeydown 参考)
- src/components/ImagePreview.vue (第 261-283 行，键盘事件互斥逻辑)
</read_first>

**实现要点:**

1. 确保导入 onMounted 和 onUnmounted：

```typescript
import { ref, computed, shallowRef, onActivated, onMounted, onUnmounted, watch } from 'vue'
```

2. 添加键盘事件处理函数：

```typescript
/**
 * 键盘导航处理（与 ImagePreview 互斥）
 */
const handleKeydown = (event: KeyboardEvent): void => {
  // 只在 ImagePreview 关闭时响应
  if (imgShow.value) return

  const { currentPage, totalPage } = currentPageData.value

  // 边界检查 + 导航
  if (event.key === 'ArrowLeft' && currentPage > 1) {
    event.preventDefault()
    goToPage(currentPage - 1, selectedCollectionId.value ?? undefined)
  } else if (event.key === 'ArrowRight' && currentPage < totalPage) {
    event.preventDefault()
    goToPage(currentPage + 1, selectedCollectionId.value ?? undefined)
  }
}
```

3. 在 onMounted 中添加事件监听：

```typescript
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})
```

4. 在 onUnmounted 中移除事件监听：

```typescript
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
```

**互斥机制说明：**
- ImagePreview: `if (!props.showing) return` — 只在预览开启时响应
- FavoritesPage: `if (imgShow.value) return` — 只在预览关闭时响应
- 两者形成完美的互斥关系

<acceptance_criteria>
- 导入 `onMounted` 和 `onUnmounted`
- `handleKeydown` 函数正确处理 `ArrowLeft`/`ArrowRight`
- 键盘事件在 `onMounted` 添加，`onUnmounted` 移除
- ImagePreview 打开时，键盘导航不生效（检查 `imgShow.value`）
- 首页时 `ArrowLeft` 不响应，末页时 `ArrowRight` 不响应
</acceptance_criteria>

---

### Task 6: 添加页面切换滚动行为

**目标:** 切换页面时滚动到顶部，保持与在线壁纸页面一致

<read_first>
- src/views/FavoritesPage.vue
- src/views/OnlineWallpaper.vue (第 233-242 行，watch currentPageData.currentPage 参考)
</read_first>

**实现要点:**

1. 确保导入 watch：

```typescript
import { ref, computed, shallowRef, onActivated, onMounted, onUnmounted, watch } from 'vue'
```

2. 添加 watch 监听页码变化：

```typescript
// 监听页码变化，触发滚动
watch(
  () => currentPageData.value.currentPage,
  (newPage, oldPage) => {
    // 仅在页码实际变化时滚动（排除初始化）
    if (oldPage !== undefined && oldPage !== 0 && newPage !== oldPage) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
)
```

<acceptance_criteria>
- 添加 `watch` 监听 `currentPageData.value.currentPage`
- 页码变化时调用 `window.scrollTo({ top: 0, behavior: 'smooth' })`
- 初始化时（`oldPage === undefined` 或 `0`）不触发滚动
- 滚动行为平滑（`behavior: 'smooth'`）
</acceptance_criteria>

---

## 验证标准

### 功能验证 (FAVPAG-01, FAVPAG-03, FAVPAG-04, FAVPAG-05)

1. **分页条显示**
   - 分页条正确显示在收藏列表下方
   - 页码按钮、省略号、总条目数都正确渲染
   - 当前页按钮高亮

2. **分页导航 (FAVPAG-01)**
   - 点击页码按钮能正确导航到对应页面
   - Previous 按钮在首页时禁用
   - Next 按钮在末页时禁用

3. **筛选切换**
   - 切换收藏夹筛选时重置到第 1 页
   - 切换收藏夹时清空 pageCache

4. **取消收藏数据同步**
   - 取消收藏后卡片从列表中移除
   - totalCount 和 counts 同步更新
   - 当前页清空时自动跳转

5. **滚动位置保持 (FAVPAG-05)**
   - KeepAlive 保持滚动位置（已配置）
   - 切换页面时滚动到顶部

6. **键盘导航**
   - ArrowLeft/ArrowRight 正确导航
   - 与 ImagePreview 无冲突

### 回归验证

- [ ] 收藏夹侧边栏切换正常
- [ ] 壁纸预览功能正常
- [ ] 收藏/取消收藏功能正常
- [ ] 下载功能正常
- [ ] 设为壁纸功能正常

---

## 必须达成 (must_haves)

1. **分页条正确渲染** — 页码、省略号、总条目数显示正确
2. **分页导航功能正常** — 点击页码能跳转，边界按钮禁用
3. **筛选切换重置分页** — 切换收藏夹时重置到第 1 页
4. **取消收藏数据同步** — 卡片移除，计数更新
5. **键盘导航正常** — ArrowLeft/ArrowRight 导航，与 ImagePreview 互斥
6. **页面切换滚动** — 切换页面自动滚动到顶部

---

*Plan created: 2026-05-04*
*Requirements: FAVPAG-01, FAVPAG-03, FAVPAG-04, FAVPAG-05*
