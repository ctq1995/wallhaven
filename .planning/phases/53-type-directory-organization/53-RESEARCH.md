# Phase 53: Type Directory Organization — Research

**Researched:** 2026-05-04
**Status:** Ready for Planning

---

## 1. Domain Analysis

### What This Phase Is Building

整理类型定义目录结构，统一导入路径。这是一个**纯重构任务**，目标是：

1. **整合 IPC 类型定义**：将 `src/shared/types/ipc.ts` 移动到 `src/types/ipc.ts`
2. **消除 `env.d.ts` 重复类型**：移除与 `ipc.ts` 重复的类型定义
3. **分类 `src/types/index.ts` 中的类型**：将类型按领域分类到 `domain/` 子目录
4. **统一导入路径**：确保所有类型导入使用 `@/types/...` 路径别名

### Existing Patterns

#### 当前类型目录结构
```
src/types/
├── index.ts              # 主入口 + 混合类型定义
└── domain/
    ├── index.ts          # 领域类型统一导出
    ├── wallpaper.ts      # 壁纸类型 (WallpaperItem, PageData 等)
    ├── favorite.ts       # 收藏类型 (Collection, FavoriteItem)
    ├── download.ts       # 下载类型 (DownloadItem, DownloadState)
    └── settings.ts       # 设置类型 (AppSettings, WallpaperFit)

src/shared/types/
└── ipc.ts                # IPC 类型 + 通道常量

env.d.ts                  # 全局类型声明 + 重复的 IPC 类型
```

#### 当前导入路径模式

**渲染进程（正确模式）：**
```typescript
// 从 @/types 导入领域类型
import type { WallpaperItem, Collection } from '@/types'

// 从 @/shared/types/ipc 导入 IPC 类型（需要统一）
import type { IpcResponse } from '@/shared/types/ipc'
```

**主进程（相对路径）：**
```typescript
// electron/main/ipc/handlers/download.handler.ts
import { IPC_CHANNELS } from '../../../../src/shared/types/ipc'

// electron/preload/types.ts
export { IPC_CHANNELS } from '../../src/shared/types/ipc'
```

---

## 2. Technical Context

### Files Requiring Modification

#### A. 需要移动的文件

| 文件 | 操作 | 目标位置 |
|------|------|----------|
| `src/shared/types/ipc.ts` | 移动 | `src/types/ipc.ts` |

#### B. 需要更新的文件（导入路径更新）

**渲染进程文件（使用 `@/shared/types/ipc`）：**
- `src/clients/api.client.ts`
- `src/clients/electron.client.ts`
- `src/services/window.service.ts`
- `src/services/favorites.service.ts`
- `src/services/wallpaper.service.ts`
- `src/services/collections.service.ts`
- `src/services/download.service.ts`
- `src/services/settings.service.ts`
- `src/repositories/wallpaper.repository.ts`
- `src/repositories/favorites.repository.ts`
- `src/repositories/download.repository.ts`
- `src/repositories/settings.repository.ts`
- `src/repositories/window.repository.ts`
- `src/composables/local/useLocalFiles.ts`
- `src/composables/settings/useSettings.ts`

**主进程文件（使用相对路径）：**
- `electron/main/ipc/handlers/download.handler.ts`
- `electron/main/ipc/handlers/cache.handler.ts`
- `electron/preload/types.ts`

#### C. 需要重构的文件

| 文件 | 操作 |
|------|------|
| `env.d.ts` | 移除重复类型，从 `@/types/ipc` 导入 |
| `src/types/index.ts` | 重构为重导出入口，分类类型到 domain 子目录 |

#### D. 需要新建的文件

| 文件 | 内容 |
|------|------|
| `src/types/domain/api.ts` | 搜索参数类型 (GetParams, CustomParams) |
| `src/types/domain/components.ts` | 组件 Props 类型 (SearchBarProps, WallpaperListProps) |
| `src/types/domain/ui.ts` | UI 辅助类型 (ResolutionLine, RatioLine, ColorLine, WallpaperActionInfo) |

#### E. tsconfig 配置

| 文件 | 影响 |
|------|------|
| `tsconfig.app.json` | 已有 `@/*` 映射，无需修改 |
| `tsconfig.electron.json` | 需要更新 `include` 路径（移除 `src/shared/types/ipc.ts`） |

### Key Dependencies

1. **主进程依赖 IPC 类型**：`electron/main/ipc/handlers/*.ts` 使用相对路径导入
2. **Preload 依赖 IPC 类型**：`electron/preload/types.ts` 重导出 IPC 常量和类型
3. **env.d.ts 全局声明**：扩展 `Window` 接口，需要保留但移除重复定义

### Constraints

1. **不修改功能行为**：纯重构，所有类型定义语义不变
2. **保持 `env.d.ts` 全局声明模式**：保留 `Window` 接口扩展
3. **主进程使用相对路径**：主进程无法使用 `@/` 别名

---

## 3. Implementation Considerations

### Pitfalls & Edge Cases

#### P-01: `env.d.ts` 中动态导入的语义

**问题：** `src/types/index.ts` 中 `WallpaperListProps` 使用动态导入：
```typescript
export interface WallpaperListProps {
  pageData: import('./domain').PageData  // 动态导入
  loading: boolean
  error: boolean
}
```

**解决方案：** 将 `WallpaperListProps` 移动到 `src/types/domain/components.ts`，使用静态导入：
```typescript
import type { PageData } from './wallpaper'

export interface WallpaperListProps {
  pageData: PageData
  loading: boolean
  error: boolean
}
```

#### P-02: `env.d.ts` 类型导入限制

**问题：** `env.d.ts` 是全局声明文件，直接使用 `import type` 会改变其模块性质。

**当前模式：**
```typescript
/// <reference types="vite/client" />

import type { Collection, FavoriteItem } from '@/types/domain/favorite'
import type { WallpaperItem } from '@/types/index'
```

**解决方案：** 保持当前模式（已正确工作）。`env.d.ts` 已使用 `import type` 导入，末尾 `export {}` 保持其为模块。

#### P-03: 主进程路径调整

**问题：** 主进程文件无法使用 `@/` 别名。

**当前路径：**
```typescript
// electron/main/ipc/handlers/download.handler.ts
import { IPC_CHANNELS } from '../../../../src/shared/types/ipc'
```

**调整后路径：**
```typescript
// 移动后
import { IPC_CHANNELS } from '../../../../src/types/ipc'
```

#### P-04: tsconfig.electron.json 包含路径

**当前配置：**
```json
{
  "include": ["electron/**/*", "src/shared/types/ipc.ts"]
}
```

**需要更新为：**
```json
{
  "include": ["electron/**/*", "src/types/ipc.ts"]
}
```

#### P-05: `src/types/index.ts` 中的混合内容

**当前内容：**
1. 重导出 `domain/` 目录
2. 定义 `CustomParams`, `GetParams` (API 类型)
3. 定义 `ResolutionLine`, `RatioLine`, `ColorLine` (UI 类型)
4. 定义 `SearchBarProps`, `WallpaperListProps` (组件 Props)
5. 定义 `WallpaperActionInfo` (操作信息)

**重构后：**
```typescript
// src/types/index.ts
export * from './domain'
export * from './ipc'
```

类型分类到：
- `src/types/domain/api.ts` — GetParams, CustomParams
- `src/types/domain/ui.ts` — ResolutionLine, RatioLine, ColorLine, WallpaperActionInfo
- `src/types/domain/components.ts` — SearchBarProps, WallpaperListProps

#### P-06: `FavoritesErrorCodes` 常量导出

**当前情况：** `src/types/domain/favorite.ts` 导出常量：
```typescript
export const FavoritesErrorCodes = {
  COLLECTION_NOT_FOUND: 'COLLECTION_NOT_FOUND',
  // ...
} as const
```

**注意：** 这是值导出（非类型），需要确保 `export *` 能正确重导出。

### Suggested Approach

#### 执行顺序

1. **步骤 A：移动 IPC 类型文件**
   - 复制 `src/shared/types/ipc.ts` → `src/types/ipc.ts`
   - 更新文件顶部注释中的导入路径说明

2. **步骤 B：更新渲染进程导入**
   - 批量替换 `@/shared/types/ipc` → `@/types/ipc`

3. **步骤 C：更新主进程导入**
   - 更新 `electron/main/ipc/handlers/*.ts` 的相对路径
   - 更新 `electron/preload/types.ts` 的相对路径

4. **步骤 D：更新 tsconfig.electron.json**
   - 修改 `include` 路径

5. **步骤 E：删除旧文件**
   - 删除 `src/shared/types/ipc.ts`
   - 删除 `src/shared/types/` 目录（如果为空）

6. **步骤 F：重构 env.d.ts**
   - 移除重复类型定义
   - 从 `@/types/ipc` 导入 `DownloadProgressData`, `PendingDownload`, `ResumeDownloadParams`, `IpcResponse`

7. **步骤 G：分类 index.ts 类型**
   - 创建 `src/types/domain/api.ts`
   - 创建 `src/types/domain/ui.ts`
   - 创建 `src/types/domain/components.ts`
   - 更新 `src/types/domain/index.ts` 重导出
   - 更新 `src/types/index.ts` 为纯重导出入口

8. **步骤 H：验证构建**
   - 运行 `pnpm typecheck` 确保无类型错误

---

## 4. Validation Architecture

### Build Verification

```bash
# TypeScript 类型检查
pnpm typecheck

# 构建验证
pnpm build
```

### Import Path Verification

验证以下导入路径模式正确：

```typescript
// 渲染进程 — 领域类型
import type { WallpaperItem, Collection } from '@/types'

// 渲染进程 — IPC 类型
import type { IpcResponse, DownloadProgressData } from '@/types/ipc'

// 渲染进程 — IPC 常量
import { IPC_CHANNELS } from '@/types/ipc'

// 主进程 — IPC 类型和常量
import { IPC_CHANNELS, type PendingDownload } from '../../../../src/types/ipc'
```

### File Structure Verification

最终目录结构应为：

```
src/types/
├── index.ts              # 重导出入口
├── ipc.ts                # IPC 类型定义
└── domain/
    ├── index.ts          # 领域类型统一导出
    ├── api.ts            # 搜索参数类型 (新建)
    ├── components.ts     # 组件 Props 类型 (新建)
    ├── ui.ts             # UI 辅助类型 (新建)
    ├── wallpaper.ts      # 壁纸类型 (已存在)
    ├── favorite.ts       # 收藏类型 (已存在)
    ├── download.ts       # 下载类型 (已存在)
    └── settings.ts       # 设置类型 (已存在)
```

### Test Cases

| 测试 | 预期结果 |
|------|----------|
| `pnpm typecheck` | 通过，无错误 |
| `pnpm build` | 成功构建 |
| `env.d.ts` 无重复类型 | `DownloadProgressData`, `PendingDownload` 等从 `@/types/ipc` 导入 |
| `src/types/index.ts` 无类型定义 | 仅包含 `export *` 语句 |
| 主进程构建 | `electron/` 目录编译成功 |

### Regression Risks

| 风险 | 缓解措施 |
|------|----------|
| 遗漏导入路径更新 | 使用 Grep 全局搜索 `@/shared/types/ipc` 和 `shared/types/ipc` |
| 循环依赖 | 确保新文件不引入循环引用 |
| 类型语义变化 | 保持所有类型定义完全一致，仅移动位置 |

---

## 5. Summary

### Key Findings

1. **IPC 类型位置**：当前在 `src/shared/types/ipc.ts`，需移动到 `src/types/ipc.ts`
2. **导入路径数量**：
   - 渲染进程：15 个文件使用 `@/shared/types/ipc`
   - 主进程：4 个文件使用相对路径
3. **env.d.ts 重复类型**：4 个重复类型定义需移除
4. **index.ts 分类**：5 类类型需分类到 `domain/` 子目录
5. **tsconfig 更新**：仅需更新 `tsconfig.electron.json`

### Complexity Assessment

- **风险等级**：低（纯重构，无功能变更）
- **工作量**：中等（约 20 个文件需更新导入路径）
- **依赖关系**：需按顺序执行，避免中间状态类型错误

### Prerequisites for Planning

1. ✅ 确认所有需要更新的文件列表
2. ✅ 确认新建文件的内容来源
3. ✅ 确认主进程相对路径调整方案
4. ✅ 确认 `env.d.ts` 重构方案

---

## RESEARCH COMPLETE

**Next Step:** 进入规划阶段，创建详细执行计划
