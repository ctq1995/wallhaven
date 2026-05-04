# Phase 51: Types & Helpers Cleanup — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning (merged with Phase 52)

<domain>
## Phase Boundary

清理项目中的死代码，包括重复类型定义、空导出文件。由于 Phase 52 的测试组件已在之前的阶段被删除，Phase 51 和 Phase 52 合并执行。

**范围内：**
- 删除重复类型文件 `src/types/favorite.ts`（更新 env.d.ts 导入路径）
- 删除空导出文件 `src/types/api/index.ts`
- 删除空导出文件 `src/types/ipc/index.ts`
- 标记 Phase 52 的 DEADCOMP-01~04 为已完成（测试组件已不存在）

**范围外：**
- 不删除未使用的工具函数（debounce, throttle, deepClone, filterEmptyValues, preloadImages, cleanupObject）— 用户决定保留
- 不修改类型目录结构（Phase 53 任务）
- 不修改类型导入路径别名（Phase 53 任务）

**合并说明：**
Phase 52 (Test Components Removal) 的核心工作已完成：
- `src/components/ElectronTest.vue` — 已删除
- `src/components/AlertDemo.vue` — 已删除
- `src/views/APITest.vue` — 已删除
- `src/views/Diagnostic.vue` — 已删除
- 路由配置中无相关引用

因此 Phase 51 和 Phase 52 合并执行，Phase 52 标记为完成。

</domain>

<decisions>
## Implementation Decisions

### A — 重复类型文件处理

**D-01:** 删除 `src/types/favorite.ts`，更新 `env.d.ts` 导入路径

**D-02:** `env.d.ts` 的导入从 `@/types/favorite` 改为 `@/types/domain/favorite`

**D-03:** 理由：`src/types/domain/favorite.ts` 包含完整的 Collection, FavoriteItem, PaginationParams 等类型定义，`src/types/favorite.ts` 是旧版本

### B — 空导出文件处理

**D-04:** 删除 `src/types/api/index.ts` — 只有 `export {}`，无实际内容

**D-05:** 删除 `src/types/ipc/index.ts` — 只有 `export {}`，无实际内容

**D-06:** 删除后检查是否有其他文件引用这些路径

### C — 未使用函数处理

**D-07:** 保留所有 6 个未使用函数：debounce, throttle, deepClone, filterEmptyValues, preloadImages, cleanupObject

**D-08:** 理由：这些是通用工具函数，未来可能使用；删除风险大于收益

### D — Phase 52 状态

**D-09:** 标记 DEADCOMP-01~04 为已完成 — 测试组件已不存在

**D-10:** Phase 52 标记为完成，无需执行任何操作

### Claude's Discretion

- 删除文件后运行 TypeScript 编译检查确保无错误
- 删除文件后运行 ESLint 检查确保无警告
- 检查是否有其他文件通过相对路径引用被删除的文件

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 需要修改的文件
- `env.d.ts` — 需要更新导入路径，从 `@/types/favorite` 改为 `@/types/domain/favorite`
- `src/types/favorite.ts` — 待删除的重复类型文件
- `src/types/api/index.ts` — 待删除的空导出文件
- `src/types/ipc/index.ts` — 待删除的空导出文件

### 参考文件
- `src/types/domain/favorite.ts` — 正确的类型定义位置，包含 Collection, FavoriteItem 等
- `src/utils/helpers.ts` — 工具函数定义位置（保留，不修改）

### 项目约束
- `.planning/PROJECT.md` — 硬约束：不修改用户操作逻辑、界面布局、UI 显示
- `.planning/ROADMAP.md` — Phase 51 和 Phase 52 需求定义

</canonical_refs>

<code_context>
## Existing Code Insights

### 当前类型导入结构
```
src/types/
├── index.ts          # 主入口，重导出 domain/*
├── favorite.ts       # [待删除] 旧版收藏类型
├── api/
│   └── index.ts      # [待删除] 空导出
├── ipc/
│   └── index.ts      # [待删除] 空导出
└── domain/
    ├── index.ts      # 领域类型入口
    ├── favorite.ts   # 正确的收藏类型位置
    ├── wallpaper.ts  # 壁纸类型
    ├── download.ts   # 下载类型
    └── settings.ts   # 设置类型
```

### env.d.ts 当前导入
```typescript
import type { Collection, FavoriteItem } from '@/types/favorite'
```

需要改为：
```typescript
import type { Collection, FavoriteItem } from '@/types/domain/favorite'
```

### 验证步骤
1. TypeScript 编译：`npm run type-check`
2. ESLint 检查：`npm run lint`
3. 应用启动测试

</code_context>

<specifics>
## Specific Ideas

- 删除文件前先确认无其他引用
- 删除后立即运行编译检查，确保无破坏性变更
- 保留 helpers.ts 中的通用工具函数，不做修改

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 51-types-helpers-cleanup*
*Context gathered: 2026-05-04*
