---
status: resolved
trigger: "修复 npm run type-check"
created: "2026-05-03"
updated: "2026-05-03"
---

# Debug Session: npm run type-check

## Symptoms

**Expected behavior**: `npm run type-check` 应该通过，没有类型错误

**Actual behavior**: 存在 49 个 TypeScript 类型错误，主要分布在：
- `electron/main/database.ts`: 3 个错误
- `electron/main/ipc/handlers/favorites.handler.ts`: 35 个错误
- `electron/main/ipc/handlers/store.handler.ts`: 8 个错误
- `electron/preload/types.ts`: 4 个错误

**Error messages**:
主要错误类型：
1. TS2322: 类型赋值错误 (DatabaseSync | undefined 不能赋值给 DatabaseSync)
2. TS2558: 预期 0 个类型参数，但得到了 1 个
3. TS2345: 参数类型错误 (SQLOutputValue 不能赋值给 string)
4. TS18048: 变量可能为 undefined
5. TS2305: 模块没有导出成员
6. TS2339: 属性不存在

**Timeline**: 未知，可能是最近的代码更改导致

**Reproduction**: 运行 `npm run type-check`

## Current Focus

hypothesis: "Node.js 22+ SQLite API 类型定义与代码实现不匹配，以及 IPC 类型定义缺失"
next_action: "completed"

## Evidence

### 根本原因分析

1. **Node.js 22+ SQLite API 泛型参数问题**
   - `prepare()` 方法签名是 `prepare(sql: string): StatementSync`，不接受泛型参数
   - 代码中使用了 `prepare<{ value: string }>(...)` 语法，导致 TS2558 错误

2. **SQLOutputValue 类型问题**
   - `StatementSync.get()` 返回 `Record<string, SQLOutputValue> | undefined`
   - `SQLOutputValue` 类型定义包含 `null | number | bigint | string | NodeJS.NonSharedUint8Array`
   - 直接访问 `row.value` 不能赋值给 `string` 类型，需要类型断言或类型守卫

3. **preload/types.ts 引用不存在的类型**
   - `SaveSettingsResponse` 和 `LoadSettingsResponse` 在 `src/shared/types/ipc.ts` 中不存在
   - `IPC_CHANNELS.SAVE_SETTINGS` 和 `IPC_CHANNELS.LOAD_SETTINGS` 在通道常量中不存在

## Eliminated

无

## Resolution

### 修复方案

1. **database.ts**
   - 将 `getDatabase()` 返回类型从 `return db` 改为 `return db!` (使用非空断言，因为已确保初始化)
   - 移除 `prepare<{ value: string }>()` 的泛型参数
   - 使用 `Record<string, unknown>` 类型断言访问 row 属性
   - 添加类型守卫检查 `typeof value === 'string'`

2. **store.handler.ts**
   - 移除所有 `prepare<T>()` 的泛型参数
   - 使用 `(row as Record<string, unknown>).value` 类型断言

3. **favorites.handler.ts**
   - 移除所有 `prepare<T>()` 的泛型参数
   - 在读取 `updated` 后检查是否存在，不存在则返回错误
   - 使用 `Record<string, unknown>` 类型断言访问 row 属性

4. **preload/types.ts**
   - 移除不存在的类型导出：`SaveSettingsResponse`, `LoadSettingsResponse`
   - 移除不存在的 IPC 通道引用：`SAVE_SETTINGS`, `LOAD_SETTINGS`

### 修复后验证

```
npm run type-check
> wallhaven@v2.6.8 type-check
> vue-tsc --build
```

类型检查通过，无错误。
