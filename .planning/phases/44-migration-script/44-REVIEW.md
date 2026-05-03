---
phase: 44-migration-script
reviewed: 2026-05-03T12:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - electron/main/migration.ts
  - electron/main/database.ts
  - electron/main/ipc/handlers/store.handler.ts
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 44: Code Review Report — Migration Script

**Reviewed:** 2026-05-03T12:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the three files changed in Phase 44 (one-time electron-store to SQLite migration). Findings reveal two BLOCKER issues: the `db` singleton is assigned before the migration completes, making migration failure unrecoverable; and the `wallpaperData` serialization in migration.ts is inconsistent with the existing `favorites.handler.ts` reader, causing `JSON.parse` to fail on migrated favorites with string wallpaper data. Additionally, missing null coalescing for NOT NULL timestamp columns and missing runtime validation of electron-store data can cause the entire migration transaction to abort or silently lose data on malformed input. The `store.handler.ts` change (protecting `_migrated_from_store` from store-clear) is correct.

## Critical Issues

### CR-01: Database connection assigned before migration completes — data lost on retry

**File:** `electron/main/database.ts:176`
**Issue:** The `db` singleton variable is assigned at line 176 (`db = new DatabaseSync(...)`) *before* the migration runs at line 185. If `runMigration()` throws (due to malformed electron-store data, SQLite constraint violations, or any other error), the exception propagates to the caller, but `db` remains assigned to a valid `DatabaseSync` instance. On the next call to `getDatabase()`, the guard `if (!db)` is false, so the entire initialization block (including `runMigration()`) is skipped. The application proceeds with a database that has the correct schema but zero migrated data — the user's settings, favorites, collections, download history, and search parameters from the old electron-store are silently lost.

**Fix:** Assign `db` only after all initialization succeeds, or reset `db` on failure. The minimal fix wraps the migration call in a try/catch that tears down the connection:

```typescript
export function getDatabase(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(getDbPath(), {
      enableForeignKeyConstraints: true,
      timeout: 5000
    })

    initializeSchema()

    try {
      const result = runMigration(db)
      if (result.migrated) {
        console.log(`[Migration] Migration executed. Backup at: ${result.backupPath}`)
      }
    } catch (e) {
      db.close()
      db = undefined
      throw e
    }

    startPeriodicCheckpoint()
    startWalMonitor()
  }

  return db
}
```

---

### CR-02: Inconsistent wallpaperData serialization breaks JSON.parse reader

**File:** `electron/main/migration.ts:156-158`
**Affected reader:** `electron/main/ipc/handlers/favorites.handler.ts:327`

**Issue:** The migration conditionally stores `wallpaperData` as a raw string when `typeof f.wallpaperData === 'string'`, and as `JSON.stringify(f.wallpaperData)` for all other types. However, the existing `favorites-get-by-collection` handler at `favorites.handler.ts:327` always calls `JSON.parse(row.wallpaper_data)` when reading favorites back. The `favorites-add` handler at `favorites.handler.ts:386` also always stores via `JSON.stringify(wallpaperData)`. This means:

- If a migrated favorite has a string `wallpaperData` (e.g., a URL string), it is stored **raw** (e.g., `https://example.com/img.jpg`).
- The reader at line 327 calls `JSON.parse('https://example.com/img.jpg')`, which throws `SyntaxError` because the string is not valid JSON.
- This crashes the favorites display for any collection containing a migrated favorite with string wallpaperData.

**Fix:** Always use `JSON.stringify`, matching the convention established by `favorites.handler.ts:386`:

```typescript
// Line 156-158 of migration.ts — change from:
const wallpaperData = typeof f.wallpaperData === 'string'
  ? f.wallpaperData
  : JSON.stringify(f.wallpaperData)

// To:
const wallpaperData = JSON.stringify(f.wallpaperData)
```

## Warnings

### WR-01: Silent favorite data loss when collections list is empty

**File:** `electron/main/migration.ts:142`
**Issue:** The favorites INSERT block at line 142 requires `rawCollections.length > 0 && rawFavorites.length > 0`. If `favData.collections` is an empty array (or null/undefined resulting in `[]`) but `favData.favorites` has entries, the condition short-circuits on `rawCollections.length > 0`, and ALL favorites are silently dropped without any warning log. This is a data loss scenario — the user's favorites exist in the old store but are not migrated because no collections were defined. Additionally, a warning is logged at line 148 for orphaned favorites *only* when collections exist (line 142's guard passes), so the `filtered > 0` case inside the guard is also unreachable if there are no collections.

**Fix:** Add an `else` branch to log a warning when favorites exist but collections do not:

```typescript
if (rawCollections.length > 0 && rawFavorites.length > 0) {
  // ... existing logic ...
} else if (rawFavorites.length > 0 && rawCollections.length === 0) {
  console.warn(`[Migration] ${rawFavorites.length} favorites skipped — no collections found`)
}
```

---

### WR-02: Missing null coalescing for NOT NULL timestamp columns

**File:** `electron/main/migration.ts:130-132` (collections), `electron/main/migration.ts:159` (favorites)
**Issue:** The `collections` schema defines `created_at TEXT NOT NULL` and `updated_at TEXT NOT NULL`. The `favorites` schema defines `added_at TEXT NOT NULL`. The TypeScript type `RawCollection` declares `createdAt: string` and `updatedAt: string` as required, but there is **no runtime protection** against undefined/null values. If the old electron-store data has a collection or favorite entry missing these timestamp fields (e.g., from an older app version that did not record timestamps), the `INSERT` statement passes `undefined` to SQLite, which becomes `NULL`, triggering a `NOT NULL` constraint violation. Since the migration runs in a single transaction (line 89), a single missing timestamp aborts the **entire** migration, including all other domains that already succeeded.

**Fix:** Add null coalescing with a reasonable fallback:

```typescript
// Line 132 — collections
collectionStmt.run(
  c.id,
  c.name,
  isDefault,
  c.createdAt ?? new Date().toISOString(),
  c.updatedAt ?? new Date().toISOString()
)

// Line 159 — favorites
favoriteStmt.run(
  f.collectionId,
  f.wallpaperId,
  wallpaperData,
  f.addedAt ?? new Date().toISOString()
)
```

---

### WR-03: No runtime type validation for electron-store data

**File:** `electron/main/migration.ts:122-123`
**Issue:** The `favoritesData` value from `store.get()` is cast to `RawFavoritesData | null | undefined` with a TypeScript type assertion (line 122), but there is no runtime validation that `favData.collections` is actually an array or `favData.favorites` is actually an array. If the electron-store file is corrupted or was modified externally, `favData?.collections` could be a string, number, or any other type. A string value would pass the `rawCollections.length > 0` check (strings have `.length`) and then `for (const c of rawCollections)` would iterate individual **characters** with `c.id`, `c.name`, etc. all being `undefined`. A non-iterable value would cause a `TypeError` at the `for...of` loop. Either case aborts the migration with a confusing error or silently inserts garbage.

**Fix:** Add runtime type guards:

```typescript
const favData = favoritesData as RawFavoritesData | null | undefined
const rawCollections = Array.isArray(favData?.collections) ? favData.collections : []
const rawFavorites = Array.isArray(favData?.favorites) ? favData.favorites : []
```

## Info

### IN-01: Circular dependency between database.ts and migration.ts

**Files:** `electron/main/database.ts:17`, `electron/main/migration.ts:17`
**Issue:** `database.ts` imports `runMigration` from `./migration` (line 17). `migration.ts` imports `withTransaction` from `./database` (line 17). This is a circular dependency. At module load time, when `database.ts` triggers loading of `migration.ts`, and `migration.ts` tries to import from `database.ts` (which is partially loaded), the `withTransaction` export is `undefined`. The circular dependency works correctly at runtime because `runMigration()` is only called from `getDatabase()` (after module initialization completes), and `withTransaction()` is only called inside `runMigration()` at runtime. However, this pattern is fragile: any future change that calls `runMigration()` during module evaluation would crash with `TypeError: withTransaction is not a function`.

**Fix (optional):** Extract `withTransaction` into a shared utility module (e.g., `database-utils.ts`) that both `database.ts` and `migration.ts` can import without circularity.

---

### IN-02: "Backup at: null" logged for fresh install

**File:** `electron/main/database.ts:187`
**Issue:** For fresh installs (no electron-store file), `runMigration()` returns `{ backupPath: null }` at line 73 of migration.ts but still sets `migrated: true`. The caller at database.ts line 187 logs `"Migration executed. Backup at: null"`. While harmless, this is misleading — there was no migration (no data to migrate). The fresh-install path could return `migrated: false` to suppress the log, or the log could conditionally omit the backup path when it is null.

---

_Reviewed: 2026-05-03T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
