import { Duration, Layer } from "effect"
import { ApplicationLive } from "../application/index.js"
import { HttpServerLive } from "../adapters/inbound/http/HttpServerLive.js"
import { RefreshSchedulerLive } from "../adapters/inbound/scheduler/RefreshScheduler.js"
import { StaticFeedCatalogLive } from "../adapters/outbound/catalog/StaticFeedCatalog.js"
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
export const makeAppLayer = (config: AppConfigShape) => {
  const DrivenAdapters = Layer.mergeAll(
    SqlitePersistenceLive({ path: config.databasePath }),
    HttpFeedSourceLive.pipe(Layer.provide(ProxyAwareHttpClientLive)),
    CryptoIdGeneratorLive,
    FastXmlOpmlCodecLive,
    StaticFeedCatalogLive,
  )

  const Application = ApplicationLive.pipe(Layer.provide(DrivenAdapters))

  const DrivingAdapters = Layer.mergeAll(
    HttpServerLive({ host: config.host, port: config.port, staticDir: config.staticDir, mcpToken: config.mcpToken }),
    RefreshSchedulerLive({ interval: config.refreshInterval, initialDelay: Duration.seconds(5) }),
  )

  return DrivingAdapters.pipe(Layer.provide(Application))
}
