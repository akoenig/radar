import { Context, Effect, Layer, Semaphore } from "effect"
import { DatabaseSync, type SQLInputValue } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { MIGRATIONS } from "./migrations.js"

export type SqlValue = SQLInputValue
export type SqlRow = Record<string, SqlValue>

/**
 * Thin Effect wrapper over Node's built-in synchronous SQLite driver. All
 * driver errors surface as defects: a broken database is not a domain
 * condition the application can act on.
 */
export interface SqliteDatabaseShape {
  readonly run: (sql: string, params?: ReadonlyArray<SqlValue>) => Effect.Effect<{ readonly changes: number }>
  readonly all: <Row extends SqlRow = SqlRow>(sql: string, params?: ReadonlyArray<SqlValue>) => Effect.Effect<ReadonlyArray<Row>>
  readonly get: <Row extends SqlRow = SqlRow>(sql: string, params?: ReadonlyArray<SqlValue>) => Effect.Effect<Row | undefined>
  /** Serialized, re-entrant transaction. */
  readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}

export class SqliteDatabase extends Context.Service<SqliteDatabase, SqliteDatabaseShape>()("@radar/SqliteDatabase") {}

/** Tracks whether the current fiber already runs inside a transaction. */
const InTransaction = Context.Reference<boolean>("@radar/SqliteDatabase/InTransaction", { defaultValue: () => false })

export interface SqliteOptions {
  /** File path, or ":memory:". */
  readonly path: string
}

export const makeSqliteDatabase = (options: SqliteOptions) =>
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.sync(() => {
        if (options.path !== ":memory:") mkdirSync(dirname(options.path), { recursive: true })
        const db = new DatabaseSync(options.path)
        db.exec("PRAGMA journal_mode = WAL")
        db.exec("PRAGMA foreign_keys = ON")
        db.exec("PRAGMA busy_timeout = 5000")
        return db
      }),
      (db) => Effect.sync(() => db.close()),
    )
    yield* Effect.sync(() => migrate(db))
    yield* Effect.annotateLogs(Effect.logInfo("sqlite ready"), { path: options.path })

    const lock = yield* Semaphore.make(1)

    const run: SqliteDatabaseShape["run"] = (sql, params = []) =>
      Effect.sync(() => {
        const result = db.prepare(sql).run(...params)
        return { changes: Number(result.changes) }
      })

    const all: SqliteDatabaseShape["all"] = <Row extends SqlRow>(sql: string, params: ReadonlyArray<SqlValue> = []) =>
      Effect.sync(() => db.prepare(sql).all(...params) as unknown as ReadonlyArray<Row>)

    const get: SqliteDatabaseShape["get"] = <Row extends SqlRow>(sql: string, params: ReadonlyArray<SqlValue> = []) =>
      Effect.sync(() => db.prepare(sql).get(...params) as Row | undefined)

    const transaction: SqliteDatabaseShape["transaction"] = (effect) =>
      Effect.flatMap(InTransaction, (nested) =>
        nested
          ? effect
          : Semaphore.withPermits(lock, 1)(
              Effect.acquireUseRelease(
                Effect.sync(() => db.exec("BEGIN IMMEDIATE")),
                () => effect,
                (_, exit) => Effect.sync(() => db.exec(exit._tag === "Success" ? "COMMIT" : "ROLLBACK")),
              ).pipe(Effect.provideService(InTransaction, true)),
            ),
      )

    return { run, all, get, transaction } satisfies SqliteDatabaseShape
  })

export const SqliteDatabaseLive = (options: SqliteOptions) => Layer.effect(SqliteDatabase, makeSqliteDatabase(options))

const migrate = (db: DatabaseSync): void => {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)")
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((r) => r.version),
  )
  for (const [index, migration] of MIGRATIONS.entries()) {
    const version = index + 1
    if (applied.has(version)) continue
    db.exec("BEGIN")
    try {
      db.exec(migration)
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version, Date.now())
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
  }
}
