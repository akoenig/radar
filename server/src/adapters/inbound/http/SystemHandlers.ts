import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CatalogService, SEARCH_LIMIT, type BrowsableFeed } from "../../../application/CatalogService.js"
import { EntryService } from "../../../application/EntryService.js"
import { OpmlService } from "../../../application/OpmlService.js"
import { RefreshService } from "../../../application/RefreshService.js"
import { SubscriptionService } from "../../../application/SubscriptionService.js"
import { RadarApi } from "./Api.js"
import { mapDomainErrors } from "./ApiErrors.js"

export const APP_VERSION = "0.1.0"

/**
 * Bundled entries carry no reach, so the field is absent on them; the wire
 * format says null instead, which is one less shape for a client to handle.
 */
const feedDto = (feed: BrowsableFeed) => ({ ...feed, reach: feed.reach ?? null })

export const SystemHandlersLive = HttpApiBuilder.group(RadarApi, "system", (handlers) =>
  Effect.gen(function* () {
    const entries = yield* EntryService
    const refresh = yield* RefreshService
    const subscriptions = yield* SubscriptionService
    const opml = yield* OpmlService
    const catalog = yield* CatalogService

    return handlers
      .handle("health", () => Effect.succeed({ ok: true, version: APP_VERSION }))
      .handle("stats", () => entries.stats)
      .handle("refreshAll", () => refresh.refreshAll)
      .handle("discover", ({ query }) => mapDomainErrors(subscriptions.discover(query.url)))
      .handle("catalog", () =>
        Effect.map(catalog.browse, (topics) => topics.map((topic) => ({ ...topic, feeds: topic.feeds.map(feedDto) }))),
      )
      .handle("catalogSearch", ({ query }) =>
        Effect.map(catalog.search(query.q, SEARCH_LIMIT), (found) => ({
          source: found.source,
          feeds: found.feeds.map(feedDto),
        })),
      )
      .handle("catalogPreview", ({ params }) => mapDomainErrors(catalog.preview(params.id)))
      .handle("exportOpml", () => opml.exportOpml)
      .handle("importOpml", ({ payload }) => mapDomainErrors(opml.importOpml(payload)))
  }),
)
