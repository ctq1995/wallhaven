# Phase 47: Repository & Service Layer — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 47-repository-service-layer
**Areas discussed:** is_favorite 注入策略, 分页查询实现, 缓存一致性, 计数去重逻辑, 三态值语义, Repository 签名, Service 集成流程

---

## is_favorite 注入策略

| Option | Description | Selected |
|--------|-------------|----------|
| 方案 A: EXISTS 子查询批量获取 | 新增 IPC 返回所有收藏状态映射，Service 层调用后合并 | |
| 方案 B: 内存 Set 缓存 | WallpaperService 内部调用 FavoritesService.getAll()，构建 Set | |
| 方案 C: SQL JOIN 状态 | 在 favorites 表 LEFT JOIN collections 表获取 is_default | ✓ |

**User's choice:** 方案 C: SQL JOIN 状态
**Notes:** 用户明确选择 SQL JOIN 方案，认为数据库层面处理更可靠

### IPC 封装方式

| Option | Description | Selected |
|--------|-------------|----------|
| A-1: 新增独立 IPC（推荐） | 新增 'favorites-get-status-map' IPC，接受 wallpaperIds 数组 | ✓ |
| A-2: 扩展现有 IPC | 扩展 'favorites-is-favorite' 支持批量查询 | |
| A-3: Service 层封装 | FavoritesService 提供方法，内部决定实现方式 | |

**User's choice:** A-1: 新增独立 IPC（推荐）

---

## 分页查询实现

| Option | Description | Selected |
|--------|-------------|----------|
| 基础实现（推荐） | 实现 favorites-get-paginated 和 favorites-get-counts 作为两个独立 IPC | |
| 合并计数返回 | 在分页查询时同时返回计数，减少 IPC 调用 | |

**User's choice:** 基础实现（两个独立 IPC）

用户最初选择"合并计数返回"，但在确认具体设计时选择返回上一层，最终确认选择"两个独立 IPC（基础）"。

---

## 缓存一致性

| Option | Description | Selected |
|--------|-------------|----------|
| 复用现有缓存（推荐） | FavoritesService 复用 cachedFavorites，新增 getFavoriteStatusMap() 方法 | |
| 实时查询数据库 | 新增 IPC 每次查询数据库获取最新状态 | ✓ |
| 缓存 + 脏标记 | 混合方案，首次用缓存，操作后标记脏 | |

**User's choice:** 实时查询数据库（坚持 SQL JOIN + 新增 IPC）

**Notes:** 用户最初选择"复用现有缓存"，但在被问及与之前 SQL JOIN 决策的协调时，确认坚持"SQL JOIN + 新增 IPC"方案，放弃缓存方案。

---

## 计数去重逻辑

| Option | Description | Selected |
|--------|-------------|----------|
| COUNT DISTINCT（推荐） | SELECT COUNT(DISTINCT wallpaper_id) 返回全部收藏去重计数 | ✓ |
| 分开查询 | 两个独立 SQL：全部收藏用 DISTINCT，收藏夹用普通 COUNT | |
| UNION 合并查询 | 一次 SQL 返回所有计数 | |

**User's choice:** COUNT DISTINCT（推荐）

---

## is_favorite 三态值语义

| Option | Description | Selected |
|--------|-------------|----------|
| 优先默认收藏夹（推荐） | 同时存在默认和其他收藏夹时返回 1 | ✓ |
| 优先其他收藏夹 | 同时存在时返回 2 | |
| 增加第四态 | 同时存在时返回新值 3（不推荐） | |

**User's choice:** 优先默认收藏夹（推荐）

---

## Repository 方法签名

| Option | Description | Selected |
|--------|-------------|----------|
| 标准签名（推荐） | getFavoriteStatusMap(ids), getFavoritesPaginated(params), getCounts() | ✓ |
| 替代签名 A | 返回 Map 类型，参数分开传递 | |
| Claude 自行决定 | 让 Claude 根据代码风格决定 | |

**User's choice:** 标准签名（推荐）

---

## Service 层集成流程

| Option | Description | Selected |
|--------|-------------|----------|
| WallpaperService 内部调用（推荐） | search() 内部调用 favoritesRepository.getFavoriteStatusMap() | ✓ |
| 新增协调 Service | 新增 WallpaperFavoriteService 协调两个 Service | |
| Composable 层合并 | Composable 层调用两个 Service 后合并 | |

**User's choice:** WallpaperService 内部调用（推荐）

---

## Claude's Discretion

- IPC handler 的具体实现细节（错误处理、日志格式）
- 类型定义的详细注释
- Repository 方法的参数校验逻辑
- 是否需要为 getFavoriteStatusMap 提供空数组处理

---

## Deferred Ideas

None — all discussed items were resolved within phase scope.

---

*Phase: 47-repository-service-layer*
*Discussion completed: 2026-05-04*
