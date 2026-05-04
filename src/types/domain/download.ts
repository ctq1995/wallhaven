/**
 * 下载相关类型定义
 * Phase 46: 从 src/types/index.ts 迁移
 */

// ==================== 下载任务相关类型 ====================

/**
 * 下载任务状态
 */
export type DownloadState =
  | 'downloading'
  | 'paused'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'retrying'

/**
 * 下载任务项
 */
export interface DownloadItem {
  id: string // 唯一标识符
  url: string
  filename: string // 文件名
  small: string
  resolution: string
  size: number
  offset: number
  progress: number
  speed: number
  state: DownloadState
  path?: string
  time?: string
  wallpaperId?: string // 关联的壁纸ID
  /** Current retry attempt (1-based, 1-3). Set when state='retrying' */
  retryCount?: number
  /** Backoff delay for current retry attempt in ms. From main process progress event */
  retryDelay?: number
  /** Date.now() timestamp when retrying state was entered. Used for countdown */
  retryStartedAt?: number
  /** Last error message from main process. Used for exhausted-retry display */
  error?: string
}

/**
 * 已完成下载项
 */
export interface FinishedDownloadItem extends DownloadItem {
  path: string
  time: string
}
