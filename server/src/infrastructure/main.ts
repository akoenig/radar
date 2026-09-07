import { Effect, Layer } from "effect"
import { NodeRuntime } from "@effect/platform-node"
import { BottleSecretsLive } from "../adapters/outbound/secrets/BottleSecrets.js"
import { ProxyAwareHttpClientLive } from "../adapters/outbound/feed/ProxyAwareHttpClient.js"
import { makeAppLayer } from "./AppLayer.js"
import { MCP_PATH } from "../adapters/inbound/mcp/McpHttp.js"
import { loadConfig, resolveMcpToken } from "./Config.js"
import { isPublic, publicPaths, readManifest } from "./Manifest.js"

/**
 * Router mode is sound only while the platform actually stands in front of
 * /mcp. If the manifest has opened that path to the internet, fall back to the
 * app's own token — which, absent a token, means MCP is not served at all.
 */
const soundAuthMode = (requested: "router" | "token") =>
  Effect.gen(function* () {
    if (requested !== "router") return requested
    const manifest = yield* readManifest
    if (manifest === null || !isPublic(publicPaths(manifest), MCP_PATH)) return "router" as const
    yield* Effect.logError(
      `MCP_AUTH=router, but cloudinabottle.toml makes ${MCP_PATH} public, so nothing would authenticate ` +
        `callers. Falling back to this app's own token; remove ${MCP_PATH} from public_paths to use router mode.`,
    )
    return "token" as const
  })

const program = Effect.gen(function* () {
  const config = yield* loadConfig
  const mcpAuth = yield* soundAuthMode(config.mcpAuth)
  // In router mode the platform authenticates callers, so there is no token to
  // look up and no reason to call the secrets service on every start.
  const mcpToken =
    mcpAuth === "router"
      ? null
      : yield* resolveMcpToken(config.mcpToken).pipe(
          Effect.provide(BottleSecretsLive.pipe(Layer.provide(ProxyAwareHttpClientLive))),
        )
  yield* Effect.annotateLogs(Effect.logInfo("starting reader"), {
    port: config.port,
    database: config.databasePath,
    staticDir: config.staticDir,
  })
  yield* Layer.launch(makeAppLayer({ ...config, mcpAuth, mcpToken }))
})

NodeRuntime.runMain(program)
