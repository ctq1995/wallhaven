/**
 * 组件 Props 类型定义
 * Phase 53: 从 src/types/index.ts 迁移
 */

import type { PageData } from './wallpaper'

// ==================== 组件 Props 类型 ====================

/**
 * SearchBar 组件 Props
 */
export interface SearchBarProps {
  customParams: import('./api').CustomParams
  apiKey: string
  desktopInfo: string
  saving: boolean
}

/**
 * WallpaperList 组件 Props
 */
export interface WallpaperListProps {
  pageData: PageData
  loading: boolean
  error: boolean
}
