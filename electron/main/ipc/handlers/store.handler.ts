/* eslint-disable @typescript-eslint/ban-ts-comment */
/**
 * SQLite-backed store IPC handlers — routes 3 known keys (appSettings,
 * wallpaperQueryParams, downloadFinishedList) to dedicated
 * tables via keyToTable().
 */

import { ipcMain } from 'electron'
import { getDatabase, withTransaction } from '../../database'
import { logHandler } from './base'
import { getQueueInstance } from './download-queue'

/** Describes which SQLite table and access pattern a store key maps to. */
interface TableRoute {
  table: string
  type: 'key_value' | 'single_row' | 'relational'
}

/**
 * Map a store key to its SQLite table and access pattern.
 *
 * - key_value: settings table (key TEXT PRIMARY KEY, value TEXT)
 * - single_row: search_params table (id=1, value TEXT)
 * - relational: download_history table (multi-row with fields)
 *
 * @throws Error for unknown keys (caught by handler try/catch)
 */
function keyToTable(key: string): TableRoute {
  switch (key) {
    case 'appSettings':
      return { table: 'settings', type: 'key_value' }
    case 'wallpaperQueryParams':
      return { table: 'search_params', type: 'single_row' }
    case 'downloadFinishedList':
      return { table: 'download_history', type: 'relational' }
    default:
      throw new Error(`Unknown store key: ${key}`)
  }
}

export function registerStoreHandlers(): void {
  /**
   * Store - 获取值（从 SQLite 表路由读取）
   */
  ipcMain.handle('store-get', (_event, key: string) => {
    try {
      const route = keyToTable(key)
      let value: unknown = null

      switch (route.type) {
        case 'key_value': {
          const row = getDatabase()
            .prepare<{ value: string }>('SELECT value FROM settings WHERE key = ?')
            .get(key)
          value = row ? JSON.parse(row.value) : null
          break
        }
        case 'single_row': {
          const row = getDatabase()
            .prepare<{ value: string }>('SELECT value FROM search_params WHERE id = 1')
            .get()
          value = row ? JSON.parse(row.value) : null
          break
        }
        case 'relational': {
          const rows = getDatabase()
            .prepare<{ data: string }>('SELECT data FROM download_history ORDER BY id DESC LIMIT 50')
            .all()
          value = rows.map(r => JSON.parse(r.data))
          break
        }
      }

      // CRITICAL: field name must be 'value' (not 'data') — electronClient.storeGet reads result.value
      return { success: true, value }
    } catch (error: any) {
      logHandler('store-get', `Error: ${error.message}`, 'error')
      return { success: false, error: error.message, value: null }
    }
  })

  /**
   * Store - 设置值（写入 SQLite 表路由）
   */
  ipcMain.handle('store-set', (_event, { key, value }: { key: string; value: any }) => {
    try {
      const route = keyToTable(key)
      const jsonValue = JSON.stringify(value)

      switch (route.type) {
        case 'key_value':
          getDatabase()
            .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
            .run(key, jsonValue)
          break

        case 'single_row':
          getDatabase()
            .prepare('INSERT OR REPLACE INTO search_params (id, value) VALUES (1, ?)')
            .run(jsonValue)
          break

        case 'relational': {
          const items = Array.isArray(value) ? value : []
          withTransaction(() => {
            getDatabase().prepare('DELETE FROM download_history').run()
            const stmt = getDatabase().prepare('INSERT INTO download_history (data) VALUES (?)')
            for (const item of items) {
              stmt.run(JSON.stringify(item))
            }
            // SQL-level max-50 constraint (D-04)
            getDatabase().exec(`
              DELETE FROM download_history
              WHERE id NOT IN (
                SELECT id FROM download_history
                ORDER BY created_at DESC
                LIMIT 50
              )
            `)
          })
          break
        }
      }

      // DL-03: Live propagation of maxConcurrentDownloads setting
      // When appSettings change (e.g., concurrency slider), re-evaluate queue
      if (key === 'appSettings') {
        getQueueInstance()?.processQueue()
      }

      return { success: true }
    } catch (error: any) {
      logHandler('store-set', `Error: ${error.message}`, 'error')
      return { success: false, error: error.message }
    }
  })

  /**
   * Store - 删除值（从 SQLite 表路由删除）
   */
  ipcMain.handle('store-delete', (_event, key: string) => {
    try {
      const route = keyToTable(key)
      switch (route.type) {
        case 'key_value':
          getDatabase()
            .prepare('DELETE FROM settings WHERE key = ?')
            .run(key)
          break
        case 'single_row':
          getDatabase()
            .prepare('DELETE FROM search_params WHERE id = 1')
            .run()
          break
        case 'relational':
          getDatabase()
            .prepare('DELETE FROM download_history')
            .run()
          break
      }
      return { success: true }
    } catch (error: any) {
      logHandler('store-delete', `Error: ${error.message}`, 'error')
      return { success: false, error: error.message }
    }
  })

  /**
   * Store - 清空数据（仅清空 settings、search_params、download_history 三表）
   * collections 和 favorites 不受影响（D-06），由专门的收藏功能管理
   */
  ipcMain.handle('store-clear', () => {
    try {
      withTransaction(() => {
        getDatabase().exec('DELETE FROM settings')
        getDatabase().exec('DELETE FROM search_params')
        getDatabase().exec('DELETE FROM download_history')
      })
      // D-06: collections and favorites NOT cleared
      // D-07: _migrated_from_store flag is managed by migration script (Phase 44), not DB
      return { success: true }
    } catch (error: any) {
      logHandler('store-clear', `Error: ${error.message}`, 'error')
      return { success: false, error: error.message }
    }
  })
}
