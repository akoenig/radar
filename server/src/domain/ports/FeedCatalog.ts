import { Context, Effect } from "effect"
import type { CatalogTopic } from "../model/Catalog.js"

/**
 * Source of the suggested-feed directory. A static bundled list today; a
 * remote directory could replace it without the application noticing.
 */
export interface FeedCatalogShape {
  readonly topics: Effect.Effect<ReadonlyArray<CatalogTopic>>
}

export class FeedCatalog extends Context.Service<FeedCatalog, FeedCatalogShape>()("@radar/FeedCatalog") {}
