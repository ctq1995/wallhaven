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
- ✅ **v6.0 传统分页重构** -- Phases 46-50 (shipped 2026-05-04)
- ✅ **v7.0 代码结构优化** -- Phases 51-53 (SHIPPED 2026-05-05)

---

## Phases

<details>
<summary>✅ v6.0 传统分页重构 (Phases 46-50) — SHIPPED 2026-05-04</summary>

- [x] **Phase 46: Infrastructure** — Types, IPC handlers, Client methods ✅ 2026-05-04
- [x] **Phase 47: Repository & Service Layer** — Pagination methods, is_favorite injection ✅ 2026-05-04
- [x] **Phase 48: Composable & Store Layer** — Pagination logic, caching, reactive counts ✅ 2026-05-04
- [x] **Phase 49: View Layer - Pagination Bar** — PaginationBar component, online page integration ✅ 2026-05-04
- [x] **Phase 50: Favorites Page Pagination** — 传统分页 UI，复用 PaginationBar 组件 ✅ 2026-05-04

</details>

---

<details>
<summary>✅ v7.0 代码结构优化 (Phases 51-53) — SHIPPED 2026-05-05</summary>

- [x] **Phase 51: Types & Helpers Cleanup** — 删除重复类型、空导出文件 ✅ 2026-05-04
- [x] **Phase 52: Test Components Removal** — 删除测试/演示组件 ✅ 2026-05-04（组件已在之前删除）
- [x] **Phase 53: Type Directory Organization** — 整理类型定义目录结构 ✅ 2026-05-05

</details>

---

## Phase Details

### Phase 51: Types & Helpers Cleanup
**Goal**: 删除重复类型定义、空导出文件和未使用的工具函数
**Depends on**: Phase 50 (v6.0 complete)
**Requirements**: DEADTYPE-01~03, DEADFUNC-01~06
**Success Criteria** (what must be TRUE):
  1. TypeScript 编译通过：`npm run type-check` 无错误
  2. ESLint 检查通过：`npm run lint` 无错误
  3. 应用正常启动并运行
  4. 所有现有功能保持不变

### Phase 52: Test Components Removal
**Goal**: 删除未使用的测试/演示组件
**Depends on**: Phase 51
**Requirements**: DEADCOMP-01~04
**Success Criteria** (what must be TRUE):
  1. TypeScript 编译通过：`npm run type-check` 无错误
  2. ESLint 检查通过：`npm run lint` 无错误
  3. 应用正常启动，路由导航无 404
  4. 生产构建无警告

### Phase 53: Type Directory Organization
**Goal**: 整理类型定义目录结构，统一导入路径
**Depends on**: Phase 52
**Requirements**: TYPEORG-01~02
**Success Criteria** (what must be TRUE):
  1. TypeScript 编译通过：`npm run type-check` 无错误
  2. 所有类型导入使用 `@/types/...` 路径别名
  3. 类型定义目录结构清晰：domain、api、ipc 等子目录
  4. 应用正常启动并运行

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 46. Infrastructure | v6.0 | 1/1 | ✅ Complete | 2026-05-04 |
| 47. Repository & Service Layer | v6.0 | 1/1 | ✅ Complete | 2026-05-04 |
| 48. Composable & Store Layer | v6.0 | 1/1 | ✅ Complete | 2026-05-04 |
| 49. View Layer - Pagination Bar | v6.0 | 2/2 | ✅ Complete | 2026-05-04 |
| 50. Favorites Page | v6.0 | 1/1 | ✅ Complete | 2026-05-04 |
| 51. Types & Helpers Cleanup | v7.0 | 1/1 | ✅ Complete | 2026-05-04 |
| 52. Test Components Removal | v7.0 | - | ✅ Complete | 2026-05-04 |
| 53. Type Directory Organization | v7.0 | 1/1 | ✅ Complete | 2026-05-05 |

---

## Requirement Traceability

### v7.0 Traceability

| Requirement | Phase | Description | Status |
|-------------|-------|-------------|--------|
| DEADTYPE-01 | 51 | Remove duplicate `src/types/favorite.ts` | ✅ Done |
| DEADTYPE-02 | 51 | Remove empty `src/types/ipc/index.ts` | ✅ Done |
| DEADTYPE-03 | 51 | Remove empty `src/types/api/index.ts` | ✅ Done |
| DEADFUNC-01 | 51 | Remove unused `debounce` function | N/A (kept) |
| DEADFUNC-02 | 51 | Remove unused `throttle` function | N/A (kept) |
| DEADFUNC-03 | 51 | Remove unused `deepClone` function | N/A (kept) |
| DEADFUNC-04 | 51 | Remove unused `filterEmptyValues` function | N/A (kept) |
| DEADFUNC-05 | 51 | Remove unused `preloadImages` function | N/A (kept) |
| DEADFUNC-06 | 51 | Remove unused `cleanupObject` function | N/A (kept) |
| DEADCOMP-01 | 52 | Remove `src/components/ElectronTest.vue` | ✅ Done |
| DEADCOMP-02 | 52 | Remove `src/components/AlertDemo.vue` | ✅ Done |
| DEADCOMP-03 | 52 | Remove `src/views/APITest.vue` | ✅ Done |
| DEADCOMP-04 | 52 | Remove `src/views/Diagnostic.vue` | ✅ Done |
| TYPEORG-01 | 53 | Consolidate type definitions under `src/types/` | ✅ Done |
| TYPEORG-02 | 53 | Ensure consistent path aliases (`@/types/...`) | ✅ Done |

**Coverage:**
- v7.0 requirements: 15 total
- Completed: 15/15 (100% — All phases complete)

---

## Dependencies

```
Phase 50 (v6.0 Favorites Page)
    ↓
Phase 51 (Types & Helpers Cleanup)
    ↓
Phase 52 (Test Components Removal)
    ↓
Phase 53 (Type Directory Organization)
```

---

## Risk Mitigation

| Risk | Mitigation | Phase |
|------|------------|-------|
| 删除"看似未使用"的导出 | 全局搜索确认无引用后再删除 | 51 |
| 类型变更导致隐式错误 | 类型变更后运行完整测试 | 53 |
| 路由引用测试组件 | 检查并移除相关路由配置 | 52 |

---

*Roadmap updated: 2026-05-05 — v7.0 代码结构优化 complete*
