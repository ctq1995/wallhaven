---
wave: 1
depends_on: []
files_modified:
  - src/types/domain/wallpaper.ts
  - src/types/domain/favorite.ts
  - src/types/domain/download.ts
  - src/types/domain/settings.ts
  - src/types/domain/index.ts
  - src/types/index.ts
  - src/shared/types/ipc.ts
  - electron/preload/index.ts
  - electron/main/ipc/handlers/favorites.handler.ts
  - src/clients/electron.client.ts
autonomous: true
requirements:
  - DATAREF-01
  - DATAREF-02
  - DATAREF-03
  - FAVSTA-01
  - FAVPAG-02
---

# Phase 46: Infrastructure — Execution Plan

**Goal:** 建立分页功能的类型系统和 IPC 通信基础

**Success Criteria:**
1. TypeScript 编译无错误（包含新增类型定义）
2. 新 IPC 通道常量正确定义
3. Preload 层正确桥接新 IPC 通道
4. ElectronClient 新方法签名正确
5. Handler 占位返回 `NOT_IMPLEMENTED` 错误

---

## Task 1: 创建 wallpaper.ts 类型文件

<read_first>
- src/types/index.ts — 当前所有类型定义，需要迁移
- src/utils/heart.ts — HeartState 三态定义，用于 is_favorite 注释
</read_first>

<action>
创建 `src/types/domain/wallpaper.ts`，包含以下内容：

1. 从 src/types/index.ts 迁移的壁纸相关类型：
   - `WallpaperItem` 接口，新增 `is_favorite?: 0 | 1 | 2` 可选字段
   - `WallpaperThumb` 接口
   - `WallpaperMeta` 接口
   - `WallpaperQuery` 接口
   - `PageData` 接口
   - `TotalPageData` 接口（保留用于无限滚动）

2. 新增类型：
   - `PageCache` 类型别名：`Map<number, PageData>`

3. `is_favorite` 字段注释必须包含：
   ```typescript
   /**
    * 收藏状态（由 Service 层后处理添加）
    * - 0: 未收藏
    * - 1: 收藏到默认收藏夹
    * - 2: 收藏到其他收藏夹（非默认）
    * 与 HeartState 对应：0 → 'none', 1 → 'default', 2 → 'non-default'
    */
   is_favorite?: 0 | 1 | 2
   ```

4. `PageCache` 类型注释：
   ```typescript
   /**
    * 在线壁纸页面缓存结构
    * key: 页码 (1-based)
    * value: 该页的壁纸数据
    */
   export type PageCache = Map<number, PageData>
   ```
</action>

<acceptance_criteria>
- `src/types/domain/wallpaper.ts` 文件存在
- 文件包含 `export interface WallpaperItem` 定义
- 文件包含 `is_favorite?: 0 | 1 | 2` 字段
- 文件包含 `export type PageCache = Map<number, PageData>`
- 文件包含 `export interface PageData`
- 文件包含 `export interface TotalPageData`
</acceptance_criteria>

---

## Task 2: 创建 favorite.ts 类型文件

<read_first>
- src/types/favorite.ts — 当前收藏相关类型定义
- src/types/index.ts — 确认导入路径
</read_first>

<action>
创建 `src/types/domain/favorite.ts`，包含以下内容：

1. 从 src/types/favorite.ts 迁移的类型：
   - `Collection` 接口
   - `FavoriteItem` 接口
   - `FavoritesData` 接口
   - `FavoritesErrorCodes` 常量
   - `FavoritesErrorCode` 类型

2. 新增类型：
   ```typescript
   /**
    * 分页查询参数
    * 用于 SQLite LIMIT/OFFSET 查询
    */
   export interface PaginationParams {
     /** 每页条数，默认 24 */
     limit: number
     /** 偏移量 (0-based) */
     offset: number
   }

   /**
    * 分页收藏查询结果
    */
   export interface PaginatedFavoritesResult {
     /** 当前页的收藏项 */
     items: FavoriteItem[]
     /** 总条目数 */
     total: number
     /** 是否有更多数据 */
     hasMore: boolean
   }
   ```

3. 移除对 `src/types/index.ts` 的 `import type { WallpaperItem }` 依赖
4. 改为 `import type { WallpaperItem } from './wallpaper'`
</action>

<acceptance_criteria>
- `src/types/domain/favorite.ts` 文件存在
- 文件包含 `export interface PaginationParams`
- 文件包含 `export interface PaginatedFavoritesResult`
- 文件包含 `export interface Collection`
- 文件包含 `export interface FavoriteItem`
- 文件包含 `export const FavoritesErrorCodes`
- 文件使用 `import type { WallpaperItem } from './wallpaper'`
</acceptance_criteria>

---

## Task 3: 创建 download.ts 类型文件

<read_first>
- src/types/index.ts — 当前下载相关类型定义
</read_first>

<action>
创建 `src/types/domain/download.ts`，从 src/types/index.ts 迁移下载相关类型：

1. 迁移类型：
   - `DownloadState` 类型
   - `DownloadItem` 接口
   - `FinishedDownloadItem` 接口
</action>

<acceptance_criteria>
- `src/types/domain/download.ts` 文件存在
- 文件包含 `export type DownloadState`
- 文件包含 `export interface DownloadItem`
- 文件包含 `export interface FinishedDownloadItem`
</acceptance_criteria>

---

## Task 4: 创建 settings.ts 类型文件

<read_first>
- src/types/index.ts — 当前设置相关类型定义
</read_first>

<action>
创建 `src/types/domain/settings.ts`，从 src/types/index.ts 迁移设置相关类型：

1. 迁移类型：
   - `WallpaperFit` 类型
   - `AppSettings` 接口
</action>

<acceptance_criteria>
- `src/types/domain/settings.ts` 文件存在
- 文件包含 `export type WallpaperFit`
- 文件包含 `export interface AppSettings`
</acceptance_criteria>

---

## Task 5: 更新 domain/index.ts 统一导出

<read_first>
- src/types/domain/index.ts — 当前空导出文件
</read_first>

<action>
更新 `src/types/domain/index.ts`，统一导出所有 domain 类型：

```typescript
/**
 * 领域类型统一导出
 * Phase 46: 从 src/types/index.ts 迁移类型定义
 */

export * from './wallpaper'
export * from './favorite'
export * from './download'
export * from './settings'
```
</action>

<acceptance_criteria>
- `src/types/domain/index.ts` 包含 `export * from './wallpaper'`
- `src/types/domain/index.ts` 包含 `export * from './favorite'`
- `src/types/domain/index.ts` 包含 `export * from './download'`
- `src/types/domain/index.ts` 包含 `export * from './settings'`
</acceptance_criteria>

---

## Task 6: 更新 src/types/index.ts 为重导出入口

<read_first>
- src/types/index.ts — 当前所有类型定义
- src/types/favorite.ts — 将被废弃的文件
</read_first>

<action>
更新 `src/types/index.ts`：

1. 删除所有已迁移到 domain/ 的类型定义
2. 保留未迁移的类型：
   - `CustomParams` 接口
   - `GetParams` 接口
   - `ResolutionLine`, `RatioLine`, `ColorLine` 接口
   - `SearchBarProps`, `WallpaperListProps` 接口
   - `WallpaperActionInfo` 接口

3. 添加重导出：
   ```typescript
   // 从 domain 目录重导出
   export * from './domain'

   // 保留旧的 favorite.ts 重导出（向后兼容）
   // 注意：新代码应从 domain 导入
   ```
</action>

<acceptance_criteria>
- `src/types/index.ts` 包含 `export * from './domain'`
- `src/types/index.ts` 不再包含 `WallpaperItem` 定义
- `src/types/index.ts` 不再包含 `PageData` 定义
- `src/types/index.ts` 不再包含 `DownloadItem` 定义
- `src/types/index.ts` 仍包含 `CustomParams` 接口
</acceptance_criteria>

---

## Task 7: 更新 IPC 通道常量

<read_first>
- src/shared/types/ipc.ts — 当前 IPC 通道定义
</read_first>

<action>
在 `src/shared/types/ipc.ts` 的 `IPC_CHANNELS` 对象中添加新通道：

```typescript
// 在 FAVORITES_GET_COLLECTIONS_FOR_WALLPAPER 之后添加：
FAVORITES_GET_PAGINATED: 'favorites-get-paginated',
FAVORITES_GET_COUNTS: 'favorites-get-counts',
```

同时添加新的请求/响应类型：

```typescript
/**
 * 分页获取收藏请求参数
 */
export interface FavoritesGetPaginatedRequest {
  collectionId?: string
  limit: number
  offset: number
}

/**
 * 收藏计数响应
 * key: collectionId 或 '_total'（表示全部收藏的唯一壁纸数）
 * value: 计数
 */
export type FavoritesCountsResponse = Record<string, number>
```
</action>

<acceptance_criteria>
- `IPC_CHANNELS` 包含 `FAVORITES_GET_PAGINATED: 'favorites-get-paginated'`
- `IPC_CHANNELS` 包含 `FAVORITES_GET_COUNTS: 'favorites-get-counts'`
- 文件包含 `export interface FavoritesGetPaginatedRequest`
- 文件包含 `export type FavoritesCountsResponse`
</acceptance_criteria>

---

## Task 8: 更新 Preload 桥接

<read_first>
- electron/preload/index.ts — 当前 preload 实现
- src/shared/types/ipc.ts — 新增的 IPC 通道
</read_first>

<action>
在 `electron/preload/index.ts` 中：

1. 在 `ElectronAPI` 接口中添加：
   ```typescript
   favoritesGetPaginated: (params: {
     collectionId?: string
     limit: number
     offset: number
   }) => Promise<IpcResponse<any>>
   favoritesGetCounts: () => Promise<IpcResponse<Record<string, number>>>
   ```

2. 在 `electronAPI` 对象中添加实现：
   ```typescript
   favoritesGetPaginated: (params) => {
     console.log('[Preload] favoritesGetPaginated called:', params)
     return ipcRenderer.invoke(IPC_CHANNELS.FAVORITES_GET_PAGINATED, params)
   },
   favoritesGetCounts: () => {
     console.log('[Preload] favoritesGetCounts called')
     return ipcRenderer.invoke(IPC_CHANNELS.FAVORITES_GET_COUNTS)
   },
   ```
</action>

<acceptance_criteria>
- `ElectronAPI` 接口包含 `favoritesGetPaginated` 方法签名
- `ElectronAPI` 接口包含 `favoritesGetCounts` 方法签名
- `electronAPI` 对象包含 `favoritesGetPaginated` 实现
- `electronAPI` 对象包含 `favoritesGetCounts` 实现
- 实现使用 `IPC_CHANNELS.FAVORITES_GET_PAGINATED`
- 实现使用 `IPC_CHANNELS.FAVORITES_GET_COUNTS`
</acceptance_criteria>

---

## Task 9: 添加 Handler 占位实现

<read_first>
- electron/main/ipc/handlers/favorites.handler.ts — 当前 handler 实现
- electron/main/database.ts:100-111 — favorites 表结构参考
</read_first>

<action>
在 `electron/main/ipc/handlers/favorites.handler.ts` 的 `registerFavoritesHandlers` 函数末尾添加两个占位 handler：

```typescript
  /**
   * 分页获取收藏（Phase 47 实现）
   */
  ipcMain.handle(
    'favorites-get-paginated',
    (_event, params: { collectionId?: string; limit: number; offset: number }) => {
      logHandler('favorites-get-paginated', 'Not implemented - Phase 47', 'warn')
      return {
        success: false,
        error: { code: 'NOT_IMPLEMENTED', message: 'Will be implemented in Phase 47' },
      }
    },
  )

  /**
   * 获取所有收藏夹计数（Phase 47 实现）
   */
  ipcMain.handle('favorites-get-counts', () => {
    logHandler('favorites-get-counts', 'Not implemented - Phase 47', 'warn')
    return {
      success: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'Will be implemented in Phase 47' },
    }
  })
```

注意：添加在 `registerFavoritesHandlers` 函数内部的 `favorites-get-collections-for-wallpaper` handler 之后。
</action>

<acceptance_criteria>
- 文件包含 `ipcMain.handle('favorites-get-paginated'` 调用
- 文件包含 `ipcMain.handle('favorites-get-counts'` 调用
- handler 返回 `success: false`
- handler 返回 `error.code: 'NOT_IMPLEMENTED'`
- handler 使用 `logHandler` 记录日志
</acceptance_criteria>

---

## Task 10: 更新 ElectronClient 添加新方法

<read_first>
- src/clients/electron.client.ts — 当前 client 实现
- src/shared/types/ipc.ts — 新增的类型
- src/types/domain/favorite.ts — PaginationParams, PaginatedFavoritesResult
</read_first>

<action>
在 `src/clients/electron.client.ts` 中：

1. 添加导入类型（更新 import）：
   ```typescript
   import type {
     IpcResponse,
     DownloadProgressData,
     LocalFile,
     CacheInfo,
     ResumeDownloadParams,
     PendingDownload,
     FavoritesGetPaginatedRequest,
     FavoritesCountsResponse,
   } from '@/shared/types/ipc'
   import type { PaginationParams, PaginatedFavoritesResult, Collection, FavoriteItem, WallpaperItem } from '@/types'
   ```

2. 在 `// ==================== Favorites & Collections ====================` 部分末尾添加两个新方法：

   ```typescript
   /**
    * 分页获取收藏项
    */
   async favoritesGetPaginated(
     params: PaginationParams & { collectionId?: string },
   ): Promise<IpcResponse<PaginatedFavoritesResult>> {
     if (!this.isAvailable()) {
       return this.createUnavailableResponse<PaginatedFavoritesResult>()
     }

     try {
       const result = await window.electronAPI.favoritesGetPaginated(params)
       if (result.success) {
         return { success: true, data: result.data as PaginatedFavoritesResult }
       }
       return {
         success: false,
         error: result.error || { code: 'FAVORITES_ERROR', message: '分页获取收藏失败' },
       }
     } catch (error) {
       return {
         success: false,
         error: { code: 'FAVORITES_ERROR', message: String(error) },
       }
     }
   }

   /**
    * 获取所有收藏夹计数
    */
   async favoritesGetCounts(): Promise<IpcResponse<Record<string, number>>> {
     if (!this.isAvailable()) {
       return this.createUnavailableResponse<Record<string, number>>()
     }

     try {
       const result = await window.electronAPI.favoritesGetCounts()
       if (result.success) {
         return { success: true, data: result.data as Record<string, number> }
       }
       return {
         success: false,
         error: result.error || { code: 'FAVORITES_ERROR', message: '获取收藏计数失败' },
       }
     } catch (error) {
       return {
         success: false,
         error: { code: 'FAVORITES_ERROR', message: String(error) },
       }
     }
   }
   ```
</action>

<acceptance_criteria>
- `electronClient` 包含 `favoritesGetPaginated` 方法
- `electronClient` 包含 `favoritesGetCounts` 方法
- `favoritesGetPaginated` 参数类型为 `PaginationParams & { collectionId?: string }`
- `favoritesGetPaginated` 返回类型为 `Promise<IpcResponse<PaginatedFavoritesResult>>`
- `favoritesGetCounts` 返回类型为 `Promise<IpcResponse<Record<string, number>>>`
</acceptance_criteria>

---

## Task 11: TypeScript 编译验证

<read_first>
- package.json — 确认 TypeScript 编译命令
</read_first>

<action>
运行 TypeScript 编译检查，确保所有类型定义正确、导入路径有效：

```bash
cd /Volumes/DATA/Code/Vscode/wallhaven && npm run type-check
```

如果没有 `type-check` 脚本，运行：
```bash
npx vue-tsc --noEmit
```
</action>

<acceptance_criteria>
- TypeScript 编译无错误（exit code 0）
- 所有类型导入有效
- 无循环依赖警告
</acceptance_criteria>

---

## Verification

### must_haves（目标回溯验证）

| ID | 要求 | 验证方式 |
|----|------|----------|
| DATAREF-01 | 保留 TotalPageData，新增 PageCache | `grep "export interface TotalPageData" src/types/domain/wallpaper.ts` |
| DATAREF-02 | PageCache 类型定义 | `grep "export type PageCache = Map<number, PageData>" src/types/domain/wallpaper.ts` |
| DATAREF-03 | Favorites 保持 TotalPageData | TotalPageData 仍存在，未修改 |
| FAVSTA-01 | is_favorite 字段定义 | `grep "is_favorite?: 0 | 1 | 2" src/types/domain/wallpaper.ts` |
| FAVPAG-02 | IPC 通道基础设施 | `grep "FAVORITES_GET_PAGINATED" src/shared/types/ipc.ts` |

### 整体验证命令

```bash
# 1. TypeScript 编译
npm run type-check

# 2. 检查关键类型定义
grep "is_favorite?: 0 | 1 | 2" src/types/domain/wallpaper.ts
grep "export type PageCache" src/types/domain/wallpaper.ts
grep "FAVORITES_GET_PAGINATED" src/shared/types/ipc.ts
grep "favoritesGetPaginated" src/clients/electron.client.ts
grep "ipcMain.handle('favorites-get-paginated'" electron/main/ipc/handlers/favorites.handler.ts
```

---

## Dependencies

本阶段无前置依赖，Phase 47 将依赖本阶段产出的类型定义和 IPC 通道。

---

*Plan created: 2026-05-04*
*Phase: 46-infrastructure*
