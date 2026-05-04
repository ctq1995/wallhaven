/**
 * 壁纸相关类型定义
 * Phase 46: 从 src/types/index.ts 迁移
 */

// ==================== 壁纸相关类型 ====================

/**
 * 壁纸缩略图信息
 */
export interface WallpaperThumb {
  large: string
  original: string
  small: string
}

/**
 * 壁纸查询参数
 */
export interface WallpaperQuery {
  id?: number
  tag?: string
}

/**
 * 壁纸元数据
 */
export interface WallpaperMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
  query?: string | WallpaperQuery
  seed?: string | null
}

/**
 * 壁纸项目信息
 */
export interface WallpaperItem {
  id: string
  url: string
  short_url: string
  views: number
  favorites: number
  source: string
  purity: 'sfw' | 'sketchy' | 'nsfw'
  category: 'general' | 'anime' | 'people'
  dimension_x: number
  dimension_y: number
  resolution: string
  ratio: string
  file_size: number
  file_type: string
  created_at: string
  colors: string[]
  path: string
  thumbs: WallpaperThumb
  /**
   * 收藏状态（由 Service 层后处理添加）
   * - 0: 未收藏
   * - 1: 收藏到默认收藏夹
   * - 2: 收藏到其他收藏夹（非默认）
   * 与 HeartState 对应：0 → 'none', 1 → 'default', 2 → 'non-default'
   */
  is_favorite?: 0 | 1 | 2
}

// ==================== 页面数据相关类型 ====================

/**
 * 页面数据结构
 */
export interface PageData {
  totalPage: number
  currentPage: number
  data: WallpaperItem[]
}

/**
 * 全部页面数据结构（保留用于无限滚动）
 */
export interface TotalPageData {
  totalPage: number
  currentPage: number
  sections: PageData[]
}

/**
 * 在线壁纸页面缓存结构
 * key: 页码 (1-based)
 * value: 该页的壁纸数据
 */
export type PageCache = Map<number, PageData>
