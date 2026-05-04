/**
 * API 搜索参数类型定义
 * Phase 53: 从 src/types/index.ts 迁移
 */

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
