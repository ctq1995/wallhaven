# Phase 53: Type Directory Organization — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

整理类型定义目录结构，统一导入路径。这是一个纯重构任务，确保类型定义有清晰的目录结构和一致的导入方式，不改变任何功能行为。

**范围内：**
- 将 `src/shared/types/ipc.ts` 合并到 `src/types/` 目录
- 统一 `env.d.ts` 中的重复类型定义到 `src/types/`
- 将 `src/types/index.ts` 中的类型按领域分类到 `domain/` 子目录
- 更新所有导入路径使用 `@/types/...` 别名
- 确保所有类型导入使用 `import type { }` 语法

**范围外：**
- 不修改类型定义的语义或结构
- 不添加新的类型定义
- 不修改任何业务逻辑代码
- 不修改 `env.d.ts` 中的全局 `Window` 接口声明模式

</domain>

<decisions>
## Implementation Decisions

### A — shared/types 整合

**D-01:** 将 `src/shared/types/ipc.ts` 移动到 `src/types/ipc.ts`

**D-02:** 更新所有导入路径：
- 渲染进程：使用 `import { ... } from '@/types/ipc'`
- 主进程：使用相对路径 `import { ... } from '../../src/types/ipc'`

**D-03:** 删除 `src/shared/types/` 目录（移动后为空）

### B — env.d.ts 类型重复

**D-04:** 统一 `env.d.ts` 中的重复类型定义到 `src/types/`：
- `DownloadProgressData` → 使用 `src/types/ipc.ts` 中的定义
- `PendingDownload` → 使用 `src/types/ipc.ts` 中的定义
- `ResumeDownloadParams` → 使用 `src/types/ipc.ts` 中的定义
- `IpcResponse` → 使用 `src/types/ipc.ts` 中的定义

**D-05:** `env.d.ts` 保留 `ElectronAPI` 接口声明，但从 `@/types/ipc` 和 `@/types/domain/favorite` 导入类型

**D-06:** 保持 `env.d.ts` 作为全局类型声明文件（扩展 `Window` 接口）

### C — 主入口文件分类

**D-07:** 将 `src/types/index.ts` 中的类型分类到 `domain/` 子目录：
- 创建 `src/types/domain/api.ts` — 搜索参数类型（GetParams, CustomParams）
- 创建 `src/types/domain/components.ts` — 组件 Props 类型（SearchBarProps, WallpaperListProps）
- 创建 `src/types/domain/ui.ts` — UI 辅助类型（ResolutionLine, RatioLine, ColorLine, WallpaperActionInfo）

**D-08:** `src/types/index.ts` 保持为重导出入口：
```typescript
export * from './domain'
export * from './ipc'
```

### D — 导入路径规范

**D-09:** 所有类型导入统一使用 `@/types/...` 路径别名

**D-10:** 类型导入使用 `import type { }` 语法（已约定，验证一致性）

**D-11:** 更新 `tsconfig.json` 路径映射如有必要

### Claude's Discretion

- 文件移动后的具体导入路径调整
- 是否需要添加 `src/types/ipc/index.ts` 重导出文件
- `WallpaperListProps` 中动态导入 `import('./domain').PageData` 的处理方式

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 现有类型定义文件（需要修改）
- `src/types/index.ts` — 主入口，需要重构为重导出入口
- `src/types/domain/index.ts` — 领域类型导出，需要添加新模块
- `src/shared/types/ipc.ts` — IPC 类型定义，需要移动到 `src/types/ipc.ts`
- `env.d.ts` — Electron API 全局声明，需要移除重复类型

### 新建类型文件
- `src/types/domain/api.ts` — 搜索参数类型
- `src/types/domain/components.ts` — 组件 Props 类型
- `src/types/domain/ui.ts` — UI 辅助类型
- `src/types/ipc.ts` — IPC 类型定义（从 shared/types/ipc.ts 移动）

### 项目约束
- `.planning/PROJECT.md` — 硬约束：不修改用户操作逻辑、界面布局、UI 显示
- `.planning/codebase/CONVENTIONS.md` — 类型定义约定：interface 优于 type，`import type` 语法

### 前序阶段参考
- `.planning/milestones/v6.0-phases/46-infrastructure/46-CONTEXT.md` — Phase 46 类型迁移上下文

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types/domain/*.ts` — 已存在的领域类型文件，结构清晰
- `tsconfig.json` — 已配置 `@/*` 路径映射

### Established Patterns
- 类型定义使用 `<script setup lang="ts">` 语法
- 领域类型放在 `src/types/domain/` 目录
- 使用 `export * from './module'` 统一导出
- 类型导入使用 `import type { }` 语法

### Integration Points
- 主进程 `electron/main/ipc/handlers.ts` — 导入 `src/shared/types/ipc.ts`
- 渲染进程各组件 — 导入 `@/types/...`
- `env.d.ts` — 导入 `@/types/domain/favorite` 和 `@/types/index`

### 需要更新的导入路径
- `electron/main/ipc/handlers.ts` → 相对路径导入 `src/types/ipc.ts`
- `electron/main/ipc/*.ts` → 相对路径导入 `src/types/ipc.ts`
- `src/**/*.ts` 和 `src/**/*.vue` → 验证使用 `@/types/...`

</code_context>

<specifics>
## Specific Ideas

- 最终目录结构：
  ```
  src/types/
  ├── index.ts          # 重导出入口
  ├── ipc.ts            # IPC 类型定义（从 shared 移动）
  └── domain/
      ├── index.ts      # 领域类型统一导出
      ├── wallpaper.ts  # 壁纸相关类型
      ├── favorite.ts   # 收藏相关类型
      ├── download.ts   # 下载相关类型
      ├── settings.ts   # 设置相关类型
      ├── api.ts        # 搜索参数类型（新建）
      ├── components.ts # 组件 Props 类型（新建）
      └── ui.ts         # UI 辅助类型（新建）
  ```

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 53-type-directory-organization*
*Context gathered: 2026-05-04*
