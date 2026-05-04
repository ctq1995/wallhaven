import { defineStore } from 'pinia'
import { ref, reactive, shallowRef } from 'vue'
import type { TotalPageData, GetParams, CustomParams, AppSettings, WallpaperFit, PageData, PageCache } from '@/types'
import { settingsService } from '@/services'

/**
 * 创建默认设置
 */
function createDefaultSettings(): AppSettings {
  return {
    downloadPath: '',
    maxConcurrentDownloads: 3,
    apiKey: '',
    wallpaperFit: 'fill' as WallpaperFit,
  }
}

export const useWallpaperStore = defineStore('wallpaper', () => {
  // ==================== 状态 ====================

  /** 壁纸数据（使用 shallowRef 优化性能） */
  const totalPageData = shallowRef<TotalPageData>({
    totalPage: 0,
    currentPage: 0,
    sections: [],
  })

  /** 当前页数据（传统分页） */
  const currentPageData = shallowRef<PageData>({
    data: [],
    totalPage: 0,
    currentPage: 0,
  })

  /** 页面缓存（最多 5 页） */
  const pageCache = shallowRef<PageCache>(new Map())

  /** 总条目数 */
  const totalCount = ref<number>(0)

  /** 加载状态 */
  const loading = ref<boolean>(false)

  /** 错误状态 */
  const error = ref<boolean>(false)

  /** 当前查询参数 */
  const queryParams = ref<GetParams | null>(null)

  /** 已保存的自定义参数 */
  const savedParams = ref<CustomParams | null>(null)

  /** 应用设置 */
  const settings = reactive<AppSettings>(createDefaultSettings())

  // ==================== 方法（由 Composable 调用） ====================

  /**
   * 重置状态
   */
  function resetState(): void {
    totalPageData.value = { totalPage: 0, currentPage: 0, sections: [] }
    currentPageData.value = { data: [], totalPage: 0, currentPage: 0 }
    pageCache.value = new Map()
    totalCount.value = 0
    queryParams.value = null
    error.value = false
  }

  /**
   * 创建空的页面数据
   */
  function createEmptyPageData(): PageData {
    return { data: [], totalPage: 0, currentPage: 0 }
  }

  /**
   * 清空页面缓存
   */
  function clearPageCache(): void {
    pageCache.value = new Map()
  }

  /**
   * 获取缓存的页面数据
   */
  function getCachedPage(page: number): PageData | undefined {
    return pageCache.value.get(page)
  }

  /**
   * 设置页面缓存（FIFO 淘汰，上限 5 页）
   */
  function setCachedPage(page: number, data: PageData): void {
    const cache = pageCache.value
    // FIFO 淘汰：超过 5 页且不是更新现有页面时删除最旧的
    if (cache.size >= 5 && !cache.has(page)) {
      const firstKey = cache.keys().next().value
      if (firstKey !== undefined) {
        cache.delete(firstKey)
      }
    }
    cache.set(page, data)
    // 触发响应式更新
    pageCache.value = cache
  }

  /**
   * 从持久化存储加载应用设置
   */
  async function loadSettings(): Promise<void> {
    const result = await settingsService.get()
    if (result.success && result.data) {
      Object.assign(settings, result.data)
      console.log('[WallpaperStore] 已从存储加载设置')
    } else {
      // 加载失败时使用默认值
      Object.assign(settings, settingsService.getDefaults())
      console.warn('[WallpaperStore] 加载设置失败，使用默认值:', result.error)
    }
  }

  return {
    // 状态
    totalPageData,
    currentPageData,
    pageCache,
    totalCount,
    loading,
    error,
    queryParams,
    savedParams,
    settings,

    // 方法
    resetState,
    loadSettings,
    createEmptyPageData,
    clearPageCache,
    getCachedPage,
    setCachedPage,
  }
})
