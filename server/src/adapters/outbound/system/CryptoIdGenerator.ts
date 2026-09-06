import { Effect, Layer } from "effect"
import { randomUUID } from "node:crypto"
import { IdGenerator } from "../../../domain/ports/IdGenerator.js"

export const CryptoIdGeneratorLive = Layer.succeed(IdGenerator, { next: Effect.sync(() => randomUUID()) })
