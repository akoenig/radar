import { Effect, Layer } from "effect"
import { NodeHttpClient } from "@effect/platform-node"
import { EnvHttpProxyAgent } from "undici"

/**
 * An HTTP client that honours the standard `HTTP_PROXY`, `HTTPS_PROXY` and
 * `NO_PROXY` environment variables.
 *
 * Effect's default undici dispatcher ignores them, so on a host that only has
 * egress through a proxy every feed fetch would time out. `EnvHttpProxyAgent`
 * behaves like a plain agent when no proxy is configured, so this is safe to
 * use unconditionally.
 */
export const ProxyAwareDispatcherLive = Layer.effect(
  NodeHttpClient.Dispatcher,
  Effect.acquireRelease(
    Effect.sync(() => new EnvHttpProxyAgent()),
    (agent) => Effect.promise(() => agent.close()),
  ),
)

export const ProxyAwareHttpClientLive = NodeHttpClient.layerUndiciNoDispatcher.pipe(
  Layer.provide(ProxyAwareDispatcherLive),
)
