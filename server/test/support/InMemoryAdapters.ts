import { Effect, Layer, Option } from "effect"
import { DirectoryUnavailable, FeedNotParseable, FeedUnreachable } from "../../src/domain/errors.js"
import type { CatalogFeed } from "../../src/domain/model/Catalog.js"
import type { Category } from "../../src/domain/model/Category.js"
import type { Entry, EntryQuery, EntryScope } from "../../src/domain/model/Entry.js"
import type { Feed } from "../../src/domain/model/Feed.js"
import type { CategoryId, EntryId, FeedId } from "../../src/domain/model/Ids.js"
import type { DiscoveredFeed, FetchOutcome, ParsedFeed } from "../../src/domain/model/ParsedFeed.js"
import { CategoryRepository } from "../../src/domain/ports/CategoryRepository.js"
import { EntryRepository } from "../../src/domain/ports/EntryRepository.js"
import { FeedRepository } from "../../src/domain/ports/FeedRepository.js"
import { FeedDirectory } from "../../src/domain/ports/FeedDirectory.js"
import { FeedSource } from "../../src/domain/ports/FeedSource.js"
import { IdGenerator } from "../../src/domain/ports/IdGenerator.js"
import { UnitOfWork } from "../../src/domain/ports/UnitOfWork.js"

/**
 * In-memory implementations of every driven port. They exercise the
 * application layer without SQLite or the network, which is the whole point
 * of the hexagonal boundary.
 */
export interface MemoryState {
  readonly feeds: Map<string, Feed>
  readonly entries: Map<string, Entry>
  readonly categories: Map<string, Category>
  /** Feed URL -> scripted fetch outcome. */
  readonly remote: Map<string, ParsedFeed | "unreachable" | "html">
  readonly discoverable: Map<string, ReadonlyArray<DiscoveredFeed>>
  /** Search query -> scripted directory answer. */
  readonly directory: Map<string, ReadonlyArray<CatalogFeed> | "unavailable">
  counter: number
}

export const makeState = (): MemoryState => ({
  feeds: new Map(),
  entries: new Map(),
  categories: new Map(),
  remote: new Map(),
  discoverable: new Map(),
  directory: new Map(),
  counter: 0,
})

const byPosition = <A extends { position: number }>(a: A, b: A) => a.position - b.position
const newestFirst = (a: Entry, b: Entry) => b.publishedAt - a.publishedAt || (a.id < b.id ? 1 : -1)

export const MemoryFeedRepository = (state: MemoryState) =>
  Layer.succeed(FeedRepository, {
    findAll: Effect.sync(() => [...state.feeds.values()].sort(byPosition)),
    findById: (id) => Effect.sync(() => Option.fromNullishOr(state.feeds.get(id))),
    findByUrl: (url) => Effect.sync(() => Option.fromNullishOr([...state.feeds.values()].find((f) => f.url === url))),
    findByCategory: (categoryId) => Effect.sync(() => [...state.feeds.values()].filter((f) => f.categoryId === categoryId)),
    save: (feed) => Effect.sync(() => void state.feeds.set(feed.id, feed)),
    saveAll: (feeds) => Effect.sync(() => feeds.forEach((f) => state.feeds.set(f.id, f))),
    remove: (id) =>
      Effect.sync(() => {
        state.feeds.delete(id)
        for (const [key, e] of state.entries) if (e.feedId === id) state.entries.delete(key)
      }),
  })

const matches = (state: MemoryState, e: Entry, q: EntryQuery | EntryScope): boolean => {
  if (q.feedId !== undefined && e.feedId !== q.feedId) return false
  if (q.categoryId !== undefined && state.feeds.get(e.feedId)?.categoryId !== q.categoryId) return false
  return true
}

export const MemoryEntryRepository = (state: MemoryState) =>
  Layer.succeed(EntryRepository, {
    findById: (id) => Effect.sync(() => Option.fromNullishOr(state.entries.get(id))),
    findByIds: (ids) => Effect.sync(() => ids.flatMap((id) => state.entries.get(id) ?? [])),
    query: (q) =>
      Effect.sync(() =>
        [...state.entries.values()]
          .filter((e) => matches(state, e, q))
          .filter((e) => !q.unreadOnly || !e.isRead)
          .filter((e) => !q.savedOnly || e.isSaved)
          .filter((e) => !q.search || `${e.title} ${e.summary}`.toLowerCase().includes(q.search.toLowerCase()))
          .sort(newestFirst)
          .filter((e) => !q.before || e.publishedAt < q.before.publishedAt || (e.publishedAt === q.before.publishedAt && e.id < q.before.id))
          .slice(0, q.limit),
      ),
    ingest: (entries) =>
      Effect.sync(() => {
        let added = 0
        for (const entry of entries) {
          const existing = [...state.entries.values()].find((e) => e.feedId === entry.feedId && e.guid === entry.guid)
          if (existing) continue
          state.entries.set(entry.id, entry)
          added += 1
        }
        return added
      }),
    setRead: (ids, read, at) =>
      Effect.sync(() => {
        for (const id of ids) {
          const e = state.entries.get(id)
          if (e) state.entries.set(id, e.markRead(read, at))
        }
      }),
    markAllRead: (scope, at) =>
      Effect.sync(() => {
        let n = 0
        for (const [id, e] of state.entries) {
          if (e.isRead || !matches(state, e, scope)) continue
          if (scope.savedOnly && !e.isSaved) continue
          if (scope.publishedBefore !== undefined && e.publishedAt > scope.publishedBefore) continue
          state.entries.set(id, e.markRead(true, at))
          n += 1
        }
        return n
      }),
    save: (entry) => Effect.sync(() => void state.entries.set(entry.id, entry)),
    unreadCountByFeed: Effect.sync(() => {
      const counts = new Map<FeedId, number>()
      for (const e of state.entries.values()) if (!e.isRead) counts.set(e.feedId, (counts.get(e.feedId) ?? 0) + 1)
      return counts
    }),
    stats: Effect.sync(() => {
      const all = [...state.entries.values()]
      return { unread: all.filter((e) => !e.isRead).length, saved: all.filter((e) => e.isSaved).length }
    }),
    prune: () => Effect.succeed(0),
  })

export const MemoryCategoryRepository = (state: MemoryState) =>
  Layer.succeed(CategoryRepository, {
    findAll: Effect.sync(() => [...state.categories.values()].sort(byPosition)),
    findById: (id) => Effect.sync(() => Option.fromNullishOr(state.categories.get(id))),
    findByName: (name) =>
      Effect.sync(() => Option.fromNullishOr([...state.categories.values()].find((c) => c.name.toLowerCase() === name.toLowerCase()))),
    save: (c) => Effect.sync(() => void state.categories.set(c.id, c)),
    remove: (id) => Effect.sync(() => void state.categories.delete(id)),
  })

export const MemoryFeedSource = (state: MemoryState) =>
  Layer.succeed(FeedSource, {
    fetch: (url) =>
      Effect.suspend((): Effect.Effect<FetchOutcome, FeedUnreachable | FeedNotParseable> => {
        const scripted = state.remote.get(url)
        if (scripted === undefined || scripted === "unreachable") {
          return Effect.fail(new FeedUnreachable({ url, reason: "scripted failure" }))
        }
        if (scripted === "html") return Effect.fail(new FeedNotParseable({ url, reason: "The URL points to a web page, not a feed" }))
        return Effect.succeed({ _tag: "Fetched", feed: scripted, hints: { etag: null, lastModified: null }, finalUrl: url })
      }),
    discover: (url) => Effect.sync(() => state.discoverable.get(url) ?? []),
  })

export const SequentialIdGenerator = (state: MemoryState) =>
  Layer.succeed(IdGenerator, { next: Effect.sync(() => `id-${++state.counter}`) })

/** The directory answers only what a test scripted; anything else is empty. */
export const MemoryDirectory = (state: MemoryState) =>
  Layer.succeed(FeedDirectory, {
    search: (query) => {
      const scripted = state.directory.get(query)
      return scripted === "unavailable"
        ? new DirectoryUnavailable({ reason: "scripted outage" })
        : Effect.succeed(scripted ?? [])
    },
  })

export const PassThroughUnitOfWork = Layer.succeed(UnitOfWork, { transaction: (effect) => effect })

/** Every driven port, in memory. */
export const MemoryAdapters = (state: MemoryState) =>
  Layer.mergeAll(
    MemoryFeedRepository(state),
    MemoryEntryRepository(state),
    MemoryCategoryRepository(state),
    MemoryFeedSource(state),
    MemoryDirectory(state),
    SequentialIdGenerator(state),
    PassThroughUnitOfWork,
  )

export const parsedFeed = (overrides: Partial<ParsedFeed> = {}): ParsedFeed => ({
  title: "Example Feed",
  siteUrl: "https://example.com/",
  description: "An example",
  iconUrl: null,
  items: [
    { guid: "a", url: "https://example.com/a", title: "Post A", author: "Ann", summary: "First", content: "<p>First</p>", publishedAt: 1_700_000_000_000 },
    { guid: "b", url: "https://example.com/b", title: "Post B", author: null, summary: "Second", content: null, publishedAt: 1_700_000_100_000 },
  ],
  ...overrides,
})

export const ids = {
  feed: (s: string) => s as FeedId,
  entry: (s: string) => s as EntryId,
  category: (s: string) => s as CategoryId,
}
