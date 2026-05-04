---
phase: 42-main-process-store-handler-cutover
plan: 01
type: execute
status: complete
execution_date: "2026-05-03"
---

# Plan 42-01 Summary: Database helpers + direct import cutover

## Objective

Add 3 helper functions to database.ts (getAppSetting, getDownloadPath, getMaxConcurrentDownloads) and cutover the two main-process files (download-queue.ts, download.handler.ts) to use them instead of direct electron-store imports.

## Changes Made

### electron/main/database.ts
- Added `getAppSetting(key: string): unknown` — reads JSON-parsed value from settings table
- Added `getDownloadPath(): string | undefined` — reads appSettings.downloadPath via getAppSetting
- Added `getMaxConcurrentDownloads(): number` — reads appSettings.maxConcurrentDownloads, defaults to 3

### electron/main/ipc/handlers/download-queue.ts
- Replaced `import { store } from '../../store'` with `import { getMaxConcurrentDownloads } from '../../database'`
- Replaced `store.get('appSettings')` + manual extraction with single `getMaxConcurrentDownloads()` call

### electron/main/ipc/handlers/download.handler.ts
- Replaced `import { store } from '../../store'` with `import { getDownloadPath } from '../../database'`
- Replaced `store?.get('appSettings.downloadPath')` with `getDownloadPath()` call

## Verification

- database.ts exports 6 functions (3 original + 3 new) — 276 lines total
- Zero store imports remain in download-queue.ts or download.handler.ts
- getMaxConcurrentDownloads() and getDownloadPath() properly used in their respective consumers

## Key Files Created/Modified

- `electron/main/database.ts` — 3 new exported helper functions
- `electron/main/ipc/handlers/download-queue.ts` — store import removed
- `electron/main/ipc/handlers/download.handler.ts` — store import removed

## Decisions Applied

- D-08: Helper functions in database.ts, not inline SQL
- D-09: Export signatures as specified
- D-10: Store imports removed from both files
- D-11: Cutover in this phase (not Phase 45)
