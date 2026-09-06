import { Clock, Context, Effect, Layer, Option } from "effect"
import {
  CategoryNotFound,
  FeedAlreadyExists,
  FeedNotFound,
  FeedNotParseable,
  FeedUnreachable,
  InvalidFeedUrl,
  NoFeedDiscovered,
} from "../domain/errors.js"
import { Feed } from "../domain/model/Feed.js"
import { CategoryId, FeedId } from "../domain/model/Ids.js"
import type { DiscoveredFeed, FetchOutcome } from "../domain/model/ParsedFeed.js"
import { CategoryRepository } from "../domain/ports/CategoryRepository.js"
import { EntryRepository } from "../domain/ports/EntryRepository.js"
import { FeedRepository } from "../domain/ports/FeedRepository.js"
import { FeedSource } from "../domain/ports/FeedSource.js"
import { IdGenerator } from "../domain/ports/IdGenerator.js"
import { FeedIngestor } from "./FeedIngestor.js"

export interface SubscribeInput {
  readonly url: string
  readonly title?: string | undefined
  readonly categoryId?: CategoryId | null | undefined
}

export interface FeedPatch {
  readonly title?: string | undefined
  readonly url?: string | undefined
  readonly categoryId?: CategoryId | null | undefined
  readonly position?: number | undefined
}

export interface FeedWithCounts {
  readonly feed: Feed
  readonly unread: number
}

export type SubscribeError =
  | FeedAlreadyExists
  | CategoryNotFound
  | InvalidFeedUrl
  | FeedUnreachable
  | FeedNotParseable
  | NoFeedDiscovered

export interface SubscriptionServiceShape {
  readonly list: Effect.Effect<ReadonlyArray<FeedWithCounts>>
  readonly get: (id: FeedId) => Effect.Effect<FeedWithCounts, FeedNotFound>
  readonly subscribe: (input: SubscribeInput) => Effect.Effect<Feed, SubscribeError>
  readonly update: (id: FeedId, patch: FeedPatch) => Effect.Effect<Feed, FeedNotFound | CategoryNotFound | FeedAlreadyExists>
  readonly unsubscribe: (id: FeedId) => Effect.Effect<void, FeedNotFound>
  readonly discover: (url: string) => Effect.Effect<ReadonlyArray<DiscoveredFeed>, InvalidFeedUrl | FeedUnreachable>
}

export class SubscriptionService extends Context.Service<SubscriptionService, SubscriptionServiceShape>()(
  "@reader/SubscriptionService",
) {}

export const SubscriptionServiceLive = Layer.effect(
  SubscriptionService,
  Effect.gen(function* () {
    const feeds = yield* FeedRepository
    const entries = yield* EntryRepository
    const categories = yield* CategoryRepository
    const source = yield* FeedSource
    const ids = yield* IdGenerator
    const ingestor = yield* FeedIngestor

    const requireFeed = (id: FeedId) =>
      Effect.flatMap(feeds.findById(id), Option.match({ onNone: () => new FeedNotFound({ id }), onSome: Effect.succeed }))

    const requireCategory = (id: CategoryId | null | undefined) =>
      id === null || id === undefined
        ? Effect.void
        : Effect.flatMap(
            categories.findById(id),
            Option.match({ onNone: () => new CategoryNotFound({ id }), onSome: () => Effect.void }),
          )

    const ensureUrlFree = (url: string, except?: FeedId) =>
      Effect.flatMap(feeds.findByUrl(url), (existing) =>
        Option.isSome(existing) && existing.value.id !== except
          ? new FeedAlreadyExists({ url, existingId: existing.value.id })
          : Effect.void,
      )

    /**
     * Fetch a URL as a feed. If the document is a web page instead, fall back
     * to autodiscovery and fetch the first advertised feed.
     */
    const resolve = (url: string): Effect.Effect<Extract<FetchOutcome, { _tag: "Fetched" }>, SubscribeError> =>
      source.fetch(url).pipe(
        Effect.flatMap((outcome) =>
          outcome._tag === "Fetched"
            ? Effect.succeed(outcome)
            : Effect.fail(new FeedNotParseable({ url, reason: "Server returned no content for a fresh request" })),
        ),
        Effect.catchTag("FeedNotParseable", (parseError) =>
          Effect.gen(function* () {
            const candidates = yield* source.discover(url)
            const first = candidates[0]
            if (!first) return yield* new NoFeedDiscovered({ url })
            const outcome = yield* source.fetch(first.url)
            if (outcome._tag !== "Fetched") return yield* parseError
            return outcome
          }),
        ),
      )

    const get: SubscriptionServiceShape["get"] = (id) =>
      Effect.gen(function* () {
        const feed = yield* requireFeed(id)
        const unread = yield* entries.unreadCountByFeed
        return { feed, unread: unread.get(feed.id) ?? 0 }
      })

    const list: SubscriptionServiceShape["list"] = Effect.gen(function* () {
      const [all, unread] = yield* Effect.all([feeds.findAll, entries.unreadCountByFeed])
      return all.map((feed) => ({ feed, unread: unread.get(feed.id) ?? 0 }))
    })

    const subscribe: SubscriptionServiceShape["subscribe"] = Effect.fn("SubscriptionService.subscribe")(
      function* (input) {
        const url = input.url.trim()
        yield* requireCategory(input.categoryId)
        yield* ensureUrlFree(url)
        const fetched = yield* resolve(url)
        // The feed may have redirected or been discovered at a different URL.
        yield* ensureUrlFree(fetched.finalUrl)

        const now = yield* Clock.currentTimeMillis
        const existing = yield* feeds.findAll
        const feed = new Feed({
          id: FeedId.make(yield* ids.next),
          url: fetched.finalUrl,
          siteUrl: fetched.feed.siteUrl,
          title: input.title?.trim() || fetched.feed.title?.trim() || hostOf(fetched.finalUrl),
          description: fetched.feed.description,
          iconUrl: fetched.feed.iconUrl,
          categoryId: input.categoryId ?? null,
          position: existing.length,
          lastFetchedAt: null,
          lastError: null,
          etag: null,
          lastModified: null,
          createdAt: now,
          updatedAt: now,
        })
        yield* feeds.save(feed)
        const result = yield* ingestor.ingest(feed, fetched.feed, fetched.hints)
        yield* Effect.annotateLogs(Effect.logInfo("subscribed"), { feedId: feed.id, url: feed.url, added: result.added })
        return result.feed
      },
    )

    const update: SubscriptionServiceShape["update"] = Effect.fn("SubscriptionService.update")(function* (id, patch) {
      const feed = yield* requireFeed(id)
      yield* requireCategory(patch.categoryId)
      if (patch.url !== undefined) yield* ensureUrlFree(patch.url.trim(), id)
      const now = yield* Clock.currentTimeMillis
      const updated = feed.edited(
        {
          ...(patch.title !== undefined && patch.title.trim().length > 0 ? { title: patch.title.trim() } : {}),
          ...(patch.url !== undefined ? { url: patch.url.trim() } : {}),
          ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
          ...(patch.position !== undefined ? { position: patch.position } : {}),
        },
        now,
      )
      yield* feeds.save(updated)
      return updated
    })

    const unsubscribe: SubscriptionServiceShape["unsubscribe"] = Effect.fn("SubscriptionService.unsubscribe")(
      function* (id) {
        yield* requireFeed(id)
        yield* feeds.remove(id)
        yield* Effect.annotateLogs(Effect.logInfo("unsubscribed"), { feedId: id })
      },
    )

    return { list, get, subscribe, update, unsubscribe, discover: source.discover }
  }),
)

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
