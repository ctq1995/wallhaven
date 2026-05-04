# Roadmap: Wallhaven 壁纸浏览器

---

## Milestones

- ✅ **v2.0 架构重构** -- Phases 1-5 (shipped 2026-04-26)
- ✅ **v2.1 下载断点续传** -- Phases 6-9 (shipped 2026-04-27)
- ✅ **v2.2 Store 分层迁移** -- Phases 10-13 (shipped 2026-04-27)
- ✅ **v2.3 ElectronAPI 分层重构** -- Phase 14 (shipped 2026-04-27)
- ✅ **v2.4 ImagePreview 导航功能** -- Phase 15 (shipped 2026-04-27)
- ✅ **v2.5 壁纸收藏功能** -- Phases 16-22 (shipped 2026-04-29)
- ✅ **v2.6 设置页缓存优化** -- Phase 23 (shipped 2026-04-29)
- ✅ **v2.7 图片切换动画** -- Phases 24-25 (shipped 2026-04-29)
- ✅ **v2.8 动画性能优化** -- Phases 26-27 (shipped 2026-04-30)
- ✅ **v2.9 LoadingOverlay 动画优化** -- Phases 28-29 (shipped 2026-04-30)
- ✅ **v3.0 首屏动画** -- Phases 30-32 (shipped 2026-04-30)
- ✅ **v4.0 多线程下载与重试退避机制** -- Phases 33-35 (shipped 2026-05-01)
- ✅ **v4.1 壁纸列表全选功能** -- Phase 36 (shipped 2026-05-01)
- ✅ **v4.2 Composable 提取** -- Phase 37 (shipped 2026-05-02)
- ✅ **v4.3 downloadWallpaperFile 分层重构** -- Phase 38 (shipped 2026-05-02)
- ✅ **v4.4 收藏状态小红心与取消收藏** -- Phase 39 (shipped 2026-05-02)
- ✅ **v4.5 在线壁纸页面小红心状态** -- Phase 40 (shipped 2026-05-02)
- ✅ **v5.0 electron-store 到 SQLite 迁移** -- Phases 41-45 (shipped 2026-05-03)
- 🚧 **v6.0 传统分页重构** -- Phases 46-50 (planning)

---

## Phases

<details>
<summary>✅ v5.0 electron-store 到 SQLite 迁移 (Phases 41-45) — SHIPPED 2026-05-03</summary>

- [x] Phase 41: Database Infrastructure (2/2 plans)
- [x] Phase 42: Main Process + Store Handler Cutover (2/2 plans)
- [x] Phase 43: Favorites & Collections Migration (2/2 plans)
- [x] Phase 44: Migration Script (2/2 plans)
- [x] Phase 45: Cleanup & Final Verification (6/6 plans)

</details>

---

<details>
<summary>🚧 v6.0 传统分页重构 (Phases 46-50) — IN PROGRESS</summary>

- [x] **Phase 46: Infrastructure** — Types, IPC handlers, Client methods ✅ 2026-05-04
- [x] **Phase 47: Repository & Service Layer** — Pagination methods, is_favorite injection ✅ 2026-05-04
- [x] **Phase 48: Composable & Store Layer** — Pagination logic, caching, reactive counts ✅ 2026-05-04
- [ ] **Phase 49: View Layer - Pagination Bar** — PaginationBar component, online page integration
- [ ] **Phase 50: Favorites Page** — Infinite scroll, sidebar counts

</details>

---

## Phase Details

### Phase 46: Infrastructure ✅
**Goal**: 建立分页功能的类型系统和 IPC 通信基础
**Depends on**: Phase 45 (v5.0 complete)
**Requirements**: DATAREF-01, DATAREF-02, DATAREF-03, FAVSTA-01, FAVPAG-02
**Success Criteria** (what must be TRUE):
  1. TypeScript compiles without errors after type additions (is_favorite, PageCache, PaginationParams) ✅
  2. New IPC handlers defined with NOT_IMPLEMENTED placeholder (Phase 47 will implement) ✅
  3. ElectronClient methods successfully invoke new handlers with correct parameter passing ✅
**Plans**: 46-PLAN.md (Wave 1, 11 tasks) — Completed 2026-05-04

### Phase 47: Repository & Service Layer ✅
**Goal**: 实现 Repository 层分页查询和 Service 层收藏状态计算
**Depends on**: Phase 46
**Requirements**: FAVSTA-02, FAVPAG-02 (continued)
**Success Criteria** (what must be TRUE):
  1. FavoritesService.getPaginatedFavorites(24, 0) returns first 24 items with correct total count ✅
  2. WallpaperService.search() returns items with correct is_favorite values matching database state ✅
  3. Total count query returns unique wallpaper count (not favorite record count) ✅
**Plans**: 47-PLAN.md (Wave 1, 9 tasks) — Completed 2026-05-04

### Phase 48: Composable & Store Layer
**Goal**: 实现 Composable 层的分页状态管理、缓存策略和响应式计数
**Depends on**: Phase 47
**Requirements**: ONLPAG-06, ONLPAG-07, FAVPAG-01, FAVPAG-03, FAVPAG-04, FAVPAG-05, SIDECT-01, SIDECT-02, SIDECT-03, SIDECT-04
**Success Criteria** (what must be TRUE):
  1. Switching to a cached page loads instantly without API call
  2. Changing search filters clears the page cache
  3. useFavorites.goToPage() correctly loads specified page
  4. Sidebar counts update immediately after favorite add/remove operations
**Plans**: 48-PLAN.md (Wave 1-3, 6 tasks) — Created 2026-05-04

### Phase 49: View Layer - Pagination Bar
**Goal**: 实现传统分页 UI 并集成到在线壁纸页面
**Depends on**: Phase 48
**Requirements**: ONLPAG-01, ONLPAG-02, ONLPAG-03, ONLPAG-04, ONLPAG-05, ONLPAG-08, FAVSTA-03, FAVSTA-04
**Success Criteria** (what must be TRUE):
  1. Pagination bar displays correctly with page numbers, ellipsis, and total count
  2. Clicking a page number navigates to that page; Previous disabled on page 1, Next disabled on last page
  3. Arrow keys navigate between pages; page scrolls to top on navigation
  4. Favorite status (three-state heart) updates immediately after add/remove operations
**Plans**: TBD

### Phase 50: Favorites Page - Infinite Scroll
**Goal**: 实现收藏页面的无限滚动分页和侧边栏实时计数
**Depends on**: Phase 48, Phase 49 (can run in parallel with 49)
**Requirements**: FAVPAG-01 (verified), FAVPAG-03 (verified), FAVPAG-04 (verified), FAVPAG-05 (verified)
**Success Criteria** (what must be TRUE):
  1. Scrolling to bottom loads more favorites automatically with loading indicator
  2. "没有更多" displays when all items loaded (hasMore === false)
  3. Sidebar counts update immediately after any favorite operation
  4. Navigating to detail page and back preserves scroll position
**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 46. Infrastructure | v6.0 | 1/1 | ✅ Complete | 2026-05-04 |
| 47. Repository & Service Layer | v6.0 | 1/1 | ✅ Complete | 2026-05-04 |
| 48. Composable & Store Layer | v6.0 | 1/1 | ✅ Complete | 2026-05-04 |
| 49. View Layer - Pagination Bar | v6.0 | 0/TBD | Waiting | - |
| 50. Favorites Page | v6.0 | 0/TBD | Waiting | - |

---

## Requirement Traceability

### v6.0 Traceability

| Requirement | Phase | Description | Status |
|-------------|-------|-------------|--------|
| ONLPAG-01 | 49 | Pagination bar with page number navigation | Pending |
| ONLPAG-02 | 49 | Current page highlighted | Pending |
| ONLPAG-03 | 49 | Previous/Next buttons with disabled states | Pending |
| ONLPAG-04 | 49 | Total item count displayed | Pending |
| ONLPAG-05 | 49 | Scroll to top on page change | Pending |
| ONLPAG-06 | 48 | Visited pages cached in memory | Pending |
| ONLPAG-07 | 48 | Cache cleared on filter change | Pending |
| ONLPAG-08 | 49 | Arrow key navigation | Pending |
| FAVSTA-01 | 46 | is_favorite field in WallpaperItem | Pending |
| FAVSTA-02 | 47 | is_favorite computed from database | Pending |
| FAVSTA-03 | 49 | Favorite status updates after operations | Pending |
| FAVSTA-04 | 49 | Three-state heart indicator | Pending |
| FAVPAG-01 | 48, 50 | Infinite scroll for favorites | Pending |
| FAVPAG-02 | 46, 47 | SQLite LIMIT/OFFSET pagination | Pending |
| FAVPAG-03 | 48, 50 | Loading indicator while fetching | Pending |
| FAVPAG-04 | 48, 50 | "没有更多" message when complete | Pending |
| FAVPAG-05 | 48, 50 | Scroll position preserved on back | Pending |
| SIDECT-01 | 48 | Sidebar count updates on add | Pending |
| SIDECT-02 | 48 | Sidebar count updates on remove | Pending |
| SIDECT-03 | 48 | "全部收藏" shows unique count | Pending |
| SIDECT-04 | 48 | Per-collection counts displayed | Pending |
| DATAREF-01 | 46 | Replace TotalPageData with PageData | Pending |
| DATAREF-02 | 46 | Store currentPageData + pageCache Map | Pending |
| DATAREF-03 | 46 | Favorites keeps TotalPageData for infinite scroll | Pending |

**Coverage:**
- v6.0 requirements: 24 total
- Mapped to phases: 24/24 ✓

---

## Dependencies

```
Phase 45 (v5.0 Cleanup)
    ↓
Phase 46 (Infrastructure)
    ↓
Phase 47 (Repository & Service)
    ↓
Phase 48 (Composable & Store)
    ↓
┌───────────────────┬───────────────────┐
│                   │                   │
▼                   ▼                   │
Phase 49        Phase 50                │
(Pagination Bar) (Favorites Page)       │
│                   │                   │
└───────────────────┴───────────────────┘
```

**Notes:**
- Phase 49 and Phase 50 can partially overlap (different pages)
- Phase 48 must complete before both Phase 49 and 50

---

## Risk Mitigation

| Risk | Mitigation | Phase |
|------|------------|-------|
| Cache invalidation on favorite changes | Update cached page data directly instead of clearing | 48 |
| Concurrent page requests | Use request sequence number or AbortController | 48 |
| LEFT JOIN data duplication | Use EXISTS subquery instead of JOIN | 47 |
| Scroll position on page change | Scroll to top in goToPage() method | 49 |

---

*Roadmap updated: 2026-05-04 — v6.0 roadmap created*
