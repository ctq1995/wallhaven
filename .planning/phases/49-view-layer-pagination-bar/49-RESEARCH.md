# Phase 49: View Layer - Pagination Bar — Research

**Researched:** 2026-05-04
**Status:** Ready for planning

---

## Executive Summary

Phase 49 需要实现传统分页 UI 组件并集成到在线壁纸页面。核心任务是创建 `PaginationBar.vue` 组件、处理键盘导航与 ImagePreview 的互斥、以及收藏操作后的数据同步。

**关键发现：**
1. 已有完整的 `.pagination` CSS 样式（list.css），可直接复用
2. `useWallpaperList` 已提供 `goToPage()`, `currentPageData`, `totalCount` 等接口
3. 收藏状态三态显示逻辑已实现在 `getHeartState()` 函数中
4. 需要处理键盘导航与 ImagePreview 的 ArrowLeft/ArrowRight 冲突

---

## Research Findings

### 1. PaginationBar 组件设计模式

#### 1.1 组件 Props/Emits 设计（基于 D-02, D-03）

```typescript
// Props 设计
interface PaginationBarProps {
  currentPage: number      // 当前页码（1-based）
  totalPages: number       // 总页数
  totalCount: number       // 总条目数（用于显示 "共 X 张"）
  loading: boolean         // 加载状态（禁用交互）
}

// Emits 设计
interface PaginationBarEmits {
  'go-to-page': [page: number]  // 跳转到指定页
}
```

**参考模式：**
- Vue 3 Composition API + `<script setup lang="ts">`
- 使用 `defineProps<PaginationBarProps>()` 泛型语法
- 使用 `defineEmits<PaginationBarEmits>()` 泛型语法

**设计要点：**
- 组件仅负责 UI 渲染和用户交互，不包含业务逻辑
- 所有状态通过 props 传入，操作通过 emit 通知父组件
- 加载状态时禁用所有交互按钮

#### 1.2 页码显示策略（基于 D-04, D-05, D-06）

```
显示 5 个页码按钮 + 首尾页

示例（总页数 10）：
- 当前页 = 1:  [1] 2 3 4 5 ... 10
- 当前页 = 3:  1 2 [3] 4 5 ... 10
- 当前页 = 5:  1 ... 3 4 [5] 6 7 ... 10
- 当前页 = 8:  1 ... 6 7 [8] 9 10
- 当前页 = 10: 1 ... 6 7 8 9 [10]
```

**实现算法要点：**
- 计算显示范围：`start = max(1, current - 2)`, `end = min(total, current + 2)`
- 边界自适应：当 current 靠近边界时，扩展另一侧
- 省略号显示条件：左侧省略号（start > 2），右侧省略号（end < total - 1）

### 2. 现有 CSS 样式复用

#### 2.1 list.css 中的 .pagination 样式（已完整定义）

```css
/* 已有样式结构 */
.pagination { margin: 1em auto; text-align: center; }
.pagination ul { display: inline-block; box-shadow: 0 0 4px rgba(0,0,0,0.4); }
.pagination li { display: inline-block; text-align: center; }
.pagination li a, .pagination li span {
  display: inline-block;
  line-height: 2em;
  min-width: 2em;
  color: #ccc;
  /* ... 背景、边框样式 */
}
.pagination li.active a, .pagination li.active span { color: #777; cursor: default; }
.pagination li.disabled a, .pagination li.disabled span { color: #777; cursor: default; }
```

**复用策略：**
- 使用 `<nav class="pagination"><ul><li>...</li></ul></nav>` 结构
- `.active` 类标记当前页
- `.disabled` 类标记边界禁用按钮（首页时 Previous，末页时 Next）
- 无需新增样式，仅引用现有 `@import url('@/static/css/list.css')`

#### 2.2 样式使用示例

```html
<nav class="pagination">
  <ul>
    <li class="disabled"><span>上一页</span></li>
    <li class="active"><a href="#">1</a></li>
    <li><a href="#">2</a></li>
    <li><span>...</span></li>
    <li><a href="#">10</a></li>
    <li><a href="#">下一页</a></li>
  </ul>
</nav>
```

### 3. 键盘导航实现

#### 3.1 键盘事件监听（基于 D-10, D-11, D-12, D-13）

**当前问题：** ImagePreview 已监听 ArrowLeft/ArrowRight 用于图片导航

**解决方案：** 在 OnlineWallpaper.vue 中添加互斥逻辑

```typescript
// OnlineWallpaper.vue 中的实现模式
const handleKeydown = (event: KeyboardEvent) => {
  // 只在 ImagePreview 关闭时响应
  if (imgShow.value) return

  const { currentPage, totalPage } = currentPageData.value

  if (event.key === 'ArrowLeft' && currentPage > 1) {
    goToPage(currentPage - 1)
  } else if (event.key === 'ArrowRight' && currentPage < totalPage) {
    goToPage(currentPage + 1)
  }
}

// 生命周期钩子
onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
```

**关键点：**
- 键盘监听在 onMounted 添加，onUnmounted 移除
- `imgShow.value` 为 true 时直接返回，不处理分页导航
- 边界检查：第一页不响应 ArrowLeft，最后一页不响应 ArrowRight

#### 3.2 与 ImagePreview 的互斥逻辑

**ImagePreview.vue 现有实现（第 261-270 行）：**

```typescript
const handleKeydown = (event: KeyboardEvent) => {
  // 只在预览显示时响应
  if (!props.showing) return

  if (event.key === 'ArrowLeft') {
    navigatePrev()
  } else if (event.key === 'ArrowRight') {
    navigateNext()
  }
}
```

**互斥机制：**
- ImagePreview: `if (!props.showing) return` — 只在预览开启时响应
- OnlineWallpaper: `if (imgShow.value) return` — 只在预览关闭时响应
- 两者形成完美的互斥关系，无需额外协调

### 4. 页面切换滚动行为

#### 4.1 滚动实现（基于 D-07, D-08, D-09）

```typescript
// OnlineWallpaper.vue 中 watch currentPageData.currentPage
import { watch } from 'vue'

// 使用 useWallpaperList 提供的 currentPageData
const { currentPageData, goToPage } = useWallpaperList()

// 监听页码变化，触发滚动
watch(
  () => currentPageData.value.currentPage,
  (newPage, oldPage) => {
    // 仅在页码实际变化时滚动（排除初始化）
    if (oldPage !== undefined && newPage !== oldPage) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
)
```

**滚动触发时机：**
- 页码变化后立即滚动，与数据加载并行
- 使用 `behavior: 'smooth'` 提供流畅体验
- 排除初始化场景（oldPage === undefined）

#### 4.2 滚动与 KeepAlive 的配合

**当前实现：**
- OnlineWallpaper 在 KeepAlive include 列表中
- onActivated/onDeactivated 用于管理滚动监听

**注意事项：**
- 滚动到顶部逻辑不需要考虑 KeepAlive 状态
- 页面切换时的滚动是主动行为，与 KeepAlive 缓存无关

### 5. 收藏状态三态显示同步

#### 5.1 已有的三态逻辑（getHeartState 函数）

```typescript
// src/utils/heart.ts
export type HeartState = 'default' | 'non-default' | 'none'

export function getHeartState(
  wallpaperId: string,
  defaultCollectionId: string | null,
  collectionMap: Map<string, string[]>,
): HeartState {
  const ids = collectionMap.get(wallpaperId)
  if (!ids || ids.length === 0) return 'none'
  if (defaultCollectionId && ids.includes(defaultCollectionId)) return 'default'
  return 'non-default'
}
```

#### 5.2 收藏操作后的数据同步（基于 D-14, D-15, FAVSTA-03）

**当前实现问题：**
- `is_favorite` 字段由 Service 层在 API 响应时注入
- 收藏/取消收藏后，`currentPageData` 中的 `is_favorite` 不会自动更新

**解决方案：**
1. 方案 A：刷新当前页（调用 `refresh()`）
2. 方案 B：局部更新 `currentPageData` 中对应项的 `is_favorite`（D-18 要求）

**方案 B 实现思路：**

```typescript
// 在 handleToggleFavorite 成功后更新 is_favorite
const handleToggleFavorite = async (item: WallpaperItem) => {
  // ... 现有收藏逻辑

  // 成功后更新 currentPageData 中的 is_favorite
  // 需要在 useWallpaperList 中提供 updateItemFavoriteStatus 方法
}
```

**需要确认的实现细节：**
- 收藏成功后，`is_favorite` 应更新为 `1`（默认收藏夹）或 `2`（其他收藏夹）
- 取消收藏后，`is_favorite` 应更新为 `0`
- 需要根据操作类型和收藏夹类型判断更新值

### 6. 集成点分析

#### 6.1 OnlineWallpaper.vue 修改点

| 修改项 | 描述 |
|--------|------|
| 引入 PaginationBar | `import PaginationBar from '@/components/PaginationBar.vue'` |
| 替换无限滚动 | 移除 `throttledScrollEvent` 相关代码 |
| 添加分页状态 | 使用 `currentPageData`, `totalCount` |
| 添加键盘监听 | ArrowLeft/ArrowRight 导航 |
| 添加滚动逻辑 | watch currentPage 触发滚动 |
| 收藏状态同步 | 收藏成功后更新 is_favorite |

#### 6.2 WallpaperList.vue 修改点

| 修改项 | 描述 |
|--------|------|
| 添加 PaginationBar slot | 在 `.main-bottom` 前添加分页条 |
| Props 扩展 | 添加 `currentPage`, `totalPages`, `totalCount`, `loading` |
| Emit 扩展 | 添加 `go-to-page` 事件 |

**设计决策：**
- PaginationBar 放在 `<main>` 内，`.thumbs-container` 后，`.main-bottom` 前
- 或者：PaginationBar 放在 OnlineWallpaper.vue 中，WallpaperList 不变

**推荐方案：** PaginationBar 放在 OnlineWallpaper.vue 中，与 WallpaperList 平级

```html
<!-- OnlineWallpaper.vue -->
<template>
  <div class="online-wallpaper-page">
    <!-- ... 其他组件 ... -->
    <WallpaperList v-else ... />
    <PaginationBar
      v-if="!error && currentPageData.totalPage > 0"
      :current-page="currentPageData.currentPage"
      :total-pages="currentPageData.totalPage"
      :total-count="totalCount"
      :loading="loading"
      @go-to-page="handleGoToPage"
    />
  </div>
</template>
```

---

## Dependencies Inventory

### 直接依赖（Phase 46-48 产出）

| 依赖项 | 位置 | 用途 |
|--------|------|------|
| `currentPageData` | wallpaper store | 当前页数据 |
| `pageCache` | wallpaper store | 页面缓存 |
| `totalCount` | wallpaper store | 总条目数 |
| `goToPage()` | useWallpaperList | 分页导航 |
| `refresh()` | useWallpaperList | 刷新当前页 |
| `PageData` | types/domain/wallpaper.ts | 页面数据类型 |
| `WallpaperItem.is_favorite` | types/domain/wallpaper.ts | 收藏状态字段 |
| `getHeartState()` | utils/heart.ts | 三态显示计算 |

### 现有资源复用

| 资源 | 位置 | 用途 |
|------|------|------|
| `.pagination` CSS | static/css/list.css | 分页条样式 |
| ImagePreview 键盘逻辑 | ImagePreview.vue | 互斥参考 |
| KeepAlive 配置 | Main.vue | 页面缓存 |

---

## Pitfalls & Gotchas

### 1. 键盘事件冲突

**问题：** ImagePreview 和分页导航都监听 ArrowLeft/ArrowRight

**解决：** 通过 `imgShow` 变量实现互斥
- ImagePreview: `if (!props.showing) return`
- OnlineWallpaper: `if (imgShow.value) return`

### 2. 滚动位置恢复

**问题：** KeepAlive 缓存的页面恢复时，滚动位置可能不正确

**解决：**
- 页面切换时主动滚动到顶部
- 返回页面时保持滚动位置（KeepAlive 默认行为）

### 3. 收藏状态同步时机

**问题：** 收藏/取消收藏后，`currentPageData` 中的 `is_favorite` 不会自动更新

**解决：**
- 方案 A：调用 `refresh()` 刷新当前页（简单但有网络请求）
- 方案 B：局部更新 `is_favorite` 字段（推荐，无网络请求）

### 4. shallowRef 与响应式更新

**问题：** `currentPageData` 使用 `shallowRef`，直接修改数组元素不会触发更新

**解决：**
- 更新时需要创建新对象：`currentPageData.value = { ...currentPageData.value }`
- 或在 Store 中提供专门的更新方法

### 5. 省略号点击行为

**问题：** 省略号不可点击，但 CSS 样式可能使其看起来可点击

**解决：**
- 使用 `<span>` 而非 `<a>` 标签
- 添加 `cursor: default` 样式（已存在于 list.css）

---

## Implementation Checklist

### PaginationBar.vue 组件

- [ ] 创建组件文件 `src/components/PaginationBar.vue`
- [ ] 实现 Props 接口（currentPage, totalPages, totalCount, loading）
- [ ] 实现 Emit 接口（go-to-page）
- [ ] 实现页码计算逻辑（5 个页码 + 省略号）
- [ ] 实现 Previous/Next 按钮（边界禁用）
- [ ] 实现总条目数显示
- [ ] 复用 list.css 样式
- [ ] 添加单元测试（页码计算逻辑）

### OnlineWallpaper.vue 集成

- [ ] 引入 PaginationBar 组件
- [ ] 使用 currentPageData 和 totalCount
- [ ] 实现 goToPage 事件处理
- [ ] 添加键盘导航监听（ArrowLeft/ArrowRight）
- [ ] 实现与 ImagePreview 的互斥逻辑
- [ ] 添加页面切换滚动逻辑
- [ ] 移除无限滚动相关代码
- [ ] 实现收藏状态同步

### 收藏状态同步

- [ ] 在 useWallpaperList 中添加 updateItemFavoriteStatus 方法
- [ ] 在 handleToggleFavorite 成功后调用更新方法
- [ ] 测试三态显示是否正确更新

---

## Questions for Planning Phase

1. **PaginationBar 位置：** 放在 WallpaperList 内部还是 OnlineWallpaper.vue 中？（推荐后者，保持 WallpaperList 职责单一）

2. **收藏状态同步方案：** 使用 `refresh()` 刷新还是局部更新 `is_favorite`？（推荐局部更新，减少网络请求）

3. **键盘导航防抖：** 是否需要对 ArrowLeft/ArrowRight 添加防抖处理？

4. **总条目数格式化：** 是否需要添加千分位分隔符（如 "1,234 张"）？

5. **loading 状态 UI：** 分页按钮在 loading 时是完全禁用还是显示 loading 动画？

---

*Research completed: 2026-05-04*
*Ready for: /gsd-plan-phase 49*
