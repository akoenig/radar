import { Clock, Context, Effect, Layer } from "effect"
import { Entry } from "../domain/model/Entry.js"
import type { Feed } from "../domain/model/Feed.js"
import { EntryId } from "../domain/model/Ids.js"
import type { ParsedFeed, ParsedItem } from "../domain/model/ParsedFeed.js"
import { EntryRepository } from "../domain/ports/EntryRepository.js"
import { FeedRepository } from "../domain/ports/FeedRepository.js"
import { IdGenerator } from "../domain/ports/IdGenerator.js"
import { UnitOfWork } from "../domain/ports/UnitOfWork.js"

/** Entries kept per feed before old read items are pruned. */
export const ENTRIES_KEPT_PER_FEED = 1000

export interface IngestResult {
  readonly feed: Feed
  readonly added: number
}

/**
 * Turns a parsed feed document into persisted entries and updated feed
 * metadata. Shared by subscription and refresh flows.
 */
export interface FeedIngestorShape {
  readonly ingest: (
    feed: Feed,
    parsed: ParsedFeed,
    hints: { readonly etag: string | null; readonly lastModified: string | null },
  ) => Effect.Effect<IngestResult>
}

export class FeedIngestor extends Context.Service<FeedIngestor, FeedIngestorShape>()("@radar/FeedIngestor") {}

const toEntry = (feed: Feed, item: ParsedItem, id: string, now: number): Entry =>
  new Entry({
    id: EntryId.make(id),
    feedId: feed.id,
    guid: item.guid,
    url: item.url,
    title: item.title.trim().length > 0 ? item.title.trim() : "(untitled)",
    author: item.author,
    summary: item.summary,
    content: item.content,
    // Undated items are treated as arriving now, but never from the future:
    // a mis-set publisher clock would otherwise pin the item to the top forever.
    publishedAt: item.publishedAt === null ? now : Math.min(item.publishedAt, now),
    fetchedAt: now,
    isRead: false,
    isSaved: false,
    readAt: null,
    savedAt: null,
  })

export const FeedIngestorLive = Layer.effect(
  FeedIngestor,
  Effect.gen(function* () {
    const feeds = yield* FeedRepository
    const entries = yield* EntryRepository
    const ids = yield* IdGenerator
    const uow = yield* UnitOfWork

    const ingest: FeedIngestorShape["ingest"] = Effect.fn("FeedIngestor.ingest")(function* (feed, parsed, hints) {
      const now = yield* Clock.currentTimeMillis
      const generated = yield* Effect.forEach(parsed.items, (item) =>
        Effect.map(ids.next, (id) => toEntry(feed, item, id, now)),
      )
      const updated = feed
        .withMetadata({ siteUrl: parsed.siteUrl, description: parsed.description, iconUrl: parsed.iconUrl }, now)
        .fetched(now, hints)

      const added = yield* uow.transaction(
        Effect.gen(function* () {
          const added = yield* entries.ingest(generated)
          yield* feeds.save(updated)
          yield* entries.prune(feed.id, ENTRIES_KEPT_PER_FEED)
          return added
        }),
      )
      yield* Effect.annotateLogs(Effect.logDebug("ingested feed"), { feedId: feed.id, added })
      return { feed: updated, added }
    })

    return { ingest }
  }),
)
