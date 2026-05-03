// electron/main/sqlite.d.ts
// Custom type declarations for node:sqlite (Stability 1.1 -- @types/node does not include these).
// Minimal surface covering only what this project uses.

declare module 'node:sqlite' {
  type BindParams = Record<string, unknown> | unknown[]

  interface RunResult {
    lastInsertRowid: number
    changes: number
  }

  interface DatabaseOptions {
    open?: boolean
    readOnly?: boolean
    enableForeignKeyConstraints?: boolean
    timeout?: number
  }

  interface ColumnInfo {
    name: string
    column: string | null
    table: string | null
    database: string | null
    type: string | null
  }

  export class StatementSync<T extends Record<string, unknown> = Record<string, unknown>> {
    all(...params: BindParams[]): T[]
    get(...params: BindParams[]): T | undefined
    run(...params: BindParams[]): RunResult
    iterate(...params: BindParams[]): IterableIterator<T>
    columns(): ColumnInfo[]
    readonly sourceSQL: string
    readonly expandedSQL: string
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseOptions)
    close(): void
    exec(sql: string): void
    open(): void
    prepare<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string
    ): StatementSync<T>
    readonly isOpen: boolean
    readonly isTransaction: boolean
  }
}
