/**
 * 类型定义主入口
 * Phase 46: 重构为重导出入口
 *
 * 领域类型已迁移至 src/types/domain/ 目录
 */

// 从 domain 目录重导出
export * from './domain'

// ==================== 搜索参数相关类型 ====================

/**
 * 自定义搜索参数
 */
export interface CustomParams {
  selector: number
  keyword: string
  categories: string[]
  aiArt: boolean
  purity: string[]
  sorting: string
  desc: boolean
  topRange: string
  ratios: string[]
  respickerLimitation: string
  resolutions: string[]
  resolution: string
  respickerCustomWidth: string
  respickerCustomHeight: string
  color: string
}

/**
 * API 获取参数
 */
export interface GetParams {
  q?: string
  ai_art_filter?: number
  categories?: string
  purity?: string
  sorting?: string
  topRange?: string
  order?: string
  colors?: string | null
  ratios?: string | null
  atleast?: string | null
  resolutions?: string | null
  page: number
  seed?: string | null
}

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

// ==================== 组件 Props 类型 ====================

/**
 * SearchBar 组件 Props
 */
export interface SearchBarProps {
  customParams: CustomParams
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

// ==================== 壁纸操作信息类型 ====================

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
