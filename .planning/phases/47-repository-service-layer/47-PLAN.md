# Phase 47: Repository & Service Layer — 执行计划

---
wave: 1
depends_on: [46]
files_modified:
  - src/shared/types/ipc.ts
  - electron/preload/index.ts
  - src/clients/electron.client.ts
  - electron/main/ipc/handlers/favorites.handler.ts
  - src/repositories/favorites.repository.ts
  - src/services/wallpaper.service.ts
autonomous: true
requirements: [FAVSTA-02, FAVPAG-02]
must_haves:
  - favoritesGetPaginated({ limit: 24, offset: 0 }) returns items + total + hasMore
  - favoritesGetCounts() returns { _total: N, [collectionId]: M }
  - getFavoriteStatusMap(ids) returns Record<string, 0|1|2>
  - WallpaperService.search() returns items with is_favorite field
---

## 目标

实现 Repository 层分页查询和 Service 层收藏状态计算，承接 Phase 46 的类型系统和 IPC 通道基础设施。

**成功标准：**
1. `favoritesGetPaginated({ limit: 24, offset: 0 })` 返回前 24 条收藏 + 正确的 total + hasMore
2. `WallpaperService.search()` 返回的数据包含正确的 `is_favorite` 字段
3. `favoritesGetCounts()` 返回去重的全部收藏计数和各收藏夹计数

---

## Task 1: 新增 IPC 通道常量 FAVORITES_GET_STATUS_MAP

<read_first>
- `src/shared/types/ipc.ts` — 查看现有 IPC_CHANNELS 定义模式
</read_first>

<action>
在 `src/shared/types/ipc.ts` 的 `IPC_CHANNELS` 对象中新增 `FAVORITES_GET_STATUS_MAP` 常量：

```typescript
// 在 Line 70 FAVORITES_GET_COUNTS 之后添加
FAVORITES_GET_STATUS_MAP: 'favorites-get-status-map',
```

同时在同一文件中新增请求参数类型定义（在 `FavoritesCountsResponse` 之后）：

```typescript
/**
 * 批量获取收藏状态请求参数
 */
export interface FavoritesGetStatusMapRequest {
  wallpaperIds: string[]
}

/**
 * 收藏状态映射响应
 * key: wallpaperId
 * value: 0=未收藏, 1=收藏到默认收藏夹, 2=收藏到其他收藏夹
 */
export type FavoritesStatusMapResponse = Record<string, 0 | 1 | 2>
```
</action>

<acceptance_criteria>
- `grep "FAVORITES_GET_STATUS_MAP" src/shared/types/ipc.ts` 返回匹配行
- `grep "FavoritesGetStatusMapRequest" src/shared/types/ipc.ts` 返回匹配行
- `grep "FavoritesStatusMapResponse" src/shared/types/ipc.ts` 返回匹配行
</acceptance_criteria>

---

## Task 2: 更新 Preload 桥接添加 favoritesGetStatusMap

<read_first>
- `electron/preload/index.ts` — 查看现有 ElectronAPI 接口和实现模式
- `src/shared/types/ipc.ts` — 确认新增的 IPC_CHANNELS.FAVORITES_GET_STATUS_MAP 常量
</read_first>

<action>
在 `electron/preload/index.ts` 中：

1. 在 `ElectronAPI` 接口（约 Line 117 之后）添加方法签名：
```typescript
favoritesGetStatusMap: (params: { wallpaperIds: string[] }) => Promise<IpcResponse<Record<string, 0 | 1 | 2>>>
```

2. 在 `electronAPI` 对象实现中（约 Line 320 之后）添加实现：
```typescript
favoritesGetStatusMap: (params) => {
  console.log('[Preload] favoritesGetStatusMap called:', params.wallpaperIds.length, 'ids')
  return ipcRenderer.invoke(IPC_CHANNELS.FAVORITES_GET_STATUS_MAP, params)
},
```
</action>

<acceptance_criteria>
- `grep "favoritesGetStatusMap:" electron/preload/index.ts` 返回至少 2 处匹配（接口定义 + 实现）
- `grep "FAVORITES_GET_STATUS_MAP" electron/preload/index.ts` 返回匹配行
</acceptance_criteria>

---

## Task 3: 更新 ElectronClient 添加 favoritesGetStatusMap 方法

<read_first>
- `src/clients/electron.client.ts` — 查看现有 favorites 相关方法实现模式
- `src/shared/types/ipc.ts` — 确认 FavoritesStatusMapResponse 类型
</read_first>

<action>
在 `src/clients/electron.client.ts` 的 `ElectronClientImpl` 类中，在 `favoritesGetCounts` 方法之后（约 Line 520）添加：

```typescript
/**
 * 批量获取收藏状态映射
 */
async favoritesGetStatusMap(
  wallpaperIds: string[],
): Promise<IpcResponse<Record<string, 0 | 1 | 2>>> {
  if (!this.isAvailable()) {
    return this.createUnavailableResponse<Record<string, 0 | 1 | 2>>()
  }

  try {
    const result = await window.electronAPI.favoritesGetStatusMap({ wallpaperIds })
    if (result.success) {
      return { success: true, data: result.data as Record<string, 0 | 1 | 2> }
    }
    return {
      success: false,
      error: result.error || { code: 'FAVORITES_ERROR', message: '获取收藏状态失败' },
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
- `grep "favoritesGetStatusMap" src/clients/electron.client.ts` 返回方法定义
- TypeScript 编译通过：`npm run type-check` 无错误
</acceptance_criteria>

---

## Task 4: 实现 favorites-get-paginated IPC Handler

<read_first>
- `electron/main/ipc/handlers/favorites.handler.ts` — 查看现有 handler 实现模式（Line 614-623 为占位代码）
- `electron/main/database.ts` — 确认 getDatabase() 函数
- `src/types/domain/favorite.ts` — 确认 PaginatedFavoritesResult 结构
</read_first>

<action>
替换 `electron/main/ipc/handlers/favorites.handler.ts` 中 `favorites-get-paginated` 的占位实现（Line 614-623）：

```typescript
/**
 * 分页获取收藏
 * - 传入 collectionId 时按收藏夹过滤
 * - 不传时返回全部收藏（去重）
 */
ipcMain.handle(
  'favorites-get-paginated',
  (_event, params: { collectionId?: string; limit: number; offset: number }) => {
    try {
      const db = getDatabase()
      const { collectionId, limit, offset } = params

      let rows: Record<string, unknown>[]
      let countRow: Record<string, unknown>

      if (collectionId) {
        // 按收藏夹查询
        rows = db
          .prepare(
            `SELECT collection_id, wallpaper_id, wallpaper_data, added_at
             FROM favorites
             WHERE collection_id = ?
             ORDER BY added_at DESC
             LIMIT ? OFFSET ?`,
          )
          .all(collectionId, limit, offset) as Record<string, unknown>[]

        countRow = db
          .prepare('SELECT COUNT(*) as total FROM favorites WHERE collection_id = ?')
          .get(collectionId) as Record<string, unknown>
      } else {
        // 全部收藏：去重查询
        rows = db
          .prepare(
            `SELECT wallpaper_id, wallpaper_data, MAX(added_at) as added_at
             FROM favorites
             GROUP BY wallpaper_id
             ORDER BY added_at DESC
             LIMIT ? OFFSET ?`,
          )
          .all(limit, offset) as Record<string, unknown>[]

        countRow = db
          .prepare('SELECT COUNT(DISTINCT wallpaper_id) as total FROM favorites')
          .get() as Record<string, unknown>
      }

      const total = (countRow?.total as number) ?? 0
      const hasMore = offset + rows.length < total

      const items = rows.map((row) => ({
        collectionId: row.collection_id ?? null,
        wallpaperId: row.wallpaper_id,
        wallpaperData: JSON.parse(row.wallpaper_data as string),
        addedAt: row.added_at,
      }))

      return { success: true, data: { items, total, hasMore } }
    } catch (error: any) {
      logHandler('favorites-get-paginated', `Error: ${error.message}`, 'error')
      return {
        success: false,
        error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
      }
    }
  },
)
```
</action>

<acceptance_criteria>
- `grep "LIMIT ? OFFSET ?" electron/main/ipc/handlers/favorites.handler.ts` 返回匹配
- `grep "COUNT(DISTINCT wallpaper_id)" electron/main/ipc/handlers/favorites.handler.ts` 返回匹配
- `grep "hasMore" electron/main/ipc/handlers/favorites.handler.ts` 返回匹配
- 不再包含 `NOT_IMPLEMENTED` 错误返回
</acceptance_criteria>

---

## Task 5: 实现 favorites-get-counts IPC Handler

<read_first>
- `electron/main/ipc/handlers/favorites.handler.ts` — 查看占位实现（Line 628-634）
- `electron/main/database.ts` — 确认 getDatabase() 函数
</read_first>

<action>
替换 `electron/main/ipc/handlers/favorites.handler.ts` 中 `favorites-get-counts` 的占位实现（Line 628-634）：

```typescript
/**
 * 获取所有收藏夹计数
 * - _total: 全部收藏的唯一壁纸数（去重）
 * - [collectionId]: 各收藏夹的壁纸数
 */
ipcMain.handle('favorites-get-counts', () => {
  try {
    const db = getDatabase()

    // 全部收藏去重计数
    const totalRow = db
      .prepare('SELECT COUNT(DISTINCT wallpaper_id) as total FROM favorites')
      .get() as Record<string, unknown> | undefined

    // 各收藏夹计数
    const collectionRows = db
      .prepare(
        `SELECT collection_id, COUNT(*) as count
         FROM favorites
         GROUP BY collection_id`,
      )
      .all() as Record<string, unknown>[]

    // 构建结果
    const result: Record<string, number> = {
      _total: (totalRow?.total as number) ?? 0,
    }

    for (const row of collectionRows) {
      result[row.collection_id as string] = row.count as number
    }

    return { success: true, data: result }
  } catch (error: any) {
    logHandler('favorites-get-counts', `Error: ${error.message}`, 'error')
    return {
      success: false,
      error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
    }
  }
})
```
</action>

<acceptance_criteria>
- `grep "_total" electron/main/ipc/handlers/favorites.handler.ts` 返回匹配
- `grep "GROUP BY collection_id" electron/main/ipc/handlers/favorites.handler.ts` 返回匹配
- handler 不再返回 `NOT_IMPLEMENTED` 错误
</acceptance_criteria>

---

## Task 6: 实现 favorites-get-status-map IPC Handler

<read_first>
- `electron/main/ipc/handlers/favorites.handler.ts` — 查看现有 handler 实现模式
- `electron/main/database.ts` — 确认 getDatabase() 函数
- `.planning/phases/47-repository-service-layer/47-CONTEXT.md` — D-02 三态值语义定义
</read_first>

<action>
在 `electron/main/ipc/handlers/favorites.handler.ts` 的 `registerFavoritesHandlers` 函数末尾（在 `favorites-get-counts` handler 之后）添加：

```typescript
/**
 * 批量获取收藏状态映射
 * - 0: 未收藏
 * - 1: 收藏到默认收藏夹（优先）
 * - 2: 仅收藏到其他收藏夹
 */
ipcMain.handle(
  'favorites-get-status-map',
  (_event, params: { wallpaperIds: string[] }) => {
    try {
      const db = getDatabase()
      const { wallpaperIds } = params

      // 空数组处理
      if (wallpaperIds.length === 0) {
        return { success: true, data: {} }
      }

      // 构建参数占位符
      const placeholders = wallpaperIds.map(() => '?').join(',')

      // 查询收藏状态
      // MAX(CASE WHEN c.is_default = 1 THEN 1 ELSE 2 END) 确保默认收藏夹优先
      const rows = db
        .prepare(
          `SELECT f.wallpaper_id,
             MAX(CASE WHEN c.is_default = 1 THEN 1 ELSE 2 END) as status
           FROM favorites f
           INNER JOIN collections c ON f.collection_id = c.id
           WHERE f.wallpaper_id IN (${placeholders})
           GROUP BY f.wallpaper_id`,
        )
        .all(...wallpaperIds) as Record<string, unknown>[]

      // 构建结果映射，初始化所有 ID 为未收藏
      const statusMap: Record<string, 0 | 1 | 2> = {}
      for (const id of wallpaperIds) {
        statusMap[id] = 0
      }

      // 更新收藏状态
      for (const row of rows) {
        statusMap[row.wallpaper_id as string] = row.status as 1 | 2
      }

      return { success: true, data: statusMap }
    } catch (error: any) {
      logHandler('favorites-get-status-map', `Error: ${error.message}`, 'error')
      return {
        success: false,
        error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
      }
    }
  },
)
```
</action>

<acceptance_criteria>
- `grep "favorites-get-status-map" electron/main/ipc/handlers/favorites.handler.ts` 返回匹配
- `grep "MAX(CASE WHEN c.is_default" electron/main/ipc/handlers/favorites.handler.ts` 返回匹配
- `grep "INNER JOIN collections c" electron/main/ipc/handlers/favorites.handler.ts` 返回匹配
</acceptance_criteria>

---

## Task 7: 更新 FavoritesRepository 新增三个方法

<read_first>
- `src/repositories/favorites.repository.ts` — 查看现有 Repository 方法实现模式
- `src/clients/electron.client.ts` — 确认新增的 favoritesGetStatusMap 方法
- `src/types/domain/favorite.ts` — 确认 PaginationParams, PaginatedFavoritesResult 类型
</read_first>

<action>
在 `src/repositories/favorites.repository.ts` 中，在 `getCollectionsForWallpaper` 方法之后添加三个新方法：

```typescript
// ==================== 分页查询方法 ====================

/**
 * 分页获取收藏项
 * @param params 分页参数（limit, offset）+ 可选 collectionId
 */
async getFavoritesPaginated(
  params: PaginationParams & { collectionId?: string },
): Promise<IpcResponse<PaginatedFavoritesResult>> {
  const result = await electronClient.favoritesGetPaginated(params)
  if (result.success) {
    return result
  }
  return {
    success: false,
    data: { items: [], total: 0, hasMore: false },
    error: result.error ?? {
      code: FavoritesErrorCodes.STORAGE_ERROR,
      message: '分页获取收藏失败',
    },
  }
},

/**
 * 获取所有收藏夹计数
 * @returns { _total: 全部收藏去重计数, [collectionId]: 各收藏夹计数 }
 */
async getCounts(): Promise<IpcResponse<Record<string, number>>> {
  const result = await electronClient.favoritesGetCounts()
  if (result.success) {
    return result
  }
  return {
    success: false,
    data: { _total: 0 },
    error: result.error ?? {
      code: FavoritesErrorCodes.STORAGE_ERROR,
      message: '获取收藏计数失败',
    },
  }
},

/**
 * 批量获取收藏状态映射
 * @param wallpaperIds 壁纸 ID 列表
 * @returns 状态映射 (0=未收藏, 1=默认收藏夹, 2=其他收藏夹)
 */
async getFavoriteStatusMap(
  wallpaperIds: string[],
): Promise<IpcResponse<Record<string, 0 | 1 | 2>>> {
  const result = await electronClient.favoritesGetStatusMap(wallpaperIds)
  if (result.success) {
    return result
  }
  return {
    success: false,
    data: {},
    error: result.error ?? {
      code: FavoritesErrorCodes.STORAGE_ERROR,
      message: '获取收藏状态失败',
    },
  }
},
```

需要添加的导入：
```typescript
import type { PaginationParams, PaginatedFavoritesResult } from '@/types'
```
</action>

<acceptance_criteria>
- `grep "getFavoritesPaginated" src/repositories/favorites.repository.ts` 返回方法定义
- `grep "getCounts" src/repositories/favorites.repository.ts` 返回方法定义
- `grep "getFavoriteStatusMap" src/repositories/favorites.repository.ts` 返回方法定义
- TypeScript 编译通过：`npm run type-check` 无错误
</acceptance_criteria>

---

## Task 8: 更新 WallpaperService.search() 注入 is_favorite 字段

<read_first>
- `src/services/wallpaper.service.ts` — 查看 search() 方法当前实现（Line 105-144）
- `src/repositories/favorites.repository.ts` — 确认 getFavoriteStatusMap 方法
- `src/types/domain/wallpaper.ts` — 确认 WallpaperItem.is_favorite 字段定义
</read_first>

<action>
修改 `src/services/wallpaper.service.ts`：

1. 添加导入（在文件顶部导入区域）：
```typescript
import { favoritesRepository } from '@/repositories'
```

2. 修改 `search()` 方法，在 API 调用成功后注入 `is_favorite` 字段（约 Line 127-132 之间）：

将原来的：
```typescript
// 调用 API
const result = await apiClient.get<WallpaperSearchResult>('/search', filteredParams, apiKey)

// 成功时缓存结果
if (result.success && result.data) {
  this.setCache(cacheKey, result.data)
}

return result
```

替换为：
```typescript
// 调用 API
const result = await apiClient.get<WallpaperSearchResult>('/search', filteredParams, apiKey)

// 成功时注入 is_favorite 字段并缓存结果
if (result.success && result.data) {
  // 注入收藏状态
  if (result.data.data.length > 0) {
    const wallpaperIds = result.data.data.map((item) => item.id)
    const statusMapResult = await favoritesRepository.getFavoriteStatusMap(wallpaperIds)

    if (statusMapResult.success && statusMapResult.data) {
      const statusMap = statusMapResult.data
      result.data.data = result.data.data.map((item) => ({
        ...item,
        is_favorite: statusMap[item.id] ?? 0,
      }))
    }
  }

  this.setCache(cacheKey, result.data)
}

return result
```

注意：需要将 `WallpaperSearchResult` 接口的 `data` 字段类型从 `WallpaperItem[]` 确认是否需要调整（当前定义在文件内 Line 14-17）。
</action>

<acceptance_criteria>
- `grep "favoritesRepository" src/services/wallpaper.service.ts` 返回导入语句
- `grep "getFavoriteStatusMap" src/services/wallpaper.service.ts` 返回调用语句
- `grep "is_favorite:" src/services/wallpaper.service.ts` 返回字段注入语句
- TypeScript 编译通过：`npm run type-check` 无错误
</acceptance_criteria>

---

## Task 9: TypeScript 编译验证

<read_first>
- 所有修改的文件
</read_first>

<action>
运行 TypeScript 编译检查，确保所有修改无类型错误：

```bash
npm run type-check
```

预期输出：无错误，编译成功。
</action>

<acceptance_criteria>
- `npm run type-check` 命令退出码为 0
- 无 TypeScript 编译错误输出
</acceptance_criteria>

---

## 验证清单

### 功能验证

| 验证项 | 验证命令/方式 | 预期结果 |
|--------|---------------|----------|
| IPC 通道定义 | `grep "FAVORITES_GET_STATUS_MAP" src/shared/types/ipc.ts` | 返回匹配行 |
| Preload 桥接 | `grep "favoritesGetStatusMap" electron/preload/index.ts` | 返回 2 处匹配 |
| ElectronClient 方法 | `grep "favoritesGetStatusMap" src/clients/electron.client.ts` | 返回方法定义 |
| 分页 handler | `grep "hasMore" electron/main/ipc/handlers/favorites.handler.ts` | 返回匹配 |
| 计数 handler | `grep "_total" electron/main/ipc/handlers/favorites.handler.ts` | 返回匹配 |
| 状态映射 handler | `grep "favorites-get-status-map" electron/main/ipc/handlers/favorites.handler.ts` | 返回 handler 定义 |
| Repository 方法 | `grep "getFavoriteStatusMap" src/repositories/favorites.repository.ts` | 返回方法定义 |
| Service 集成 | `grep "is_favorite:" src/services/wallpaper.service.ts` | 返回字段注入 |
| TypeScript 编译 | `npm run type-check` | 无错误 |

### Must Haves 验证

| ID | 要求 | 验证方式 |
|----|------|----------|
| FAVPAG-02 | 分页获取收藏返回 items + total + hasMore | Task 4 完成后 handler 返回正确结构 |
| FAVSTA-02 | is_favorite 从数据库计算 | Task 6 + Task 8 完成，search() 返回正确状态 |
| SIDECT-03 | _total 返回去重计数 | Task 5 使用 COUNT(DISTINCT wallpaper_id) |

---

## 依赖关系

```
Task 1 (IPC 常量) ─┬─→ Task 2 (Preload) ─→ Task 3 (ElectronClient)
                   │
                   └─→ Task 6 (Handler)
                           
Task 4 (分页 Handler) ←── 独立
Task 5 (计数 Handler) ←── 独立
Task 6 (状态 Handler) ←── 依赖 Task 1

Task 7 (Repository) ←── 依赖 Task 1-6

Task 8 (Service) ←── 依赖 Task 7

Task 9 (验证) ←── 依赖 Task 1-8
```

**Wave 1 执行顺序：**
1. Task 1 → Task 2 → Task 3（IPC 通道 + Preload + Client）
2. Task 4, Task 5, Task 6（三个 Handler 可并行）
3. Task 7（Repository 方法）
4. Task 8（Service 集成）
5. Task 9（最终验证）

---

*计划创建时间: 2026-05-04*
