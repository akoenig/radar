import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CatalogService } from "../../../application/CatalogService.js"
import { EntryService } from "../../../application/EntryService.js"
import { OpmlService } from "../../../application/OpmlService.js"
import { RefreshService } from "../../../application/RefreshService.js"
import { SubscriptionService } from "../../../application/SubscriptionService.js"
import { ReaderApi } from "./Api.js"
import { mapDomainErrors } from "./ApiErrors.js"

export const APP_VERSION = "0.1.0"

export const SystemHandlersLive = HttpApiBuilder.group(ReaderApi, "system", (handlers) =>
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
      .handle("catalog", () => catalog.browse)
      .handle("exportOpml", () => opml.exportOpml)
      .handle("importOpml", ({ payload }) => mapDomainErrors(opml.importOpml(payload)))
  }),
)
