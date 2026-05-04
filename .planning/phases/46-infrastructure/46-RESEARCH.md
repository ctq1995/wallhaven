# Phase 46: Infrastructure — Research

**Domain:** Wallhaven 壁纸浏览器 — 传统分页重构的类型系统和 IPC 基础设施
**Researched:** 2026-05-04
**Confidence:** HIGH

## Executive Summary

Phase 46 是 v6.0 传统分页重构的第一个阶段，主要职责是建立类型系统和 IPC 通信基础。本阶段不涉及业务逻辑实现，仅定义类型接口和 IPC 通道，为后续 Phase 47-50 提供基础支撑。

**核心交付物：**
1. 类型定义迁移：从 `src/types/index.ts` 迁移到 `src/types/domain/` 目录
2. `is_favorite` 三态字段定义：WallpaperItem 新增收藏状态字段
3. 分页相关类型：PageCache、PaginationParams、PaginatedFavoritesResult
4. IPC 通道：`favorites-get-paginated` 和 `favorites-get-counts`
5. Client 层接口：ElectronClient 新增分页和计数方法

---

## 需求追踪

| ID | 描述 | 本阶段责任 |
|----|------|-----------|
| DATAREF-01 | Replace TotalPageData with PageData | 类型定义：保留 TotalPageData，新增 PageCache |
| DATAREF-02 | Store currentPageData + pageCache Map | 类型定义：PageCache 类型 |
| DATAREF-03 | Favorites keeps TotalPageData for infinite scroll | 无需修改（保持现有类型） |
| FAVSTA-01 | is_favorite field in WallpaperItem | 类型定义：新增 `is_favorite?: 0 | 1 | 2` |
| FAVPAG-02 | SQLite LIMIT/OFFSET pagination | IPC 通道：定义 PaginationParams 和 PaginatedFavoritesResult |

---

## 现有代码分析

### 1. 类型定义现状

**文件：** `src/types/index.ts`

当前类型定义结构：
```
src/types/
├── index.ts        # 所有类型定义 + 重导出 favorite.ts
├── favorite.ts     # Collection, FavoriteItem, FavoritesData
└── domain/
    └── index.ts    # 空导出（预留目录结构）
```

**关键类型：**
- `WallpaperItem` — 壁纸数据接口（需新增 `is_favorite` 字段）
- `PageData` — 单页数据结构
- `TotalPageData` — 多页聚合数据（无限滚动用，需保留）
- `Collection`, `FavoriteItem` — 收藏相关类型（已定义）

### 2. IPC 通道现状

**文件：** `src/shared/types/ipc.ts`

现有 Favorites 相关通道（11 个）：
- `FAVORITES_GET_COLLECTIONS`
- `FAVORITES_CREATE_COLLECTION`
- `FAVORITES_RENAME_COLLECTION`
- `FAVORITES_DELETE_COLLECTION`
- `FAVORITES_SET_DEFAULT_COLLECTION`
- `FAVORITES_GET_BY_COLLECTION`
- `FAVORITES_ADD`
- `FAVORITES_REMOVE`
- `FAVORITES_MOVE`
- `FAVORITES_IS_FAVORITE`
- `FAVORITES_GET_COLLECTIONS_FOR_WALLPAPER`

**需要新增：**
- `FAVORITES_GET_PAGINATED` — 分页查询收藏
- `FAVORITES_GET_COUNTS` — 获取所有收藏夹计数

### 3. Handler 现状

**文件：** `electron/main/ipc/handlers/favorites.handler.ts`

现有 handler 实现模式：
- 使用 `ipcMain.handle(channel, (event, params) => {...})` 注册
- 统一返回 `{ success: boolean, data?: T, error?: IpcErrorInfo }`
- SQL 查询使用 `db.prepare(sql).all(params)` 模式
- 使用 `logHandler(channel, message, level)` 记录日志

**关键 SQL 示例（favorites-get-by-collection）：**
```typescript
db.prepare(
  'SELECT collection_id, wallpaper_id, wallpaper_data, added_at FROM favorites WHERE collection_id = ? ORDER BY added_at DESC'
).all(collectionId)
```

### 4. Preload 现状

**文件：** `electron/preload/index.ts`

Preload 桥接模式：
```typescript
favoritesGetByCollection: (params) => {
  return ipcRenderer.invoke(IPC_CHANNELS.FAVORITES_GET_BY_COLLECTION, params)
}
```

### 5. Client 现状

**文件：** `src/clients/electron.client.ts`

ElectronClient 方法模式：
```typescript
async favoritesGetByCollection(collectionId?: string): Promise<IpcResponse<FavoriteItem[]>> {
  if (!this.isAvailable()) {
    return this.createUnavailableResponse<FavoriteItem[]>()
  }
  try {
    const result = await window.electronAPI.favoritesGetByCollection({ collectionId })
    if (result.success) {
      return { success: true, data: result.data as FavoriteItem[] }
    }
    return { success: false, error: result.error || {...} }
  } catch (error) {
    return { success: false, error: { code: 'FAVORITES_ERROR', message: String(error) } }
  }
}
```

### 6. HeartState 三态定义

**文件：** `src/utils/heart.ts`

```typescript
export type HeartState = 'default' | 'non-default' | 'none'
```

与 `is_favorite` 数值的对应关系：
| is_favorite | HeartState | 含义 |
|-------------|------------|------|
| 0 | 'none' | 未收藏 |
| 1 | 'default' | 在默认收藏夹 |
| 2 | 'non-default' | 仅在非默认收藏夹 |

---

## 关键设计决策

### D-01: 类型迁移策略

**决策：** 渐进式迁移到 `src/types/domain/` 目录

**理由：**
- 保持 `src/types/index.ts` 作为统一入口
- 按 domain 分组提高可维护性
- 避免大规模导入路径修改

**迁移计划：**
```
src/types/domain/
├── index.ts        # 统一导出
├── wallpaper.ts    # WallpaperItem, WallpaperMeta, WallpaperThumb, WallpaperQuery, PageData, TotalPageData, PageCache
├── favorite.ts     # Collection, FavoriteItem, PaginationParams, PaginatedFavoritesResult
├── download.ts     # DownloadItem, DownloadState, FinishedDownloadItem
└── settings.ts     # AppSettings, WallpaperFit
```

### D-02: is_favorite 三态定义

**决策：** `is_favorite?: 0 | 1 | 2` 可选字段

**理由：**
- 可选字段保持与 Wallhaven API 原始数据的兼容性
- 三态数值与 HeartState 语义对应
- Service 层后处理填充此字段

**类型定义：**
```typescript
interface WallpaperItem {
  // ... 现有字段
  /**
   * 收藏状态（由 Service 层后处理添加）
   * - 0: 未收藏
   * - 1: 收藏到默认收藏夹
   * - 2: 收藏到其他收藏夹
   */
  is_favorite?: 0 | 1 | 2
}
```

### D-03: PageCache 类型

**决策：** `Map<number, PageData>` 结构

**理由：**
- Map 结构便于 Vue 响应式追踪
- 页码作为 key，直接 O(1) 访问
- 与 `shallowRef` 配合优化性能

**类型定义：**
```typescript
/**
 * 在线壁纸页面缓存结构
 * key: 页码 (1-based)
 * value: 该页的壁纸数据
 */
export type PageCache = Map<number, PageData>
```

### D-04: PaginationParams 类型

**决策：** `{ limit: number, offset: number }` 格式

**理由：**
- 与 SQLite LIMIT/OFFSET 语法直接对应
- 标准 SQL 分页参数，无需转换
- 与 Wallhaven API 的 page 参数区分（API 用 page，本地用 offset）

**类型定义：**
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
```

### D-05: PaginatedFavoritesResult 类型

**决策：** 包含 items、total、hasMore 三字段

**类型定义：**
```typescript
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

### D-06: IPC 通道设计

**新增通道：**

```typescript
// src/shared/types/ipc.ts
FAVORITES_GET_PAGINATED: 'favorites-get-paginated',
FAVORITES_GET_COUNTS: 'favorites-get-counts',
```

**请求/响应类型：**

```typescript
// favorites-get-paginated
interface FavoritesGetPaginatedRequest {
  collectionId?: string  // 不传则查询全部收藏
  limit: number
  offset: number
}
// 返回: IpcResponse<PaginatedFavoritesResult>

// favorites-get-counts
// 无请求参数
// 返回: IpcResponse<{ [collectionId: string]: number }>
```

### D-07: 计数通道设计

**决策：** 单一通道返回所有计数

**返回结构：**
```typescript
{
  "_total": 150,           // 全部收藏（去重后的唯一壁纸数）
  "uuid-default": 80,      // 默认收藏夹
  "uuid-custom-1": 50,     // 自定义收藏夹 1
  "uuid-custom-2": 20      // 自定义收藏夹 2
}
```

**理由：**
- 减少 IPC 调用次数
- 侧边栏一次请求获取所有计数
- `_total` 使用特殊键避免与 collectionId 冲突

---

## 实现要点

### 1. 类型迁移步骤

```
Step 1: 创建 domain 目录下的类型文件
  - domain/wallpaper.ts — 迁移 WallpaperItem 等
  - domain/favorite.ts — 迁移并新增分页类型
  - domain/download.ts — 迁移下载相关类型
  - domain/settings.ts — 迁移设置相关类型
  - domain/index.ts — 统一导出

Step 2: 修改 src/types/index.ts
  - 删除类型定义
  - 添加 `export * from './domain'`
  - 保持 `export * from './favorite'` 不变（或合并到 domain）

Step 3: 验证导入路径
  - 确认所有 `import type { ... } from '@/types'` 仍然有效
```

### 2. IPC 通道注册步骤

```
Step 1: 更新 src/shared/types/ipc.ts
  - 添加 IPC_CHANNELS 常量
  - 添加请求/响应类型定义

Step 2: 更新 electron/preload/index.ts
  - 添加 favoritesGetPaginated 桥接
  - 添加 favoritesGetCounts 桥接
  - 更新 ElectronAPI 接口类型

Step 3: 更新 electron/main/ipc/handlers/favorites.handler.ts
  - 添加 'favorites-get-paginated' handler（Phase 47 实现逻辑）
  - 添加 'favorites-get-counts' handler（Phase 47 实现逻辑）
  - **注意：** 本阶段仅添加 handler 占位，返回 mock 数据或简单错误

Step 4: 更新 src/clients/electron.client.ts
  - 添加 favoritesGetPaginated() 方法
  - 添加 favoritesGetCounts() 方法
```

### 3. Handler 占位实现

由于 Phase 46 是 Infrastructure 阶段，Handler 逻辑在 Phase 47 实现。本阶段添加占位：

```typescript
// favorites.handler.ts
ipcMain.handle('favorites-get-paginated', (_event, params) => {
  // Phase 47: 实现 LIMIT/OFFSET 查询
  logHandler('favorites-get-paginated', 'Not implemented yet', 'error')
  return {
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'Phase 47' }
  }
})

ipcMain.handle('favorites-get-counts', () => {
  // Phase 47: 实现计数查询
  logHandler('favorites-get-counts', 'Not implemented yet', 'error')
  return {
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'Phase 47' }
  }
})
```

---

## 集成点清单

### 需要创建的文件
| 文件 | 说明 |
|------|------|
| `src/types/domain/wallpaper.ts` | 壁纸相关类型 |
| `src/types/domain/favorite.ts` | 收藏相关类型（含分页类型） |
| `src/types/domain/download.ts` | 下载相关类型 |
| `src/types/domain/settings.ts` | 设置相关类型 |

### 需要修改的文件
| 文件 | 修改内容 |
|------|----------|
| `src/types/domain/index.ts` | 统一导出所有类型 |
| `src/types/index.ts` | 改为重导出 domain |
| `src/shared/types/ipc.ts` | 新增 IPC 通道常量和类型 |
| `electron/preload/index.ts` | 新增 IPC 桥接方法 |
| `electron/main/ipc/handlers/favorites.handler.ts` | 新增 handler 占位 |
| `src/clients/electron.client.ts` | 新增 Client 方法 |

---

## 风险与缓解

### 风险 1: 类型迁移破坏现有导入

**缓解：**
- 保持 `src/types/index.ts` 作为统一入口
- 使用 `export * from './domain'` 重导出
- 迁移后运行 TypeScript 编译检查

### 风险 2: Handler 占位导致运行时错误

**缓解：**
- 占位 handler 返回明确的 `NOT_IMPLEMENTED` 错误
- Phase 47 紧随其后实现逻辑
- 不在 Phase 46 添加实际的 SQL 查询

### 风险 3: is_favorite 与 HeartState 映射不一致

**缓解：**
- 在类型定义中添加详细注释说明对应关系
- Service 层实现时使用 `getHeartState()` 工具函数的反向逻辑

---

## 验证标准

### 类型定义验证
- [ ] TypeScript 编译无错误
- [ ] 所有现有导入路径仍有效
- [ ] 新类型正确导出

### IPC 通道验证
- [ ] IPC_CHANNELS 常量包含新通道
- [ ] Preload 正确暴露新方法
- [ ] ElectronClient 方法签名正确
- [ ] Handler 占位返回 NOT_IMPLEMENTED

### 文档验证
- [ ] 类型注释完整清晰
- [ ] is_favorite 与 HeartState 对应关系有说明

---

## 后续阶段依赖

| 后续阶段 | 依赖本阶段产出 |
|----------|---------------|
| Phase 47 | IPC 通道、类型定义（用于 Repository/Service 实现） |
| Phase 48 | PageCache 类型、PaginationParams 类型（用于 Composable） |
| Phase 49 | is_favorite 类型（用于 View 层显示） |
| Phase 50 | PaginatedFavoritesResult 类型（用于收藏页面） |

---

## Sources

- `.planning/phases/46-infrastructure/46-CONTEXT.md` — Phase 46 决策记录
- `.planning/REQUIREMENTS.md` — v6.0 需求定义
- `.planning/research/ARCHITECTURE.md` — 分页架构设计
- `src/types/index.ts` — 现有类型定义
- `src/shared/types/ipc.ts` — IPC 通道定义
- `electron/main/ipc/handlers/favorites.handler.ts` — Handler 实现模式
- `src/clients/electron.client.ts` — Client 实现模式
- `src/utils/heart.ts` — HeartState 定义

---

*Research for: Phase 46 Infrastructure*
*Researched: 2026-05-04*
