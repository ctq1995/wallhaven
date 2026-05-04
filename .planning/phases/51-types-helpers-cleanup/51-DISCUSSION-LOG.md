# Phase 51: Types & Helpers Cleanup — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 51-types-helpers-cleanup
**Areas discussed:** 重复类型文件处理, 空导出文件处理, 未使用函数处理, Phase 52 状态确认, 后续步骤

---

## 重复类型文件处理

| Option | Description | Selected |
|--------|-------------|----------|
| 更新导入后删除 | env.d.ts 改为从 @/types/domain/favorite 导入，然后删除 src/types/favorite.ts | ✓ |
| 保留作为重导出 | 保留 src/types/favorite.ts 作为重导出入口，内容改为 export * from './domain/favorite' | |

**User's choice:** 更新导入后删除
**Notes:** 用户确认更新 env.d.ts 的导入路径后删除重复的类型文件

---

## 空导出文件处理

| Option | Description | Selected |
|--------|-------------|----------|
| 直接删除（推荐） | 删除 src/types/api/index.ts 和 src/types/ipc/index.ts，这两个文件没有实际内容 | ✓ |
| 保留占位符 | 保留空导出文件作为未来类型的占位符 | |

**User's choice:** 直接删除（推荐）
**Notes:** 两个空文件没有实际用途，直接删除

---

## 未使用函数处理

| Option | Description | Selected |
|--------|-------------|----------|
| 全部删除（推荐） | 删除所有 6 个未使用函数：debounce, throttle, deepClone, filterEmptyValues, preloadImages, cleanupObject | |
| 保留防抖/节流 | 保留 debounce 和 throttle 作为通用工具，删除其他 4 个 | |
| 全部保留 | 保留所有函数，仅做类型文件的清理 | ✓ |

**User's choice:** 全部保留
**Notes:** 用户决定保留所有工具函数，仅清理类型文件

---

## Phase 52 状态确认

| Option | Description | Selected |
|--------|-------------|----------|
| 确认已完成（推荐） | 标记 DEADCOMP-01~04 为完成，无需任何操作 | ✓ |
| 保留记录 | 保留这些 requirements 作为历史记录，不做状态更新 | |

**User's choice:** 确认已完成（推荐）
**Notes:** 测试组件（ElectronTest.vue, AlertDemo.vue, APITest.vue, Diagnostic.vue）已在之前的阶段被删除，Phase 52 工作已完成

---

## 后续步骤

| Option | Description | Selected |
|--------|-------------|----------|
| 合并并继续（推荐） | 合并 Phase 52 到 Phase 51，一起完成；然后执行 Phase 53 类型目录整理 | ✓ |
| 分步执行 | 单独完成 Phase 51，Phase 52 作为空阶段跳过 | |

**User's choice:** 合并并继续（推荐）
**Notes:** Phase 51 和 Phase 52 合并执行，Phase 52 标记为完成

---

## Claude's Discretion

- 删除文件后运行 TypeScript 编译检查确保无错误
- 删除文件后运行 ESLint 检查确保无警告
- 检查是否有其他文件通过相对路径引用被删除的文件

## Deferred Ideas

None — discussion stayed within phase scope.
