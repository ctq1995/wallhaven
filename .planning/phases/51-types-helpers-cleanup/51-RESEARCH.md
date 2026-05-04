# Phase 51: Types & Helpers Cleanup — Research

**研究日期：** 2026-05-04
**研究者：** Claude (Research Agent)
**状态：** 完成

---

## 1. 文件引用分析

### 1.1 `src/types/favorite.ts` 引用情况

**确认：`env.d.ts` 是唯一引用 `@/types/favorite` 的源代码文件**

| 文件路径 | 行号 | 引用方式 | 处理方式 |
|---------|------|---------|---------|
| `env.d.ts` | 3 | `import type { Collection, FavoriteItem } from '@/types/favorite'` | 更新为 `@/types/domain/favorite` |

**其他引用均为文档/计划文件（.planning/），删除后无需更新。**

**验证命令：**
```bash
grep -rn "@/types/favorite" --include="*.ts" --include="*.vue" src/
# 结果：无匹配（只有 env.d.ts 在项目根目录）
```

### 1.2 `src/types/api/index.ts` 引用情况

**确认：无任何引用**

```bash
grep -rn "@/types/api" --include="*.ts" --include="*.vue" .
# 结果：无匹配
```

**文件内容：** 仅包含 `export {}` 和注释，无实际类型定义。

### 1.3 `src/types/ipc/index.ts` 引用情况

**确认：无任何引用**

```bash
grep -rn "@/types/ipc" --include="*.ts" --include="*.vue" .
# 结果：无匹配
```

**文件内容：** 仅包含 `export {}` 和注释，无实际类型定义。

---

## 2. 类型定义对比

### 2.1 `src/types/favorite.ts` vs `src/types/domain/favorite.ts`

| 特性 | `src/types/favorite.ts` | `src/types/domain/favorite.ts` |
|-----|------------------------|-------------------------------|
| Collection | ✓ | ✓ |
| FavoriteItem | ✓ | ✓ |
| FavoritesData | ✓ | ✓ |
| FavoritesErrorCodes | ✓ | ✓ |
| FavoritesErrorCode | ✓ | ✓ |
| PaginationParams | ✗ | ✓ (新增) |
| PaginatedFavoritesResult | ✗ | ✓ (新增) |
| WallpaperItem 导入 | `from './index'` | `from './wallpaper'` |

**结论：** `src/types/domain/favorite.ts` 是超集，包含更多类型定义，可安全删除 `src/types/favorite.ts`。

---

## 3. 验证命令

### 3.1 TypeScript 编译检查

```bash
npm run type-check
```

**预期：** 无错误输出

### 3.2 ESLint 检查

```bash
npm run lint
```

**预期：** 无错误或警告

### 3.3 构建验证

```bash
npm run build
```

**预期：** 构建成功，无类型错误

---

## 4. 风险评估

### 4.1 风险矩阵

| 操作 | 风险等级 | 影响范围 | 缓解措施 |
|-----|---------|---------|---------|
| 删除 `src/types/favorite.ts` | 低 | 仅 `env.d.ts` | 更新导入路径后立即运行 type-check |
| 删除 `src/types/api/index.ts` | 极低 | 无 | 运行 type-check 验证 |
| 删除 `src/types/ipc/index.ts` | 极低 | 无 | 运行 type-check 验证 |
| 更新 `env.d.ts` 导入 | 低 | 全局类型声明 | 确保 `@/types/domain/favorite` 正确导出所需类型 |

### 4.2 潜在问题

1. **路径别名解析：** 确保 `@/types/domain/favorite` 在 TypeScript 配置中正确解析
   - 已验证：`tsconfig.json` 中 `@` 别名指向 `src/`

2. **类型重导出链：** `src/types/domain/index.ts` → `src/types/index.ts` → 外部
   - 已验证：重导出链完整，`Collection` 和 `FavoriteItem` 可从多个路径导入

---

## 5. 执行步骤

### 步骤 1：更新 env.d.ts 导入路径
```typescript
// 从
import type { Collection, FavoriteItem } from '@/types/favorite'

// 改为
import type { Collection, FavoriteItem } from '@/types/domain/favorite'
```

### 步骤 2：删除冗余文件
```bash
rm src/types/favorite.ts
rm src/types/api/index.ts
rmdir src/types/api
rm src/types/ipc/index.ts
rmdir src/types/ipc
```

### 步骤 3：验证
```bash
npm run type-check
npm run lint
```

---

## 6. 需求覆盖确认

| Requirement ID | 状态 | 备注 |
|---------------|------|-----|
| DEADTYPE-01 | ✅ 可执行 | 删除 `src/types/favorite.ts`，更新 env.d.ts |
| DEADTYPE-02 | ✅ 可执行 | 删除 `src/types/ipc/index.ts` 及目录 |
| DEADTYPE-03 | ✅ 可执行 | 删除 `src/types/api/index.ts` 及目录 |
| DEADFUNC-01~06 | N/A | 用户决定保留，不删除 |

---

## 7. 额外发现

### 7.1 目录结构清理后

```
src/types/
├── index.ts          # 主入口，重导出 domain/*
├── domain/
│   ├── index.ts      # 领域类型入口
│   ├── favorite.ts   # 收藏类型
│   ├── wallpaper.ts  # 壁纸类型
│   ├── download.ts   # 下载类型
│   └── settings.ts   # 设置类型
└── README.md         # 文档
```

### 7.2 类型导入路径标准化

删除后，推荐的导入方式：
```typescript
// 推荐：从 domain 子路径导入
import type { Collection, FavoriteItem } from '@/types/domain/favorite'

// 或从主入口导入（通过重导出）
import type { Collection, FavoriteItem } from '@/types'
```

---

## 8. 结论

**研究结论：** Phase 51 可安全执行，无需额外准备工作。

**执行顺序：**
1. 更新 `env.d.ts` 导入路径
2. 删除 `src/types/favorite.ts`
3. 删除 `src/types/api/` 目录
4. 删除 `src/types/ipc/` 目录
5. 运行 `npm run type-check` 验证
6. 运行 `npm run lint` 验证

**预计影响：** 零功能影响，仅清理死代码。

---

*研究完成时间：2026-05-04*
