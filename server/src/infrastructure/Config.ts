import { Config, Context, Duration, Effect, Layer, Redacted } from "effect"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

export interface AppConfigShape {
  readonly host: string
  readonly port: number
  readonly databasePath: string
  readonly staticDir: string
  readonly refreshInterval: Duration.Duration
  /** When absent, the MCP endpoint is not served at all. */
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
