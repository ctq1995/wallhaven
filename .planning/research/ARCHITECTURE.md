# Architecture Research: 代码结构优化

**Domain:** Wallhaven 壁纸浏览器 — v7.0 代码结构优化
**Researched:** 2026-05-04
**Confidence:** HIGH (基于现有分层架构分析 + 代码依赖审查)

---

## Executive Summary

本文档分析如何在分层架构 (Client → Repository → Service → Composable → View) 中安全地执行代码优化，包括死代码删除、重复代码消除、类型/导入简化。核心原则是**自底向上优化，保持 API 兼容性**。

**关键发现：**
1. 分层架构提供了清晰的依赖边界，优化应从底层开始
2. 大部分死代码可通过静态分析识别，但跨层引用需要运行时验证
3. 类型定义存在冗余（如 `env.d.ts` 与 `src/shared/types/ipc.ts`）
4. 某些"死代码"实际上是 IPC 通道暴露，需谨慎处理

---

## 分层架构优化策略

### Client Layer

**职责：** 封装 Electron IPC 调用和 HTTP 请求

**文件：**
- `src/clients/api.client.ts` — HTTP 客户端
- `src/clients/electron.client.ts` — Electron IPC 客户端
- `src/clients/constants.ts` — 存储键常量

**优化策略：**

1. **死代码检测方法：**
   - 搜索 `electronClient` 的所有方法调用
   - 检查 `STORAGE_KEYS` 是否全部被使用
   - 验证 `apiClient` 的 `get`/`post` 方法是否都被使用

2. **安全优化要点：**
   - Client 方法即使未被直接调用，也可能被 IPC 通道需要
   - 不要删除任何暴露给 preload 的 IPC 方法
   - 保持 `IpcResponse<T>` 返回类型一致性

3. **可优化项：**
   - `apiClient.ts` 与 `wallpaperApi.ts` 存在功能重复（两个 axios 实例）
   - 可合并为统一 HTTP 客户端

4. **不可删除项：**
   - 所有 `electronClient` 方法 — 被 Repository 层依赖
   - `STORAGE_KEYS` 常量 — 定义存储键

```typescript
// 检测命令：查找 Client 方法的所有调用
grep -r "electronClient\." src/
grep -r "apiClient\." src/
```

---

### Repository Layer

**职责：** 数据访问抽象，封装存储操作

**文件：**
- `src/repositories/settings.repository.ts`
- `src/repositories/wallpaper.repository.ts`
- `src/repositories/window.repository.ts`
- `src/repositories/download.repository.ts`（推测存在）
- `src/repositories/favorites.repository.ts`（推测存在）

**优化策略：**

1. **死代码检测方法：**
   - 每个 Repository 方法应在 Service 层有对应调用
   - 检查 `index.ts` 导出的类型是否全部被使用

2. **依赖关系：**
   ```
   Repository → Client (electronClient, apiClient)
   Service → Repository
   ```

3. **安全优化要点：**
   - Repository 方法签名变更会影响所有 Service
   - 不要修改返回类型，保持 `IpcResponse<T>` 包装
   - 内部实现可简化，但对外 API 保持稳定

4. **可优化项：**
   - `CacheInfo`、`ClearCacheResult` 类型可移至 `types/` 目录统一管理
   - 检查是否有未使用的 Repository 方法

```typescript
// 检测命令：验证 Repository 方法是否被 Service 调用
grep -r "settingsRepository\." src/services/
grep -r "wallpaperRepository\." src/services/
grep -r "favoritesRepository\." src/services/
```

---

### Service Layer

**职责：** 业务逻辑处理，协调多个 Repository

**文件：**
- `src/services/wallpaperApi.ts` — Wallhaven API 调用
- `src/services/download.service.ts` — 下载管理
- `src/services/settings.service.ts` — 设置管理
- `src/services/window.service.ts` — 窗口控制
- `src/services/collections.service.ts` — 收藏夹管理
- `src/services/favorites.service.ts` — 收藏项管理

**优化策略：**

1. **死代码检测方法：**
   - 每个 Service 方法应在 Composable 层有对应调用
   - 检查私有方法是否被公共方法使用
   - 验证导出的类型是否被使用

2. **依赖关系：**
   ```
   Service → Repository (多个)
   Service → Client (少量直接调用)
   Composable → Service
   ```

3. **安全优化要点：**
   - Service 是业务逻辑核心，修改影响面最广
   - 保持公共方法签名不变
   - 私有方法可自由重构/删除

4. **可优化项：**
   - `wallpaperApi.ts` 有大量 `any` 类型（见 CONCERNS.md）
   - `clearApiCache()` 函数可能未被使用
   - `cancelCurrentRequest()` 函数需验证是否被使用
   - 内存缓存逻辑可在多个 Service 间复用

5. **重复代码模式：**
   - `settings.service.ts` 和 `collections.service.ts` 都有 `cachedSettings`/`cachedCollections` 内存缓存
   - 可提取为通用缓存装饰器或基类

```typescript
// 检测命令：验证 Service 方法是否被 Composable 调用
grep -r "settingsService\." src/composables/
grep -r "downloadService\." src/composables/
grep -r "wallpaperService\." src/composables/
grep -r "collectionsService\." src/composables/
grep -r "favoritesService\." src/composables/
```

---

### Composable Layer

**职责：** Vue 组合式函数，封装组件逻辑

**文件：**
- `src/composables/core/useAlert.ts`
- `src/composables/wallpaper/useWallpaperList.ts`
- `src/composables/wallpaper/useWallpaperSetter.ts`
- `src/composables/download/useDownload.ts`
- `src/composables/settings/useSettings.ts`
- `src/composables/local/useLocalFiles.ts`
- `src/composables/favorites/useCollections.ts`
- `src/composables/favorites/useFavorites.ts`
- `src/composables/animation/useImageTransition.ts`

**优化策略：**

1. **死代码检测方法：**
   - 每个 Composable 应在 View 层有对应调用
   - 检查返回值是否全部被使用
   - 验证导出类型是否被使用

2. **依赖关系：**
   ```
   Composable → Service (多个)
   Composable → Store (Pinia)
   View → Composable
   ```

3. **安全优化要点：**
   - Composable 返回值变更直接影响 View 层
   - 保持返回对象结构不变
   - 内部实现可自由重构

4. **可优化项：**
   - `UseAlertReturn` 接口定义了 7 个方法，但某些 View 可能只用 `showError`
   - `useSettings` 的 `editableSettings` 功能可能与某些页面无关
   - 检查 `useImageTransition` 是否被所有预览场景使用

5. **返回值简化：**
   ```typescript
   // 当前：返回完整对象
   return {
     alert, showAlert, hideAlert, showSuccess, showError, showWarning, showInfo
   }

   // 如果 hideAlert 从未被使用，可考虑移除
   // 但需全面检查所有使用点
   ```

```typescript
// 检测命令：验证 Composable 是否被 View 使用
grep -r "useAlert" src/views/
grep -r "useWallpaperList" src/views/
grep -r "useDownload" src/views/
grep -r "useSettings" src/views/
grep -r "useFavorites" src/views/
grep -r "useCollections" src/views/
```

---

### View Layer

**职责：** UI 渲染和用户交互

**文件：**
- `src/views/OnlineWallpaper.vue`
- `src/views/LocalWallpaper.vue`
- `src/views/SettingPage.vue`
- `src/views/DownloadWallpaper.vue`
- `src/views/FavoritesPage.vue`
- `src/components/` — 共享组件

**优化策略：**

1. **死代码检测方法：**
   - 检查未使用的 import 语句
   - 检查定义但未使用的 ref/reactive
   - 检查未使用的 CSS 类

2. **依赖关系：**
   ```
   View → Composable
   View → Component (子组件)
   View → assets (静态资源)
   ```

3. **安全优化要点：**
   - View 层优化风险最低
   - 可安全移除未使用的导入和变量
   - CSS 清理需确保动态类名不受影响

4. **可优化项：**
   - 检查 `OnlineWallpaper.vue` 中 `wallpaperList` 计算属性是否必要
   - 检查 `DownloadWallpaper.vue` 中 `showInFolder` 是否可通过 Service 层实现
   - 移除未使用的组件导入

5. **已知问题（来自 CONCERNS.md）：**
   - `src/components/ElectronTest.vue` — 测试组件，未在生产使用
   - `src/components/AlertDemo.vue` — Demo 组件，未在生产使用
   - `src/views/APITest.vue` — 测试视图，未集成到路由
   - `src/views/Diagnostic.vue` — 诊断视图，未集成到路由

---

## 依赖分析

### 跨层依赖矩阵

| 层级 | 依赖方向 | 依赖项 |
|------|----------|--------|
| Client | 无依赖 | — |
| Repository | → Client | electronClient, apiClient, STORAGE_KEYS |
| Service | → Repository | settingsRepository, wallpaperRepository, etc. |
| Service | → Client | electronClient (直接调用，如 downloadService) |
| Composable | → Service | 所有 Service |
| Composable | → Store | Pinia stores |
| View | → Composable | 所有 Composables |
| View | → Component | 子组件 |

### 优化安全边界

```
┌─────────────────────────────────────────────────────────────────┐
│                      SAFE TO REMOVE                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ View Layer: 未使用的 import, ref, CSS                      │  │
│  │ Composable Layer: 未使用的返回值, 私有方法                   │  │
│  │ Service Layer: 未使用的私有方法, 可合并的缓存逻辑             │  │
│  │ Repository Layer: 未使用的方法 (需验证)                      │  │
│  │ Client Layer: 未使用的方法 (需验证 IPC 暴露)                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                      NEEDS VERIFICATION                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 类型定义: 可能被多个文件引用                                 │  │
│  │ IPC 通道: 可能被 preload 暴露                               │  │
│  │ Store 方法: 可能被多个 Composable 调用                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                      DO NOT REMOVE                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 公共 API 签名: Service/Composable/Repository 公共方法       │  │
│  │ IPC Handler: 所有注册的 IPC 处理器                          │  │
│  │ 类型导出: index.ts 中导出的类型                             │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 优化顺序

### 推荐顺序：自底向上

**理由：** 底层变更影响面小，易于验证；上层变更影响面大，需谨慎。

```
Phase 1: View Layer（风险最低）
  ├─ 移除未使用的 import
  ├─ 移除未使用的 ref/reactive
  ├─ 移除未使用的 CSS
  └─ 删除测试/演示组件

Phase 2: Composable Layer
  ├─ 检查返回值使用情况
  ├─ 简化内部实现
  └─ 提取共享逻辑

Phase 3: Service Layer
  ├─ 检查方法调用情况
  ├─ 移除未使用的私有方法
  ├─ 合并重复的缓存逻辑
  └─ 简化类型定义

Phase 4: Repository Layer
  ├─ 检查方法调用情况
  └─ 简化内部实现

Phase 5: Client Layer（风险最高）
  ├─ 检查方法调用情况
  └─ 合并重复的 HTTP 客户端

Phase 6: Types & Constants
  ├─ 合并重复的类型定义
  ├─ 移除未使用的类型
  └─ 统一类型文件位置
```

### 验证检查点

每个 Phase 完成后执行：

1. **TypeScript 编译：** `npm run type-check`
2. **单元测试：** `npm run test`
3. **应用启动：** 手动验证核心功能
4. **功能回归：** 验证所有页面正常工作

---

## 类型定义优化

### 当前问题

1. **类型重复：**
   - `env.d.ts` 与 `src/shared/types/ipc.ts` 存在类型重复
   - 见 CONCERNS.md: "Type duplication between `env.d.ts` and `src/shared/types/ipc.ts`"

2. **类型位置分散：**
   - `src/types/index.ts` — 主类型定义
   - `src/types/api/index.ts` — API 类型（当前为空）
   - `src/shared/types/ipc.ts` — IPC 类型
   - 各文件内联定义的类型

3. **`any` 类型滥用：**
   - 见 CONCERNS.md 详细列表

### 优化策略

1. **统一类型位置：**
   ```
   src/types/
   ├─ index.ts       — 主类型导出
   ├─ api.ts         — API 相关类型
   ├─ ipc.ts         — IPC 相关类型（从 shared/ 迁移）
   ├─ store.ts       — Store 相关类型
   └─ common.ts      — 通用类型
   ```

2. **类型迁移原则：**
   - 保持导出路径兼容，使用 re-export
   - 逐步迁移，每次迁移一个类型
   - 迁移后更新 import 路径

3. **消除 `any` 策略：**
   - 优先使用 `unknown` 替代
   - 定义具体的接口
   - 使用泛型约束

---

## 死代码检测技术

### 静态分析方法

1. **TypeScript 编译器：**
   ```bash
   # 启用未使用变量检查
   tsc --noUnusedLocals --noUnusedParameters
   ```

2. **ESLint 规则：**
   ```json
   {
     "rules": {
       "no-unused-vars": "error",
       "@typescript-eslint/no-unused-vars": "error"
     }
   }
   ```

3. **手动搜索：**
   ```bash
   # 搜索函数定义
   grep -r "function\|const.*=.*(" src/

   # 搜索函数调用
   grep -r "functionName(" src/
   ```

### 运行时验证

对于无法静态确定的情况（如动态属性访问）：

```typescript
// 添加开发环境的调用追踪
if (import.meta.env.DEV) {
  const original = repository.method
  repository.method = (...args) => {
    console.trace('method called')
    return original.apply(this, args)
  }
}
```

---

## 风险与缓解

### 风险 1：删除看似无用但实际被动态调用的代码

**场景：** IPC 通道通过字符串名称调用，静态分析无法发现

**缓解：**
- 检查 `electron/preload/index.ts` 中的暴露方法
- 检查 `electron/main/ipc/handlers/` 中的注册处理器
- 保留所有 preload 暴露的方法

### 风险 2：类型变更导致隐式错误

**场景：** 修改类型定义，TypeScript 编译通过但运行时错误

**缓解：**
- 类型变更后运行完整测试
- 手动验证相关功能
- 保持向后兼容的类型扩展

### 风险 3：Store 响应式断裂

**场景：** Store 结构变更导致组件响应式失效

**缓解：**
- 不要修改 Store 的状态结构
- 仅移除未使用的 Store 方法
- 验证所有使用 Store 的组件

---

## 检查清单

### 每个文件优化前

- [ ] 确认文件是否被 import
- [ ] 确认导出的函数/类型是否被使用
- [ ] 确认是否有动态访问（如 `obj[key]`）

### 每个函数移除前

- [ ] 全局搜索函数名
- [ ] 检查是否被 preload 暴露
- [ ] 检查是否被 Store 调用
- [ ] 检查是否被其他层直接调用

### 每个类型移除前

- [ ] 全局搜索类型名
- [ ] 检查是否在 index.ts 中 re-export
- [ ] 检查是否被外部包引用

---

## Sources

- 现有代码分析：`src/` 目录结构
- 架构文档：`.planning/codebase/ARCHITECTURE.md`
- 技术债务：`.planning/codebase/CONCERNS.md`
- 陷阱指南：`.planning/research/PITFALLS.md`

---

*Architecture research for: v7.0 代码结构优化*
*Researched: 2026-05-04*
