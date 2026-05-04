/**
 * 收藏功能仓储
 * 管理收藏夹和收藏项的持久化存储
 *
 * 使用专用 IPC 通道进行目标 SQL 操作，不再读取/写入完整收藏数据 blob
 */

import type { IpcResponse } from '@/shared/types/ipc'
import type { Collection, FavoriteItem, FavoritesErrorCode, PaginationParams, PaginatedFavoritesResult } from '@/types'
import { electronClient } from '@/clients'
import { FavoritesErrorCodes } from '@/types'

/** 创建错误响应 */
function createError<T>(code: FavoritesErrorCode, message: string): IpcResponse<T> {
  return {
    success: false,
    error: { code, message },
  }
}

/**
 * 收藏功能仓储
 */
export const favoritesRepository = {
  // ==================== 收藏夹操作 ====================

  /**
   * 获取所有收藏夹
   */
  async getCollections(): Promise<IpcResponse<Collection[]>> {
    const result = await electronClient.favoritesGetCollections()
    if (result.success) {
      return { success: true, data: result.data ?? [] }
    }
    return {
      success: false,
      data: [],
      error: result.error ?? {
        code: FavoritesErrorCodes.STORAGE_ERROR,
        message: '读取收藏夹列表失败',
      },
    }
  },

  /**
   * 创建收藏夹
   */
  async createCollection(name: string): Promise<IpcResponse<Collection>> {
    const result = await electronClient.favoritesCreateCollection(name)
    if (result.success) return result

    // Map IPC error codes to FavoritesErrorCodes for backward compatibility
    if (result.error?.code === 'COLLECTION_NAME_EXISTS') {
      return createError(FavoritesErrorCodes.COLLECTION_NAME_EXISTS, '收藏夹名称已存在')
    }
    return createError(FavoritesErrorCodes.STORAGE_ERROR, result.error?.message || '创建收藏夹失败')
  },

  /**
   * 重命名收藏夹
   */
  async renameCollection(id: string, name: string): Promise<IpcResponse<Collection>> {
    const result = await electronClient.favoritesRenameCollection(id, name)
    if (result.success) return result

    if (result.error?.code === 'COLLECTION_NOT_FOUND') {
      return createError(FavoritesErrorCodes.COLLECTION_NOT_FOUND, '收藏夹不存在')
    }
    if (result.error?.code === 'COLLECTION_NAME_EXISTS') {
      return createError(FavoritesErrorCodes.COLLECTION_NAME_EXISTS, '收藏夹名称已存在')
    }
    return createError(
      FavoritesErrorCodes.STORAGE_ERROR,
      result.error?.message || '重命名收藏夹失败',
    )
  },

  /**
   * 删除收藏夹
   */
  async deleteCollection(id: string): Promise<IpcResponse<void>> {
    const result = await electronClient.favoritesDeleteCollection(id)
    if (result.success) return result

    if (result.error?.code === 'COLLECTION_NOT_FOUND') {
      return createError(FavoritesErrorCodes.COLLECTION_NOT_FOUND, '收藏夹不存在')
    }
    if (result.error?.code === 'COLLECTION_IS_DEFAULT') {
      return createError(FavoritesErrorCodes.COLLECTION_IS_DEFAULT, '无法删除默认收藏夹')
    }
    return createError(FavoritesErrorCodes.STORAGE_ERROR, result.error?.message || '删除收藏夹失败')
  },

  /**
   * 设置默认收藏夹
   * @param id - 要设为默认的收藏夹 ID
   */
  async setDefaultCollection(id: string): Promise<IpcResponse<Collection>> {
    const result = await electronClient.favoritesSetDefaultCollection(id)
    if (result.success) return result

    if (result.error?.code === 'COLLECTION_NOT_FOUND') {
      return createError(FavoritesErrorCodes.COLLECTION_NOT_FOUND, '收藏夹不存在')
    }
    return createError(
      FavoritesErrorCodes.STORAGE_ERROR,
      result.error?.message || '设置默认收藏夹失败',
    )
  },

  // ==================== 收藏项操作 ====================

  /**
   * 获取收藏项
   * @param collectionId 可选，指定收藏夹 ID 则只返回该收藏夹的收藏项
   */
  async getFavorites(collectionId?: string): Promise<IpcResponse<FavoriteItem[]>> {
    const result = await electronClient.favoritesGetByCollection(collectionId)
    if (result.success) {
      return { success: true, data: result.data ?? [] }
    }
    return {
      success: false,
      data: [],
      error: result.error ?? { code: FavoritesErrorCodes.STORAGE_ERROR, message: '读取收藏项失败' },
    }
  },

  /**
   * 添加收藏项
   */
  async addFavorite(item: FavoriteItem): Promise<IpcResponse<FavoriteItem>> {
    console.log('[FavoritesRepository] addFavorite called with item:', item)
    const result = await electronClient.favoritesAdd(
      item.wallpaperId,
      item.collectionId,
      item.wallpaperData,
    )
    console.log('[FavoritesRepository] electronClient.favoritesAdd result:', result)
    if (result.success) return result

    if (result.error?.code === 'COLLECTION_NOT_FOUND') {
      return createError(FavoritesErrorCodes.COLLECTION_NOT_FOUND, '收藏夹不存在')
    }
    if (result.error?.code === 'FAVORITE_ALREADY_EXISTS') {
      return createError(FavoritesErrorCodes.FAVORITE_ALREADY_EXISTS, '该壁纸已在此收藏夹中')
    }
    return createError(FavoritesErrorCodes.STORAGE_ERROR, result.error?.message || '添加收藏失败')
  },

  /**
   * 移除收藏项
   */
  async removeFavorite(wallpaperId: string, collectionId: string): Promise<IpcResponse<void>> {
    const result = await electronClient.favoritesRemove(wallpaperId, collectionId)
    if (result.success) return result

    if (result.error?.code === 'FAVORITE_NOT_FOUND') {
      return createError(FavoritesErrorCodes.FAVORITE_NOT_FOUND, '收藏项不存在')
    }
    return createError(FavoritesErrorCodes.STORAGE_ERROR, result.error?.message || '移除收藏失败')
  },

  /**
   * 移动收藏项到其他收藏夹
   */
  async moveFavorite(
    wallpaperId: string,
    fromCollectionId: string,
    toCollectionId: string,
  ): Promise<IpcResponse<FavoriteItem>> {
    const result = await electronClient.favoritesMove(wallpaperId, fromCollectionId, toCollectionId)
    if (result.success) return result

    if (result.error?.code === 'COLLECTION_NOT_FOUND') {
      return createError(FavoritesErrorCodes.COLLECTION_NOT_FOUND, '目标收藏夹不存在')
    }
    if (result.error?.code === 'FAVORITE_NOT_FOUND') {
      return createError(FavoritesErrorCodes.FAVORITE_NOT_FOUND, '收藏项不存在')
    }
    if (result.error?.code === 'FAVORITE_ALREADY_EXISTS') {
      return createError(FavoritesErrorCodes.FAVORITE_ALREADY_EXISTS, '该壁纸已在目标收藏夹中')
    }
    return createError(FavoritesErrorCodes.STORAGE_ERROR, result.error?.message || '移动收藏失败')
  },

  // ==================== 查询方法 ====================

  /**
   * 检查壁纸是否已收藏
   * 使用 SQL 索引查询（SELECT 1 ... LIMIT 1），而非加载完整 blob
   */
  async isFavorite(wallpaperId: string): Promise<IpcResponse<boolean>> {
    const result = await electronClient.favoritesIsFavorite(wallpaperId)
    if (result.success) {
      return { success: true, data: result.data }
    }
    return {
      success: false,
      data: false,
      error: result.error ?? {
        code: FavoritesErrorCodes.STORAGE_ERROR,
        message: '检查收藏状态失败',
      },
    }
  },

  /**
   * 获取壁纸所属的收藏夹列表
   */
  async getCollectionsForWallpaper(wallpaperId: string): Promise<IpcResponse<Collection[]>> {
    const result = await electronClient.favoritesGetCollectionsForWallpaper(wallpaperId)
    if (result.success) {
      return { success: true, data: result.data ?? [] }
    }
    return {
      success: false,
      data: [],
      error: result.error ?? {
        code: FavoritesErrorCodes.STORAGE_ERROR,
        message: '获取壁纸收藏夹失败',
      },
    }
  },

  // ==================== 分页查询方法 ====================

  /**
   * 分页获取收藏项
   * @param params 分页参数（limit, offset）+ 可选 collectionId
   */
  async getFavoritesPaginated(
    params: PaginationParams & { collectionId?: string },
  ): Promise<IpcResponse<PaginatedFavoritesResult>> {
    const result = await electronClient.favoritesGetPaginated(params)
    if (result.success) {
      return result
    }
    return {
      success: false,
      data: { items: [], total: 0, hasMore: false },
      error: result.error ?? {
        code: FavoritesErrorCodes.STORAGE_ERROR,
        message: '分页获取收藏失败',
      },
    }
  },

  /**
   * 获取所有收藏夹计数
   * @returns { _total: 全部收藏去重计数, [collectionId]: 各收藏夹计数 }
   */
  async getCounts(): Promise<IpcResponse<Record<string, number>>> {
    const result = await electronClient.favoritesGetCounts()
    if (result.success) {
      return result
    }
    return {
      success: false,
      data: { _total: 0 },
      error: result.error ?? {
        code: FavoritesErrorCodes.STORAGE_ERROR,
        message: '获取收藏计数失败',
      },
    }
  },

  /**
   * 批量获取收藏状态映射
   * @param wallpaperIds 壁纸 ID 列表
   * @returns 状态映射 (0=未收藏, 1=默认收藏夹, 2=其他收藏夹)
   */
  async getFavoriteStatusMap(
    wallpaperIds: string[],
  ): Promise<IpcResponse<Record<string, 0 | 1 | 2>>> {
    const result = await electronClient.favoritesGetStatusMap(wallpaperIds)
    if (result.success) {
      return result
    }
    return {
      success: false,
      data: {},
      error: result.error ?? {
        code: FavoritesErrorCodes.STORAGE_ERROR,
        message: '获取收藏状态失败',
      },
    }
  },
}
