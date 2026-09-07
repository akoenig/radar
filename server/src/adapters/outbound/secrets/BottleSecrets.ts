import { Context, Effect, Layer, Option, Redacted } from "effect"
import { HttpBody, HttpClient } from "effect/unstable/http"

/**
 * Reads secrets the owner has granted this app.
 *
 * Cloud in a Bottle does not inject granted secrets into the environment: a
 * grant in `cloudinabottle.toml` only says the app *may* read a key, and the
 * value is fetched at runtime through the router. So the manifest name
 * (READER_MCP_TOKEN) and the setting it feeds (the MCP token) are connected
 * here rather than by any configuration.
 */
export interface SecretsShape {
  readonly get: (key: string) => Effect.Effect<Option.Option<Redacted.Redacted<string>>>
}

export class Secrets extends Context.Service<Secrets, SecretsShape>()("@radar/Secrets") {}

const ROUTER_URL = "BOTTLE_ROUTER_URL"
const APP_TOKEN = "BOTTLE_APP_TOKEN"

/**
 * Pulls a requested key out of the service's answer.
 *
 * The response envelope is not pinned down by the published docs, so rather
 * than guess one shape and fail silently on another, accept the key at the top
 * level or inside any single-level container, and treat anything else as
 * "not found" — which falls back to the environment.
 */
export const extractSecret = (body: unknown, key: string): string | null => {
  if (typeof body !== "object" || body === null) return null
  const record = body as Record<string, unknown>
  const direct = record[key]
  if (typeof direct === "string") return direct
  for (const value of Object.values(record)) {
    if (typeof value === "object" && value !== null) {
      const nested = (value as Record<string, unknown>)[key]
      if (typeof nested === "string") return nested
    }
  }
  return null
}

/**
 * The real secrets service. Absent the router variables — anywhere but a
 * deployed instance — every lookup is simply empty, so local runs fall through
 * to the environment instead of failing.
 */
export const BottleSecretsLive = Layer.effect(
  Secrets,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const routerUrl = process.env[ROUTER_URL]
    const appToken = process.env[APP_TOKEN]

    if (!routerUrl || !appToken) {
      yield* Effect.logInfo(`No ${ROUTER_URL}/${APP_TOKEN}; secrets service not in use`)
      return { get: () => Effect.succeed(Option.none<Redacted.Redacted<string>>()) } satisfies SecretsShape
    }

    const get: SecretsShape["get"] = (key) =>
      client
        .post(`${routerUrl.replace(/\/+$/, "")}/api/services/v2/call/secrets/get`, {
          headers: { authorization: `Bearer ${appToken}`, "content-type": "application/json" },
          body: HttpBody.jsonUnsafe({ keys: [key] }),
        })
        .pipe(
          Effect.flatMap((response) =>
            response.status >= 400
              ? Effect.as(Effect.logWarning(`Secrets service answered ${response.status} for ${key}`), null)
              : Effect.map(response.json, (body) => extractSecret(body, key)),
          ),
          Effect.map((value) => (value === null ? Option.none() : Option.some(Redacted.make(value)))),
          // A missing secret must never stop Radar from starting.
          Effect.catchCause((cause) =>
            Effect.as(Effect.logWarning(`Could not read secret ${key}`, cause), Option.none()),
          ),
        )

    return { get } satisfies SecretsShape
  }),
)
