---
phase: 41-database-infrastructure
plan: 01
subsystem: database
tags: node:sqlite, type-declarations, typescript, nodejs-24

requires: []
provides:
  - node:sqlite TypeScript type declarations (DatabaseSync, StatementSync, etc.)
  - Node.js >=24 engine requirement enforcement
affects:
  - 41-database-infrastructure (all subsequent plans need node:sqlite types)
  - 42-main-process-handler-cutover

tech-stack:
  added: []
  patterns:
    - Module augmentation (declare module 'node:sqlite') for built-in Node.js modules not covered by @types/node
    - Interface for object shapes, type alias for unions (per project CONVENTIONS.md)

key-files:
  created:
    - electron/main/sqlite.d.ts (49 lines, custom type declarations for node:sqlite)
  modified:
    - package.json (engines.node updated)

key-decisions:
  - "Use exact interface shapes per STACK.md spec adapted to CONVENTIONS.md: interface for RunResult/DatabaseOptions/ColumnInfo, type for BindParams"
  - "Engines.node set to >=24 (minimum) rather than a range — Electron 41 bundles Node.js 24.14.0+, CI runners support this"

patterns-established:
  - "Module augmentation pattern: declare module 'node:sqlite' wraps all types in a module declaration block"
  - "Minimal surface type declarations: only what this project uses (DatabaseSync, StatementSync, 4 support types)"

requirements-completed:
  - DBINFRA-02

duration: 1min
completed: 2026-05-03
---

# Phase 41 Database Infrastructure Plan 01: node:sqlite Type Declarations & Node.js Engine Requirement

**Custom TypeScript type declarations for node:sqlite (DatabaseSync, StatementSync with 4 supporting types/interfaces) and Node.js engine requirement pinned to >=24**

## Performance

- **Duration:** 1 min
- **Started:** 2026-05-03T11:19:54Z
- **Completed:** 2026-05-03T11:20:04Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `electron/main/sqlite.d.ts` — 49-line custom type declarations for the built-in `node:sqlite` module (Stability 1.1, not included in @types/node)
- Updated `package.json` engines.node from `^20.19.0 || >=22.12.0` to `>=24`, ensuring Node.js 24+ for `node:sqlite` availability
- All types follow project conventions: `interface` for object shapes (RunResult, DatabaseOptions, ColumnInfo), `type` for union types (BindParams)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create node:sqlite TypeScript type declarations** - `a7ae7c1` (feat)
2. **Task 2: Update package.json engines field to require Node.js >= 24** - `41fbdfc` (feat)

**Plan metadata commit:** pending (docs: complete 41-01 plan)

## Files Created/Modified

- `electron/main/sqlite.d.ts` (created, 49 lines) — Custom type declarations for node:sqlite module: DatabaseSync class (constructor, close, exec, open, prepare, isOpen, isTransaction), StatementSync class (all, get, run, iterate, columns, sourceSQL, expandedSQL), plus RunResult, DatabaseOptions, ColumnInfo interfaces and BindParams type alias
- `package.json` (modified) — engines.node updated from `^20.19.0 || >=22.12.0` to `>=24`

## Decisions Made

- Used exact declaration content from STACK.md adapted to project CONVENTIONS.md preference for `interface` over `type` for object shapes (STACK.md already used `interface` for all three shapes, so no adaptation was needed)
- Set engines.node to an unconditional `>=24` rather than a version range — the project's development environments, CI runners, and Electron 41's bundled Node.js (v24.14.0+) all satisfy this

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Threat Flags

No new security-relevant surface introduced — type declarations and config metadata only, no runtime code.

## Known Stubs

None.

## Self-Check: PASSED

- [x] `electron/main/sqlite.d.ts` exists, 49 lines, contains `declare module 'node:sqlite'`, `export class DatabaseSync`, `export class StatementSync`, `interface RunResult`, `interface DatabaseOptions`, `interface ColumnInfo`, `type BindParams`
- [x] `package.json` engines.node equals `>=24`
- [x] No unrelated files modified

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 41-02 (Database initialization & Repository base) can now import from `node:sqlite` with full type safety in main process code
- All subsequent Phase 41+ plans benefit from these type declarations

---
*Phase: 41-database-infrastructure*
*Completed: 2026-05-03*
