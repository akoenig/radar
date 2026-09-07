import { Effect } from "effect"
import { access, rename } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

/**
 * Radar shipped as "reader" first, and an instance from then has its data in
 * reader.db. Renaming a product must not cost anyone their subscriptions, so
 * on startup a missing radar.db adopts the old file — together with the WAL
 * and shared-memory files SQLite keeps beside it, which belong to the database
 * by name and would be orphaned by moving it alone.
 */
const LEGACY_NAME = "reader.db"
const SIDECARS = ["", "-wal", "-shm"]

const exists = (path: string) =>
  Effect.tryPromise(() => access(path)).pipe(
    Effect.as(true),
    Effect.catchCause(() => Effect.succeed(false)),
  )

export const adoptLegacyDatabase = (databasePath: string) =>
  Effect.gen(function* () {
    if (basename(databasePath) === LEGACY_NAME) return
    const legacy = join(dirname(databasePath), LEGACY_NAME)
    if ((yield* exists(databasePath)) || !(yield* exists(legacy))) return

    for (const suffix of SIDECARS) {
      const from = `${legacy}${suffix}`
      if (yield* exists(from)) {
        yield* Effect.tryPromise(() => rename(from, `${databasePath}${suffix}`))
      }
    }
    yield* Effect.logInfo(`Adopted ${legacy} as ${databasePath}`)
  }).pipe(
    // A failed adoption must not stop startup; a fresh database is the same
    // outcome the old code had with no file at all, and the old file stays put.
    Effect.catchCause((cause) => Effect.logWarning(`Could not adopt ${LEGACY_NAME}`, cause)),
  )
