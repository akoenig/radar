import { Clock, Context, Effect, Layer } from "effect"
import { CatalogEntryNotFound, type FeedNotParseable, type FeedUnreachable, type InvalidFeedUrl } from "../domain/errors.js"
import type { CatalogFeed } from "../domain/model/Catalog.js"
import type { FeedId } from "../domain/model/Ids.js"
import { FeedCatalog } from "../domain/ports/FeedCatalog.js"
import { FeedRepository } from "../domain/ports/FeedRepository.js"
import { FeedSource } from "../domain/ports/FeedSource.js"

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

/** A headline from a catalog feed, shown before subscribing. */
export interface PreviewItem {
  readonly title: string
  readonly url: string | null
  readonly publishedAt: number | null
}

export type PreviewError = CatalogEntryNotFound | InvalidFeedUrl | FeedUnreachable | FeedNotParseable

export interface CatalogServiceShape {
  readonly browse: Effect.Effect<ReadonlyArray<BrowsableTopic>>
  /** The newest few headlines of a catalog feed, so a subscription is not a blind choice. */
  readonly preview: (id: string) => Effect.Effect<ReadonlyArray<PreviewItem>, PreviewError>
}

export class CatalogService extends Context.Service<CatalogService, CatalogServiceShape>()("@reader/CatalogService") {}

/** How many headlines a preview shows. */
export const PREVIEW_LENGTH = 5

/**
 * How long a fetched preview is reused. Browsing the catalog should not put a
 * request on a publisher every time a card is opened.
 */
export const PREVIEW_TTL_MILLIS = 10 * 60_000

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
    const source = yield* FeedSource

    const browse: CatalogServiceShape["browse"] = Effect.gen(function* () {
      const [topics, subscribed] = yield* Effect.all([catalog.topics, feeds.findAll])
      const byUrl = new Map(subscribed.map((f) => [canonical(f.url), f.id] as const))
      return topics.map((topic) => ({
        ...topic,
        feeds: topic.feeds.map((feed) => ({ ...feed, subscribedAs: byUrl.get(canonical(feed.url)) ?? null })),
      }))
    })

    const cache = new Map<string, { readonly at: number; readonly items: ReadonlyArray<PreviewItem> }>()

    const findEntry = (id: string) =>
      Effect.flatMap(catalog.topics, (topics) => {
        const found = topics.flatMap((t) => t.feeds).find((f) => f.id === id)
        return found ? Effect.succeed(found) : new CatalogEntryNotFound({ id })
      })

    const preview: CatalogServiceShape["preview"] = Effect.fn("CatalogService.preview")(function* (id) {
      const now = yield* Clock.currentTimeMillis
      const hit = cache.get(id)
      if (hit && now - hit.at < PREVIEW_TTL_MILLIS) return hit.items

      const entry = yield* findEntry(id)
      const outcome = yield* source.fetch(entry.url)
      // A conditional request is never sent here, so anything but a body is a surprise.
      const items: ReadonlyArray<PreviewItem> =
        outcome._tag === "Fetched"
          ? outcome.feed.items.slice(0, PREVIEW_LENGTH).map((item) => ({
              title: item.title,
              url: item.url,
              publishedAt: item.publishedAt,
            }))
          : []
      cache.set(id, { at: now, items })
      return items
    })

    return { browse, preview }
  }),
)
