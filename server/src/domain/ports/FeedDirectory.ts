import { Context, Effect } from "effect"
import type { DirectoryUnavailable } from "../errors.js"
import type { CatalogFeed } from "../model/Catalog.js"

/**
 * A searchable index of the world's feeds — the long tail the bundled catalog
 * cannot cover. Ranking, reach and cadence come from whoever implements this;
 * the application only asks a question and sorts nothing.
 */
export interface FeedDirectoryShape {
  readonly search: (query: string, limit: number) => Effect.Effect<ReadonlyArray<CatalogFeed>, DirectoryUnavailable>
}

export class FeedDirectory extends Context.Service<FeedDirectory, FeedDirectoryShape>()("@reader/FeedDirectory") {}
