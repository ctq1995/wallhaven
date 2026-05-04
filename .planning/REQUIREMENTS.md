# Requirements: Wallhaven v7.0 — 代码结构优化

**Defined:** 2026-05-04
**Core Value:** 收藏管理，分类随心 — 将喜欢的壁纸添加到自定义收藏夹，按主题分类管理

## v7.0 Requirements

### Dead Code Removal — Types

- [ ] **DEADTYPE-01**: Developer removes duplicate `src/types/favorite.ts` file (kept `src/types/domain/favorite.ts`)
- [ ] **DEADTYPE-02**: Developer removes empty `src/types/ipc/index.ts` export file
- [ ] **DEADTYPE-03**: Developer removes empty `src/types/api/index.ts` export file

### Dead Code Removal — Functions

- [ ] **DEADFUNC-01**: Developer removes unused `debounce` function from `src/utils/helpers.ts`
- [ ] **DEADFUNC-02**: Developer removes unused `throttle` function from `src/utils/helpers.ts`
- [ ] **DEADFUNC-03**: Developer removes unused `deepClone` function from `src/utils/helpers.ts`
- [ ] **DEADFUNC-04**: Developer removes unused `filterEmptyValues` function from `src/utils/helpers.ts`
- [ ] **DEADFUNC-05**: Developer removes unused `preloadImages` function from `src/utils/helpers.ts`
- [ ] **DEADFUNC-06**: Developer removes unused `cleanupObject` function from `src/utils/helpers.ts`

### Dead Code Removal — Components

- [ ] **DEADCOMP-01**: Developer removes test component `src/components/ElectronTest.vue`
- [ ] **DEADCOMP-02**: Developer removes demo component `src/components/AlertDemo.vue`
- [ ] **DEADCOMP-03**: Developer removes test view `src/views/APITest.vue`
- [ ] **DEADCOMP-04**: Developer removes diagnostic view `src/views/Diagnostic.vue`

### Type Directory Organization

- [ ] **TYPEORG-01**: Developer consolidates type definitions under `src/types/` directory
- [ ] **TYPEORG-02**: Developer ensures all type imports use consistent path aliases (`@/types/...`)

## Out of Scope

| Feature | Reason |
|---------|--------|
| HTTP 客户端合并 | 复杂度较高，风险中等，延后评估 |
| 缓存逻辑提取 | 涉及多个 Service 层重构，复杂度较高 |
| 大文件拆分 | `electron.client.ts` 结构清晰，暂不需要拆分 |
| 功能行为变更 | 项目约束 — 保持所有现有功能不变 |
| IPC 通道变更 | 需保持向后兼容 |
| Store 结构变更 | 响应式风险 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEADTYPE-01 | Phase 51 | Pending |
| DEADTYPE-02 | Phase 51 | Pending |
| DEADTYPE-03 | Phase 51 | Pending |
| DEADFUNC-01 | Phase 51 | Pending |
| DEADFUNC-02 | Phase 51 | Pending |
| DEADFUNC-03 | Phase 51 | Pending |
| DEADFUNC-04 | Phase 51 | Pending |
| DEADFUNC-05 | Phase 51 | Pending |
| DEADFUNC-06 | Phase 51 | Pending |
| DEADCOMP-01 | Phase 52 | Pending |
| DEADCOMP-02 | Phase 52 | Pending |
| DEADCOMP-03 | Phase 52 | Pending |
| DEADCOMP-04 | Phase 52 | Pending |
| TYPEORG-01 | Phase 53 | Pending |
| TYPEORG-02 | Phase 53 | Pending |

**Coverage:**
- v7.0 requirements: 15 total
- Mapped to phases: 15/15 ✓

---

## Phase Mapping Summary

### Phase 51: Types & Helpers Cleanup (9 requirements)
- DEADTYPE-01, DEADTYPE-02, DEADTYPE-03 — Remove duplicate/empty type files
- DEADFUNC-01 to DEADFUNC-06 — Remove unused helper functions

### Phase 52: Test Components Removal (4 requirements)
- DEADCOMP-01 to DEADCOMP-04 — Remove test/demo components

### Phase 53: Type Directory Organization (2 requirements)
- TYPEORG-01, TYPEORG-02 — Consolidate type definitions

---

*Requirements defined: 2026-05-04*
