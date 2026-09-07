import { Config, Context, Duration, Effect, Layer, Option, Redacted } from "effect"
import { Secrets } from "../adapters/outbound/secrets/BottleSecrets.js"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

export interface AppConfigShape {
  readonly host: string
  readonly port: number
  readonly databasePath: string
  readonly staticDir: string
  readonly refreshInterval: Duration.Duration
  /**
   * When absent, the MCP endpoint is not served at all. Resolved from the
   * secrets service first and MCP_TOKEN second — see resolveMcpToken.
   */
  readonly mcpToken: Redacted.Redacted<string> | null
}

export class AppConfig extends Context.Service<AppConfig, AppConfigShape>()("@reader/AppConfig") {}

/** `<repo>/web/dist`, whether running from `src/` via tsx or from `dist/`. */
const defaultStaticDir = fileURLToPath(new URL("../../../web/dist", import.meta.url))

/**
 * Reads configuration from the environment. Cloud in a Bottle injects
 * `BOTTLE_APP_DATA_DIR` for persistent storage; plain deployments fall back
 * to `./data`.
 */
export const loadConfig: Effect.Effect<AppConfigShape, Config.ConfigError> = Effect.gen(function* () {
  const host = yield* Config.string("HOST").pipe(Config.withDefault("0.0.0.0"))
  const port = yield* Config.port("PORT").pipe(Config.withDefault(8080))
  const bottleDataDir = yield* Config.string("BOTTLE_APP_DATA_DIR").pipe(Config.withDefault(""))
  const dataDir = yield* Config.string("DATA_DIR").pipe(Config.withDefault(bottleDataDir || resolve("data")))
  const databasePath = yield* Config.string("DATABASE_PATH").pipe(Config.withDefault(resolve(dataDir, "reader.db")))
  const staticDir = yield* Config.string("STATIC_DIR").pipe(Config.withDefault(defaultStaticDir))
  const refreshMinutes = yield* Config.number("REFRESH_INTERVAL_MINUTES").pipe(Config.withDefault(15))
  const mcpSecret = yield* Config.string("MCP_TOKEN").pipe(Config.withDefault(""))
  return {
    host,
    port,
    databasePath,
    staticDir,
    refreshInterval: Duration.minutes(Math.max(1, refreshMinutes)),
    mcpToken: mcpSecret.trim().length > 0 ? Redacted.make(mcpSecret.trim()) : null,
  }
})

export const AppConfigLive = Layer.effect(AppConfig, loadConfig)

/** The key the owner grants in cloudinabottle.toml. */
export const MCP_TOKEN_SECRET = "READER_MCP_TOKEN"

/**
 * Settles where the MCP token comes from.
 *
 * On a deployed instance it is the granted secret; the manifest names the key
 * and nothing injects it, so the mapping onto this setting happens here. Local
 * runs have no secrets service, so MCP_TOKEN stays the way to switch MCP on by
 * hand.
 */
export const resolveMcpToken = (fromEnv: Redacted.Redacted<string> | null) =>
  Effect.gen(function* () {
    const secrets = yield* Secrets
    const granted = yield* secrets.get(MCP_TOKEN_SECRET)
    if (Option.isSome(granted)) {
      yield* Effect.logInfo(`MCP token read from the secrets service (${MCP_TOKEN_SECRET})`)
      return granted.value
    }
    if (fromEnv !== null) {
      yield* Effect.logInfo("MCP token read from MCP_TOKEN")
      return fromEnv
    }
    return null
  })
