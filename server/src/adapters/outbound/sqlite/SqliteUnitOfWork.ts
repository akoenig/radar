import { Effect, Layer } from "effect"
import { UnitOfWork } from "../../../domain/ports/UnitOfWork.js"
import { SqliteDatabase } from "./SqliteDatabase.js"

export const SqliteUnitOfWorkLive = Layer.effect(
  UnitOfWork,
  Effect.map(SqliteDatabase, (db) => ({ transaction: db.transaction })),
)
