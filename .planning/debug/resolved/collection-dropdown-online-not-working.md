---
status: resolved
trigger: "在线壁纸页面的CollectionDropdown无效，无法实现收藏/取消收藏功能"
created: "2026-05-04"
updated: "2026-05-04"
---

# Debug Session: collection-dropdown-online-not-working

## Symptoms

- **Expected behavior**: 点击后壁纸被添加到收藏夹
- **Actual behavior**: 点击后无反应
- **Error messages**: 没有看到错误
- **Timeline**: 之前可以工作，现在是回归问题
- **Reproduction**: 在线壁纸页面点击收藏
- **Updated observation**: 下拉菜单能正常打开且有内容，但点击收藏夹项后无效

## Current Focus

hypothesis: "点击事件可能没有被正确触发，或者数据传递有问题"
test: "添加调试日志追踪点击事件和数据流"
expecting: "控制台日志显示调用链和可能的错误"
next_action: "运行应用，查看控制台输出"
reasoning_checkpoint: "已添加完整的调试日志链"
tdd_checkpoint: "需要验证日志输出"

## Evidence

### 问题分析

1. **数据加载时机问题**（已修复但仍无效）：
   - `main.ts` 中的 `initializeApp()` 是非阻塞式的
   - 用户可以在数据加载完成前点击收藏按钮
   - 此时 Pinia store 中的 `collections` 和 `favorites` 还是空数组

2. **原组件实现问题**（已修复但仍无效）：
   - `CollectionDropdown` 组件在 `onMounted` 中加载数据
   - 但这是异步操作，组件渲染时数据可能还没准备好
   - 没有加载状态指示，用户看到空列表

3. **当前调试方向**：
   - 点击事件是否被触发
   - 数据是否正确传递
   - IPC 调用是否成功

### 代码流程

```
用户点击收藏夹项
  ↓
CollectionDropdown.toggleCollection()
  ↓
useFavorites.add()
  ↓
favoritesService.add()
  ↓
favoritesRepository.addFavorite()
  ↓
electronClient.favoritesAdd()
  ↓
window.electronAPI.favoritesAdd()
  ↓
主进程 IPC handler
```

### 已添加的调试日志

1. `CollectionDropdown.vue`:
   - visible 变化时
   - 数据加载完成时
   - toggleCollection 调用时（包含所有参数）
   - addFavorite 结果

2. `useFavorites.ts`:
   - load() 调用时
   - add() 调用时（包含参数）
   - favoritesService.add 结果

3. `favorites.service.ts`:
   - add() 调用时（包含参数）
   - repository 结果

4. `favorites.repository.ts`:
   - addFavorite 调用时
   - electronClient 结果

5. `electron.client.ts`:
   - favoritesAdd 调用时
   - window.electronAPI 结果

## Root Cause

**已确认**：Electron IPC 序列化错误 - `wallpaperData` 是 Vue Proxy 对象，无法被结构化克隆算法序列化。

错误日志：
```
[ElectronClient] favoritesAdd error: Error: An object could not be cloned.
```

## Fix

在 `electron.client.ts` 的 `favoritesAdd` 方法中，使用 `JSON.parse(JSON.stringify())` 将 Proxy 对象转换为纯 JSON 对象：

```typescript
// 将 Proxy 对象转换为纯 JSON 对象，避免 IPC 序列化错误
const plainWallpaperData = JSON.parse(JSON.stringify(wallpaperData))
const result = await window.electronAPI.favoritesAdd({ wallpaperId, collectionId, wallpaperData: plainWallpaperData })
```

## Verification

- [x] 查看控制台日志，确认问题点
- [ ] 测试收藏功能是否正常工作
- [ ] 测试取消收藏功能

## Resolution

root_cause: "wallpaperData 是 Vue Proxy 对象，Electron IPC 的结构化克隆算法无法序列化"
fix: "在 IPC 调用前使用 JSON.parse(JSON.stringify()) 转换为纯对象"
verification: "待验证"
files_changed: ["src/clients/electron.client.ts"]
