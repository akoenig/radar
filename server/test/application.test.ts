import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { ApplicationLive } from "../src/application/index.js"
import { CategoryService } from "../src/application/CategoryService.js"
import { EntryService } from "../src/application/EntryService.js"
import { OpmlService } from "../src/application/OpmlService.js"
import { RefreshService } from "../src/application/RefreshService.js"
import { SubscriptionService } from "../src/application/SubscriptionService.js"
import { StaticFeedCatalogLive } from "../src/adapters/outbound/catalog/StaticFeedCatalog.js"
import { FastXmlOpmlCodecLive } from "../src/adapters/outbound/opml/FastXmlOpmlCodec.js"
import { CatalogService } from "../src/application/CatalogService.js"
import { MemoryAdapters, ids, makeState, parsedFeed, type MemoryState } from "./support/InMemoryAdapters.js"

const run = <A, E>(
  state: MemoryState,
  effect: Effect.Effect<A, E, SubscriptionService | RefreshService | EntryService | CategoryService | OpmlService | CatalogService>,
) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        ApplicationLive.pipe(
          Layer.provide(MemoryAdapters(state)),
          Layer.provide(FastXmlOpmlCodecLive),
          Layer.provide(StaticFeedCatalogLive),
        ),
      ),
    ),
  )

describe("SubscriptionService", () => {
  it("subscribes to a feed URL and ingests its items", async () => {
    const state = makeState()
    state.remote.set("https://example.com/rss", parsedFeed())

    const feed = await run(
      state,
      Effect.flatMap(SubscriptionService, (s) => s.subscribe({ url: "https://example.com/rss" })),
    )

    expect(feed.title).toBe("Example Feed")
    expect(feed.siteUrl).toBe("https://example.com/")
    expect(feed.lastFetchedAt).not.toBeNull()
    expect(state.entries.size).toBe(2)
    expect([...state.entries.values()].every((e) => !e.isRead)).toBe(true)
  })

  it("falls back to autodiscovery when given a web page", async () => {
    const state = makeState()
    state.remote.set("https://example.com/", "html")
    state.remote.set("https://example.com/feed.xml", parsedFeed({ title: "Discovered" }))
    state.discoverable.set("https://example.com/", [{ url: "https://example.com/feed.xml", title: null, type: null }])

    const feed = await run(state, Effect.flatMap(SubscriptionService, (s) => s.subscribe({ url: "https://example.com/" })))

    expect(feed.url).toBe("https://example.com/feed.xml")
    expect(feed.title).toBe("Discovered")
  })

  it("rejects duplicate subscriptions", async () => {
    const state = makeState()
    state.remote.set("https://example.com/rss", parsedFeed())
    await run(state, Effect.flatMap(SubscriptionService, (s) => s.subscribe({ url: "https://example.com/rss" })))

    const result = await run(
      state,
      Effect.flatMap(SubscriptionService, (s) => s.subscribe({ url: "https://example.com/rss" })).pipe(Effect.result),
    )

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure._tag).toBe("FeedAlreadyExists")
  })

  it("reports unreachable feeds without creating a subscription", async () => {
    const state = makeState()
    const result = await run(
      state,
      Effect.flatMap(SubscriptionService, (s) => s.subscribe({ url: "https://down.example.com/rss" })).pipe(Effect.result),
    )
    expect(result._tag).toBe("Failure")
    expect(state.feeds.size).toBe(0)
  })

  it("edits title and category, and validates the category exists", async () => {
    const state = makeState()
    state.remote.set("https://example.com/rss", parsedFeed())
    const { feed, category } = await run(
      state,
      Effect.gen(function* () {
        const subs = yield* SubscriptionService
        const cats = yield* CategoryService
        const category = yield* cats.create("Tech")
        const feed = yield* subs.subscribe({ url: "https://example.com/rss" })
        const updated = yield* subs.update(feed.id, { title: "Renamed", categoryId: category.id })
        return { feed: updated, category }
      }),
    )
    expect(feed.title).toBe("Renamed")
    expect(feed.categoryId).toBe(category.id)

    const missing = await run(
      state,
      Effect.flatMap(SubscriptionService, (s) => s.update(feed.id, { categoryId: ids.category("nope") })).pipe(Effect.result),
    )
    expect(missing._tag === "Failure" && missing.failure._tag).toBe("CategoryNotFound")
  })

  it("unsubscribing removes the feed and its entries", async () => {
    const state = makeState()
    state.remote.set("https://example.com/rss", parsedFeed())
    await run(
      state,
      Effect.gen(function* () {
        const subs = yield* SubscriptionService
        const feed = yield* subs.subscribe({ url: "https://example.com/rss" })
        yield* subs.unsubscribe(feed.id)
      }),
    )
    expect(state.feeds.size).toBe(0)
    expect(state.entries.size).toBe(0)
  })
})

describe("RefreshService", () => {
  it("adds only new items on refresh and records failures on the feed", async () => {
    const state = makeState()
    state.remote.set("https://example.com/rss", parsedFeed())
    const feed = await run(state, Effect.flatMap(SubscriptionService, (s) => s.subscribe({ url: "https://example.com/rss" })))

    state.remote.set(
      "https://example.com/rss",
      parsedFeed({
        items: [
          ...parsedFeed().items,
          { guid: "c", url: null, title: "Post C", author: null, summary: "Third", content: null, publishedAt: null },
        ],
      }),
    )
    const first = await run(state, Effect.flatMap(RefreshService, (r) => r.refreshFeed(feed.id)))
    expect(first.added).toBe(1)
    expect(state.entries.size).toBe(3)

    state.remote.set("https://example.com/rss", "unreachable")
    const second = await run(state, Effect.flatMap(RefreshService, (r) => r.refreshAll))
    expect(second[0]?.error).toContain("scripted failure")
    expect(state.feeds.get(feed.id)?.lastError).toContain("scripted failure")
  })
})

describe("EntryService", () => {
  const seed = async () => {
    const state = makeState()
    state.remote.set("https://example.com/rss", parsedFeed())
    const feed = await run(state, Effect.flatMap(SubscriptionService, (s) => s.subscribe({ url: "https://example.com/rss" })))
    return { state, feed }
  }

  it("lists newest first with cursor pagination", async () => {
    const { state } = await seed()
    const page1 = await run(state, Effect.flatMap(EntryService, (e) => e.list({ unreadOnly: false, savedOnly: false, limit: 1 })))
    expect(page1.items.map((i) => i.title)).toEqual(["Post B"])
    expect(page1.next).not.toBeNull()

    const page2 = await run(
      state,
      Effect.flatMap(EntryService, (e) => e.list({ unreadOnly: false, savedOnly: false, limit: 1, before: page1.next! })),
    )
    expect(page2.items.map((i) => i.title)).toEqual(["Post A"])
    expect(page2.next).toBeNull()
  })

  it("marks read, saves for later, and filters accordingly", async () => {
    const { state, feed } = await seed()
    const [a, b] = [...state.entries.values()].sort((x, y) => x.title.localeCompare(y.title))
    const result = await run(
      state,
      Effect.gen(function* () {
        const entries = yield* EntryService
        yield* entries.setRead([a!.id], true)
        yield* entries.setSaved(b!.id, true)
        const unread = yield* entries.list({ unreadOnly: true, savedOnly: false, limit: 10 })
        const saved = yield* entries.list({ unreadOnly: false, savedOnly: true, limit: 10 })
        const stats = yield* entries.stats
        const marked = yield* entries.markAllRead({ feedId: feed.id })
        return { unread, saved, stats, marked }
      }),
    )
    expect(result.unread.items.map((i) => i.title)).toEqual(["Post B"])
    expect(result.saved.items.map((i) => i.title)).toEqual(["Post B"])
    expect(result.stats).toEqual({ unread: 1, saved: 1 })
    expect(result.marked).toBe(1)
  })
})

describe("CategoryService", () => {
  it("deleting a category leaves its feeds uncategorized", async () => {
    const state = makeState()
    state.remote.set("https://example.com/rss", parsedFeed())
    const feedId = await run(
      state,
      Effect.gen(function* () {
        const cats = yield* CategoryService
        const subs = yield* SubscriptionService
        const c = yield* cats.create("News")
        const feed = yield* subs.subscribe({ url: "https://example.com/rss", categoryId: c.id })
        yield* cats.remove(c.id)
        return feed.id
      }),
    )
    expect(state.categories.size).toBe(0)
    expect(state.feeds.get(feedId)?.categoryId).toBeNull()
  })
})

describe("OpmlService", () => {
  it("round-trips subscriptions through OPML", async () => {
    const state = makeState()
    state.remote.set("https://example.com/rss", parsedFeed())
    const { xml, summary } = await run(
      state,
      Effect.gen(function* () {
        const cats = yield* CategoryService
        const subs = yield* SubscriptionService
        const opml = yield* OpmlService
        const c = yield* cats.create("Tech")
        yield* subs.subscribe({ url: "https://example.com/rss", categoryId: c.id })
        const xml = yield* opml.exportOpml
        // Import into a fresh state to prove the document is self-contained.
        return { xml, summary: null }
      }),
    )
    expect(xml).toContain('xmlUrl="https://example.com/rss"')
    expect(xml).toContain('title="Tech"')
    void summary

    const fresh = makeState()
    const imported = await run(fresh, Effect.flatMap(OpmlService, (o) => o.importOpml(xml)))
    expect(imported).toEqual({ feedsAdded: 1, feedsSkipped: 0, categoriesAdded: 1 })
    expect([...fresh.feeds.values()][0]?.categoryId).toBe([...fresh.categories.values()][0]?.id)

    const again = await run(fresh, Effect.flatMap(OpmlService, (o) => o.importOpml(xml)))
    expect(again.feedsSkipped).toBe(1)
  })

  it("rejects documents that are not OPML", async () => {
    const result = await run(makeState(), Effect.flatMap(OpmlService, (o) => o.importOpml("<html/>")).pipe(Effect.result))
    expect(result._tag === "Failure" && result.failure._tag).toBe("InvalidOpml")
  })
})

describe("CatalogService", () => {
  it("offers topics of feeds and flags the ones already subscribed", async () => {
    const state = makeState()
    const topics = await run(state, Effect.flatMap(CatalogService, (c) => c.browse))

    expect(topics.length).toBeGreaterThan(3)
    expect(topics.every((t) => t.feeds.length > 0)).toBe(true)
    expect(topics.flatMap((t) => t.feeds).every((f) => f.subscribedAs === null)).toBe(true)

    // Ids must be unique, or the client cannot key the grid.
    const ids = topics.flatMap((t) => t.feeds.map((f) => f.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("previews the newest headlines and reuses them instead of refetching", async () => {
    const state = makeState()
    const target = (await run(state, Effect.flatMap(CatalogService, (c) => c.browse)))[0]!.feeds[0]!
    state.remote.set(target.url, parsedFeed())

    // Both looks must share one service instance, since the cache lives in it.
    const { first, second } = await run(
      state,
      Effect.gen(function* () {
        const catalog = yield* CatalogService
        const first = yield* catalog.preview(target.id)
        // A second look must not put another request on the publisher.
        state.remote.set(target.url, "unreachable")
        const second = yield* catalog.preview(target.id)
        return { first, second }
      }),
    )
    expect(first.map((i) => i.title)).toEqual(["Post A", "Post B"])
    expect(second).toEqual(first)
  })

  it("reports an unknown catalog id rather than fetching nothing", async () => {
    const result = await run(
      makeState(),
      Effect.flatMap(CatalogService, (c) => c.preview("no-such-feed")).pipe(Effect.result),
    )
    expect(result._tag === "Failure" && result.failure._tag).toBe("CatalogEntryNotFound")
  })

  it("matches a subscription even when the stored URL differs by a trailing slash", async () => {
    const state = makeState()
    const target = (await run(state, Effect.flatMap(CatalogService, (c) => c.browse)))[0]!.feeds[0]!
    state.remote.set(`${target.url}/`, parsedFeed())

    const feed = await run(state, Effect.flatMap(SubscriptionService, (s) => s.subscribe({ url: `${target.url}/` })))
    const topics = await run(state, Effect.flatMap(CatalogService, (c) => c.browse))

    expect(topics[0]!.feeds[0]!.subscribedAs).toBe(feed.id)
  })
})
