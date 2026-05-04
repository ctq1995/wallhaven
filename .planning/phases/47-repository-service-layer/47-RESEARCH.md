# Phase 47: Repository & Service Layer — 研究报告

**研究时间**: 2026-05-04
**研究问题**: "What do I need to know to PLAN this phase well?"
**置信度**: HIGH

---

## 一、执行摘要

Phase 47 的核心任务是实现 Repository 层分页查询和 Service 层收藏状态计算。这是 v6.0 传统分页重构的第二个阶段，承接 Phase 46 的类型系统和 IPC 通道基础设施。

**关键发现：**
1. Phase 46 已完成所有类型定义和 IPC 通道基础设施，包括 `favorites-get-paginated`、`favorites-get-counts` 的占位 handler
2. 需要新增 `favorites-get-status-map` IPC 通道（D-01 决策）用于批量获取收藏状态映射
3. 现有代码模式清晰，可直接参考 `favorites.handler.ts` 和 `FavoritesRepository` 的实现风格

---

## 二、研究问题回答

### Q: 需要了解什么才能良好规划此阶段？

#### A1: 现有架构模式与代码风格

**IPC Handler 模式** (`favorites.handler.ts`):
```typescript
// 标准模式：try-catch + logHandler + IpcResponse
ipcMain.handle('favorites-xxx', (_event, params: { ... }) => {
  try {
    const db = getDatabase()
    // SQL 查询
    return { success: true, data: result }
  } catch (error: any) {
    logHandler('favorites-xxx', `Error: ${error.message}`, 'error')
    return { success: false, error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message } }
  }
})
```

**Repository 方法模式** (`favorites.repository.ts`):
```typescript
// 标准模式：调用 electronClient + 错误映射
async methodName(...args): Promise<IpcResponse<T>> {
  const result = await electronClient.ipcMethodName(params)
  if (result.success) return result
  // 错误码映射
  return createError(FavoritesErrorCodes.XXX, '错误消息')
}
```

**Service 层缓存模式** (`favorites.service.ts`):
- 使用私有变量存储缓存 (`cachedFavorites: FavoriteItem[] | null`)
- 成功操作后调用 `clearCache()` 清除缓存
- 优先返回缓存数据，避免重复 IPC 调用

#### A2: Phase 46 产出清单

| 产出 | 位置 | 状态 |
|------|------|------|
| `is_favorite?: 0 \| 1 \| 2` | `src/types/domain/wallpaper.ts:66` | ✅ 已定义 |
| `PaginationParams` | `src/types/domain/favorite.ts:60-65` | ✅ 已定义 |
| `PaginatedFavoritesResult` | `src/types/domain/favorite.ts:70-77` | ✅ 已定义 |
| `FAVORITES_GET_PAGINATED` | `src/shared/types/ipc.ts:69` | ✅ 已定义 |
| `FAVORITES_GET_COUNTS` | `src/shared/types/ipc.ts:70` | ✅ 已定义 |
| `favoritesGetPaginated()` | `src/clients/electron.client.ts:473-494` | ✅ 已定义 |
| `favoritesGetCounts()` | `src/clients/electron.client.ts:500-519` | ✅ 已定义 |
| `favorites-get-paginated` handler | `favorites.handler.ts:614-623` | ⚠️ 占位 (NOT_IMPLEMENTED) |
| `favorites-get-counts` handler | `favorites.handler.ts:628-634` | ⚠️ 占位 (NOT_IMPLEMENTED) |

**需要新增的产出** (Phase 47):
- `favorites-get-status-map` IPC 通道 + handler
- `favoritesGetStatusMap()` 方法 (ElectronClient + Preload)
- `getFavoriteStatusMap()` Repository 方法
- `getFavoritesPaginated()` Repository 方法
- `getCounts()` Repository 方法
- WallpaperService.search() 中的 is_favorite 注入逻辑

#### A3: 数据库 Schema 确认

**collections 表**:
```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,  -- 0=否, 1=是
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

**favorites 表**:
```sql
CREATE TABLE favorites (
  collection_id TEXT NOT NULL,
  wallpaper_id TEXT NOT NULL,
  wallpaper_data TEXT NOT NULL,  -- JSON 序列化的 WallpaperItem
  added_at TEXT NOT NULL,
  PRIMARY KEY (collection_id, wallpaper_id),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
)

CREATE INDEX idx_favorites_wallpaper ON favorites(wallpaper_id)
```

#### A4: 关键决策实现细节

**D-01: favorites-get-status-map IPC**
- 参数: `{ wallpaperIds: string[] }`
- 返回: `IpcResponse<Record<string, 0 | 1 | 2>>`
- SQL 策略:
  ```sql
  SELECT f.wallpaper_id,
    CASE
      WHEN c.is_default = 1 THEN 1
      ELSE 2
    END as status
  FROM favorites f
  INNER JOIN collections c ON f.collection_id = c.id
  WHERE f.wallpaper_id IN (?, ?, ...)
  ```
- 需要处理"同时存在于默认和其他收藏夹"的情况，优先返回 1

**D-02: is_favorite 三态值语义**
| 值 | 含义 | 心形颜色 |
|----|------|----------|
| 0 | 未收藏 | 透明 |
| 1 | 收藏到默认收藏夹 | 红色 |
| 2 | 仅收藏到其他收藏夹 | 蓝色 |

**D-04: 分页与计数分离**
- 两个独立 IPC 通道，职责单一
- 分页查询返回 `items + total + hasMore`
- 计数查询返回 `{ '_total': number, [collectionId]: number }`

**D-06: _total 去重计数**
```sql
-- 全部收藏去重计数
SELECT COUNT(DISTINCT wallpaper_id) FROM favorites

-- 各收藏夹计数
SELECT collection_id, COUNT(*) as count
FROM favorites
GROUP BY collection_id
```

---

## 三、实现方法详解

### 3.1 favorites-get-paginated Handler

**实现要点**:
```typescript
ipcMain.handle('favorites-get-paginated',
  (_event, params: { collectionId?: string; limit: number; offset: number }) => {
    try {
      const db = getDatabase()
      const { collectionId, limit, offset } = params

      // 1. 查询当前页数据
      let rows: Record<string, unknown>[]
      if (collectionId) {
        rows = db.prepare(`
          SELECT collection_id, wallpaper_id, wallpaper_data, added_at
          FROM favorites
          WHERE collection_id = ?
          ORDER BY added_at DESC
          LIMIT ? OFFSET ?
        `).all(collectionId, limit, offset) as Record<string, unknown>[]
      } else {
        // 全部收藏：需要去重（同一壁纸可能在多个收藏夹）
        rows = db.prepare(`
          SELECT wallpaper_id, wallpaper_data, MAX(added_at) as added_at
          FROM favorites
          GROUP BY wallpaper_id
          ORDER BY added_at DESC
          LIMIT ? OFFSET ?
        `).all(limit, offset) as Record<string, unknown>[]
      }

      // 2. 查询总数
      const countRow = collectionId
        ? db.prepare('SELECT COUNT(*) as total FROM favorites WHERE collection_id = ?').get(collectionId)
        : db.prepare('SELECT COUNT(DISTINCT wallpaper_id) as total FROM favorites').get()

      const total = (countRow as Record<string, unknown>).total as number
      const hasMore = offset + rows.length < total

      // 3. 映射结果
      const items = rows.map(row => ({
        collectionId: row.collection_id,
        wallpaperId: row.wallpaper_id,
        wallpaperData: JSON.parse(row.wallpaper_data as string),
        addedAt: row.added_at,
      }))

      return { success: true, data: { items, total, hasMore } }
    } catch (error: any) {
      logHandler('favorites-get-paginated', `Error: ${error.message}`, 'error')
      return { success: false, error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message } }
    }
  }
)
```

**注意事项**:
- 全部收藏场景需要去重（`GROUP BY wallpaper_id`）
- 返回的 `total` 用于前端分页计算

### 3.2 favorites-get-counts Handler

**实现要点**:
```typescript
ipcMain.handle('favorites-get-counts', () => {
  try {
    const db = getDatabase()

    // 1. 全部收藏去重计数
    const totalRow = db.prepare(
      'SELECT COUNT(DISTINCT wallpaper_id) as total FROM favorites'
    ).get() as Record<string, unknown>

    // 2. 各收藏夹计数
    const collectionRows = db.prepare(`
      SELECT collection_id, COUNT(*) as count
      FROM favorites
      GROUP BY collection_id
    `).all() as Record<string, unknown>[]

    // 3. 构建结果
    const result: Record<string, number> = {
      _total: totalRow.total as number,
    }

    for (const row of collectionRows) {
      result[row.collection_id as string] = row.count as number
    }

    return { success: true, data: result }
  } catch (error: any) {
    logHandler('favorites-get-counts', `Error: ${error.message}`, 'error')
    return { success: false, error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message } }
  }
})
```

### 3.3 favorites-get-status-map Handler (新增)

**实现要点**:
```typescript
ipcMain.handle('favorites-get-status-map',
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

      // 查询收藏状态（优先默认收藏夹）
      const rows = db.prepare(`
        SELECT f.wallpaper_id,
          MAX(CASE WHEN c.is_default = 1 THEN 1 ELSE 2 END) as status
        FROM favorites f
        INNER JOIN collections c ON f.collection_id = c.id
        WHERE f.wallpaper_id IN (${placeholders})
        GROUP BY f.wallpaper_id
      `).all(...wallpaperIds) as Record<string, unknown>[]

      // 构建结果映射
      const statusMap: Record<string, 0 | 1 | 2> = {}

      // 初始化所有 ID 为未收藏
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
      return { success: false, error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message } }
    }
  }
)
```

**关键逻辑**:
- 使用 `MAX(CASE WHEN c.is_default = 1 THEN 1 ELSE 2 END)` 确保同一壁纸在默认+其他收藏夹时返回 1
- 未查询到的 ID 默认返回 0（未收藏）
- 空数组输入返回空对象

### 3.4 WallpaperService.search() 集成

**修改位置**: `src/services/wallpaper.service.ts` 第 105 行 `search()` 方法

**实现要点**:
```typescript
async search(params: GetParams | null): Promise<IpcResponse<WallpaperSearchResult>> {
  try {
    // ... 现有参数过滤逻辑 ...

    // 调用 API
    const result = await apiClient.get<WallpaperSearchResult>('/search', filteredParams, apiKey)

    // 新增：注入 is_favorite 字段
    if (result.success && result.data && result.data.data.length > 0) {
      const wallpaperIds = result.data.data.map(item => item.id)
      const statusMapResult = await favoritesRepository.getFavoriteStatusMap(wallpaperIds)

      if (statusMapResult.success && statusMapResult.data) {
        const statusMap = statusMapResult.data
        result.data.data = result.data.data.map(item => ({
          ...item,
          is_favorite: statusMap[item.id] ?? 0,
        }))
      }
    }

    // ... 缓存逻辑 ...
    return result
  } catch (error) {
    // ... 错误处理 ...
  }
}
```

**注意事项**:
- 仅在 API 返回成功且有数据时注入 `is_favorite`
- 注入失败不影响主流程（数据仍可使用，只是 is_favorite 默认为 undefined）
- 需要在文件顶部导入 `favoritesRepository`

---

## 四、文件修改清单

### 4.1 新增内容

| 文件 | 新增内容 | 说明 |
|------|----------|------|
| `src/shared/types/ipc.ts` | `FAVORITES_GET_STATUS_MAP` 常量 | 新增 IPC 通道名称 |
| `electron/preload/index.ts` | `favoritesGetStatusMap` 方法 | Preload 桥接 |
| `src/clients/electron.client.ts` | `favoritesGetStatusMap()` 方法 | Client 方法 |
| `src/repositories/favorites.repository.ts` | 3 个新方法 | Repository 层 |
| `electron/main/ipc/handlers/favorites.handler.ts` | 3 个 handler 实现 | 替换占位实现 |

### 4.2 修改内容

| 文件 | 修改内容 | 说明 |
|------|----------|------|
| `src/services/wallpaper.service.ts` | search() 方法注入 is_favorite | Service 层集成 |

---

## 五、技术风险与缓解

### 风险 1: favorites-get-status-map 大量 ID 查询性能

**场景**: API 返回 24 个壁纸，需要批量查询收藏状态

**缓解策略**:
- 使用 `IN (...)` 单次查询，而非循环查询
- 已有 `idx_favorites_wallpaper` 索引支持快速查询
- 参数化查询避免 SQL 注入

### 风险 2: WallpaperService 对 FavoritesRepository 的循环依赖

**场景**: `wallpaper.service.ts` 导入 `favorites.repository.ts`

**缓解策略**:
- 确认当前依赖方向：`wallpaper.service.ts` → `favorites.repository.ts` → `electron.client.ts`
- 无循环依赖风险（WallpaperService 不被 Repository 层依赖）

### 风险 3: 全部收藏分页去重逻辑复杂

**场景**: 同一壁纸在多个收藏夹，全部收藏视图需要去重

**缓解策略**:
- 使用 `GROUP BY wallpaper_id` + `MAX(added_at)` 确定显示时间
- 返回的 `total` 使用 `COUNT(DISTINCT wallpaper_id)` 准确计数
- 注意返回的 `collectionId` 可能为空（需在类型层面处理）

---

## 六、依赖与前置条件

### 已满足的前置条件（Phase 46）

- [x] `PaginationParams` 类型定义
- [x] `PaginatedFavoritesResult` 类型定义
- [x] `FavoritesGetPaginatedRequest` 类型定义
- [x] `FavoritesCountsResponse` 类型定义
- [x] `FAVORITES_GET_PAGINATED` IPC 通道常量
- [x] `FAVORITES_GET_COUNTS` IPC 通道常量
- [x] `favoritesGetPaginated()` ElectronClient 方法
- [x] `favoritesGetCounts()` ElectronClient 方法
- [x] `favorites-get-paginated` handler 占位
- [x] `favorites-get-counts` handler 占位
- [x] `favoritesGetPaginated()` Preload 桥接
- [x] `favoritesGetCounts()` Preload 桥接

### Phase 47 需要新增

- [ ] `FAVORITES_GET_STATUS_MAP` IPC 通道常量
- [ ] `favoritesGetStatusMap()` ElectronClient 方法
- [ ] `favoritesGetStatusMap()` Preload 桥接
- [ ] `favorites-get-status-map` handler 实现
- [ ] `favorites-get-paginated` handler 实际实现
- [ ] `favorites-get-counts` handler 实际实现
- [ ] `getFavoriteStatusMap()` Repository 方法
- [ ] `getFavoritesPaginated()` Repository 方法
- [ ] `getCounts()` Repository 方法
- [ ] WallpaperService.search() is_favorite 注入

---

## 七、验证标准

### 功能验证

| 验证项 | 预期结果 |
|--------|----------|
| `favoritesGetPaginated({ limit: 24, offset: 0 })` | 返回前 24 条收藏 + 总数 + hasMore |
| `favoritesGetPaginated({ collectionId: 'xxx', limit: 24, offset: 0 })` | 返回指定收藏夹的前 24 条 |
| `favoritesGetCounts()` | 返回 `{ _total: N, collectionId1: M, ... }` |
| `getFavoriteStatusMap(['id1', 'id2'])` | 返回 `{ id1: 0/1/2, id2: 0/1/2 }` |
| `WallpaperService.search()` | 返回的数据包含 `is_favorite` 字段 |

### 边界条件验证

| 场景 | 预期行为 |
|------|----------|
| `getFavoriteStatusMap([])` | 返回 `{ success: true, data: {} }` |
| `favoritesGetPaginated` 空收藏夹 | 返回 `{ items: [], total: 0, hasMore: false }` |
| 壁纸同时在默认和其他收藏夹 | `is_favorite` 返回 `1` |
| API 返回空数据 | 不调用 `getFavoriteStatusMap` |

---

## 八、代码参考

### 现有代码模式参考

**数据库查询模式** (`favorites.handler.ts:320-356`):
```typescript
ipcMain.handle('favorites-get-by-collection', (_event, params: { collectionId?: string }) => {
  try {
    const db = getDatabase()
    // ... 查询逻辑 ...
    const mappedFavorites = rows.map((row) => ({
      collectionId: row.collection_id,
      wallpaperId: row.wallpaper_id,
      wallpaperData: JSON.parse(row.wallpaper_data as string),
      addedAt: row.added_at,
    }))
    return { success: true, data: mappedFavorites }
  } catch (error: any) {
    logHandler('favorites-get-by-collection', `Error: ${error.message}`, 'error')
    return { success: false, error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message } }
  }
})
```

**Repository 方法模式** (`favorites.repository.ts:193-206`):
```typescript
async isFavorite(wallpaperId: string): Promise<IpcResponse<boolean>> {
  const result = await electronClient.favoritesIsFavorite(wallpaperId)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    data: false,
    error: result.error ?? { code: FavoritesErrorCodes.STORAGE_ERROR, message: '检查收藏状态失败' },
  }
}
```

---

## 九、来源索引

| 文档/代码 | 参考内容 |
|-----------|----------|
| `.planning/phases/47-repository-service-layer/47-CONTEXT.md` | 用户决策、Canonical References |
| `.planning/phases/46-infrastructure/SUMMARY.md` | Phase 46 产出清单 |
| `.planning/phases/46-infrastructure/46-VERIFICATION.md` | Phase 46 验证结果 |
| `.planning/research/ARCHITECTURE.md` | 分页架构设计、is_favorite 注入策略 |
| `.planning/research/PITFALLS.md` | 分页实现陷阱、SQL 层陷阱 |
| `src/repositories/favorites.repository.ts` | Repository 模式参考 |
| `src/services/wallpaper.service.ts` | Service 层模式参考 |
| `src/services/favorites.service.ts` | 缓存模式参考 |
| `electron/main/ipc/handlers/favorites.handler.ts` | Handler 实现参考 |
| `electron/main/database.ts` | 数据库工具函数 |
| `src/types/domain/favorite.ts` | 分页类型定义 |
| `src/types/domain/wallpaper.ts` | is_favorite 字段定义 |

---

## RESEARCH COMPLETE
