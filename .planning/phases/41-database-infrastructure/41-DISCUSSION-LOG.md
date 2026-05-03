# Phase 41: Database Infrastructure — Discussion Log

**Date:** 2026-05-03
**Mode:** Interactive (default)

## Discussion Summary

### Gray Areas Identified
1. Schema 版本化策略
2. WAL 检查点策略
3. 数据库初始化时机
4. 错误处理模式
5. 测试策略

### Selected for Discussion
1. Schema 版本化策略 ✓
2. 数据库初始化时机 ✓
3. 错误处理 + 测试策略 ✓

### Claude's Discretion (未选择讨论)
- WAL 检查点策略

---

## Area 1: Schema 版本化策略

**Question:** Phase 41 该如何处理 schema 版本化？

**Options presented:**
- 从第一天引入完整版本化（schema_versions 表 + 迁移数组 + runMigrations()）
- 简单 CREATE TABLE IF NOT EXISTS（不引入版本化，将来需要时再加）

**Selection:** 简单 CREATE TABLE IF NOT EXISTS

**Follow-up notes:** v5.0 期间 schema 基本稳定，不需要增加版本化复杂度。将来需要 schema 变更时再补充。

---

## Area 2: 数据库初始化时机

**Question:** 数据库初始化应该在什么时候首次触发？

**Options presented:**
- 完全懒初始化（只在首次调用 getDatabase() 时初始化）
- Splash 期间主动初始化（splash 展示期初始化）
- 启动最早阶段初始化（createWindow 之前）

**Selection:** 完全懒初始化

**Follow-up notes:** `database.ts` 导出 `getDatabase()` 函数而非顶层实例。import 不触发数据库打开。

---

## Area 3: 错误处理 + 测试策略

**Question (错误处理):** 数据库操作出错时应如何向调用者报告？

**Options presented:**
- IpcResponse<T> 模式（与现有仓库一致）
- 抛出类型化自定义错误
- 返回 null 语义

**Selection:** IpcResponse<T> 模式

**Follow-up notes:** 保持一致性和可预测性。

---

**Question (测试):** 如何解决 node:sqlite 在 Vitest（系统 Node.js）中的可用性问题？

**Options presented:**
- Mock 仓库层（安全最简单）
- try-require + fallback mock
- 要求 Node.js 24+ 开发环境

**Selection:** 要求 Node.js 24+ 开发环境

**Follow-up notes:** 在 package.json engines 中添加 `"node": ">=24"`。测试可以直接使用 `node:sqlite`。

---

## Deferred Ideas

- Schema 版本化系统 — 将来需要 schema 变更时补充
- WAL 检查点策略交由 Claude 自由裁量（每 5 分钟 passive checkpoint + close 时最终检查点）

---

*Discussion completed: 2026-05-03*
