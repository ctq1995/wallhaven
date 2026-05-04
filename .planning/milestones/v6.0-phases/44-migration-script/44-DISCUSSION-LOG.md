# Phase 44: Migration Script - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 44-migration-script
**Areas discussed:** Script Location & Structure, Migration Trigger, Idempotency, Backup Strategy, Data Transformation, Transaction Strategy, FK Handling, Empty Data Handling, Error Handling, Script Export

**Mode:** `--auto` — all gray areas auto-selected and auto-resolved with recommended defaults

---

## A — Script Location & Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Single file (`electron/main/migration.ts`) | Single file following the pattern of database.ts. Small scope, no multi-file needed. | ✓ |
| Multi-file directory | Dedicated directory for migration logic. | |

**Auto-selected:** Single file `electron/main/migration.ts`
**Rationale:** Migration scope is small — one function reading 4 keys and writing to 5 tables. No benefit from multiple files.

## B — Migration Trigger Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Called from `getDatabase()` after schema init | Migration runs as part of lazy DB initialization, before first handler accesses DB. | ✓ |
| Called from `index.ts` explicitly | Separate explicit call in main process startup. | |

**Auto-selected:** Integrated into `getDatabase()` after `initializeSchema()`
**Rationale:** Ensures migration completes before any IPC handler accesses the database. No risk of race conditions.

## C — Idempotency Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| `_migrated_from_store` flag in settings table | SQLite-native marker. Survives electron-store deletion. | ✓ |
| electron-store sidecar marker | Keep marker in electron-store JSON file. | |

**Auto-selected:** `_migrated_from_store` in settings table
**Rationale:** Survives electron-store deletion in Phase 45. Single source of truth.

## D — Backup Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Copy before transaction starts | Create `.bak` copy before any SQLite writes. | ✓ |
| Keep electron-store intact (no backup) | Rely on transaction rollback for safety. | |

**Auto-selected:** Backup before transaction (wallhaven-data.json → wallhaven-data.json.bak)
**Rationale:** DBINFRA-07 requirement. Rollback for safety is orthogonal.

## E — Data Transformation

| Option | Description | Selected |
|--------|-------------|----------|
| Per-domain mapping to tables | Each domain maps to its dedicated table. | ✓ |
| Store everything in settings key-value blobs | Keep blob pattern in SQLite. | |

**Auto-selected:** Per-domain mapping to dedicated tables
**Rationale:** Matches existing schema design from Phases 41-43. Enables atomic operations.

## F — Transaction Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single `withTransaction()` for all writes | All-or-nothing atomic migration. | ✓ |
| Per-domain transactions | Each domain committed independently. | |

**Auto-selected:** Single `withTransaction()` for all writes
**Rationale:** Pitfall P2 prevention. If migration crashes mid-way, next startup retries from scratch.

## G — FK & Orphaned Data Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Filter orphans before insert | Check each favorite's collectionId exists. Log and skip orphans. | ✓ |
| Disable FK enforcement during migration | Temporarily skip FK checks, clean up later. | |

**Auto-selected:** Filter orphans (strict approach)
**Rationale:** Pitfall P6 prevention. Safer — no risk of FK violation mid-transaction.

## H — Empty Data / Fresh Install Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit null/undefined checks, set flag even if empty | Check each key, skip domains with no data, still write _migrated_from_store. | ✓ |
| Skip migration entirely when no electron-store data | Don't set marker, check every startup. | |

**Auto-selected:** Explicit checks + set marker on empty
**Rationale:** Pitfall P9 prevention. electron-store defaults (empty arrays) should not prevent future runs from working.

## I — Error Handling

| Option | Description | Selected |
|--------|-------------|----------|
| All in transaction, rollback on any failure | withTransaction() handles rollback automatically. | ✓ |
| Continue on per-domain failure | Log error and continue with remaining domains. | |

**Auto-selected:** All-in-transaction rollback
**Rationale:** Atomicity is the primary design goal. Partial migration is worse than no migration.

## J — Script Export Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Export `runMigration(): MigrationResult` | Returns stats and status for logging. | ✓ |
| Export `migrateFromElectronStore(): boolean` | Simple boolean result. | |

**Auto-selected:** `runMigration(): MigrationResult` with full stats
**Rationale:** Provides useful information for startup logs and diagnostics.

---

## Claude's Discretion

- Exact SQL statement implementation details
- Log format and verbosity
- `MigrationResult` TypeScript type definition
- Exact call location inside `getDatabase()`
- `download_history` data column field mapping strategy

## Deferred Ideas

None — discussion stayed within phase scope.
