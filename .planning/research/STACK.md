# Technology Stack: 传统分页重构

**Project:** Wallhaven Wallpaper Browser
**Researched:** 2026-05-04
**Mode:** Stack Additions for v6.0 传统分页重构
**Milestone:** v6.0

---

## Executive Recommendation

**无需添加任何第三方分页组件库。**

项目已有完整的 `.pagination` CSS 样式（位于 `src/static/css/list.css`），支持页码导航的完整 UI 样式。结合现有的 Vue 3 Composition API + Pinia 架构，使用原生实现分页条组件最为简洁。

SQLite 分页使用标准的 `LIMIT/OFFSET` 模式，配合现有 `node:sqlite` 和 `withTransaction()` 工具函数即可实现。对于"我的收藏"页面的数据量（通常 < 500 条），`LIMIT/OFFSET` 性能完全足够，无需引入游标分页的复杂性。

---

## Stack Additions Summary

| Category | Addition | Version | Purpose | Why |
|----------|----------|---------|---------|-----|
| **组件库** | 无 | - | 分页条 UI | 项目已有 `.pagination` CSS 样式，无需引入新库 |
| **工具库** | 无 | - | 分页逻辑 | Vue 3 Composition API + Pinia 足够处理分页状态 |
| **SQLite 分页** | 无 | - | 数据库分页 | 使用现有 `node:sqlite` + `LIMIT/OFFSET` 模式 |
| **缓存** | 无 | - | 内存缓存 | 使用 Vue `reactive()`/`ref()` + `Map` 即可 |

**结论：零依赖添加。完全复用现有技术栈。**

---

## Pagination UI Implementation

### 推荐方案：自定义 Vue 组件

**理由：**
1. 项目已有完整的 `.pagination` CSS 样式（list.css 第 1822-1880 行）
2. 样式与 Wallhaven 官网风格一致，用户体验无缝衔接
3. 无第三方库学习成本，团队完全掌控代码
4. 分页逻辑简单（共 X 页，当前第 Y 页，跳转），无需复杂库

### 现有 CSS 样式支持

```css
/* 已有样式 (list.css) */
.pagination { margin: 1em auto; text-align: center; }
.pagination ul { display: inline-block; box-shadow: 0 0 4px rgba(0, 0, 0, 0.4); }
.pagination li { display: inline-block; text-align: center; }
.pagination li a, .pagination li span {
  display: inline-block;
  line-height: 2em;
  min-width: 2em;
  /* ... gradient backgrounds ... */
}
.pagination li.active a, .pagination li.active span { /* 当前页高亮 */ }
.pagination li.disabled a, .pagination li.disabled span { /* 禁用状态 */ }
```

### 组件结构建议

```
src/components/
  Pagination.vue        # 新增：分页条组件
```

**组件 Props：**
```typescript
interface PaginationProps {
  currentPage: number    // 当前页码 (1-based)
  totalPages: number     // 总页数
  totalItems?: number    // 可选：总条目数显示 ("共 X 张")
  maxVisible?: number    // 可选：最多显示几个页码按钮 (默认 7)
  disabled?: boolean     // 可选：禁用状态
}
```

**组件 Emits：**
```typescript
interface PaginationEmits {
  'page-change': [page: number]  // 页码变更事件
}
```

### 排除的第三方库

| 库名 | 排除原因 |
|------|----------|
| **vueuse/useOffsetPagination** | 工具函数，无 UI 组件。项目无需此抽象层 |
| **laravel-vue-pagination** | Laravel API 风格耦合，过度设计 |
| **vue-ads-pagination** | 额外依赖，样式覆盖成本高于自写 |
| **vee-validate** | 表单验证库，非分页专用 |
| **Element Plus** | 引入完整 UI 库仅为分页组件，过度依赖 |

---

## SQLite Pagination Patterns

### 推荐方案：LIMIT/OFFSET 分页

**适用场景：**
- "我的收藏"页面数据量：通常 < 500 条
- 在线壁纸 API 返回：24 张/页，元数据包含 `total` 和 `last_page`

**SQL 模式：**
```sql
-- 分页查询
SELECT wallpaper_id, wallpaper_data, added_at
FROM favorites
WHERE collection_id = ?  -- 可选过滤
ORDER BY added_at DESC
LIMIT ? OFFSET ?;

-- 总数查询（用于显示"共 X 张"）
SELECT COUNT(*) as total FROM favorites WHERE collection_id = ?;
```

### 计算公式

```typescript
// 页码计算 (1-based)
const pageSize = 24  // 与 Wallhaven API 一致
const offset = (currentPage - 1) * pageSize
const totalPages = Math.ceil(totalCount / pageSize)
```

### 性能评估

| 数据量 | LIMIT/OFFSET 性能 | 建议 |
|--------|------------------|------|
| < 1000 条 | 优秀 (< 1ms) | ✅ 推荐，无需优化 |
| 1000-10000 条 | 良好 (< 10ms) | ✅ 可接受 |
| > 10000 条 | 可能变慢 | ⚠️ 考虑游标分页（本项目不适用） |

**SQLite 索引优化（已存在）：**
```sql
-- 已有索引 (database.ts)
CREATE INDEX idx_favorites_wallpaper ON favorites(wallpaper_id);
CREATE INDEX idx_download_history_created ON download_history(created_at DESC);
```

**建议添加的索引（收藏分页优化）：**
```sql
-- 用于按收藏夹筛选 + 时间排序的分页查询
CREATE INDEX idx_favorites_collection_added
  ON favorites(collection_id, added_at DESC);
```

### 排除的方案：游标分页 (Cursor Pagination)

**原因：**
1. 游标分页适用于大数据量（> 10000 条）深度分页场景
2. 实现复杂度高：需要持久化游标、处理插入/删除后的游标失效
3. 本项目数据量小，`LIMIT/OFFSET` 完全够用
4. Wallhaven API 本身使用 `page` 参数，游标分页无法复用 API 元数据

---

## Memory Caching Strategy

### 推荐方案：Vue Reactive Map

**实现：** 在 Store/Composable 层使用 `Map<string, PageData>` 缓存已加载页面。

```typescript
// useWallpaperList.ts 或 wallpaperStore
const pageCache = reactive(new Map<number, PageData>())

// 获取页面时检查缓存
async function fetchPage(page: number): Promise<PageData> {
  // 1. 检查内存缓存
  const cached = pageCache.get(page)
  if (cached) return cached

  // 2. 缓存未命中，请求 API
  const result = await wallpaperService.search({ ...queryParams, page })
  const pageData = toPageData(result.data!)

  // 3. 写入缓存
  pageCache.set(page, pageData)
  return pageData
}

// 搜索条件变更时清空缓存
function clearCache(): void {
  pageCache.clear()
}
```

### 缓存策略

| 策略 | 说明 |
|------|------|
| **缓存粒度** | 按 `Map<page, PageData>` 存储，每页独立缓存 |
| **缓存触发** | 首次访问页面时加载，后续访问直接返回 |
| **缓存失效** | 搜索条件变更时清空全部缓存 |
| **缓存上限** | 无硬性限制（数据量小，内存占用可忽略） |

### 排除的方案

| 方案 | 排除原因 |
|------|----------|
| **localStorage/sessionStorage** | 数据序列化成本、无必要持久化 |
| **IndexedDB** | 过度设计，内存缓存足够 |
| **LRU Cache 库** | 引入额外依赖，数据量小无需淘汰策略 |

---

## Data Structure Changes

### 现有数据结构 (TotalPageData)

```typescript
// src/types/index.ts
interface TotalPageData {
  totalPage: number
  currentPage: number
  sections: PageData[]  // 无限滚动：追加到 sections
}

interface PageData {
  totalPage: number
  currentPage: number
  data: WallpaperItem[]
}
```

### 目标数据结构 (PageData + Cache)

```typescript
// 在线壁纸页面：单页数据 + 缓存
const currentPageData = ref<PageData>({
  totalPage: 0,
  currentPage: 1,
  data: []
})

const pageCache = reactive(new Map<number, PageData>())

// 我的收藏页面：无限滚动保持 TotalPageData 结构
const favoritesData = ref<TotalPageData>({
  totalPage: 0,
  currentPage: 0,
  sections: []
})
```

### 迁移路径

1. **在线壁纸页面**：
   - 移除 `sections` 数组，改用单页 `PageData`
   - 新增 `pageCache: Map<number, PageData>` 缓存已加载页
   - `currentPage` 变更时从缓存或 API 加载

2. **我的收藏页面**：
   - 保持 `TotalPageData` 结构（无限滚动）
   - 添加 SQLite 分页查询支持
   - 侧边栏收藏数目响应式更新

---

## Integration with Existing Stack

### 无需修改的文件

| 文件/模块 | 原因 |
|----------|------|
| `electron/main/database.ts` | 已有完整的 SQLite 基础设施 |
| `electron/main/sqlite.d.ts` | 已有类型声明 |
| `src/clients/electron.client.ts` | 无需新增 IPC 通道（复用现有查询） |
| `package.json` | 零依赖添加 |

### 需要新增的文件

| 文件 | 用途 |
|------|------|
| `src/components/Pagination.vue` | 分页条 UI 组件 |

### 需要修改的文件

| 文件 | 变更内容 |
|------|----------|
| `src/stores/modules/wallpaper/index.ts` | 添加 `pageCache`，修改分页逻辑 |
| `src/composables/wallpaper/useWallpaperList.ts` | 重构 `fetch`/`loadMore` 为 `fetchPage` |
| `src/views/OnlineWallpaper.vue` | 集成分页条组件，移除滚动监听 |
| `src/views/FavoritesPage.vue` | 添加 SQLite 分页查询支持 |
| `electron/main/ipc/handlers/favorites.handler.ts` | 新增分页查询 IPC 通道 |
| `src/types/index.ts` | 保持现有类型，可能添加 `PaginatedResult<T>` |

---

## Recommended IPC Additions

### 收藏分页查询

```typescript
// 新增 IPC 通道
'favorites:get-paginated': {
  collectionId?: string,  // 可选：指定收藏夹
  page: number,           // 页码 (1-based)
  pageSize: number        // 每页条数 (默认 24)
}

// 返回类型
interface PaginatedFavorites {
  data: FavoriteItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
```

### SQLite Handler 实现

```typescript
// electron/main/ipc/handlers/favorites.handler.ts
ipcMain.handle('favorites:get-paginated', (_event, params) => {
  const { collectionId, page = 1, pageSize = 24 } = params
  const offset = (page - 1) * pageSize

  const db = getDatabase()

  // 总数查询
  const countSql = collectionId
    ? 'SELECT COUNT(*) as total FROM favorites WHERE collection_id = ?'
    : 'SELECT COUNT(*) as total FROM favorites'
  const countRow = collectionId
    ? db.prepare(countSql).get(collectionId)
    : db.prepare(countSql).get()
  const total = (countRow as { total: number }).total

  // 分页查询
  const dataSql = collectionId
    ? `SELECT * FROM favorites WHERE collection_id = ? ORDER BY added_at DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM favorites ORDER BY added_at DESC LIMIT ? OFFSET ?`
  const rows = collectionId
    ? db.prepare(dataSql).all(collectionId, pageSize, offset)
    : db.prepare(dataSql).all(pageSize, offset)

  return {
    success: true,
    data: {
      data: rows.map(row => deserializeFavorite(row)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  }
})
```

---

## Confidence Assessment

| Aspect | Confidence | Reason |
|--------|------------|--------|
| 零依赖策略 | **HIGH** | 现有 CSS 样式 + Vue 3 足够，无需第三方库 |
| LIMIT/OFFSET 性能 | **HIGH** | 收藏数据量小（< 500 条），性能优秀 |
| 内存缓存策略 | **HIGH** | Vue `reactive(Map)` 成熟稳定 |
| 组件实现复杂度 | **HIGH** | 分页条 UI 简单，现有样式覆盖完整 |
| 集成风险 | **LOW** | 仅修改 View/Composable 层，不涉及底层架构 |

---

## Summary

**核心决策：零依赖添加，复用现有技术栈。**

1. **分页 UI**：使用现有 `.pagination` CSS + 自定义 Vue 组件
2. **SQLite 分页**：使用 `LIMIT/OFFSET` + 索引优化
3. **内存缓存**：使用 `reactive(Map<number, PageData>)`
4. **数据结构**：在线壁纸用单页 `PageData`，我的收藏保持 `TotalPageData`

---

## Sources

- [SQLite LIMIT/OFFSET Documentation](https://www.sqlite.org/lang_select.html#limitoffset) — 官方文档
- [Vue 3 Reactivity API](https://vuejs.org/api/reactivity-core.html) — reactive/ref 官方文档
- [Wallhaven API Documentation](https://wallhaven.cc/help/api) — API 返回格式参考
- Current codebase: `src/types/index.ts`, `src/stores/modules/wallpaper/index.ts`, `src/composables/wallpaper/useWallpaperList.ts`, `src/static/css/list.css`, `electron/main/database.ts`

---

*Researched: 2026-05-04 for v6.0 milestone*
