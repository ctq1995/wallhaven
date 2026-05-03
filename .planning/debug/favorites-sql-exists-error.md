---
slug: favorites-sql-exists-error
status: resolved
trigger: |
  收藏操作（添加、创建收藏集、重命名收藏集）三个操作都报 near "exists": syntax error
  错误日志:
  [2026-05-03T13:54:23.321Z][favorites-add] Error: near "exists": syntax error
  [2026-05-03T13:54:57.889Z][favorites-create-collection] Error: near "exists": syntax error
  [2026-05-03T13:55:06.828Z][favorites-rename-collection] Error: near "exists": syntax error
created: 2026-05-03
updated: 2026-05-03

symptoms:
  expected: "三个收藏操作应该正常执行 SQL，不报语法错误"
  actual: "三个操作都报 'near \"exists\": syntax error'，SQLite 无法解析 SQL 语句"
  errors: |
    [2026-05-03T13:54:23.321Z][favorites-add] Error: near "exists": syntax error
    [2026-05-03T13:54:57.889Z][favorites-create-collection] Error: near "exists": syntax error
    [2026-05-03T13:55:06.828Z][favorites-rename-collection] Error: near "exists": syntax error
  timeline: 今天刚出现，之前功能正常
  reproduction: 三个操作各自可以独立复现（收藏、创建收藏集、重命名收藏集）

# Current Focus
hypothesis: "SQL 语句使用了 SQLite 保留关键字 exists 作为列别名（SELECT 1 as exists），导致 SQLite 解析失败"
test: ""
expecting: "将 exists 别名改为非关键字或使用引号包裹"
next_action: 修复所有 5 处 SELECT 1 as exists 为 SELECT 1 as "exists"
reasoning_checkpoint: ""
tdd_checkpoint: ""

# Evidence
- timestamp: 2026-05-03
  finding: |
    在 `electron/main/ipc/handlers/favorites.handler.ts` 中发现 5 处 SQL 语句使用 `SELECT 1 as exists`。
    `EXISTS` 是 SQLite 保留关键字，不能直接用作列别名，必须使用引号包裹或改用其他别名。
    
    受影响的操作:
    1. `favorites-create-collection` (第 88 行) — 检查收藏夹名称是否已存在
    2. `favorites-rename-collection` (第 149 行) — 检查新名称是否已被其他收藏夹使用
    3. `favorites-add` (第 373 行) — 检查壁纸是否已在此收藏夹中
    4. `favorites-move` (第 487 行) — 检查壁纸是否已在目标收藏夹中
    5. `favorites-is-favorite` (第 534 行) — 检查壁纸是否已收藏
    
    第 4、5 项虽未出现在错误报告中，但存在相同的 bug。

# Eliminated
- hypothesis: "数据库表结构问题"
  reason: "表结构使用 CREATE TABLE IF NOT EXISTS，且 collections/favorites 表在 get-collections 操作中正常使用，说明表结构无问题"

# Resolution
root_cause: "5 处 SQL 查询使用了 SELECT 1 as exists，但 EXISTS 是 SQLite 保留关键字，不能直接用作列别名，导致 SQL 解析失败"
fix: "将 favorites.handler.ts 中所有 5 处 SELECT 1 as exists 改为 SELECT 1 as \"exists\"（使用双引号包裹保留字），或改用非关键字别名如 found"
verification: "三个操作执行后不再报 SQL 语法错误"
files_changed:
  - electron/main/ipc/handlers/favorites.handler.ts
