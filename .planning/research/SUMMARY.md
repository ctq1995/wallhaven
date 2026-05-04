# Research Summary: v7.0 代码结构优化

**Milestone:** v7.0 代码结构优化
**Researched:** 2026-05-04
**Confidence:** HIGH

---

## Executive Summary

本研究识别了 Wallhaven 壁纸浏览器代码库中的优化机会。通过静态分析发现：
- **死代码**：重复的类型定义、未使用的函数、测试组件
- **重复代码**：潜在的缓存逻辑重复、HTTP 客户端重复
- **优化机会**：类型定义简化、导入清理

**核心发现：**
1. `src/types/favorite.ts` 与 `src/types/domain/favorite.ts` 完全重复
2. `src/utils/helpers.ts` 中 6 个函数未被使用
3. 4 个测试/演示组件未在生产环境使用
4. `electron.client.ts` 达 1106 行，但结构清晰暂不需要拆分

---

## Stack Additions

**无需添加任何第三方工具。**

使用现有工具即可完成优化：
- TypeScript 编译器 — `noUnusedLocals`, `noUnusedParameters`
- ESLint — `no-unused-vars` 规则
- 手动代码审查

---

## Feature Categories

### Table Stakes (必须包含)

| 类别 | 发现 | 风险 |
|------|------|------|
| 类型重复 | `favorite.ts` 两处重复定义 | 低 |
| 未使用函数 | `helpers.ts` 中 6 个函数 | 低 |
| 空导出文件 | `types/ipc/index.ts`, `types/api/index.ts` | 低 |
| 测试组件 | `ElectronTest.vue`, `AlertDemo.vue`, `APITest.vue`, `Diagnostic.vue` | 低 |

### Differentiators (可选优化)

| 类别 | 发现 | 风险 |
|------|------|------|
| 大文件 | `electron.client.ts` 1106 行 | 中 |
| HTTP 客户端 | `apiClient.ts` 与 `wallpaperApi.ts` 功能重复 | 中 |
| 缓存逻辑 | Service 层缓存逻辑可提取复用 | 中 |
| 类型位置 | 类型定义分散在多个目录 | 中 |

### Out of Scope

| 排除项 | 原因 |
|--------|------|
| 功能行为变更 | 项目约束 |
| IPC 通道变更 | 需保持向后兼容 |
| Store 结构变更 | 响应式风险 |

---

## Architecture Insights

### 推荐优化顺序（自底向上）

| Phase | 层级 | 风险 | 预估时间 |
|-------|------|------|----------|
| 1 | View Layer | 最低 | 0.5 天 |
| 2 | Types & Constants | 低 | 0.5 天 |
| 3 | Composable Layer | 中 | 1 天 |
| 4 | Service Layer | 中 | 1 天 |
| 5 | Repository Layer | 中 | 0.5 天 |
| 6 | Client Layer | 高 | 0.5 天 |

### 依赖安全边界

```
SAFE TO REMOVE:
├── 未使用的 import 语句
├── 未使用的 ref/reactive
├── 未使用的 CSS 类
├── 未使用的工具函数
└── 测试/演示组件

NEEDS VERIFICATION:
├── 类型定义（可能被多处引用）
├── IPC 通道（可能被 preload 暴露）
└── Store 方法（可能被多个 Composable 调用）

DO NOT REMOVE:
├── 公共 API 签名
├── IPC Handler
└── 类型导出
```

---

## Key Pitfalls

### Pitfall 1: 删除"看似未使用"的导出

**问题：** TypeScript 编译器可能无法检测动态导入或外部引用
**预防：** 全局搜索确认无引用后再删除

### Pitfall 2: 类型变更导致隐式错误

**问题：** 修改类型定义，编译通过但运行时错误
**预防：** 类型变更后运行完整测试

### Pitfall 3: Store 响应式断裂

**问题：** Store 结构变更导致组件响应式失效
**预防：** 不修改 Store 状态结构，仅移除未使用的方法

### Pitfall 4: IPC 通道误删

**问题：** IPC 通道通过字符串名称调用，静态分析无法发现
**预防：** 检查 preload 暴露的方法和 handlers 注册

---

## Metrics

### 优化前基线

| 指标 | 当前值 | 目标 |
|------|--------|------|
| 重复类型定义 | 1 组 | 0 |
| 未使用函数 | ~6 个 | 0 |
| 空导出文件 | 2 个 | 0 |
| 测试组件 | 4 个 | 0 |

### 验证方法

1. TypeScript 编译：`npm run type-check`
2. ESLint 检查：`npm run lint`
3. 应用启动验证
4. 功能回归测试

---

## Sources

- `.planning/research/FEATURES.md` — 功能研究
- `.planning/research/ARCHITECTURE.md` — 架构研究
- `.planning/codebase/CONCERNS.md` — 技术债务清单
- 代码库静态分析

---

*Research summary for: v7.0 代码结构优化*
*Researched: 2026-05-04*
