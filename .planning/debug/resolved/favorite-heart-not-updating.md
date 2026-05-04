---
status: resolved
trigger: 在线壁纸页面点击收藏，红心没有变化（实际已经添加到收藏了）
created: 2026-05-04T14:35:00.000Z
updated: 2026-05-04T14:50:00.000Z
---

# Debug Session: Favorite Heart Not Updating

## Symptoms

**Expected behavior:** 点击收藏后红心应该立即变成实心红色
**Actual behavior:** 点击后红心没有变化，但刷新页面后红心是实心的
**Error messages:** None
**Timeline:** 新发现问题
**Reproduction:** 在线壁纸页面点击壁纸卡片上的红心
**Confirmation:** 刷新页面后红心显示正确，说明收藏操作成功

## Current Focus

hypothesis: null
test: null
expecting: null
next_action: fix identified

## Evidence

### 证据 1: 数据流分析

**`WallpaperList.vue` 红心渲染逻辑（第 91-106 行）：**
```vue
<div
  class="thumb-favorite-btn"
  :class="{
    'is-favorite': heartState(liItem.id) === 'default',
    'is-favorite-in-other': heartState(liItem.id) === 'non-default',
  }"
>
```

`heartState()` 函数使用 `wallpaperCollectionMap` prop 来判断状态：
```typescript
const heartState = (id: string): HeartState => {
  return getHeartState(id, props.defaultCollectionId, props.wallpaperCollectionMap)
}
```

### 证据 2: wallpaperCollectionMap 的来源

**`OnlineWallpaper.vue` 第 200-211 行：**
```typescript
const wallpaperCollectionMap = computed(() => {
  const map = new Map<string, string[]>()
  for (const fav of favorites.value) {
    const ids = map.get(fav.wallpaperId)
    if (ids) {
      ids.push(fav.collectionId)
    } else {
      map.set(fav.wallpaperId, [fav.collectionId])
    }
  }
  return map
})
```

`wallpaperCollectionMap` 完全依赖于 `favorites.value`。

### 证据 3: 收藏操作后的状态更新

**`useFavorites.ts` 的 `add()` 方法（第 157-170 行）：**
```typescript
const add = async (
  wallpaperId: string,
  collectionId: string,
  wallpaperData: WallpaperItem,
): Promise<boolean> => {
  const result = await favoritesService.add(wallpaperId, collectionId, wallpaperData)
  if (result.success) {
    await loadCounts()  // ← 只加载计数，没有重新加载 favorites！
    showSuccess('已添加到收藏')
    return true
  }
  showError(result.error?.message || '添加收藏失败')
  return false
}
```

**问题核心：** `add()` 成功后只调用了 `loadCounts()`，没有重新加载 `favorites` 列表。

### 证据 4: 对比 store 中的实现

**`useFavoritesStore` 的 `addFavorite()` 方法（第 145-156 行）：**
```typescript
async function addFavorite(
  wallpaperId: string,
  collectionId: string,
  wallpaperData: any,
): Promise<boolean> {
  const result = await favoritesService.add(wallpaperId, collectionId, wallpaperData)
  if (result.success) {
    await loadFavorites()  // ← store 的实现正确地重新加载了 favorites
    return true
  }
  return false
}
```

Store 的实现是正确的，但 `useFavorites.ts` composable 的 `add()` 方法没有使用 store 的 `addFavorite()`，而是直接调用 service 并只更新了计数。

## Root Cause

**根本原因：** `useFavorites.ts` composable 的 `add()` 和 `remove()` 方法在操作成功后只调用了 `loadCounts()` 更新计数，没有更新 `favorites` 列表。

由于 `wallpaperCollectionMap` 是从 `favorites` 计算出来的，收藏操作后 `favorites` 不更新导致：
1. `wallpaperCollectionMap` 不更新
2. `heartState()` 计算结果不变
3. 红心 UI 不变化

## Resolution

**修复方案：** 在 `useFavorites.ts` 的 `add()` 和 `remove()` 方法中，成功后调用 `store.loadFavorites()` 重新加载收藏列表。

**修改文件：** `src/composables/favorites/useFavorites.ts`

**修复代码：**
```typescript
const add = async (
  wallpaperId: string,
  collectionId: string,
  wallpaperData: WallpaperItem,
): Promise<boolean> => {
  const result = await favoritesService.add(wallpaperId, collectionId, wallpaperData)
  if (result.success) {
    await store.loadFavorites()  // 重新加载收藏列表
    await loadCounts()
    showSuccess('已添加到收藏')
    return true
  }
  showError(result.error?.message || '添加收藏失败')
  return false
}

const remove = async (wallpaperId: string, collectionId: string): Promise<boolean> => {
  const result = await favoritesService.remove(wallpaperId, collectionId)
  if (result.success) {
    await store.loadFavorites()  // 重新加载收藏列表
    await loadCounts()
    showSuccess('已从收藏移除')
    return true
  }
  showError(result.error?.message || '移除收藏失败')
  return false
}
```

**验证方式：**
1. 在线壁纸页面点击壁纸卡片的红心
2. 确认红心立即变成实心红色
3. 再次点击，确认红心变回空心

## Files Changed

- `src/composables/favorites/useFavorites.ts`
