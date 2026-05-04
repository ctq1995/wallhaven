---
phase: 51
plan: 01
status: complete
completed: 2026-05-04
requirements:
  - DEADTYPE-01
  - DEADTYPE-02
  - DEADTYPE-03
---

# Phase 51 Plan 01: Types & Helpers Cleanup

## Summary

成功清理项目中的死代码，包括重复类型定义和空导出文件。

### Completed Tasks

| Task | Description | Status |
|------|-------------|--------|
| 1 | 更新 env.d.ts 导入路径 | ✅ |
| 2 | 删除 src/types/favorite.ts | ✅ |
| 3 | 删除 src/types/api/ 目录 | ✅ |
| 4 | 删除 src/types/ipc/ 目录 | ✅ |
| 5 | 完整验证 | ✅ |

### Changes Made

1. **env.d.ts** — 导入路径从 `@/types/favorite` 更新为 `@/types/domain/favorite`
2. **src/types/favorite.ts** — 已删除（重复类型，内容已在 `src/types/domain/favorite.ts`）
3. **src/types/api/index.ts** 和 `src/types/api/` 目录 — 已删除（空导出）
4. **src/types/ipc/index.ts` 和 `src/types/ipc/` 目录 — 已删除（空导出）

### Verification Results

- **TypeScript**: `npm run type-check` 通过 ✅
- **ESLint**: 存在预存在的警告/错误（与本次更改无关）⚠️
- **应用状态**: 类型导入无破坏性变更 ✅

### Notes

- ESLint 报告的 4 个错误是预存在的问题，位于 `electron.client.ts` 和 `download.repository.ts`，与本次清理无关
- 6 个未使用工具函数（debounce, throttle 等）保留，按用户决定（DEADFUNC-01~06 标记为 N/A）

### Commit

```
refactor(51): remove duplicate types and empty export directories
```
