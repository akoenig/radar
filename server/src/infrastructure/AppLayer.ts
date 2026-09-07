import { Duration, Layer } from "effect"
import { ApplicationLive } from "../application/index.js"
import { HttpServerLive } from "../adapters/inbound/http/HttpServerLive.js"
import { mcpAccess } from "../adapters/inbound/mcp/McpHttp.js"
import { RefreshSchedulerLive } from "../adapters/inbound/scheduler/RefreshScheduler.js"
import { StaticFeedCatalogLive } from "../adapters/outbound/catalog/StaticFeedCatalog.js"
import { FeedlyDirectoryLive } from "../adapters/outbound/directory/FeedlyDirectory.js"
import { HttpFeedSourceLive } from "../adapters/outbound/feed/HttpFeedSource.js"
import { ProxyAwareHttpClientLive } from "../adapters/outbound/feed/ProxyAwareHttpClient.js"
import { FastXmlOpmlCodecLive } from "../adapters/outbound/opml/FastXmlOpmlCodec.js"
import { SqlitePersistenceLive } from "../adapters/outbound/sqlite/index.js"
import { CryptoIdGeneratorLive } from "../adapters/outbound/system/CryptoIdGenerator.js"
import type { AppConfigShape } from "./Config.js"

/**
 * Composition root. This is the only place that knows which adapter
 * satisfies which port.
 */
/**
 * `onListening` is for embedders: the desktop app asks for port 0 and needs to
 * be told which port it actually got before it can point a window at it.
 */
export type AppLayerOptions = AppConfigShape & { readonly onListening?: (address: string) => void }

export const makeAppLayer = (config: AppLayerOptions) => {
  const DrivenAdapters = Layer.mergeAll(
    SqlitePersistenceLive({ path: config.databasePath }),
    HttpFeedSourceLive.pipe(Layer.provide(ProxyAwareHttpClientLive)),
    CryptoIdGeneratorLive,
    FastXmlOpmlCodecLive,
    StaticFeedCatalogLive,
    FeedlyDirectoryLive.pipe(Layer.provide(ProxyAwareHttpClientLive)),
  )

  const Application = ApplicationLive.pipe(Layer.provide(DrivenAdapters))

  const DrivingAdapters = Layer.mergeAll(
    HttpServerLive({
      host: config.host,
      port: config.port,
      staticDir: config.staticDir,
      mcpAccess: mcpAccess(config.mcpAuth, config.mcpToken),
      ...(config.onListening === undefined ? {} : { onListening: config.onListening }),
    }),
    RefreshSchedulerLive({ interval: config.refreshInterval, initialDelay: Duration.seconds(5) }),
  )

  return DrivingAdapters.pipe(Layer.provide(Application))
}
