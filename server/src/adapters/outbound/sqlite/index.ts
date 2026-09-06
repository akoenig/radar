import { Layer } from "effect"
import { SqliteCategoryRepositoryLive } from "./SqliteCategoryRepository.js"
import { SqliteDatabaseLive, type SqliteOptions } from "./SqliteDatabase.js"
import { SqliteEntryRepositoryLive } from "./SqliteEntryRepository.js"
import { SqliteFeedRepositoryLive } from "./SqliteFeedRepository.js"
import { SqliteUnitOfWorkLive } from "./SqliteUnitOfWork.js"

export * from "./SqliteDatabase.js"

/** Every persistence port, backed by one SQLite file. */
export const SqlitePersistenceLive = (options: SqliteOptions) =>
  Layer.mergeAll(
    SqliteFeedRepositoryLive,
    SqliteEntryRepositoryLive,
    SqliteCategoryRepositoryLive,
    SqliteUnitOfWorkLive,
  ).pipe(Layer.provide(SqliteDatabaseLive(options)))
