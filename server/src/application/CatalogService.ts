import { Context, Effect, Layer } from "effect"
import type { CatalogFeed } from "../domain/model/Catalog.js"
import type { FeedId } from "../domain/model/Ids.js"
import { FeedCatalog } from "../domain/ports/FeedCatalog.js"
import { FeedRepository } from "../domain/ports/FeedRepository.js"

/** A catalog entry plus the reader's own state for it. */
export interface BrowsableFeed extends CatalogFeed {
  /** Set when the user already subscribes to this feed. */
  readonly subscribedAs: FeedId | null
}

export interface BrowsableTopic {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly feeds: ReadonlyArray<BrowsableFeed>
}

export interface CatalogServiceShape {
  readonly browse: Effect.Effect<ReadonlyArray<BrowsableTopic>>
}

export class CatalogService extends Context.Service<CatalogService, CatalogServiceShape>()("@reader/CatalogService") {}

/** Trailing slashes and case in the host should not hide an existing subscription. */
const canonical = (url: string): string => {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`
  } catch {
    return url.trim().replace(/\/+$/, "")
  }
}

export const CatalogServiceLive = Layer.effect(
  CatalogService,
  Effect.gen(function* () {
    const catalog = yield* FeedCatalog
    const feeds = yield* FeedRepository

    const browse: CatalogServiceShape["browse"] = Effect.gen(function* () {
      const [topics, subscribed] = yield* Effect.all([catalog.topics, feeds.findAll])
      const byUrl = new Map(subscribed.map((f) => [canonical(f.url), f.id] as const))
      return topics.map((topic) => ({
        ...topic,
        feeds: topic.feeds.map((feed) => ({ ...feed, subscribedAs: byUrl.get(canonical(feed.url)) ?? null })),
      }))
    })

    return { browse }
  }),
)
