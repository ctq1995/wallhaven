# Phase 53: Type Directory Organization — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 53-type-directory-organization
**Areas discussed:** shared/types 整合, env.d.ts 类型重复, 主入口文件分类

---

## 灰色区域选择

| Option | Description | Selected |
|--------|-------------|----------|
| shared/types 整合 | IPC 类型文件处理 | ✓ |
| env.d.ts 类型重复 | 全局声明与模块类型统一 | ✓ |
| 主入口文件分类 | index.ts 类型分类 | ✓ |
| 无需更多讨论 | 当前结构已清晰 | |

**User's choice:** 选择前三个区域进行讨论
**Notes:** 用户确认类型目录在 Phase 46 已基本整理完毕，但仍有上述三个问题需要解决

---

## Area 1: shared/types 整合

| Option | Description | Selected |
|--------|-------------|----------|
| 合并到 src/types/（推荐） | 将 ipc.ts 移动到 src/types/，更新所有导入路径 | ✓ |
| 保持独立 | 保留 src/shared/types/ipc.ts，分离避免混淆 | |
| 两者都保留 | 类型定义移动，保留重导出入口 | |

**User's choice:** 合并到 src/types/（推荐）
**Notes:** 统一类型定义位置，主进程使用相对路径，渲染进程使用 @/ 别名

---

## Area 2: env.d.ts 类型重复

| Option | Description | Selected |
|--------|-------------|----------|
| 统一到 src/types/（推荐） | 删除重复定义，统一从 @/types/ 导入 | ✓ |
| 保持 env.d.ts 独立 | 保留现有结构，全局声明与模块类型不冲突 | |
| 部分统一 | 仅移除明显重复的类型，保留全局声明 | |

**User's choice:** 统一到 src/types/（推荐）
**Notes:** 保持单一来源，env.d.ts 保留 ElectronAPI 接口声明但导入统一类型

---

## Area 3: 主入口文件分类

| Option | Description | Selected |
|--------|-------------|----------|
| 创建 api.ts 和 components.ts | 在 src/types/ 根目录创建新文件 | |
| 放入 domain/ 子目录 | 分类到 domain/api.ts、domain/components.ts | ✓ |
| 保持现状（推荐） | 当前结构已清晰，无需进一步分类 | |

**User's choice:** 放入 domain/ 子目录
**Notes:** 保持领域类型统一在 domain/ 目录下

---

## Claude's Discretion

- 文件移动后的具体导入路径调整
- 是否需要添加 `src/types/ipc/index.ts` 重导出文件
- `WallpaperListProps` 中动态导入 `import('./domain').PageData` 的处理方式

## Deferred Ideas

None — discussion stayed within phase scope.
