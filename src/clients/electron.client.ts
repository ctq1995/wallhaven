/**
 * Electron IPC 客户端
 * 封装所有 window.electronAPI 方法，统一返回 IpcResponse<T> 格式
 */

import type {
  IpcResponse,
  DownloadProgressData,
  LocalFile,
  CacheInfo,
  ResumeDownloadParams,
  PendingDownload,
  FavoritesGetPaginatedRequest,
  FavoritesCountsResponse,
} from '@/shared/types/ipc'
import { ErrorCodes } from '@/errors'

import type {
  Collection,
  FavoriteItem,
  WallpaperItem,
  PaginationParams,
  PaginatedFavoritesResult,
} from '@/types'

/**
 * ElectronClient 实现类
 */
class ElectronClientImpl {
  // ==================== 私有辅助方法 ====================

  /**
   * 检查 Electron API 是否可用
   */
  private isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse<T>(code: string, message: string): IpcResponse<T> {
    return {
      success: false,
      error: { code, message },
    }
  }

  /**
   * 创建 Electron 不可用错误响应
   */
  private createUnavailableResponse<T>(): IpcResponse<T> {
    return this.createErrorResponse<T>('ELECTRON_UNAVAILABLE', 'Electron API is not available')
  }

  // ==================== Store 操作 ====================

  /**
   * 从 electron-store 获取数据
   */
  async storeGet<T>(key: string): Promise<IpcResponse<T | null>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<T | null>()
    }

    try {
      const result = await window.electronAPI.storeGet(key)
      if (result.success) {
        return { success: true, data: result.value as T }
      }
      return {
        success: false,
        data: null,
        error: {
          code: ErrorCodes.STORE_READ_ERROR,
          message: result.error || 'Store get failed',
        },
      }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: { code: ErrorCodes.STORE_ERROR, message: String(error) },
      }
    }
  }

  /**
   * 向 electron-store 保存数据
   */
  async storeSet(key: string, value: unknown): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      // 深度克隆对象，移除 Vue reactive proxy，避免 IPC 克隆错误
      const plainValue = JSON.parse(JSON.stringify(value))
      const result = await window.electronAPI.storeSet({ key, value: plainValue })
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: {
          code: ErrorCodes.STORE_WRITE_ERROR,
          message: result.error || 'Store set failed',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: ErrorCodes.STORE_ERROR, message: String(error) },
      }
    }
  }

  /**
   * 从 electron-store 删除数据
   */
  async storeDelete(key: string): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.storeDelete(key)
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: {
          code: ErrorCodes.STORE_DELETE_ERROR,
          message: result.error || 'Store delete failed',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: ErrorCodes.STORE_ERROR, message: String(error) },
      }
    }
  }

  /**
   * 清空 electron-store 所有数据
   */
  async storeClear(): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.storeClear()
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: { code: ErrorCodes.STORE_ERROR, message: result.error || 'Store clear failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: ErrorCodes.STORE_ERROR, message: String(error) },
      }
    }
  }

  // ==================== Favorites & Collections ====================

  /**
   * 获取所有收藏夹
   */
  async favoritesGetCollections(): Promise<IpcResponse<Collection[]>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<Collection[]>()
    }

    try {
      const result = await window.electronAPI.favoritesGetCollections()
      if (result.success) {
        return { success: true, data: result.data as Collection[] }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '收藏夹不存在' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 创建收藏夹
   */
  async favoritesCreateCollection(name: string): Promise<IpcResponse<Collection>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<Collection>()
    }

    try {
      const result = await window.electronAPI.favoritesCreateCollection({ name })
      if (result.success) {
        return { success: true, data: result.data as Collection }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '创建收藏夹失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 重命名收藏夹
   */
  async favoritesRenameCollection(id: string, name: string): Promise<IpcResponse<Collection>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<Collection>()
    }

    try {
      const result = await window.electronAPI.favoritesRenameCollection({ id, name })
      if (result.success) {
        return { success: true, data: result.data as Collection }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '重命名收藏夹失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 删除收藏夹
   */
  async favoritesDeleteCollection(id: string): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.favoritesDeleteCollection({ id })
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '删除收藏夹失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 设置默认收藏夹
   */
  async favoritesSetDefaultCollection(id: string): Promise<IpcResponse<Collection>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<Collection>()
    }

    try {
      const result = await window.electronAPI.favoritesSetDefaultCollection({ id })
      if (result.success) {
        return { success: true, data: result.data as Collection }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '设置默认收藏夹失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 获取收藏夹中的收藏项
   */
  async favoritesGetByCollection(collectionId?: string): Promise<IpcResponse<FavoriteItem[]>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<FavoriteItem[]>()
    }

    try {
      const result = await window.electronAPI.favoritesGetByCollection({ collectionId })
      if (result.success) {
        return { success: true, data: result.data as FavoriteItem[] }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '获取收藏项失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 添加收藏项
   */
  async favoritesAdd(
    wallpaperId: string,
    collectionId: string,
    wallpaperData: WallpaperItem,
  ): Promise<IpcResponse<FavoriteItem>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<FavoriteItem>()
    }

    try {
      // 将 Proxy 对象转换为纯 JSON 对象，避免 IPC 序列化错误
      const plainWallpaperData = JSON.parse(JSON.stringify(wallpaperData))
      const result = await window.electronAPI.favoritesAdd({
        wallpaperId,
        collectionId,
        wallpaperData: plainWallpaperData,
      })
      if (result.success) {
        return { success: true, data: result.data as FavoriteItem }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '添加收藏失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 移除收藏项
   */
  async favoritesRemove(wallpaperId: string, collectionId: string): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.favoritesRemove({ wallpaperId, collectionId })
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '移除收藏失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 移动收藏项到其他收藏夹
   */
  async favoritesMove(
    wallpaperId: string,
    fromCollectionId: string,
    toCollectionId: string,
  ): Promise<IpcResponse<FavoriteItem>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<FavoriteItem>()
    }

    try {
      const result = await window.electronAPI.favoritesMove({
        wallpaperId,
        fromCollectionId,
        toCollectionId,
      })
      if (result.success) {
        return { success: true, data: result.data as FavoriteItem }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '移动收藏失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 检查壁纸是否已收藏
   */
  async favoritesIsFavorite(wallpaperId: string): Promise<IpcResponse<boolean>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<boolean>()
    }

    try {
      const result = await window.electronAPI.favoritesIsFavorite({ wallpaperId })
      if (result.success) {
        return { success: true, data: result.data as boolean }
      }
      return {
        success: false,
        data: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '检查收藏状态失败' },
      }
    } catch (error) {
      return {
        success: false,
        data: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 获取壁纸所属的收藏夹列表
   */
  async favoritesGetCollectionsForWallpaper(
    wallpaperId: string,
  ): Promise<IpcResponse<Collection[]>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<Collection[]>()
    }

    try {
      const result = await window.electronAPI.favoritesGetCollectionsForWallpaper({ wallpaperId })
      if (result.success) {
        return { success: true, data: result.data as Collection[] }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '获取壁纸收藏夹失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 分页获取收藏项
   */
  async favoritesGetPaginated(
    params: PaginationParams & { collectionId?: string },
  ): Promise<IpcResponse<PaginatedFavoritesResult>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<PaginatedFavoritesResult>()
    }

    try {
      const result = await window.electronAPI.favoritesGetPaginated(params)
      if (result.success) {
        return { success: true, data: result.data as PaginatedFavoritesResult }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '分页获取收藏失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 获取所有收藏夹计数
   */
  async favoritesGetCounts(): Promise<IpcResponse<Record<string, number>>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<Record<string, number>>()
    }

    try {
      const result = await window.electronAPI.favoritesGetCounts()
      if (result.success) {
        return { success: true, data: result.data as Record<string, number> }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '获取收藏计数失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 批量获取收藏状态映射
   */
  async favoritesGetStatusMap(
    wallpaperIds: string[],
  ): Promise<IpcResponse<Record<string, 0 | 1 | 2>>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<Record<string, 0 | 1 | 2>>()
    }

    try {
      const result = await window.electronAPI.favoritesGetStatusMap({ wallpaperIds })
      if (result.success) {
        return { success: true, data: result.data as Record<string, 0 | 1 | 2> }
      }
      return {
        success: false,
        error: result.error || { code: 'FAVORITES_ERROR', message: '获取收藏状态失败' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'FAVORITES_ERROR', message: String(error) },
      }
    }
  }

  // ==================== 文件操作 ====================

  /**
   * 选择文件夹
   */
  async selectFolder(): Promise<IpcResponse<string | null>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<string | null>()
    }

    try {
      const path = await window.electronAPI.selectFolder()
      return { success: true, data: path }
    } catch (error) {
      return {
        success: false,
        data: null,
        error: { code: 'SELECT_FOLDER_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 读取目录
   */
  async readDirectory(dirPath: string): Promise<IpcResponse<LocalFile[]>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<LocalFile[]>()
    }

    try {
      const result = await window.electronAPI.readDirectory(dirPath)
      if (result.error) {
        return {
          success: false,
          data: [],
          error: { code: 'READ_DIRECTORY_ERROR', message: result.error },
        }
      }
      return { success: true, data: result.files as LocalFile[] }
    } catch (error) {
      return {
        success: false,
        data: [],
        error: { code: 'READ_DIRECTORY_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 打开文件夹
   */
  async openFolder(folderPath: string): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.openFolder(folderPath)
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: { code: 'OPEN_FOLDER_ERROR', message: result.error || 'Open folder failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'OPEN_FOLDER_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 删除文件
   */
  async deleteFile(filePath: string): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.deleteFile(filePath)
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: { code: 'DELETE_FILE_ERROR', message: result.error || 'Delete file failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'DELETE_FILE_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath: string): Promise<IpcResponse<boolean>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<boolean>()
    }

    try {
      const result = await window.electronAPI.checkFileExists(filePath)
      if (result.success) {
        return { success: true, data: result.exists }
      }
      return {
        success: false,
        data: false,
        error: {
          code: 'FILE_EXISTS_ERROR',
          message: result.error || 'File existence check failed',
        },
      }
    } catch (error) {
      return {
        success: false,
        data: false,
        error: { code: 'FILE_EXISTS_ERROR', message: String(error) },
      }
    }
  }

  // ==================== 下载管理 ====================

  /**
   * 下载壁纸（同步模式）
   */
  async downloadWallpaper(params: {
    url: string
    filename: string
    saveDir: string
  }): Promise<IpcResponse<string>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<string>()
    }

    try {
      const result = await window.electronAPI.downloadWallpaper(params)
      if (result.success && result.filePath) {
        return { success: true, data: result.filePath }
      }
      return {
        success: false,
        error: { code: 'DOWNLOAD_ERROR', message: result.error || 'Download failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'DOWNLOAD_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 开始下载任务（带进度）
   */
  async startDownloadTask(params: {
    taskId: string
    url: string
    filename: string
    saveDir: string
  }): Promise<IpcResponse<string>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<string>()
    }

    try {
      const result = await window.electronAPI.startDownloadTask(params)
      if (result.success && result.taskId) {
        return { success: true, data: result.taskId }
      }
      return {
        success: false,
        error: { code: 'DOWNLOAD_ERROR', message: result.error || 'Download task failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'DOWNLOAD_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 暂停下载任务
   */
  async pauseDownloadTask(taskId: string): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.pauseDownloadTask(taskId)
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: { code: 'DOWNLOAD_PAUSE_ERROR', message: result.error || 'Pause download failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'DOWNLOAD_PAUSE_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 取消下载任务
   */
  async cancelDownloadTask(taskId: string): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.cancelDownloadTask(taskId)
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: { code: 'DOWNLOAD_CANCEL_ERROR', message: result.error || 'Cancel download failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'DOWNLOAD_CANCEL_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 恢复下载任务
   */
  async resumeDownloadTask(params: ResumeDownloadParams): Promise<IpcResponse<string>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<string>()
    }

    try {
      const result = await window.electronAPI.resumeDownloadTask(params)
      if (result.success && result.data) {
        return { success: true, data: result.data }
      }
      return {
        success: false,
        error: {
          code: result.error?.code || 'DOWNLOAD_RESUME_ERROR',
          message: result.error?.message || 'Resume download failed',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'DOWNLOAD_RESUME_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 获取待恢复的下载任务列表
   */
  async getPendingDownloads(): Promise<IpcResponse<PendingDownload[]>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<PendingDownload[]>()
    }

    try {
      const result = await window.electronAPI.getPendingDownloads()
      if (result.success) {
        return { success: true, data: result.data || [] }
      }
      return {
        success: false,
        data: [],
        error: {
          code: result.error?.code || 'GET_PENDING_DOWNLOADS_ERROR',
          message: result.error?.message || 'Get pending downloads failed',
        },
      }
    } catch (error) {
      return {
        success: false,
        data: [],
        error: { code: 'GET_PENDING_DOWNLOADS_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 监听下载进度
   */
  onDownloadProgress(callback: (data: DownloadProgressData) => void): void {
    if (this.isAvailable()) {
      window.electronAPI.onDownloadProgress(callback as (data: unknown) => void)
    }
  }

  /**
   * 移除下载进度监听器
   */
  removeDownloadProgressListener(callback: (data: DownloadProgressData) => void): void {
    if (this.isAvailable()) {
      window.electronAPI.removeDownloadProgressListener(callback as (data: unknown) => void)
    }
  }

  // ==================== 壁纸设置 ====================

  /**
   * 设置壁纸
   */
  async setWallpaper(imagePath: string): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      const result = await window.electronAPI.setWallpaper(imagePath)
      if (result.success) {
        return { success: true }
      }
      return {
        success: false,
        error: {
          code: 'SET_WALLPAPER_ERROR',
          message: result.error || 'Set wallpaper failed',
        },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'SET_WALLPAPER_ERROR', message: String(error) },
      }
    }
  }

  // ==================== API 代理 ====================

  /**
   * Wallhaven API 代理请求
   */
  async wallhavenApiRequest<T = unknown>(params: {
    endpoint: string
    params?: Record<string, unknown>
    apiKey?: string
  }): Promise<IpcResponse<T>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<T>()
    }

    try {
      const result = await window.electronAPI.wallhavenApiRequest(params)
      if (result.success && result.data !== null) {
        return { success: true, data: result.data as T }
      }
      return {
        success: false,
        error: { code: 'API_ERROR', message: result.error || 'API request failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'API_ERROR', message: String(error) },
      }
    }
  }

  // ==================== 窗口控制 ====================

  /**
   * 最小化窗口
   */
  async minimizeWindow(): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      await window.electronAPI.minimizeWindow()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: { code: 'WINDOW_CONTROL_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 最大化窗口
   */
  async maximizeWindow(): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      await window.electronAPI.maximizeWindow()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: { code: 'WINDOW_CONTROL_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 关闭窗口
   */
  async closeWindow(): Promise<IpcResponse<void>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<void>()
    }

    try {
      await window.electronAPI.closeWindow()
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: { code: 'WINDOW_CONTROL_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 检查窗口是否最大化
   */
  async isMaximized(): Promise<IpcResponse<boolean>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<boolean>()
    }

    try {
      const maximized = await window.electronAPI.isMaximized()
      return { success: true, data: maximized }
    } catch (error) {
      return {
        success: false,
        data: false,
        error: { code: 'WINDOW_CONTROL_ERROR', message: String(error) },
      }
    }
  }

  // ==================== 缓存管理 ====================

  /**
   * 清理应用缓存
   */
  async clearAppCache(downloadPath?: string): Promise<
    IpcResponse<{
      thumbnailsDeleted: number
      tempFilesDeleted: number
    }>
  > {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<{
        thumbnailsDeleted: number
        tempFilesDeleted: number
      }>()
    }

    try {
      const result = await window.electronAPI.clearAppCache(downloadPath)
      if (result.success) {
        return {
          success: true,
          data: {
            thumbnailsDeleted: result.thumbnailsDeleted,
            tempFilesDeleted: result.tempFilesDeleted,
          },
        }
      }
      return {
        success: false,
        error: { code: 'CACHE_ERROR', message: result.error || 'Clear cache failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'CACHE_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 获取缓存信息
   */
  async getCacheInfo(downloadPath?: string): Promise<IpcResponse<CacheInfo>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<CacheInfo>()
    }

    try {
      const result = await window.electronAPI.getCacheInfo(downloadPath)
      if (result.success) {
        return { success: true, data: result.info }
      }
      return {
        success: false,
        error: { code: 'CACHE_ERROR', message: result.error || 'Get cache info failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'CACHE_ERROR', message: String(error) },
      }
    }
  }

  /**
   * 清理孤儿临时文件
   * 删除超过 7 天的临时文件和状态文件
   */
  async cleanupOrphanFiles(
    downloadPath: string,
  ): Promise<IpcResponse<{ filesDeleted: number; stateFilesDeleted: number }>> {
    if (!this.isAvailable()) {
      return this.createUnavailableResponse<{ filesDeleted: number; stateFilesDeleted: number }>()
    }

    try {
      const result = await window.electronAPI.cleanupOrphanFiles(downloadPath)
      if (result.success) {
        return {
          success: true,
          data: {
            filesDeleted: result.filesDeleted,
            stateFilesDeleted: result.stateFilesDeleted,
          },
        }
      }
      return {
        success: false,
        error: { code: 'CLEANUP_ERROR', message: result.errors?.join('; ') || 'Cleanup failed' },
      }
    } catch (error) {
      return {
        success: false,
        error: { code: 'CLEANUP_ERROR', message: String(error) },
      }
    }
  }
}

export const electronClient = new ElectronClientImpl()
