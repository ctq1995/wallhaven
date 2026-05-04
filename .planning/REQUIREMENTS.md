# Requirements: Wallhaven v6.0 — 传统分页重构

**Defined:** 2026-05-04
**Core Value:** 收藏管理，分类随心 — 将喜欢的壁纸添加到自定义收藏夹，按主题分类管理

## v6.0 Requirements

### Online Wallpaper Pagination

- [ ] **ONLPAG-01**: User can see a pagination bar with page number navigation below the wallpaper grid
- [ ] **ONLPAG-02**: Current page is highlighted in the pagination bar
- [ ] **ONLPAG-03**: User can click "Previous"/"Next" buttons to navigate pages (disabled at boundaries)
- [ ] **ONLPAG-04**: User can see total item count displayed (e.g., "共 1000 张")
- [ ] **ONLPAG-05**: Page scrolls to top when switching pages
- [ ] **ONLPAG-06**: Visited pages are cached in memory — switching back loads instantly without API request
- [ ] **ONLPAG-07**: Cache is cleared when search filters change
- [ ] **ONLPAG-08**: User can navigate pages using left/right arrow keys

### Favorite Status Calculation

- [ ] **FAVSTA-01**: WallpaperItem includes `is_favorite` boolean field returned from Service layer
- [ ] **FAVSTA-02**: `is_favorite` is computed by checking wallpaper ID against user's favorites in database
- [ ] **FAVSTA-03**: Favorite status updates correctly after add/remove favorite operations
- [ ] **FAVSTA-04**: Three-state heart indicator displays correctly (red=in default collection, blue=in custom collection, transparent=not favorited)

### Favorites Page Pagination

- [ ] **FAVPAG-01**: User can scroll to bottom to load more favorites (infinite scroll)
- [ ] **FAVPAG-02**: Favorites are loaded in pages of 24 items via SQLite LIMIT/OFFSET
- [ ] **FAVPAG-03**: Loading indicator shows while fetching more items
- [ ] **FAVPAG-04**: "没有更多" message displays when all favorites are loaded
- [ ] **FAVPAG-05**: Scroll position is preserved when navigating to wallpaper detail and back

### Sidebar Reactive Counts

- [ ] **SIDECT-01**: Collection count in sidebar updates immediately after adding a favorite
- [ ] **SIDECT-02**: Collection count in sidebar updates immediately after removing a favorite
- [ ] **SIDECT-03**: "全部收藏" count shows unique wallpaper count (not total favorite records)
- [ ] **SIDECT-04**: Each collection's count shows number of wallpapers in that collection

### Data Structure Refactoring

- [ ] **DATAREF-01**: Replace `TotalPageData` with `PageData` for online wallpaper page
- [ ] **DATAREF-02**: Store maintains `currentPageData` + `pageCache` Map structure
- [ ] **DATAREF-03**: Favorites page continues using `TotalPageData` for infinite scroll accumulation

## Out of Scope

| Feature | Reason |
|---------|--------|
| URL parameter sync | Deferred to future milestone — complexity of browser history + search state |
| Page number input box | Click navigation sufficient for limited page counts |
| Virtual pagination (frontend truncation) | Wallhaven API returns only 24 items per request — cannot paginate frontend |
| Dual mode (infinite scroll + pagination toggle) | Interaction logic conflict, doubles state management complexity |
| Favorites page traditional pagination | Infinite scroll is better suited for local data browsing |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ONLPAG-01 | TBD | Pending |
| ONLPAG-02 | TBD | Pending |
| ONLPAG-03 | TBD | Pending |
| ONLPAG-04 | TBD | Pending |
| ONLPAG-05 | TBD | Pending |
| ONLPAG-06 | TBD | Pending |
| ONLPAG-07 | TBD | Pending |
| ONLPAG-08 | TBD | Pending |
| FAVSTA-01 | TBD | Pending |
| FAVSTA-02 | TBD | Pending |
| FAVSTA-03 | TBD | Pending |
| FAVSTA-04 | TBD | Pending |
| FAVPAG-01 | TBD | Pending |
| FAVPAG-02 | TBD | Pending |
| FAVPAG-03 | TBD | Pending |
| FAVPAG-04 | TBD | Pending |
| FAVPAG-05 | TBD | Pending |
| SIDECT-01 | TBD | Pending |
| SIDECT-02 | TBD | Pending |
| SIDECT-03 | TBD | Pending |
| SIDECT-04 | TBD | Pending |
| DATAREF-01 | TBD | Pending |
| DATAREF-02 | TBD | Pending |
| DATAREF-03 | TBD | Pending |

**Coverage:**
- v6.0 requirements: 24 total
- Mapped to phases: 0/24 ⚠️

---
*Requirements defined: 2026-05-04*
