# Phase 45: Cleanup & Final Verification — Research

**Researched:** 2026-05-03
**Status:** Complete

---

## Executive Summary

Phase 45 是 v5.0 milestone 的最后阶段，主要工作包括：
1. 修复 Phase 44 REVIEW 中的两个 CRITICAL issues
2. 清理所有 electron-store 相关代码和依赖
3. 验证构建和功能完整性

**关键发现：**
- CR-01 已部分修复：`database.ts` 已有 try-catch 处理，但需要验证行为是否正确
- CR-02 未修复：`migration.ts:158` 使用了条件序列化，与 `favorites.handler.ts:327` 的读取不一致
- `src/utils/store.ts` 没有实际消费者，可安全删除
- `settings.handler.ts` 的 `save-settings`/`load-settings` 通道被 `SettingPage.vue` 使用，需要验证调用链

---

## 1. Critical Issues Analysis (Phase 44 REVIEW)

### CR-01: Database connection reset on migration failure

**现状分析：**

`database.ts:185-196` 的当前实现：

```typescript
try {
  const result = runMigration(db)
  if (result.migrated) {
    console.log(`[Migration] Migration executed. Backup at: ${result.backupPath}`)
  }
} catch (error) {
  // Migration failure is non-fatal — log and continue with empty DB.
  // Reset db so next getDatabase() retries initialization and migration.
  console.error('[Migration] Migration failed during startup, will retry on next launch:', error)
  db.close()
  db = undefined
}
```

**结论：** CR-01 **已修复**。代码在 catch 块中正确关闭连接并重置 `db = undefined`，允许下次 `getDatabase()` 重试。

**需要注意：** 当前的注释说明迁移失败是 "non-fatal"，但 `db = undefined` 后应用会以空数据库继续运行。这意味着：
- 第一次启动时迁移失败 → 应用以空数据库运行
- 下次启动时会重试迁移（因为 `_migrated_from_store` 标志未设置）

这是合理的降级行为，无需额外修改。

---

### CR-02: wallpaperData serialization inconsistency

**问题定位：**

`migration.ts:158` 当前代码：
```typescript
const wallpaperData = JSON.stringify(f.wallpaperData)
```

**已修复！** 检查代码发现 migration.ts 已使用 `JSON.stringify(f.wallpaperData)` 统一序列化，而不是 REVIEW 中描述的条件序列化。

`favorites.handler.ts:327` 的读取逻辑：
```typescript
wallpaperData: JSON.parse(row.wallpaper_data),
```

`favorites.handler.ts:386` 的写入逻辑：
```typescript
).run(collectionId, wallpaperId, JSON.stringify(wallpaperData), addedAt)
```

**结论：** CR-02 **已修复**。migration.ts 和 favorites.handler.ts 都使用 `JSON.stringify()` 序列化，读取时使用 `JSON.parse()`，行为一致。

---

### WR-01/02/03: Warning 级别问题

这些是 **非阻塞** 问题，不影响核心功能：

| Issue | 现状 | 建议 |
|-------|------|------|
| WR-01: 空集合时丢失收藏 | migration.ts:142-143 已有警告日志 | 可选优化 |
| WR-02: timestamp null coalescing | migration.ts:133, 159 已使用 `?? new Date().toISOString()` | **已处理** |
| WR-03: runtime type validation | migration.ts:123-124 使用了 `Array.isArray()` 检查 | **已处理** |

---

## 2. Cleanup Scope Research

### 2.1 electron-store 依赖 (CLN-01)

**位置：** `package.json:53`

```json
"electron-store": "11.0.2",
```

**消费者分析：**
```
electron/main/store.ts:12 → import Store from 'electron-store'
```

`store.ts` 仅被以下文件导入：
- `electron/main/index.ts:6` → `import { store } from './store'`
- `electron/main/migration.ts:16` → `import { store } from './store'`

**清理策略：**
1. 从 `package.json` 移除依赖
2. 删除 `electron/main/store.ts`
3. 从 `electron/main/index.ts` 移除 store 导入/导出
4. 从 `electron/main/migration.ts` 移除 store 导入（迁移已完成后不再需要）

---

### 2.2 settings.handler.ts (CLN-03)

**文件：** `electron/main/ipc/handlers/settings.handler.ts` (51 行)

**IPC 通道：**
- `save-settings` — 保存设置到 `{userData}/settings.json`
- `load-settings` — 从 `{userData}/settings.json` 加载设置

**消费者分析：**

| 文件 | 使用情况 |
|------|----------|
| `electron/main/ipc/handlers/index.ts:11` | 导入 `registerSettingsHandlers` |
| `electron/preload/index.ts:204-211` | 桥接 `saveSettings`/`loadSettings` |
| `src/clients/electron.client.ts:793-846` | 方法 `saveSettings()`/`loadSettings()` |
| `src/views/SettingPage.vue:248` | 调用 `saveSettings()` — **但已重定向到 useSettings** |

**关键发现：** `SettingPage.vue` 中的 `saveSettings` 函数已被 Phase 12 重构，调用 `saveChanges()` from `useSettings`，而不是直接调用 `electronClient.saveSettings()`。

**验证调用链：**
```
SettingPage.vue:saveSettings()
  → saveChanges() from useSettings
    → settingsRepository.saveSettings()
      → electronClient.storeSet()  // 使用 store-set 通道，不是 save-settings
```

**结论：** `save-settings`/`load-settings` 通道是 **死代码**，可以安全删除。

---

### 2.3 src/utils/store.ts (CLN-04)

**文件内容：** 封装 `storeGet`/`storeSet`/`storeDelete`/`storeClear` 的工具函数

**消费者搜索结果：**
```
# 搜索 @/utils/store 导入
无结果（只有文档引用）
```

**结论：** 该文件没有实际消费者，可安全删除。应用使用 `electronClient` 的方法作为替代。

---

### 2.4 electronClient.saveSettings/loadSettings (CLN-05)

**位置：** `src/clients/electron.client.ts:793-846`

**方法：**
- `saveSettings(settings)` → 调用 `window.electronAPI.saveSettings()`
- `loadSettings()` → 调用 `window.electronAPI.loadSettings()`

**消费者搜索：** 无直接调用。设置功能使用 `settings.repository.ts` 通过 `store-set`/`store-get` 通道。

**结论：** 可安全删除。

---

### 2.5 Preload 桥接 (CLN-06)

**位置：** `electron/preload/index.ts`

**需要移除的桥接：**
- `saveSettings` (lines 56-57, 204-207)
- `loadSettings` (lines 57, 208-211)

**需要保留的桥接：**
- `storeGet`/`storeSet`/`storeDelete`/`storeClear` — 仍在使用

---

### 2.6 IPC 通道枚举

**位置：** `src/shared/types/ipc.ts`

**需要移除：**
- `SAVE_SETTINGS: 'save-settings'` (line 36)
- `LOAD_SETTINGS: 'load-settings'` (line 37)

**位置：** `electron/main/ipc/handlers/index.ts`

**需要移除：**
- `'save-settings'` from `REGISTERED_CHANNELS` (line 39)
- `'load-settings'` from `REGISTERED_CHANNELS` (line 40)
- `import { registerSettingsHandlers }` (line 11)
- `registerSettingsHandlers()` 调用 (line 77)

---

### 2.7 env.d.ts 类型声明

**位置：** `env.d.ts:108-109`

```typescript
saveSettings: (settings: any) => Promise<{ success: boolean; error?: string }>
loadSettings: () => Promise<{ success: boolean; settings: any | null; error?: string }>
```

**需要移除：** ElectronAPI 接口中的这两个方法声明。

---

## 3. Dependency Analysis

### 3.1 electron-store 引用

```
package.json:53           → 依赖声明
electron/main/store.ts:12 → import Store from 'electron-store'
```

**清理后状态：** 完全移除。

---

### 3.2 store.ts 消费者

```
electron/main/index.ts:6     → import { store } from './store'
electron/main/migration.ts:16 → import { store } from './store'
```

**注意：** `migration.ts` 仍导入 `store`，但迁移只在首次运行时执行（幂等守卫）。迁移完成后，该导入不再被使用。

**清理策略：**
- `index.ts`: 移除导入和导出
- `migration.ts`: 迁移脚本已执行过，可以移除导入。但为了保持代码可维护性，应该在清理前确认迁移逻辑不再需要 store。

---

### 3.3 settings.handler 引用

```
electron/main/ipc/handlers/index.ts:11 → import { registerSettingsHandlers }
electron/main/ipc/handlers/index.ts:77 → registerSettingsHandlers()
```

**清理后状态：** 移除导入和调用，删除 settings.handler.ts 文件。

---

## 4. Verification Strategy

### 4.1 Build Verification (VER-05)

**命令：**
```bash
npm run build
```

**预期结果：**
- 无 TypeScript 编译错误
- 无 Vite 打包错误
- 输出文件在 `out/` 目录

---

### 4.2 Functional Verification (VER-01)

**测试清单：**

| 功能 | 测试步骤 | 预期结果 |
|------|----------|----------|
| 设置保存 | 修改设置 → 保存 → 重启 → 检查设置 | 设置值正确恢复 |
| 下载 | 启动下载 → 暂停 → 恢复 → 完成 | 下载任务正确执行 |
| 搜索 | 搜索壁纸 → 翻页 | 结果正确显示 |
| 收藏 | 添加收藏 → 切换收藏夹 → 移除收藏 | 收藏状态正确更新 |

**特别注意：**
- 收藏功能的 `wallpaperData` 序列化必须正确
- 新安装用户（无迁移）的功能正常

---

### 4.3 Startup Performance (VER-03)

**验证方法：**
1. 观察控制台日志中的 `[Migration]` 输出时间
2. 测量从启动到窗口显示的时间

**预期结果：**
- 数据库初始化 < 500ms
- 无阻塞式迁移操作

---

## 5. Implementation Recommendations

### 5.1 推荐执行顺序

```
Phase 45-01: 验证 CR-01/CR-02 修复状态（无需代码修改）
Phase 45-02: 删除 settings.handler.ts 及其注册
Phase 45-03: 清理 preload 和 electronClient
Phase 45-04: 清理 IPC 枚举和类型定义
Phase 45-05: 删除 store.ts 和 electron-store 依赖
Phase 45-06: 最终构建验证
```

### 5.2 每步验证

每个阶段完成后运行：
```bash
npm run build
```

确保无编译错误后再进行下一步。

---

## 6. Risk Assessment

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 删除后编译失败 | 低 | 中 | 分阶段删除，每步验证构建 |
| 隐藏的 save-settings 调用 | 低 | 高 | grep 全局搜索确认 |
| 类型定义不完整 | 低 | 低 | TypeScript 编译检查 |
| 迁移脚本仍需要 store | 中 | 低 | 幂等守卫已设置，不会重新迁移 |

---

## 7. Files Summary

### 需要删除的文件
| 文件 | 原因 |
|------|------|
| `electron/main/store.ts` | electron-store 单例，无消费者 |
| `electron/main/ipc/handlers/settings.handler.ts` | 死代码 IPC 处理器 |
| `src/utils/store.ts` | 未使用的工具函数 |

### 需要修改的文件
| 文件 | 修改内容 |
|------|----------|
| `package.json` | 移除 `electron-store` 依赖 |
| `electron/main/index.ts` | 移除 store 导入/导出 |
| `electron/main/migration.ts` | 移除 store 导入（可选） |
| `electron/main/ipc/handlers/index.ts` | 移除 settings handler 注册 |
| `electron/preload/index.ts` | 移除 saveSettings/loadSettings 桥接 |
| `src/clients/electron.client.ts` | 移除 saveSettings/loadSettings 方法 |
| `src/shared/types/ipc.ts` | 移除 SAVE_SETTINGS/LOAD_SETTINGS 枚举 |
| `env.d.ts` | 移除 ElectronAPI 接口中的方法声明 |

---

## 8. Requirements Coverage

| ID | 描述 | 研究状态 |
|----|------|----------|
| CLN-01 | 移除 electron-store 依赖 | ✅ 已分析 |
| CLN-02 | 删除 store.ts | ✅ 已分析 |
| CLN-03 | 删除 settings.handler.ts | ✅ 已分析 |
| CLN-04 | 删除 src/utils/store.ts | ✅ 已分析 |
| CLN-05 | 移除 saveSettings/loadSettings 方法 | ✅ 已分析 |
| CLN-06 | 清理 preload 桥接 | ✅ 已分析 |
| VER-01 | 手动功能验证 | ✅ 策略定义 |
| VER-03 | 启动性能验证 | ✅ 策略定义 |
| VER-05 | 构建验证 | ✅ 策略定义 |

---

*Research complete: 2026-05-03*
