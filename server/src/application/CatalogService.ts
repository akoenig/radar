import { Clock, Context, Effect, Layer } from "effect"
import { CatalogEntryNotFound, type FeedNotParseable, type FeedUnreachable, type InvalidFeedUrl } from "../domain/errors.js"
import { directoryUrl, type CatalogFeed } from "../domain/model/Catalog.js"
import type { FeedId } from "../domain/model/Ids.js"
import { FeedCatalog } from "../domain/ports/FeedCatalog.js"
import { FeedDirectory } from "../domain/ports/FeedDirectory.js"
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

/**
 * Search results, plus where they came from. The directory is a third party
 * that can be down, blocked by a proxy or simply gone; when it is, the bundled
 * catalog answers instead and the client says so rather than showing an error.
 */
export interface SearchResults {
  readonly source: "directory" | "bundled"
  readonly feeds: ReadonlyArray<BrowsableFeed>
}

export interface CatalogServiceShape {
  readonly browse: Effect.Effect<ReadonlyArray<BrowsableTopic>>
  /** Searches the wider directory, falling back to the bundled catalog. */
  readonly search: (query: string, limit: number) => Effect.Effect<SearchResults>
  /** The newest few headlines of a catalog feed, so a subscription is not a blind choice. */
  readonly preview: (id: string) => Effect.Effect<ReadonlyArray<PreviewItem>, PreviewError>
}

export class CatalogService extends Context.Service<CatalogService, CatalogServiceShape>()("@reader/CatalogService") {}

/** Results per search. Enough to scroll, few enough to stay one request. */
export const SEARCH_LIMIT = 24

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
    const directory = yield* FeedDirectory
    const feeds = yield* FeedRepository
    const source = yield* FeedSource

    /** Stamps the reader's own state onto entries that know nothing about it. */
    const withSubscriptions = (found: ReadonlyArray<CatalogFeed>) =>
      Effect.map(feeds.findAll, (subscribed) => {
        const byUrl = new Map(subscribed.map((f) => [canonical(f.url), f.id] as const))
        return found.map((feed) => ({ ...feed, subscribedAs: byUrl.get(canonical(feed.url)) ?? null }))
      })

    const browse: CatalogServiceShape["browse"] = Effect.gen(function* () {
      const [topics, subscribed] = yield* Effect.all([catalog.topics, feeds.findAll])
      const byUrl = new Map(subscribed.map((f) => [canonical(f.url), f.id] as const))
      return topics.map((topic) => ({
        ...topic,
        feeds: topic.feeds.map((feed) => ({ ...feed, subscribedAs: byUrl.get(canonical(feed.url)) ?? null })),
      }))
    })

    const bundled = (needle: string) =>
      Effect.map(catalog.topics, (topics) =>
        topics
          .flatMap((topic) => topic.feeds)
          .filter((feed) => `${feed.title} ${feed.description} ${feed.siteUrl}`.toLowerCase().includes(needle)),
      )

    const search: CatalogServiceShape["search"] = Effect.fn("CatalogService.search")(function* (query, limit) {
      const needle = query.trim()
      if (needle.length === 0) return { source: "bundled" as const, feeds: [] }

      const found = yield* directory.search(needle, limit).pipe(
        Effect.map((feeds) => ({ source: "directory" as const, feeds })),
        Effect.catchTag("DirectoryUnavailable", (error) =>
          Effect.as(
            Effect.logWarning(`Feed directory unavailable, falling back to the bundled catalog: ${error.reason}`),
            { source: "bundled" as const, feeds: [] as ReadonlyArray<CatalogFeed> },
          ),
        ),
      )

      // An empty answer from a working directory is an answer — "nothing found"
      // — so only substitute the bundled list when the directory itself failed.
      const feeds = found.source === "bundled" ? yield* bundled(needle.replace(/^#/, "").toLowerCase()) : found.feeds
      return { source: found.source, feeds: yield* withSubscriptions(feeds) }
    })

    const cache = new Map<string, { readonly at: number; readonly items: ReadonlyArray<PreviewItem> }>()

    /**
     * Previews are addressed by catalog id. A bundled slug is looked up; a
     * directory id carries its own address, so a result stays previewable
     * without the server remembering every search it has answered.
     */
    const findUrl = (id: string) =>
      Effect.flatMap(catalog.topics, (topics) => {
        const found = topics.flatMap((t) => t.feeds).find((f) => f.id === id)
        if (found) return Effect.succeed(found.url)
        const url = directoryUrl(id)
        return url === null ? new CatalogEntryNotFound({ id }) : Effect.succeed(url)
      })

    const preview: CatalogServiceShape["preview"] = Effect.fn("CatalogService.preview")(function* (id) {
      const now = yield* Clock.currentTimeMillis
      const hit = cache.get(id)
      if (hit && now - hit.at < PREVIEW_TTL_MILLIS) return hit.items

      const url = yield* findUrl(id)
      const outcome = yield* source.fetch(url)
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

    return { browse, search, preview }
  }),
)
