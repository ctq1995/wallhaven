# 研究摘要: v6.0 传统分页重构

**Milestone:** v6.0 — 将在线壁纸页面从无限滚动改为传统分页条，我的收藏页面实现无限滚动分页
**研究日期:** 2026-05-04
**置信度:** HIGH

---

## 一、里程碑范围概述

### 核心变更

| 页面 | 当前实现 | 目标实现 |
|------|----------|----------|
| **在线壁纸** | 无限滚动（scroll event 触发加载） | 传统分页条（页码导航） |
| **我的收藏** | 全量加载 + 前端过滤 | 无限滚动分页（SQLite LIMIT/OFFSET） |
| **收藏状态** | 前端计算（Set 查找） | Service 层注入（is_favorite 字段） |

### 不在范围内

- URL 参数同步（后续 milestone）
- 页码输入框跳转
- 虚拟分页/前端截断
- 双模式切换（无限滚动 + 传统分页并存）

---

## 二、技术栈决策

### 零依赖添加

**核心理念：** 完全复用现有技术栈，无需引入第三方分页组件库。

| 类别 | 决策 | 理由 |
|------|------|------|
| **分页 UI** | 自定义 Vue 组件 + 现有 CSS | 项目已有完整的 `.pagination` 样式（list.css 第 1822-1880 行） |
| **SQLite 分页** | `LIMIT/OFFSET` 模式 | 收藏数据量小（< 500 条），性能完全足够 |
| **内存缓存** | `reactive(Map<number, PageData>)` | Vue 响应式 + Map 结构简洁高效 |
| **状态管理** | 现有 Pinia Store | 无需新增状态管理工具 |

### 排除的第三方库

| 库名 | 排除原因 |
|------|----------|
| vueuse/useOffsetPagination | 工具函数无 UI，项目无需此抽象层 |
| laravel-vue-pagination | Laravel API 风格耦合，过度设计 |
| vue-ads-pagination | 额外依赖，样式覆盖成本高于自写 |
| Element Plus | 引入完整 UI 库仅为分页组件，过度依赖 |

---

## 三、功能分类

### Table Stakes（用户期望的基础特性）

| 功能 | 复杂度 | 说明 |
|------|--------|------|
| 页码导航 | MEDIUM | 新建 Pagination 组件，处理页码计算、省略号显示 |
| 当前页高亮 | LOW | CSS 类切换 |
| 上一页/下一页按钮 | LOW | 条件禁用 + 点击处理 |
| 总条目数显示 | LOW | 从 API meta.total 获取 |
| 页面切换时滚动到顶部 | LOW | `window.scrollTo(0, 0)` |

### Differentiators（差异化优势）

| 功能 | 复杂度 | 价值主张 |
|------|--------|----------|
| 内存页面缓存 | MEDIUM | 已访问页面瞬间加载，无需重新请求 API |
| 收藏状态 Service 层计算 | MEDIUM | 数据源一致，减少前端计算负担 |
| 分页条响应式设计 | LOW | 小屏幕省略页码，大屏幕完整显示 |
| 键盘快捷键导航 | LOW | 左右方向键翻页 |

### Anti-Features（应避免的功能）

| 功能 | 问题 |
|------|------|
| 无限滚动 + 传统分页并存 | 交互逻辑冲突，状态管理双倍复杂 |
| URL 参数双向绑定 | 前进/后退按钮、搜索条件变化等边界情况复杂 |
| 虚拟分页（前端截断） | Wallhaven API 每次仅返回 24 张，无法前端分页 |
| 页码输入框跳转 | 总页数有限时点击跳转足够，增加 UI 复杂度 |

---

## 四、推荐架构方案

### 数据结构变更

**Before（无限滚动）：**
```typescript
interface TotalPageData {
  totalPage: number
  currentPage: number
  sections: PageData[]  // 累积的页面数据
}
```

**After（传统分页）：**
```typescript
// 在线壁纸：单页数据 + 缓存
interface WallpaperStoreState {
  currentPageData: shallowRef<PageData | null>
  pageCache: Map<number, PageData>  // composable 管理
  currentPage: number
  totalPage: number
  total: number  // 总条目数
}

// 我的收藏：保持 TotalPageData（无限滚动）
interface FavoritesState {
  data: TotalPageData  // sections 累加
  hasMore: boolean
}
```

### 各层职责

| 层级 | 在线壁纸变更 | 我的收藏变更 |
|------|-------------|-------------|
| **View** | 添加 PaginationBar，移除滚动监听 | 添加滚动监听，触发 loadMore |
| **Composable** | 新增 goToPage(), pageCache | 新增 loadMore(), hasMore |
| **Service** | 添加 is_favorite 后处理 | 添加分页方法 |
| **Repository** | 无变更 | 添加分页 IPC 调用 |
| **Client** | 无变更 | 添加 favoritesGetPaginated() |
| **Handler** | 无变更 | 添加 LIMIT/OFFSET SQL handler |

### is_favorite 字段注入

**推荐方案：Service 层后处理**

```typescript
// WallpaperService.search()
async search(params: GetParams | null) {
  const result = await apiClient.get<WallpaperSearchResult>('/search', filteredParams, apiKey)

  if (result.success && result.data) {
    const favoriteIds = await this.getFavoriteIds()  // 复用 FavoritesService 缓存

    const dataWithFavorite = result.data.data.map(item => ({
      ...item,
      is_favorite: favoriteIds.has(item.id)
    }))

    return { success: true, data: { data: dataWithFavorite, meta: result.data.meta } }
  }
  return result
}
```

---

## 五、关键陷阱警示

### 高风险陷阱（数据丢失/重写）

| 陷阱 | 症状 | 预防策略 |
|------|------|----------|
| **页码越界** | 删除最后一条后显示空白页 | 删除后检查页码有效性，自动跳转前一页 |
| **TotalPageData 混用** | 页码切换后数据错乱 | 明确区分使用场景，在线壁纸用 PageData，收藏用 TotalPageData |
| **缓存失效策略缺失** | 收藏状态不更新 | 定义明确失效条件，收藏操作后更新缓存中的 is_favorite |

### 中风险陷阱（性能/体验）

| 陷阱 | 症状 | 预防策略 |
|------|------|----------|
| **并发请求竞态** | 快速切换后显示错误页面 | 使用请求序列号或 AbortController |
| **LEFT JOIN 数据重复** | 同一壁纸显示多次 | 使用 EXISTS 子查询替代 |
| **侧边栏计数不更新** | 删除后计数错误 | 分离列表数据与元数据查询 |

### 低风险陷阱（代码质量）

| 陷阱 | 症状 | 预防策略 |
|------|------|----------|
| **Composable 职责膨胀** | 代码难以测试 | 提取 usePageCache、usePagination 子 composable |
| **类型定义碎片化** | 频繁类型转换 | 统一类型定义，明确使用场景 |

---

## 六、构建顺序建议

### Phase 1: 基础设施层
1. `types/index.ts` — 添加 `is_favorite` 字段
2. `favorites.handler.ts` — 添加分页和计数 handlers
3. `ElectronClient.ts` — 添加新 IPC 调用

### Phase 2: Repository & Service 层
4. `FavoritesRepository.ts` — 添加分页方法
5. `FavoritesService.ts` — 添加分页逻辑
6. `WallpaperService.ts` — 添加 is_favorite 后处理

### Phase 3: Composable & Store 层
7. `WallpaperStore` — 替换数据结构
8. `useWallpaperList.ts` — 添加分页逻辑和缓存
9. `useFavorites.ts` — 添加无限滚动逻辑
10. `useCollections.ts` — 添加响应式计数

### Phase 4: View 层
11. `PaginationBar.vue` — 新建分页条组件
12. `OnlineWallpaper.vue` — 集成分页条，移除无限滚动
13. `FavoritesPage.vue` — 添加无限滚动
14. `CollectionSidebar.vue` — 响应式计数

---

## 七、验收标准

### 在线壁纸页面
- [ ] 显示传统分页条（页码导航）
- [ ] 显示总条目数（"共 X 张"）
- [ ] 点击页码可跳转到对应页面
- [ ] 已访问页面有缓存，不重复请求
- [ ] 收藏状态正确显示（三态心形）
- [ ] 收藏操作后状态正确同步

### 我的收藏页面
- [ ] 支持无限滚动分页
- [ ] 侧边栏收藏数目实时更新
- [ ] 滚动到底部自动加载更多
- [ ] 加载完成显示"没有更多"

---

## 八、来源索引

| 文档 | 内容 |
|------|------|
| `STACK.md` | 技术栈决策、零依赖策略、SQLite 分页模式 |
| `FEATURES.md` | 功能分类、依赖关系、MVP 定义、优先级矩阵 |
| `ARCHITECTURE.md` | 现有架构分析、目标架构设计、数据流图、集成点清单 |
| `PITFALLS.md` | 分页实现陷阱、SQL 层陷阱、性能陷阱、UI/UX 陷阱 |

---

*研究摘要生成于: 2026-05-04*
*Milestone: v6.0 传统分页重构*
