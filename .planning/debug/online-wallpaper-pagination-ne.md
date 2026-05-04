---
slug: online-wallpaper-pagination-ne
status: resolved
trigger: |
  在线壁纸页面壁纸分页点击下一页数据没有更新
created: 2026-05-04
updated: 2026-05-04

symptoms:
  expected: "点击下一页后，滚动到顶部显示新壁纸"
  actual: "显示加载中但数据不变"
  errors: "无错误信息"
  timeline: "每次都复现"
  reproduction: "在在线壁纸页面点击下一页按钮"

# Current Focus
hypothesis: ""
test: ""
expecting: ""
next_action: ""
reasoning_checkpoint: ""
tdd_checkpoint: ""

# Evidence

## 分析过程
1. 查看 OnlineWallpaper.vue → 发现使用 `wallpapers`（即 totalPageData）传递给 WallpaperList
2. 查看 WallpaperList.vue → 遍历 `pageData.sections` 显示壁纸
3. 查看 useWallpaperList.ts → 发现 `goToPage` 方法只更新了 `currentPageData`，没有更新 `totalPageData`

## 根本原因
- `goToPage` 方法成功获取数据后，只更新了 `store.currentPageData`
- `WallpaperList` 组件绑定的是 `wallpapers`（即 `totalPageData`）
- `totalPageData` 在分页时没有被更新，导致界面显示不变

## 对比 fetch 方法
`fetch` 方法正确更新了 `totalPageData`：
```typescript
store.totalPageData = {
  sections: [pageData],
  totalPage: pageData.totalPage,
  currentPage: pageData.currentPage,
}
```
而 `goToPage` 缺少这段逻辑。

# Eliminated

# Resolution
root_cause: "goToPage 方法只更新 currentPageData，未更新 totalPageData，导致 WallpaperList 组件无法显示新页面数据"
fix: "在 goToPage 方法中添加 totalPageData 更新逻辑，包括缓存命中和 API 加载两种情况"
verification: "点击下一页按钮，壁纸列表更新为新页面数据，页面滚动到顶部"
files_changed:
  - src/composables/wallpaper/useWallpaperList.ts
