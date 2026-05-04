/**
 * 应用设置相关类型定义
 * Phase 46: 从 src/types/index.ts 迁移
 */

// ==================== 应用设置类型 ====================

/**
 * 壁纸适配模式
 */
export type WallpaperFit = 'fill' | 'fit' | 'stretch' | 'tile' | 'center' | 'span'

/**
 * 应用设置接口
 */
export interface AppSettings {
  // 下载设置
  downloadPath: string
  maxConcurrentDownloads: number

  // API 设置
  apiKey: string

  // 桌面设置
  wallpaperFit: WallpaperFit
}
