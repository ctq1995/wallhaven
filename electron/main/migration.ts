/**
 * electron-store to SQLite Migration Script
 *
 * One-time migration that reads all 4 data domains from electron-store
 * (wallhaven-data.json) and imports them into SQLite in a single atomic
 * transaction. Creates a cold backup before any writes.
 *
 * Idempotent: guarded by _migrated_from_store flag in settings table.
 * Fresh installs are marked as migrated with zero data.
 */

import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { DatabaseSync } from 'node:sqlite'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationResult {
  migrated: boolean
  stats: {
    settings: number
    searchParams: number
    downloadHistory: number
    collections: number
    favorites: number
  }
  backupPath: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const defaultStats: MigrationResult['stats'] = {
  settings: 0,
  searchParams: 0,
  downloadHistory: 0,
  collections: 0,
  favorites: 0,
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

export function runMigration(db: DatabaseSync): MigrationResult {
  // -----------------------------------------------------------------------
  // Step 1: Idempotency guard — check _migrated_from_store (D-07)
  // -----------------------------------------------------------------------
  const alreadyMigrated = db
    .prepare("SELECT 1 FROM settings WHERE key = '_migrated_from_store'")
    .get()

  if (alreadyMigrated) {
    console.log('[Migration] Already migrated (found _migrated_from_store)')
    return { migrated: false, stats: { ...defaultStats }, backupPath: null }
  }

  // -----------------------------------------------------------------------
  // Step 2: Check electron-store file exists (D-13, H-03)
  // -----------------------------------------------------------------------
  const userDataPath = app.getPath('userData')
  const storePath = join(userDataPath, 'wallhaven-data.json')

  if (!existsSync(storePath)) {
    console.log('[Migration] No electron-store file found (fresh install)')
    db.prepare("INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')").run()
    return { migrated: true, stats: { ...defaultStats }, backupPath: null }
  }

  // -----------------------------------------------------------------------
  // Step 3: Backup outside transaction (D-10, D-11, D-12)
  // -----------------------------------------------------------------------
  const backupPath = join(userDataPath, 'wallhaven-data.json.bak')
  copyFileSync(storePath, backupPath)
  console.log('[Migration] Backup created: wallhaven-data.json.bak')

  // -----------------------------------------------------------------------
  // Step 4: Transaction body — all domain migrations (I-01, I-02)
  // -----------------------------------------------------------------------
  const stats: MigrationResult['stats'] = { ...defaultStats }

  try {
    db.exec('BEGIN IMMEDIATE')
    try {
      // ---------------------------------------------------------------
      // Step A: Read all 4 domains from electron-store (H-04)
      // ---------------------------------------------------------------
      // Read the JSON file directly (store.ts has been removed)
      const storeData = JSON.parse(readFileSync(storePath, 'utf-8'))
      const appSettings: unknown = storeData.appSettings
      const queryParams: unknown = storeData.wallpaperQueryParams
      const downloadHistoryList: unknown = storeData.downloadFinishedList
      const favoritesData: unknown = storeData.favoritesData

      // ---------------------------------------------------------------
      // Step B: Collections INSERT (E-04, E-06 — FK dependency first)
      // ---------------------------------------------------------------
      type RawCollection = {
        id: string
        name: string
        isDefault?: boolean
        createdAt: string
        updatedAt: string
      }

      type RawFavorite = {
        wallpaperId: string
        collectionId: string
        addedAt: string
        wallpaperData: unknown
      }

      type RawFavoritesData = {
        collections?: RawCollection[]
        favorites?: RawFavorite[]
        defaultCollectionId?: string
      }

      const favData = favoritesData as RawFavoritesData | null | undefined
      const rawCollections = Array.isArray(favData?.collections) ? favData.collections : []
      const rawFavorites = Array.isArray(favData?.favorites) ? favData.favorites : []

      if (rawCollections.length > 0) {
        const collectionStmt = db.prepare(
          'INSERT INTO collections (id, name, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)'
        )

        for (const c of rawCollections) {
          const isDefault = (c.isDefault || c.id === favData?.defaultCollectionId) ? 1 : 0
          collectionStmt.run(c.id, c.name, isDefault, c.createdAt ?? new Date().toISOString(), c.updatedAt ?? new Date().toISOString())
          stats.collections++
        }
      }

      // ---------------------------------------------------------------
      // Step C: Favorites INSERT with orphan filtering (E-05, G-01/02/03)
      // ---------------------------------------------------------------
      if (rawFavorites.length > 0) {
        if (rawCollections.length === 0) {
          console.warn(`[Migration] No collections found — skipping ${rawFavorites.length} favorites`)
        } else {
          const validCollectionIds = new Set(rawCollections.map(c => c.id))
          const validFavorites = rawFavorites.filter(f => validCollectionIds.has(f.collectionId))
          const filtered = rawFavorites.length - validFavorites.length

          if (filtered > 0) {
            console.warn(`[Migration] Filtered ${filtered} orphaned favorites`)
          }

          const favoriteStmt = db.prepare(
            'INSERT INTO favorites (collection_id, wallpaper_id, wallpaper_data, added_at) VALUES (?, ?, ?, ?)'
          )

          for (const f of validFavorites) {
            const wallpaperData = JSON.stringify(f.wallpaperData)
            const addedAt = f.addedAt ?? new Date().toISOString()
            favoriteStmt.run(f.collectionId, f.wallpaperId, wallpaperData, addedAt)
            stats.favorites++
          }
        }
      }

      // ---------------------------------------------------------------
      // Step D: Settings — appSettings (E-01)
      // ---------------------------------------------------------------
      if (appSettings !== null && appSettings !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
          'appSettings',
          JSON.stringify(appSettings)
        )
        stats.settings++
      }

      // ---------------------------------------------------------------
      // Step E: Search Params (E-02)
      // ---------------------------------------------------------------
      if (queryParams !== null && queryParams !== undefined) {
        db.prepare('INSERT OR REPLACE INTO search_params (id, value) VALUES (1, ?)').run(
          JSON.stringify(queryParams)
        )
        stats.searchParams++
      }

      // ---------------------------------------------------------------
      // Step F: Download History (E-03)
      // ---------------------------------------------------------------
      type RawDownloadItem = Record<string, unknown> & {
        wallpaperId?: string
        id?: string
        url?: string
        filename?: string
        path?: string
        size?: unknown
        small?: string
        resolution?: string
        time?: string
      }

      if (Array.isArray(downloadHistoryList) && downloadHistoryList.length > 0) {
        const historyStmt = db.prepare(
          'INSERT INTO download_history (wallpaper_id, url, filename, file_path, file_size, thumbnail_path, resolution, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )

        for (const item of downloadHistoryList as RawDownloadItem[]) {
          const wallpaperId = item.wallpaperId ?? item.id ?? null
          const url = item.url ?? null
          const filename = item.filename ?? null
          const filePath = item.path ?? null
          const fileSize = typeof item.size === 'number' ? item.size : null
          const thumbnailPath = item.small ?? null
          const resolution = item.resolution ?? null
          const data = JSON.stringify(item)
          const createdAt = item.time ?? new Date().toISOString()

          historyStmt.run(wallpaperId, url, filename, filePath, fileSize, thumbnailPath, resolution, data, createdAt)
          stats.downloadHistory++
        }
      }

      // ---------------------------------------------------------------
      // Step G: _migrated_from_store — LAST step (D-08, F-02)
      // ---------------------------------------------------------------
      db.prepare("INSERT INTO settings (key, value) VALUES ('_migrated_from_store', '1')").run()

      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }

    console.log(
      `[Migration] Complete. Settings: ${stats.settings}, SearchParams: ${stats.searchParams}, ` +
      `DownloadHistory: ${stats.downloadHistory}, Collections: ${stats.collections}, ` +
      `Favorites: ${stats.favorites}`
    )

    return { migrated: true, stats, backupPath }
  } catch (error) {
    console.error('[Migration] FAILED — transaction rolled back:', error)
    throw error
  }
}
