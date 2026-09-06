import { Clock, Context, Effect, Layer, Option } from "effect"
import { FeedNotFound } from "../domain/errors.js"
import type { Feed } from "../domain/model/Feed.js"
import type { FeedId } from "../domain/model/Ids.js"
import { FeedRepository } from "../domain/ports/FeedRepository.js"
import { FeedSource } from "../domain/ports/FeedSource.js"
import { FeedIngestor } from "./FeedIngestor.js"

export interface RefreshResult {
  readonly feedId: FeedId
  readonly title: string
  readonly added: number
  readonly error: string | null
}

export interface RefreshServiceShape {
  /** Refresh one feed. Fetch problems are recorded on the feed, not raised. */
  readonly refreshFeed: (id: FeedId) => Effect.Effect<RefreshResult, FeedNotFound>
  readonly refreshAll: Effect.Effect<ReadonlyArray<RefreshResult>>
}

export class RefreshService extends Context.Service<RefreshService, RefreshServiceShape>()("@reader/RefreshService") {}

/** How many feeds are fetched at once during a full refresh. */
export const REFRESH_CONCURRENCY = 6

export const RefreshServiceLive = Layer.effect(
  RefreshService,
  Effect.gen(function* () {
    const feeds = yield* FeedRepository
    const source = yield* FeedSource
    const ingestor = yield* FeedIngestor

    const refresh = (feed: Feed): Effect.Effect<RefreshResult> =>
      source.fetch(feed.url, feed.cacheHints).pipe(
        Effect.flatMap((outcome) =>
          outcome._tag === "NotModified"
            ? Effect.gen(function* () {
                const now = yield* Clock.currentTimeMillis
                yield* feeds.save(feed.fetched(now, feed.cacheHints))
                return { feedId: feed.id, title: feed.title, added: 0, error: null }
              })
            : Effect.map(ingestor.ingest(feed, outcome.feed, outcome.hints), ({ added }) => ({
                feedId: feed.id,
                title: feed.title,
                added,
                error: null,
              })),
        ),
        Effect.catchTags({
          InvalidFeedUrl: (e) => recordFailure(feed, e.reason),
          FeedUnreachable: (e) => recordFailure(feed, e.reason),
          FeedNotParseable: (e) => recordFailure(feed, e.reason),
        }),
        Effect.withSpan("RefreshService.refresh", { attributes: { feedId: feed.id } }),
      )

    const recordFailure = (feed: Feed, reason: string): Effect.Effect<RefreshResult> =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        yield* feeds.save(feed.failed(reason, now))
        yield* Effect.annotateLogs(Effect.logWarning("feed refresh failed"), { feedId: feed.id, reason })
        return { feedId: feed.id, title: feed.title, added: 0, error: reason }
      })

    const refreshFeed: RefreshServiceShape["refreshFeed"] = (id) =>
      Effect.flatMap(
        feeds.findById(id),
        Option.match({ onNone: () => new FeedNotFound({ id }), onSome: refresh }),
      )

    const refreshAll: RefreshServiceShape["refreshAll"] = Effect.gen(function* () {
      const all = yield* feeds.findAll
      const results = yield* Effect.forEach(all, refresh, { concurrency: REFRESH_CONCURRENCY })
      const added = results.reduce((n, r) => n + r.added, 0)
      const failed = results.filter((r) => r.error !== null).length
      yield* Effect.annotateLogs(Effect.logInfo("refreshed all feeds"), { feeds: all.length, added, failed })
      return results
    }).pipe(Effect.withSpan("RefreshService.refreshAll"))

    return { refreshFeed, refreshAll }
  }),
)
