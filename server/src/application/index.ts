import { Layer } from "effect"
import { CatalogServiceLive } from "./CatalogService.js"
import { CategoryServiceLive } from "./CategoryService.js"
import { EntryServiceLive } from "./EntryService.js"
import { FeedIngestorLive } from "./FeedIngestor.js"
import { OpmlServiceLive } from "./OpmlService.js"
import { RefreshServiceLive } from "./RefreshService.js"
import { SubscriptionServiceLive } from "./SubscriptionService.js"

export * from "./CatalogService.js"
export * from "./CategoryService.js"
export * from "./EntryService.js"
export * from "./FeedIngestor.js"
export * from "./OpmlService.js"
export * from "./RefreshService.js"
export * from "./SubscriptionService.js"

/**
 * Every application service, wired to each other but still requiring the
 * domain ports. Infrastructure decides which adapters satisfy the ports.
 */
export const ApplicationLive = Layer.mergeAll(
  SubscriptionServiceLive,
  CatalogServiceLive,
  RefreshServiceLive,
  EntryServiceLive,
  CategoryServiceLive,
  OpmlServiceLive,
).pipe(Layer.provideMerge(FeedIngestorLive), Layer.provideMerge(CategoryServiceLive))
