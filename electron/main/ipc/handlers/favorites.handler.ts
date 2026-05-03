/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Favorites & Collections IPC Handlers
 *
 * 11 dedicated IPC channels for favorites and collections operations on SQLite.
 * Replaces the generic store-get/store-set IPC path for favorites data.
 */

import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import { getDatabase, withTransaction } from '../../database'
import { logHandler } from './base'

export function registerFavoritesHandlers(): void {
  // ===========================================================================
  // Collections
  // ===========================================================================

  /**
   * Get all collections, ordered by sort_order then creation time.
   * If no collections exist, auto-creates a default collection (D-07).
   */
  ipcMain.handle('favorites-get-collections', () => {
    try {
      const db = getDatabase()
      const rows = db
        .prepare<any[]>(
          `SELECT id, name, is_default, sort_order, created_at, updated_at
           FROM collections
           ORDER BY sort_order ASC, created_at ASC`,
        )
        .all()

      // Auto-create default collection when collections table is empty (D-07)
      if (rows.length === 0) {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        db.prepare(
          'INSERT INTO collections (id, name, is_default, sort_order, created_at, updated_at) VALUES (?, ?, 1, 0, ?, ?)',
        ).run(id, '收藏', now, now)

        return {
          success: true,
          data: [
            {
              id,
              name: '收藏',
              isDefault: true,
              sortOrder: 0,
              createdAt: now,
              updatedAt: now,
            },
          ],
        }
      }

      const mappedCollections = rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        isDefault: row.is_default === 1,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
      return { success: true, data: mappedCollections }
    } catch (error: any) {
      logHandler('favorites-get-collections', `Error: ${error.message}`, 'error')
      return {
        success: false,
        error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
      }
    }
  })

  /**
   * Create a new collection with the given name.
   * Validates name uniqueness before insert.
   */
  ipcMain.handle(
    'favorites-create-collection',
    (_event, params: { name: string }) => {
      try {
        const db = getDatabase()
        const { name } = params

        // Check name not already taken
        const existing = db
          .prepare<{ exists: number }>('SELECT 1 as "exists" FROM collections WHERE name = ? LIMIT 1')
          .get(name)
        if (existing) {
          return {
            success: false,
            error: { code: 'COLLECTION_NAME_EXISTS', message: '收藏夹名称已存在' },
          }
        }

        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        db.prepare(
          'INSERT INTO collections (id, name, is_default, sort_order, created_at, updated_at) VALUES (?, ?, 0, 0, ?, ?)',
        ).run(id, name, now, now)

        return {
          success: true,
          data: {
            id,
            name,
            isDefault: false,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          },
        }
      } catch (error: any) {
        logHandler('favorites-create-collection', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  /**
   * Rename a collection.
   * Validates collection exists and new name is not taken by another collection.
   */
  ipcMain.handle(
    'favorites-rename-collection',
    (_event, params: { id: string; name: string }) => {
      try {
        const db = getDatabase()
        const { id, name } = params

        // Check collection exists
        const collection = db
          .prepare<{ id: string }>('SELECT id FROM collections WHERE id = ? LIMIT 1')
          .get(id)
        if (!collection) {
          return {
            success: false,
            error: { code: 'COLLECTION_NOT_FOUND', message: '收藏夹不存在' },
          }
        }

        // Check new name not taken by another collection
        const nameExists = db
          .prepare<{ exists: number }>(
            'SELECT 1 as "exists" FROM collections WHERE name = ? AND id != ? LIMIT 1',
          )
          .get(name, id)
        if (nameExists) {
          return {
            success: false,
            error: { code: 'COLLECTION_NAME_EXISTS', message: '收藏夹名称已存在' },
          }
        }

        const now = new Date().toISOString()
        db.prepare('UPDATE collections SET name = ?, updated_at = ? WHERE id = ?').run(
          name,
          now,
          id,
        )

        // Read back full row after update
        const updated = db
          .prepare<any>('SELECT * FROM collections WHERE id = ?')
          .get(id)
        return {
          success: true,
          data: {
            id: updated.id,
            name: updated.name,
            isDefault: updated.is_default === 1,
            sortOrder: updated.sort_order,
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
          },
        }
      } catch (error: any) {
        logHandler('favorites-rename-collection', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  /**
   * Delete a collection and all its favorites via CASCADE.
   * Rejects deletion of the default collection.
   */
  ipcMain.handle(
    'favorites-delete-collection',
    (_event, params: { id: string }) => {
      try {
        const db = getDatabase()
        const { id } = params

        // Check collection exists and is not default
        const row = db
          .prepare<{ is_default: number }>(
            'SELECT is_default FROM collections WHERE id = ? LIMIT 1',
          )
          .get(id)
        if (!row) {
          return {
            success: false,
            error: { code: 'COLLECTION_NOT_FOUND', message: '收藏夹不存在' },
          }
        }
        if (row.is_default === 1) {
          return {
            success: false,
            error: {
              code: 'COLLECTION_IS_DEFAULT',
              message: '无法删除默认收藏夹',
            },
          }
        }

        // CASCADE will delete related favorites rows
        db.prepare('DELETE FROM collections WHERE id = ?').run(id)
        return { success: true }
      } catch (error: any) {
        logHandler('favorites-delete-collection', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  /**
   * Set a collection as the default collection.
   * Uses withTransaction to atomically unset the old default and set the new one.
   */
  ipcMain.handle(
    'favorites-set-default-collection',
    (_event, params: { id: string }) => {
      try {
        const db = getDatabase()
        const { id } = params

        // Check collection exists
        const row = db
          .prepare<{ id: string }>('SELECT id FROM collections WHERE id = ? LIMIT 1')
          .get(id)
        if (!row) {
          return {
            success: false,
            error: { code: 'COLLECTION_NOT_FOUND', message: '收藏夹不存在' },
          }
        }

        const now = new Date().toISOString()
        withTransaction(() => {
          db.prepare(
            'UPDATE collections SET is_default = 0, updated_at = ? WHERE is_default = 1',
          ).run(now)
          db.prepare(
            'UPDATE collections SET is_default = 1, updated_at = ? WHERE id = ?',
          ).run(now, id)
        })

        // Read back updated collection
        const updated = db
          .prepare<any>('SELECT * FROM collections WHERE id = ?')
          .get(id)
        return {
          success: true,
          data: {
            id: updated.id,
            name: updated.name,
            isDefault: true,
            sortOrder: updated.sort_order,
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
          },
        }
      } catch (error: any) {
        logHandler('favorites-set-default-collection', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  // ===========================================================================
  // Favorites
  // ===========================================================================

  /**
   * Get favorites, optionally filtered by collection ID.
   * Returns all favorites if no collectionId provided.
   */
  ipcMain.handle(
    'favorites-get-by-collection',
    (_event, params: { collectionId?: string }) => {
      try {
        const db = getDatabase()
        const { collectionId } = params

        let rows: any[]
        if (collectionId) {
          rows = db
            .prepare<any[]>(
              'SELECT collection_id, wallpaper_id, wallpaper_data, added_at FROM favorites WHERE collection_id = ? ORDER BY added_at DESC',
            )
            .all(collectionId)
        } else {
          rows = db
            .prepare<any[]>(
              'SELECT collection_id, wallpaper_id, wallpaper_data, added_at FROM favorites ORDER BY added_at DESC',
            )
            .all()
        }

        const mappedFavorites = rows.map((row: any) => ({
          collectionId: row.collection_id,
          wallpaperId: row.wallpaper_id,
          wallpaperData: JSON.parse(row.wallpaper_data),
          addedAt: row.added_at,
        }))
        return { success: true, data: mappedFavorites }
      } catch (error: any) {
        logHandler('favorites-get-by-collection', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  /**
   * Add a wallpaper to a collection.
   * Validates collection exists and prevents duplicate entries.
   */
  ipcMain.handle(
    'favorites-add',
    (
      _event,
      params: {
        wallpaperId: string
        collectionId: string
        wallpaperData: any
      },
    ) => {
      try {
        const db = getDatabase()
        const { wallpaperId, collectionId, wallpaperData } = params

        // Check collection exists
        const collection = db
          .prepare<{ id: string }>('SELECT 1 as id FROM collections WHERE id = ? LIMIT 1')
          .get(collectionId)
        if (!collection) {
          return {
            success: false,
            error: { code: 'COLLECTION_NOT_FOUND', message: '收藏夹不存在' },
          }
        }

        // Check not already in collection
        const existing = db
          .prepare<{ exists: number }>(
            'SELECT 1 as "exists" FROM favorites WHERE collection_id = ? AND wallpaper_id = ? LIMIT 1',
          )
          .get(collectionId, wallpaperId)
        if (existing) {
          return {
            success: false,
            error: { code: 'FAVORITE_ALREADY_EXISTS', message: '该壁纸已在收藏夹中' },
          }
        }

        const addedAt = new Date().toISOString()
        db.prepare(
          'INSERT INTO favorites (collection_id, wallpaper_id, wallpaper_data, added_at) VALUES (?, ?, ?, ?)',
        ).run(collectionId, wallpaperId, JSON.stringify(wallpaperData), addedAt)

        return {
          success: true,
          data: {
            collectionId,
            wallpaperId,
            wallpaperData,
            addedAt,
          },
        }
      } catch (error: any) {
        logHandler('favorites-add', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  /**
   * Remove a wallpaper from a collection.
   * Returns FAVORITE_NOT_FOUND if the favorite entry does not exist.
   */
  ipcMain.handle(
    'favorites-remove',
    (_event, params: { wallpaperId: string; collectionId: string }) => {
      try {
        const db = getDatabase()
        const { wallpaperId, collectionId } = params

        const result = db
          .prepare(
            'DELETE FROM favorites WHERE wallpaper_id = ? AND collection_id = ?',
          )
          .run(wallpaperId, collectionId)

        if (result.changes === 0) {
          return {
            success: false,
            error: { code: 'FAVORITE_NOT_FOUND', message: '收藏项不存在' },
          }
        }
        return { success: true }
      } catch (error: any) {
        logHandler('favorites-remove', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  /**
   * Move a favorite from one collection to another.
   * Validates collection existence, source favorite existence, and checks
   * the target collection does not already contain the wallpaper.
   */
  ipcMain.handle(
    'favorites-move',
    (
      _event,
      params: {
        wallpaperId: string
        fromCollectionId: string
        toCollectionId: string
      },
    ) => {
      try {
        const db = getDatabase()
        const { wallpaperId, fromCollectionId, toCollectionId } = params

        // Check target collection exists
        const targetCollection = db
          .prepare<{ id: string }>('SELECT 1 as id FROM collections WHERE id = ? LIMIT 1')
          .get(toCollectionId)
        if (!targetCollection) {
          return {
            success: false,
            error: { code: 'COLLECTION_NOT_FOUND', message: '目标收藏夹不存在' },
          }
        }

        // Check source favorite exists and get wallpaper_data for return value
        const sourceFavorite = db
          .prepare<{ wallpaper_data: string }>(
            'SELECT wallpaper_data FROM favorites WHERE wallpaper_id = ? AND collection_id = ? LIMIT 1',
          )
          .get(wallpaperId, fromCollectionId)
        if (!sourceFavorite) {
          return {
            success: false,
            error: { code: 'FAVORITE_NOT_FOUND', message: '收藏项不存在' },
          }
        }

        // Check not already in target collection
        const alreadyExists = db
          .prepare<{ exists: number }>(
            'SELECT 1 as "exists" FROM favorites WHERE wallpaper_id = ? AND collection_id = ? LIMIT 1',
          )
          .get(wallpaperId, toCollectionId)
        if (alreadyExists) {
          return {
            success: false,
            error: { code: 'FAVORITE_ALREADY_EXISTS', message: '该壁纸已在目标收藏夹中' },
          }
        }

        const now = new Date().toISOString()
        db.prepare(
          'UPDATE favorites SET collection_id = ?, added_at = ? WHERE wallpaper_id = ? AND collection_id = ?',
        ).run(toCollectionId, now, wallpaperId, fromCollectionId)

        return {
          success: true,
          data: {
            collectionId: toCollectionId,
            wallpaperId,
            wallpaperData: JSON.parse(sourceFavorite.wallpaper_data),
            addedAt: now,
          },
        }
      } catch (error: any) {
        logHandler('favorites-move', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  /**
   * Check if a wallpaper exists in any collection (boolean).
   * Uses SELECT 1 ... LIMIT 1 for O(1) existence check (D-05).
   */
  ipcMain.handle(
    'favorites-is-favorite',
    (_event, params: { wallpaperId: string }) => {
      try {
        const db = getDatabase()
        const { wallpaperId } = params

        const row = db
          .prepare<{ exists: number }>(
            'SELECT 1 as "exists" FROM favorites WHERE wallpaper_id = ? LIMIT 1',
          )
          .get(wallpaperId)
        return { success: true, data: !!row }
      } catch (error: any) {
        logHandler('favorites-is-favorite', `Error: ${error.message}`, 'error')
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )

  /**
   * Get all collections that contain a specific wallpaper.
   * Uses INNER JOIN on collections and favorites tables.
   */
  ipcMain.handle(
    'favorites-get-collections-for-wallpaper',
    (_event, params: { wallpaperId: string }) => {
      try {
        const db = getDatabase()
        const { wallpaperId } = params

        const rows = db
          .prepare<any[]>(
            `SELECT c.id, c.name, c.is_default, c.sort_order, c.created_at, c.updated_at
             FROM collections c
             INNER JOIN favorites f ON f.collection_id = c.id
             WHERE f.wallpaper_id = ?
             ORDER BY c.sort_order ASC, c.created_at ASC`,
          )
          .all(wallpaperId)

        const mappedCollections = rows.map((row: any) => ({
          id: row.id,
          name: row.name,
          isDefault: row.is_default === 1,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }))
        return { success: true, data: mappedCollections }
      } catch (error: any) {
        logHandler(
          'favorites-get-collections-for-wallpaper',
          `Error: ${error.message}`,
          'error',
        )
        return {
          success: false,
          error: { code: 'FAVORITES_STORAGE_ERROR', message: error.message },
        }
      }
    },
  )
}
