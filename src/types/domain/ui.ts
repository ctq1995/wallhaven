/**
 * UI 辅助类型定义
 * Phase 53: 从 src/types/index.ts 迁移
 */

// ==================== UI 辅助类型 ====================

/**
 * 分辨率行数据
 */
export interface ResolutionLine {
  item: string[]
}

/**
 * 比例行数据
 */
export interface RatioLine {
  item: string[]
}

/**
 * 颜色行数据
 */
export interface ColorLine {
  item: string[]
}

/**
 * 壁纸操作信息（用于设置背景、下载等）
 */
export interface WallpaperActionInfo {
  id: string
  url: string
  size: number
  small: string
  resolution: string
}
