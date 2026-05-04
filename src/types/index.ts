/**
 * 类型定义主入口
 * Phase 53: 重构为重导出入口
 *
 * 领域类型在 src/types/domain/ 目录
 * IPC 类型在 src/types/ipc.ts
 */

// 从 domain 目录重导出
export * from './domain'

// 从 ipc 文件重导出
export * from './ipc'
