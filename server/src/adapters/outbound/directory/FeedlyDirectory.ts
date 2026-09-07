import { Clock, Duration, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { DirectoryUnavailable } from "../../../domain/errors.js"
import { directoryId, type CatalogFeed } from "../../../domain/model/Catalog.js"
import { FeedDirectory, type FeedDirectoryShape } from "../../../domain/ports/FeedDirectory.js"

/**
 * Feed search backed by Feedly's public directory — the same index its own
 * search box uses, which is why results come with a subscriber count and a
 * posting cadence rather than just a URL.
 *
 * No credentials: this endpoint is the one Feedly leaves open. It is also
 * undocumented, so treat it as something that can go away — every failure here
 * is a DirectoryUnavailable, and the caller is expected to fall back to the
 * bundled catalog rather than show an error.
 */
const ENDPOINT = "https://cloud.feedly.com/v3/search/feeds"
const TIMEOUT = Duration.seconds(8)

/** Searches repeat constantly while typing; the index does not move that fast. */
export const SEARCH_TTL_MILLIS = 15 * 60_000
const MAX_CACHED_SEARCHES = 200

const str = (value: unknown): string | null => (typeof value === "string" && value.trim().length > 0 ? value.trim() : null)
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)

/** `feed/https://example.com/rss` is Feedly's id format; the address is the tail. */
const feedUrl = (raw: unknown): string | null => {
  const id = str(raw)
  if (id === null) return null
  const url = id.startsWith("feed/") ? id.slice("feed/".length) : id
  return /^https?:\/\//i.test(url) ? url : null
}

const origin = (url: string): string => {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

/**
 * Maps the directory's answer onto catalog entries, dropping anything without a
 * usable address. Written defensively on purpose: this is an unversioned API,
 * and a changed field should cost a result, not the whole search.
 */
export const parseResults = (body: unknown): ReadonlyArray<CatalogFeed> => {
  const results = (body as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  const feeds: Array<CatalogFeed> = []
  for (const raw of results) {
    if (typeof raw !== "object" || raw === null) continue
    const result = raw as Record<string, unknown>
    if (result["valid"] === false) continue
    const url = feedUrl(result["feedId"] ?? result["id"])
    if (url === null) continue
    const site = str(result["website"]) ?? origin(url)
    feeds.push({
      id: directoryId(url),
      title: str(result["title"]) ?? origin(url).replace(/^https?:\/\//, ""),
      description: str(result["description"]) ?? "",
      url,
      siteUrl: site,
      reach: {
        // Feedly serves icons over plain http; upgrade them so a page loaded
        // over https does not have its images blocked as mixed content.
        iconUrl: str(result["iconUrl"])?.replace(/^http:\/\//, "https://") ?? null,
        subscribers: num(result["subscribers"]),
        postsPerWeek: num(result["velocity"]),
        lastPublishedAt: num(result["lastUpdated"]),
        topics: Array.isArray(result["topics"]) ? result["topics"].filter((t): t is string => typeof t === "string") : [],
      },
    })
  }
  return feeds
}

export const FeedlyDirectoryLive = Layer.effect(
  FeedDirectory,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.setHeaders({ accept: "application/json" })),
    )
    const cache = new Map<string, { readonly at: number; readonly feeds: ReadonlyArray<CatalogFeed> }>()

    const search: FeedDirectoryShape["search"] = Effect.fn("FeedlyDirectory.search")(function* (query, limit) {
      const key = `${query.toLowerCase()}|${limit}`
      const now = yield* Clock.currentTimeMillis
      const hit = cache.get(key)
      if (hit && now - hit.at < SEARCH_TTL_MILLIS) return hit.feeds

      const feeds = yield* Effect.gen(function* () {
        const response = yield* client.get(ENDPOINT, { urlParams: { query, count: limit, locale: "en" } })
        if (response.status >= 400) {
          return yield* new DirectoryUnavailable({ reason: `The directory answered ${response.status}` })
        }
        return parseResults(yield* response.json)
      }).pipe(
        Effect.timeout(TIMEOUT),
        Effect.catchTags({
          TimeoutError: () => new DirectoryUnavailable({ reason: "The directory timed out" }),
          HttpClientError: (e) => new DirectoryUnavailable({ reason: e.message }),
        }),
      )

      // A plain FIFO trim: entries are equivalent, so the oldest is as good a
      // victim as any, and it keeps a long browsing session bounded.
      if (cache.size >= MAX_CACHED_SEARCHES) {
        const oldest = cache.keys().next()
        if (!oldest.done) cache.delete(oldest.value)
      }
      cache.set(key, { at: now, feeds })
      return feeds
    })

    return { search } satisfies FeedDirectoryShape
  }),
)
