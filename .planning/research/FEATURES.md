# Features Research: 代码结构优化

**Domain:** Wallhaven 壁纸浏览器 — 代码清理与优化
**Researched:** 2026-05-04
**Confidence:** HIGH (基于代码库静态分析)

## 优化类别

### Table Stakes (必须包含)

基础优化项，缺失会影响代码可维护性。

| 优化项 | 发现位置 | 影响 | 风险 |
|--------|----------|------|------|
| **类型重复定义** | `src/types/favorite.ts` 与 `src/types/domain/favorite.ts` 完全重复 | 中 — 维护两份相同代码 | 低 — 删除旧文件 |
| **空导出文件** | `src/types/ipc/index.ts` 和 `src/types/api/index.ts` 仅 `export {}` | 低 — 无实际用途 | 低 — 可删除或保留占位 |
| **未使用函数** | `src/utils/helpers.ts` 中多个函数未被使用 | 中 — 增加打包体积 | 低 — 确认后删除 |
| **大文件拆分机会** | `electron.client.ts` 1106 行 | 高 — 单文件过大 | 中 — 需保持接口稳定 |

### Differentiators (可选优化)

进阶优化项，提升代码质量但非必须。

| 优化项 | 描述 | 收益 | 复杂度 |
|--------|------|------|--------|
| **Barrel Exports 精简** | 检查 `index.ts` 导出是否都被使用 | 减少未使用的导出 | 低 |
| **导入路径统一** | 统一使用 `@/types` vs 相对路径 | 代码一致性 | 低 |
| **类型定义集中化** | `src/types/` 目录结构优化 | 更清晰的类型组织 | 中 |
| **组件按功能分组** | `components/` 目录结构优化 | 更清晰的组件组织 | 中 |

### Anti-patterns to Avoid

优化过程中应避免的模式。

| 反模式 | 为什么有问题 | 替代方案 |
|--------|-------------|----------|
| **过度拆分文件** | 拆分过多小文件增加导入复杂度，降低可读性 | 保持相关逻辑在一起，按职责拆分 |
| **删除"看似未使用"的导出** | 可能被动态导入或外部引用 | 使用 TypeScript 编译器验证 |
| **重构与功能变更混合** | 难以追踪变更来源，增加回归风险 | 纯重构，不改变任何功能行为 |
| **改变公共 API 签名** | 破坏下游调用者 | 保持接口向后兼容 |
| **删除错误处理代码** | 即使看似未触发，可能是防御性代码 | 审查后谨慎处理 |

## 详细发现

### 1. 类型重复定义

**问题描述:**
`src/types/favorite.ts` 和 `src/types/domain/favorite.ts` 存在完全重复的类型定义：
- `Collection` interface
- `FavoriteItem` interface
- `FavoritesData` interface
- `FavoritesErrorCodes` constant

**分析:**
- `src/types/domain/favorite.ts` 是 Phase 46 迁移后的新位置
- `src/types/favorite.ts` 应该是遗留文件，但未被删除
- `src/types/index.ts` 通过 `export * from './domain'` 重导出
- `src/types/favorite.ts` 未被直接导入（搜索未发现 `from '@/types/favorite'`）

**建议:**
- 删除 `src/types/favorite.ts` 重复文件
- 保留 `src/types/domain/favorite.ts`

### 2. 未使用函数分析

**`src/utils/helpers.ts` 函数使用情况:**

| 函数 | 使用次数 | 状态 |
|------|----------|------|
| `formatResolution` | 5 处 | ✅ 保留 |
| `formatFileSize` | 5 处 | ✅ 保留 |
| `arrayToBinaryString` | 2 处 | ✅ 保留 |
| `generateRandomString` | 1 处 | ✅ 保留 |
| `formatSpeed` | 1 处 | ✅ 保留 |
| `formatTime` | 1 处 | ✅ 保留 |
| `formatCountdown` | 1 处 | ✅ 保留 |
| `debounce` | 0 处（仅定义和注释内使用） | ⚠️ 待确认 |
| `throttle` | 0 处（仅定义和注释内使用） | ⚠️ 待确认 |
| `deepClone` | 0 处（仅内部递归调用） | ⚠️ 待确认 |
| `isEmpty` | 1 处（仅被 `filterEmptyValues` 使用） | ⚠️ 待确认 |
| `filterEmptyValues` | 0 处 | ⚠️ 待确认 |
| `preloadImages` | 0 处 | ⚠️ 待确认 |
| `cleanupObject` | 0 处 | ⚠️ 待确认 |

**建议:**
- 保留所有格式化函数（已验证使用）
- 对 `debounce`, `throttle`, `deepClone`, `filterEmptyValues`, `preloadImages`, `cleanupObject` 进行进一步验证
- 如确认未使用，可安全删除

### 3. 大文件分析

**超过 300 行的文件:**

| 文件 | 行数 | 评估 |
|------|------|------|
| `src/clients/electron.client.ts` | 1106 | 🔴 过大，考虑按功能拆分 |
| `src/components/SearchBar.vue` | 869 | 🟡 大型组件，但功能集中 |
| `src/views/SettingPage.vue` | 786 | 🟡 设置页面，表单多属正常 |
| `src/views/OnlineWallpaper.vue` | 657 | 🟡 主页面，逻辑集中 |
| `src/composables/download/useDownload.ts` | 536 | 🟡 下载逻辑复杂，可接受 |
| `src/components/WallpaperList.vue` | 525 | 🟡 列表组件，功能集中 |
| `src/components/ImagePreview.vue` | 506 | 🟡 预览组件，功能集中 |
| `src/views/DownloadWallpaper.vue` | 496 | 🟡 下载页面，功能集中 |
| `src/components/LocalWallpaperMain.vue` | 487 | 🟡 本地壁纸，功能集中 |
| `src/shared/types/ipc.ts` | 426 | 🟢 类型定义，无需拆分 |

**`electron.client.ts` 拆分建议:**
该文件是一个大类，包含以下功能组：
1. Store 操作 (storeGet, storeSet, storeDelete, storeClear)
2. Favorites & Collections 操作 (15+ 个方法)
3. 文件操作 (selectFolder, readDirectory, openFolder, deleteFile, fileExists)
4. 下载管理 (downloadWallpaper, startDownloadTask, pause, cancel, resume, getPending, onProgress)
5. 壁纸设置 (setWallpaper)
6. API 代理 (wallhavenApiRequest)
7. 窗口控制 (minimize, maximize, close, isMaximized)
8. 缓存管理 (clearAppCache, getCacheInfo, cleanupOrphanFiles)

**拆分方案:**
- 保持单一 `ElectronClientImpl` 类不变（已封装良好）
- 或按功能域拆分为多个独立类，再聚合
- **建议:** 当前结构清晰，方法分组明确，暂不拆分。可考虑添加功能分组注释。

### 4. 空导出文件

**发现:**
```typescript
// src/types/ipc/index.ts
export {}

// src/types/api/index.ts
export {}
```

**分析:**
- 注释表明这些是"阶段 1"占位文件，计划后续迁移类型
- `src/shared/types/ipc.ts` 已包含完整的 IPC 类型定义
- `src/types/ipc/index.ts` 与 `src/shared/types/ipc.ts` 职责重叠

**建议:**
- 评估 `src/types/ipc/` 和 `src/types/api/` 目录是否仍需要
- 如果不需要，删除整个目录
- 如果保留作为未来扩展点，添加更明确的 TODO 注释

## 代码健康指标

### 优化前基线

| 指标 | 当前值 | 目标 |
|------|--------|------|
| 总代码行数 | ~14,000 (TS + Vue) | 减少 5-10% |
| 重复类型定义 | 1 组 (`favorite.ts`) | 0 |
| 未使用导出函数 | ~6 个待确认 | 0 |
| >300 行文件 | 10 个 | 减少 1-2 个 |
| 空导出文件 | 2 个 | 0 或明确用途 |

### 验证方法

1. **死代码检测:**
   ```bash
   # 使用 TypeScript 编译器检测未使用的导出
   npx tsc --noEmit --listFiles

   # 使用 ESLint 规则
   npx eslint --rule 'no-unused-vars: error' src/
   ```

2. **打包体积对比:**
   ```bash
   # 优化前
   npm run build && du -sh dist/

   # 优化后对比
   ```

3. **功能验证:**
   - 运行完整测试套件
   - 手动回归测试主要功能

## 风险评估

### 低风险优化

| 操作 | 风险 | 缓解措施 |
|------|------|----------|
| 删除 `src/types/favorite.ts` | 低 | 验证无直接导入 |
| 删除空导出文件 | 低 | 无代码依赖 |
| 删除未使用的工具函数 | 低 | 编译器验证 |

### 中风险优化

| 操作 | 风险 | 缓解措施 |
|------|------|----------|
| 大文件拆分 | 中 | 保持接口不变，逐步重构 |
| Barrel exports 精简 | 中 | 逐个验证导出使用情况 |

### 约束条件

根据项目约束，以下内容 **不可变更**：
- 用户操作逻辑
- 界面布局
- UI 显示效果
- 功能行为
- API 兼容性（IPC 通道名称和消息格式）

## 推荐优化顺序

1. **Phase 1: 低风险清理**
   - 删除重复的 `src/types/favorite.ts`
   - 删除或明确空导出文件
   - 删除确认未使用的工具函数

2. **Phase 2: 中风险重构**
   - 精简 barrel exports
   - 统一导入路径风格

3. **Phase 3: 验证**
   - 运行完整测试
   - 构建验证
   - 功能回归测试

## Sources

- 代码库静态分析:
  - `wc -l` 行数统计
  - `grep` 导入/导出搜索
  - TypeScript 类型定义审查
- 项目约束: `.planning/PROJECT.md`
- 架构文档: `.planning/research/ARCHITECTURE.md`

---
*Feature research for: v7.0 代码结构优化*
*Researched: 2026-05-04*
