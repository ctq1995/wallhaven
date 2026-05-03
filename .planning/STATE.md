---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: electron-store 到 SQLite 迁移
status: planning
last_updated: "2026-05-03T00:00:00.000Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

> Updated: 2026-05-03
> Current: Milestone v5.0 — defined requirements, roadmap created
> Status: Planning

---

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-03)

**Core value:** 收藏管理，分类随心 — 将喜欢的壁纸添加到自定义收藏夹，按主题分类管理

---

## Current Position

Phase: 41 — Database Infrastructure (first phase of v5.0)
Plan: —
Status: Roadmap created, awaiting planning
Last activity: 2026-05-03 — v5.0 roadmap created (Phases 41-45)

---

## Performance Metrics

| Metric | Value |
|--------|-------|
| Total phases (v5.0) | 5 |
| Completed phases | 0 |
| Total plans | 0 |
| Completed plans | 0 |
| Overall progress | 0% |

---

## Accumulated Context

### v5.0 Milestone — electron-store 到 SQLite 迁移

**Goal:** 将持久化存储从 electron-store (JSON 文件) 迁移到 SQLite，利用关系型数据库替代 JSON blob 存储，实现高效的部分更新和查询能力。

**Key design decisions (from research):**
- Use `node:sqlite` (Node.js 24.14+ built-in), NOT better-sqlite3 — zero external dependencies, no build config changes
- Singleton `DatabaseSync` in `electron/main/database.ts`, lazy initialization
- 5 tables: settings, search_params, download_history, collections, favorites
- One-time migration from electron-store JSON to SQLite (idempotent, transactional, cold backup)

**Phase structure (5 phases):**
| Phase | Name | Requirements |
|-------|------|--------------|
| 41 | Database Infrastructure | DBINFRA-01/02/03/04 |
| 42 | Main Process + Store Handler Cutover | MPDIR-01/02, STIPC-01/02/03/04, REPO-01/02/03 |
| 43 | Favorites & Collections Migration | REPO-04/05, VER-04 |
| 44 | Migration Script | DBINFRA-05/06/07, VER-02 |
| 45 | Cleanup & Final Verification | CLN-01/02/03/04/05/06, VER-01/03/05 |

**Critical ordering constraints:**
- Main process modules (download-queue.ts, download.handler.ts) directly import store — they must be cut over BEFORE generic store handler changes (enforced by plan ordering within Phase 42)
- Migration script must be last — it depends on final schema from all prior phases
- Cleanup must be last — cannot delete files with remaining consumers

**Key risks:**
- `node:sqlite` is Node.js Stability 1.1 — API change risk. Mitigated by using only stable core API (prepare/get/all/run/exec) and Repository layer insulation. Fallback: `@photostructure/sqlite` with identical API.

---

*Updated: 2026-05-03 — v5.0 roadmap created*
