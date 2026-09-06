import { Effect, Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { makeAppLayer } from "./AppLayer.js"
import { loadConfig } from "./Config.js"

const program = Effect.gen(function* () {
  const config = yield* loadConfig
  yield* Effect.annotateLogs(Effect.logInfo("starting reader"), {
    port: config.port,
    database: config.databasePath,
    staticDir: config.staticDir,
  })
  yield* Layer.launch(makeAppLayer(config))
})

NodeRuntime.runMain(program)
