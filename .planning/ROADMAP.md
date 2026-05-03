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
- 🚧 **v5.0 electron-store 到 SQLite 迁移** -- Phases 41-45 (planning)

---

## Phases

<details>
<summary>✅ v4.0 多线程下载与重试退避机制 (Phases 33-35) — SHIPPED 2026-05-01</summary>

- [x] Phase 33: 下载队列与并发控制 (3/3 plans) — completed 2026-05-01
- [x] Phase 34: 错误分类与重试退避 (3/3 plans) — completed 2026-05-01
- [x] Phase 35: 重试状态展示与UI集成 (3/3 plans) — completed 2026-05-01

</details>

<details>
<summary>✅ v4.1 壁纸列表全选功能 (Phase 36) — SHIPPED 2026-05-01</summary>

- [x] Phase 36: 壁纸列表全选功能 (1/1 plan) — completed 2026-05-01

</details>

<details>
<summary>✅ v4.2 Composable 提取 (Phase 37) — SHIPPED 2026-05-02</summary>

- [x] Phase 37: 将 FavoritesPage.vue 和 OnlineWallpaper.vue 中的 handleSetBg/setBg 与 downloadWallpaperFile 提取为可复用组合函数 (2/2 plans) — completed 2026-05-02

</details>

---

<details>
<summary>✅ v4.3 downloadWallpaperFile 分层重构 (Phase 38) — SHIPPED 2026-05-02</summary>

- [x] Phase 38: downloadWallpaperFile 分层重构与重复下载检测 (2/2 plans) — completed 2026-05-02

Plans:
- [x] 38-01-PLAN.md — Add fileExists IPC infrastructure (IPC channel, preload bridge, electron client)
- [x] 38-02-PLAN.md — Add simpleDownload to service + refactor composable to delegate

</details>

---

<details>
<summary>✅ v4.4 收藏状态小红心与取消收藏 (Phase 39) — SHIPPED 2026-05-02</summary>

- [x] Phase 39: 收藏状态小红心逻辑与取消收藏功能 (2/2 plans) — completed 2026-05-02

Plans:
- [x] 39-01-PLAN.md — Make FavoriteWallpaperCard badge clickable (emit unfavorite, hover tooltip, click-stop)
- [x] 39-02-PLAN.md — Implement unfavorite handlers in FavoritesPage (card badge + ImagePreview heart)

</details>

---

<details>
<summary>✅ v4.5 在线壁纸页面小红心状态 (Phase 40) — SHIPPED 2026-05-02</summary>

- [x] Phase 40: 在线壁纸页面小红心多收藏夹状态区分 — WallpaperList/ImagePreview 组件颜色逻辑 (3 plans) — complete

Plans:
- [x] 40-01-PLAN.md — Create heart.ts utility + compute wallpaperCollectionMap/defaultCollectionId in OnlineWallpaper
- [x] 40-02-PLAN.md — Implement three-state heart in WallpaperList (red/blue/transparent + CSS)
- [x] 40-03-PLAN.md — Implement three-state heart in ImagePreview (with backward-compatible fallback + CSS)

</details>

---

<details>
<summary>🚧 v5.0 electron-store 到 SQLite 迁移 (Phases 41-45) — EXECUTING</summary>

- [x] **Phase 41: Database Infrastructure** (2/2 plans) — Core database connection, schema, and utilities
- [x] **Phase 42: Main Process + Store Handler Cutover** (2/2 plans) — All generic store access backed by SQLite
- [ ] **Phase 43: Favorites & Collections Migration** (0 plans) — Targeted SQL operations for favorites
- [ ] **Phase 44: Migration Script** (0 plans) — One-time electron-store to SQLite migration
- [ ] **Phase 45: Cleanup & Final Verification** (0 plans) — Remove electron-store, verify build integrity

</details>

---

## Phase Details

### Phase 41: Database Infrastructure
**Goal**: Core database connection, schema initialization, and utility layer established
**Depends on**: Nothing (first phase of v5.0 milestone)
**Requirements**: DBINFRA-01, DBINFRA-02, DBINFRA-03, DBINFRA-04
**Success Criteria** (what must be TRUE):
  1. Singleton DatabaseSync initializes lazily on first access and shuts down cleanly
  2. All 5 tables (settings, search_params, download_history, collections, favorites) created with correct schema, foreign keys, and indexes
  3. WAL mode is enabled on the database connection
  4. withTransaction() utility correctly commits or rolls back multi-write operations
**Plans**: 2 plans
- [x] 41-01-PLAN.md — Foundation: node:sqlite type declarations (sqlite.d.ts) + package.json engines update
- [x] 41-02-PLAN.md — Database module: database.ts (singleton, schema, withTransaction, WAL checkpoint) + index.ts integration

### Phase 42: Main Process + Store Handler Cutover
**Goal**: All generic store access (direct imports + generic IPC handlers + repositories) backed by SQLite
**Depends on**: Phase 41
**Requirements**: MPDIR-01, MPDIR-02, STIPC-01, STIPC-02, STIPC-03, STIPC-04, REPO-01, REPO-02, REPO-03
**Success Criteria** (what must be TRUE):
  1. download-queue.ts reads maxConcurrentDownloads from SQLite (not store.get)
  2. download.handler.ts reads downloadPath from SQLite (not store.get)
  3. store-get/store-set/store-delete/store-clear IPC handlers query/upsert/delete from SQLite tables
  4. SettingsRepository, WallpaperRepository, DownloadRepository all route through SQLite via unchanged IPC
  5. Download history max-50 constraint enforced by SQL (not application code)
**Plans**: 2 plans
- [x] 42-01-PLAN.md — Database helpers (getAppSetting/getDownloadPath/getMaxConcurrentDownloads) + cutover direct store imports in download-queue.ts and download.handler.ts
- [x] 42-02-PLAN.md — Rewrite store.handler.ts with keyToTable() routing to SQLite + remove app-layer max-50 slice from download.repository.ts

### Phase 43: Favorites & Collections Migration
**Goal**: FavoritesRepository redesigned to use targeted SQL operations instead of full-blob read-modify-write
**Depends on**: Phase 42
**Requirements**: REPO-04, REPO-05, VER-04
**Success Criteria** (what must be TRUE):
  1. FavoritesRepository uses INSERT/UPDATE/DELETE per mutation (not full-blob read-modify-write)
  2. Favorite existence check uses SQL index query (not in-memory Set from full blob)
  3. All favorites operations (add, remove, move, check) produce correct results via SQL queries
  4. Multiple collections per wallpaper still supported after migration
**Plans**: 2 plans
Plans:
- [ ] 42-01-PLAN.md — Database helpers (getAppSetting/getDownloadPath/getMaxConcurrentDownloads) + cutover direct store imports in download-queue.ts and download.handler.ts
- [ ] 42-02-PLAN.md — Rewrite store.handler.ts with keyToTable() routing to SQLite + remove app-layer max-50 slice from download.repository.ts

### Phase 44: Migration Script
**Goal**: One-time migration from electron-store to SQLite; idempotent and data-safe
**Depends on**: Phase 43
**Requirements**: DBINFRA-05, DBINFRA-06, DBINFRA-07, VER-02
**Success Criteria** (what must be TRUE):
  1. Migration reads all 4 domains from electron-store and imports into SQLite in a single transaction
  2. Migration creates a backup copy of electron-store file before any SQLite writes
  3. Migration is idempotent — guarded by _migrated_from_store flag, safe to re-run if interrupted
  4. Existing settings, search params, download history, and favorites survive migration without data loss
**Plans**: 2 plans
Plans:
- [ ] 42-01-PLAN.md — Database helpers (getAppSetting/getDownloadPath/getMaxConcurrentDownloads) + cutover direct store imports in download-queue.ts and download.handler.ts
- [ ] 42-02-PLAN.md — Rewrite store.handler.ts with keyToTable() routing to SQLite + remove app-layer max-50 slice from download.repository.ts

### Phase 45: Cleanup & Final Verification
**Goal**: Remove all electron-store code and dependencies; verify build integrity and feature completeness
**Depends on**: Phase 44
**Requirements**: CLN-01, CLN-02, CLN-03, CLN-04, CLN-05, CLN-06, VER-01, VER-03, VER-05
**Success Criteria** (what must be TRUE):
  1. electron-store removed from package.json dependencies
  2. electron/main/store.ts deleted with no remaining consumers
  3. settings.handler.ts and its IPC channels removed (zero callers)
  4. src/utils/store.ts deleted (no remaining consumers)
  5. Legacy electronClient.saveSettings()/loadSettings() removed (if confirmed unused)
  6. All unused store handler IPC channels removed
  7. Application compiles and bundles without electron-store dependency (VER-05)
  8. Full functional verification: all features (settings, download, search, favorites) work (VER-01)
  9. App launches and initializes database within 500ms overhead (VER-03)
**Plans**: 2 plans
Plans:
- [ ] 42-01-PLAN.md — Database helpers (getAppSetting/getDownloadPath/getMaxConcurrentDownloads) + cutover direct store imports in download-queue.ts and download.handler.ts
- [ ] 42-02-PLAN.md — Rewrite store.handler.ts with keyToTable() routing to SQLite + remove app-layer max-50 slice from download.repository.ts

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 33. 下载队列与并发控制 | v4.0 | 3/3 | Complete | 2026-05-01 |
| 34. 错误分类与重试退避 | v4.0 | 3/3 | Complete | 2026-05-01 |
| 35. 重试状态展示与UI集成 | v4.0 | 3/3 | Complete | 2026-05-01 |
| 36. 壁纸列表全选功能 | v4.1 | 1/1 | Complete | 2026-05-01 |
| 37. Composable 提取 | v4.2 | 2/2 | Complete | 2026-05-02 |
| 38. downloadWallpaperFile 分层重构 | v4.3 | 2/2 | Complete | 2026-05-02 |
| 39. 收藏状态小红心逻辑与取消收藏功能 | v4.4 | 2/2 | Complete | 2026-05-02 |
| 40. 在线壁纸页面小红心多收藏夹状态区分 | v4.5 | 3/3 | Complete | 2026-05-02 |
| 41. Database Infrastructure | v5.0 | 2/2 | Complete | 2026-05-03 |
| 42. Main Process + Store Handler Cutover | v5.0 | 2/2 | Complete | 2026-05-03 |
| 43. Favorites & Collections Migration | v5.0 | 0/0 | Not started | - |
| 44. Migration Script | v5.0 | 0/0 | Not started | - |
| 45. Cleanup & Final Verification | v5.0 | 0/0 | Not started | - |

---

## Requirement Traceability

| ID | Phase | Description |
|----|-------|-------------|
| DL-01 | 33 | Follow maxConcurrentDownloads setting | Complete |
| DL-02 | 33 | Auto-queue excess downloads | Complete |
| DL-03 | 33 | Live setting propagation | Complete |
| DL-04 | 33 | Graceful concurrency reduction | Complete |
| DL-05 | 34 | Auto-retry on transient errors | Complete |
| DL-06 | 34 | Permanent errors fail immediately | Complete |
| DL-07 | 34 | Exponential backoff with jitter | Complete |
| DL-08 | 34 | Max 3 retries | Complete |
| DL-09 | 34 | Retry holds queue slot | Complete |
| UI-01 | 35 | Show "retrying (X/3)" | Complete |
| UI-02 | 35 | Show retry countdown | Complete |
| UI-03 | 35 | Show final failure state | Complete |
| HEART-01 | 40 | HeartState type with three string literal variants | Complete |
| HEART-02 | 40 | getHeartState() pure function | Complete |
| HEART-03 | 40 | Three-state heart in WallpaperList with CSS | Complete |
| HEART-04 | 40 | Three-state heart in ImagePreview with fallback | Complete |

### v5.0 Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DBINFRA-01 | 41 | Complete |
| DBINFRA-02 | 41 | Complete |
| DBINFRA-03 | 41 | Complete |
| DBINFRA-04 | 41 | Complete |
| DBINFRA-05 | 44 | Pending |
| DBINFRA-06 | 44 | Pending |
| DBINFRA-07 | 44 | Pending |
| MPDIR-01 | 42 | Complete |
| MPDIR-02 | 42 | Complete |
| STIPC-01 | 42 | Complete |
| STIPC-02 | 42 | Complete |
| STIPC-03 | 42 | Complete |
| STIPC-04 | 42 | Complete |
| REPO-01 | 42 | Complete |
| REPO-02 | 42 | Complete |
| REPO-03 | 42 | Complete |
| REPO-04 | 43 | Pending |
| REPO-05 | 43 | Pending |
| CLN-01 | 45 | Pending |
| CLN-02 | 45 | Pending |
| CLN-03 | 45 | Pending |
| CLN-04 | 45 | Pending |
| CLN-05 | 45 | Pending |
| CLN-06 | 45 | Pending |
| VER-01 | 45 | Pending |
| VER-02 | 44 | Pending |
| VER-03 | 45 | Pending |
| VER-04 | 43 | Pending |
| VER-05 | 45 | Pending |

**Coverage:**
- v5.0 requirements: 29 total
- Mapped to phases: 29/29 ✓
