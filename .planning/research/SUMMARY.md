# Research Summary: electron-store to SQLite Migration

**Project:** Wallhaven v5.0 -- electron-store to SQLite Migration
**Domain:** Persistent storage migration from JSON blob (electron-store) to relational database (SQLite) in Electron desktop app
**Researched:** 2026-05-03
**Overall confidence:** HIGH

## Executive Summary

This milestone migrates Wallhaven's persistent storage from `electron-store` (synchronous JSON file-based storage) to SQLite. This addresses three concrete problems: (1) crash risk from mid-write JSON corruption, mitigated by SQLite WAL transaction journaling; (2) no partial updates -- every favorites mutation reads the entire blob, modifies in JavaScript, and writes the entire blob back, causing read-modify-write races; (3) no query capability -- checking "is this wallpaper favorited" requires scanning an entire in-memory array instead of an indexed SQL lookup.

The key research question was: which SQLite library to use? The answer changed during research.

**Revised recommendation: Use `node:sqlite` (Node.js built-in), not `better-sqlite3`.** Electron 41 ships Node.js v24.14.0+, which includes `node:sqlite` at Stability 1.1 (Active development) with no experimental flag required. The built-in module provides an identical synchronous API (`new DatabaseSync()`, `.prepare()`, `.get()`, `.all()`, `.run()`, `.exec()`) but with zero dependency overhead and zero build pipeline changes.

The previously assumed choice `better-sqlite3` adds:
- Native module compilation requiring `electron-rebuild`
- `asarUnpack` configuration in `electron-builder.yml`
- Outdated TypeScript types (`@types/better-sqlite3@7.6.13` locked to v7 API, while the package is on v12.x)
- Electron version compatibility tracking (v12.7.x broke for Electron 41)
- Known "Cannot find module" errors after packaging

The `node:sqlite` built-in avoids all of these because it is not an npm dependency -- it is baked into the Node.js runtime that Electron ships.

## Key Findings

**Stack:** `node:sqlite` (Node.js 24.14+ built-in). Zero new dependencies. A custom ~30-line TypeScript declaration file in `electron/main/sqlite.d.ts` provides types (`@types/node` skips experimental modules). No electron-vite, electron-builder, or electron-rebuild configuration changes needed. The existing `postinstall` and `asarUnpack` config remain unchanged (they continue handling `sharp`).

**Architecture:** Singleton database connection initialized on app startup in `electron/main/database.ts`. Five SQLite tables (`settings`, `search_params`, `download_history`, `collections`, `favorites`) replace four electron-store keys. The existing Repository layer isolates the renderer from storage changes. IPC handler signatures (`store-get`, `store-set`, `store-delete`, `store-clear`) remain identical -- only the implementation changes from `store.get()` to `getDatabase().prepare(...).get()`.

**Critical pitfall -- main process direct imports:** The main process modules (`download-queue.ts`, `download.handler.ts`) directly `import { store }` and call `store.get('appSettings')`. After migration, these must import `database` instead. If missed, the download queue defaults to `maxConcurrentDownloads = 3` regardless of the user's setting. Phase 2 of the roadmap (main process module cutover) specifically addresses this.

## Implications for Roadmap

Based on research, the recommended phase structure:

### Phase 1: Database Infrastructure
Create `electron/main/database.ts` with schema initialization, singleton connection, `withTransaction()` utility, and `sqlite.d.ts` type declarations.
**Avoids pitfall:** Build integration failure with native modules (zero build config changes needed).

### Phase 2: Main Process Module Cutover
Replace `store.get('appSettings')` calls in `download-queue.ts` and `download.handler.ts` with SQLite queries. Must happen before the generic store handler changes because these modules bypass IPC entirely.
**Avoids pitfall:** Missed direct imports leaving main process still reading electron-store after store.ts is removed.

### Phase 3: Store Handler Migration (Generic IPC)
Modify `store.handler.ts` to use SQLite queries instead of `store.get()`/`store.set()`. All four IPC channels (`store-get`, `store-set`, `store-delete`, `store-clear`) keep their signatures. The ElectronClient, repositories, services, composables, and views are entirely unaffected.

### Phase 4: Favorites/Collections Migration
Replace the full-blob read-modify-write pattern (`store.get('favoritesData')` -> mutate -> `store.set('favoritesData')`) with SQL queries on the `collections` and `favorites` tables. This is where SQLite provides the most value: O(1) favorite existence check via SQL index instead of in-memory Set populated from full blob.

### Phase 5: Migration Script and Cleanup
Build one-time migration from electron-store JSON to SQLite, verify data integrity, then remove `electron-store` dependency.
**Guard:** Check `_migrated_from_store` flag before running. Run in transaction for atomicity.

**Phase ordering rationale:**
- Infrastructure first because all other phases depend on having a working database
- Main process cutover second because direct `store` imports must be eliminated before the generic store handler changes
- Store handler IPC third because it replaces the generic get/set/delete pattern that powers all feature domains
- Favorites fourth because the full-blob read-modify-write is the primary motivation for the migration
- Migration script last because it must understand the final schema of all tables

**Research flags for phases:**
- Phase 5: MEDIUM -- migration script needs careful testing with real electron-store data (empty store, partial data, full data)

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `node:sqlite` availability in Electron 41 confirmed via official Electron blog post (Node.js v24.14.0). API surface matches project needs. Zero build integration risk. The Stability 1.1 label is mitigated by using only the stable core API (prepare/get/all/run/exec), which has not changed across Node.js 22-25. |
| Features | HIGH | Migration scope is well-defined. 5 tables map directly to 4 existing storage keys. IPC backward compatibility guaranteed by the Repository layer separation. |
| Architecture | HIGH | Singleton database connection with lazy initialization is a standard pattern. The Repository layer already isolates storage from business logic. Schema design is straightforward for the data volume. |
| Pitfalls | MEDIUM | `node:sqlite` is Stability 1.1, meaning API changes are possible. Risk is mitigated because: (a) only stable core API is used, (b) Repository layer insulates most code, (c) fallback (`@photostructure/sqlite`) is available with identical API if needed. |

## Gaps to Address

- **TypeScript type coverage:** The custom `sqlite.d.ts` covers only the API surface used. If future phases need additional `node:sqlite` features, types must be extended. This is intentional -- keep the declaration small and explicit.
- **Fallback plan:** If `node:sqlite` has a critical bug in an Electron 41 patch update, fall back to `@photostructure/sqlite` which provides an identical API with its own TypeScript types. Only `database.ts` needs to change (the import path).
- **Migration testing strategy:** Create a test fixture with an electron-store file containing representative data across all 4 domains, run migration against it, verify SQLite output.

## Sources

- [Electron 41.0.0 Release Announcement](https://az.electronjs.org/blog/electron-41-0) -- Node.js v24.14.0 confirmed -- HIGH confidence
- [Node.js 24 `node:sqlite` Documentation](https://nodejs.org/download/nightly/v24.0.0-nightly20250503f552c86fec/docs/api/sqlite.html) -- Official API reference -- HIGH confidence
- [electron-vite Dependency Handling](https://electron-vite.org/guide/dependency-handling) -- Native module externalization docs -- HIGH confidence
- [electron-vite Distribution Guide](https://electron-vite.org/guide/distribution) -- asarUnpack configuration -- HIGH confidence
- [TypeScript 6.0 Announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6.0/) -- Confirms no Node built-in module types in TS 6.0 lib -- HIGH confidence
- [@types/better-sqlite3 npm](https://www.npmjs.com/package/@types/better-sqlite3) -- v7.6.13, locked to v7 API -- HIGH confidence
- [better-sqlite3 v12.8.0 Release](https://github.com/WiseLibs/better-sqlite3/releases/tag/v12.7.0) -- Electron 41 V8 fix -- MEDIUM confidence
- [Photostructure SQLite Library Comparison](https://photostructure.github.io/node-sqlite/documents/library-comparison.html) -- Stability matrix across Node versions -- MEDIUM confidence
- Current codebase: `electron/main/store.ts`, `electron.vite.config.ts`, `electron-builder.yml`, `src/clients/electron.client.ts`, `src/clients/constants.ts`, `package.json`

---
*Research completed: 2026-05-03*
*Ready for roadmap: yes*
