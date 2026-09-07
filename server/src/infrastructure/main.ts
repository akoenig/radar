import { Effect, Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { BottleSecretsLive } from "../adapters/outbound/secrets/BottleSecrets.js"
import { ProxyAwareHttpClientLive } from "../adapters/outbound/feed/ProxyAwareHttpClient.js"
import { makeAppLayer } from "./AppLayer.js"
import { loadConfig, resolveMcpToken } from "./Config.js"

const program = Effect.gen(function* () {
  const config = yield* loadConfig
  const mcpToken = yield* resolveMcpToken(config.mcpToken).pipe(
    Effect.provide(BottleSecretsLive.pipe(Layer.provide(ProxyAwareHttpClientLive))),
  )
  yield* Effect.annotateLogs(Effect.logInfo("starting reader"), {
    port: config.port,
    database: config.databasePath,
    staticDir: config.staticDir,
  })
  yield* Layer.launch(makeAppLayer({ ...config, mcpToken }))
})

NodeRuntime.runMain(program)
