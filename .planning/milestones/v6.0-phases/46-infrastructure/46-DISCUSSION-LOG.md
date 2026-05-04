# Phase 46: Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 46-infrastructure
**Areas discussed:** 类型定义位置, is_favorite 字段定义, PageCache 类型, PaginationParams 格式, IPC 通道设计, Client 层接口, 类型迁移范围, 向后兼容性, is_favorite 计算逻辑

---

## 类型定义位置

| Option | Description | Selected |
|--------|-------------|----------|
| 现有文件分散 | WallpaperItem 在 src/types/index.ts，收藏相关在 src/types/favorite.ts | |
| 迁移到 domain/ | 全部迁移到 src/types/domain/ 目录，按领域分组 | ✓ |
| 单一文件集中 | 在 src/types/index.ts 集中定义所有类型 | |

**User's choice:** 迁移到 domain/

---

## is_favorite 字段定义

| Option | Description | Selected |
|--------|-------------|----------|
| 添加到 WallpaperItem | 修改 WallpaperItem 接口，添加 is_favorite?: boolean | |
| 创建扩展接口 | 创建 WallpaperItemWithFavorite extends WallpaperItem | |
| 保持运行时计算 | 不修改类型，在前端使用 Map 或 Set 计算 | |

**User's choice:** 添加到 WallpaperItem，使用三态值 [0, 1, 2]
**Notes:** 三态含义：0=未收藏, 1=收藏到默认收藏夹, 2=收藏到其他收藏夹

---

## 三态含义

| Option | Description | Selected |
|--------|-------------|----------|
| 0=无, 1=默认, 2=其他 | 0=未收藏，1=收藏到默认收藏夹，2=收藏到其他收藏夹 | ✓ |
| 0=无, 1=单, 2=多 | 0=未收藏，1=已收藏（单收藏夹），2=多收藏夹收藏 | |
| 仅用 0/1 二态 | 0=未收藏，1=已收藏（不区分收藏夹数量） | |

**User's choice:** 0=无, 1=默认, 2=其他

---

## PageCache 类型

| Option | Description | Selected |
|--------|-------------|----------|
| Map<number, PageData> | 每个页码对应一个 PageData | ✓ |
| Map<number, ExtendedData> | 包含 data 和 total 信息 | |
| 不定义类型 | 在 Composable 层使用 reactive 对象 | |

**User's choice:** Map<number, PageData>

---

## PaginationParams 格式

| Option | Description | Selected |
|--------|-------------|----------|
| limit + offset | 经典 SQL 风格，与 SQLite LIMIT/OFFSET 对应 | ✓ |
| page + pageSize | 更语义化，需要转换为 offset | |
| page + 可选 limit | 混合模式，默认 limit=24 | |

**User's choice:** limit + offset

---

## favorites-get-paginated 返回结构

| Option | Description | Selected |
|--------|-------------|----------|
| items + total + hasMore | 包含所有分页元信息 | ✓ |
| items + meta 对象 | 嵌套 meta 对象 | |
| 仅返回数组 | total 通过单独 count 请求获取 | |

**User's choice:** items + total + hasMore

---

## 侧边栏收藏计数格式

| Option | Description | Selected |
|--------|-------------|----------|
| Map<string, number> | 一次请求获取所有计数 | ✓ |
| 单个 collection 计数 | 每次请求单个 collectionId | |
| 分离两个通道 | favorites-count 返回总数，favorites-count-by-collection 返回映射 | |

**User's choice:** Map<string, number>

---

## ROADMAP 计数通道合并

| Option | Description | Selected |
|--------|-------------|----------|
| 合并为一个通道 | favorites-get-counts 返回所有 collection 的计数映射 | ✓ |
| 保持两个通道 | favorites-count 和 favorites-count-by-collection | |
| 复用现有通道 | favorites-get-collections 返回值中包含 count 字段 | |

**User's choice:** 合并为一个通道

---

## ElectronClient 返回格式

| Option | Description | Selected |
|--------|-------------|----------|
| 完整 IpcResponse | 返回完整的 IpcResponse<T>，由 Service 层处理 | ✓ |
| 直接返回数据 | 成功时返回 T，失败时抛出异常 | |
| 扁平化结果 | 返回 { data: T | null, error: string | null } | |

**User's choice:** 完整 IpcResponse

---

## ElectronClient 方法命名风格

| Option | Description | Selected |
|--------|-------------|----------|
| favorites 前缀 | favoritesGetPaginated(), favoritesGetCounts() | ✓ |
| get 前缀 | getFavoritesPaginated(), getFavoritesCounts() | |
| 自然语序 | getPaginatedFavorites(), getFavoritesCounts() | |

**User's choice:** favorites 前缀

---

## 类型迁移范围

| Option | Description | Selected |
|--------|-------------|----------|
| 最小迁移 | 仅迁移 WallpaperItem 和新增类型 | |
| 全部壁纸+收藏类型 | 一次性迁移所有壁纸和收藏相关类型 | |
| 完整迁移 | 迁移所有类型包括 DownloadItem、AppSettings 等 | ✓ |

**User's choice:** 完整迁移

---

## 向后兼容性

| Option | Description | Selected |
|--------|-------------|----------|
| 保留重导出 | 在 src/types/index.ts 中保留 export * from './domain' | ✓ |
| 直接导入 domain/ | 不保留重导出，所有文件修改导入路径 | |
| 分阶段过渡 | 本次保留重导出，后续 milestone 清理 | |

**User's choice:** 保留重导出

---

## is_favorite 计算位置

| Option | Description | Selected |
|--------|-------------|----------|
| Service 层后处理 | WallpaperService.search() 获取 API 数据后查询 favorites 表 | ✓ |
| 新增批量查询 IPC | favorites-is-favorite-batch 批量查询 | |
| 保持前端计算 | 前端使用 wallpaperCollectionMap 计算 | |

**User's choice:** Service 层后处理

---

## 三态计算逻辑

| Option | Description | Selected |
|--------|-------------|----------|
| 基于 collectionIds 判断 | 查询 favorites 表获取 collectionIds，判断三态 | ✓ |
| SQL 字段存储 | 新增 SQL 字段直接存储三态值 | |
| 前端二次计算 | 前端根据 is_favorite + wallpaperCollectionMap 计算 | |

**User's choice:** 基于 collectionIds 判断

---

## Claude's Discretion

- 类型迁移的具体提交粒度（可按领域文件分多次提交或一次提交）
- 类型定义的详细文档注释
- Handler 层 SQL 查询的具体实现方式
- 是否需要为 PaginationParams 提供默认值工厂函数

## Deferred Ideas

None — discussion stayed within phase scope.
