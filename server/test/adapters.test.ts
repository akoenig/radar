import { Effect, Layer, Option } from "effect"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { discoverInHtml } from "../src/adapters/outbound/feed/FeedDiscovery.js"
import { parseFeed } from "../src/adapters/outbound/feed/FeedParser.js"
import { decodeBody, htmlToText, looksLikeHtml, truncate } from "../src/adapters/outbound/feed/text.js"
import { FastXmlOpmlCodecLive } from "../src/adapters/outbound/opml/FastXmlOpmlCodec.js"
import { SqlitePersistenceLive } from "../src/adapters/outbound/sqlite/index.js"
import { Entry } from "../src/domain/model/Entry.js"
import { Feed } from "../src/domain/model/Feed.js"
import { EntryId, FeedId } from "../src/domain/model/Ids.js"
import { EntryRepository } from "../src/domain/ports/EntryRepository.js"
import { FeedRepository } from "../src/domain/ports/FeedRepository.js"
import { OpmlCodec } from "../src/domain/ports/OpmlCodec.js"
import { UnitOfWork } from "../src/domain/ports/UnitOfWork.js"

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")

describe("FeedParser", () => {
  it("parses RSS 2.0 with content:encoded, entities and undated items", () => {
    const feed = parseFeed(fixture("rss.xml"), "https://margins.example.com/rss.xml")
    expect(feed.title).toBe("The Margins & Notes")
    expect(feed.siteUrl).toBe("https://margins.example.com/")
    expect(feed.iconUrl).toBe("https://margins.example.com/logo.png")
    expect(feed.items).toHaveLength(3)

    const [first, second, third] = feed.items
    expect(first?.guid).toBe("margins-2026-0902")
    expect(first?.author).toBe("Ada Wexler")
    expect(first?.content).toContain("<h2>What changed</h2>")
    expect(first?.summary.startsWith("For a decade")).toBe(true)
    expect(first?.publishedAt).toBe(Date.parse("Wed, 02 Sep 2026 09:15:00 GMT"))

    expect(second?.title).toBe("Typography for Long Reads — a checklist")
    expect(second?.guid).toBe("https://margins.example.com/posts/typography-checklist")
    expect(second?.summary).toContain("Bold claims included")
    expect(second?.summary).not.toContain("<b>")

    expect(third?.publishedAt).toBeNull()
    expect(third?.guid).toBe("https://margins.example.com/posts/undated")
  })

  it("parses Atom with relative links, html titles and xhtml content", () => {
    const feed = parseFeed(fixture("atom.xml"), "https://signal.example.org/feed.atom")
    expect(feed.title).toBe("Signal & Noise")
    expect(feed.siteUrl).toBe("https://signal.example.org/")
    expect(feed.iconUrl).toBe("https://signal.example.org/icon.png")

    const [latency, xhtml] = feed.items
    expect(latency?.title).toBe("Measuring latency honestly")
    expect(latency?.url).toBe("https://signal.example.org/posts/latency")
    expect(latency?.author).toBe("Rin Okabe")
    expect(latency?.content).toContain("<ul>")
    expect(latency?.publishedAt).toBe(Date.parse("2026-09-05T08:30:00Z"))

    expect(xhtml?.author).toBe("Lab Team")
    expect(xhtml?.content).toBe('<div xmlns="http://www.w3.org/1999/xhtml"><p>Inline <b>XHTML</b> body.</p></div>')
    expect(xhtml?.summary).toBe("Inline XHTML body.")
  })

  it("parses JSON Feed", () => {
    const feed = parseFeed(fixture("feed.json"), "https://json.example.net/feed.json")
    expect(feed.title).toBe("JSON Dispatch")
    expect(feed.items[0]?.author).toBe("J. Author")
    expect(feed.items[1]?.content).toBe("<p>Plain text body.</p>")
    expect(feed.items[1]?.summary).toBe("A short summary.")
  })

  it("rejects non-feed documents with a helpful reason", () => {
    expect(() => parseFeed("<html><body/></html>", "https://x.test/")).toThrow(/Unsupported document root <html>/)
    expect(() => parseFeed("{}", "https://x.test/")).toThrow(/not a JSON Feed/)
    expect(() => parseFeed("", "https://x.test/")).toThrow()
  })
})

describe("FeedDiscovery", () => {
  it("finds advertised feeds and resolves relative hrefs", () => {
    const found = discoverInHtml(fixture("page.html"), "https://margins.example.com/about")
    expect(found).toEqual([
      { url: "https://margins.example.com/rss.xml", title: "Margins RSS", type: "application/rss+xml" },
      { url: "https://margins.example.com/atom.xml", title: "Margins Atom", type: "application/atom+xml" },
    ])
    expect(looksLikeHtml(fixture("page.html"))).toBe(true)
    expect(looksLikeHtml(fixture("rss.xml"))).toBe(false)
  })
})

describe("text helpers", () => {
  it("strips markup and decodes entities", () => {
    expect(htmlToText("<p>Hello&nbsp;<b>world</b> &amp; friends</p><script>x()</script>")).toBe("Hello world & friends")
    expect(truncate("one two three four", 10)).toBe("one two…")
  })

  it("decodes non-UTF-8 bodies using the XML declaration", () => {
    const latin1 = new Uint8Array([...Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><t>caf'), 0xe9, ...Buffer.from("</t>")])
    expect(decodeBody(latin1, "text/xml")).toContain("café")
  })
})

describe("OPML codec", () => {
  it("flattens nested folders on import", async () => {
    const doc = await Effect.runPromise(
      Effect.flatMap(OpmlCodec, (c) => c.parse(fixture("subscriptions.opml"))).pipe(Effect.provide(FastXmlOpmlCodecLive)),
    )
    expect(doc.title).toBe("My subscriptions")
    expect(doc.uncategorized.map((o) => o.xmlUrl)).toEqual(["https://loose.example.com/rss"])
    expect(doc.folders.map((f) => f.name)).toEqual(["Tech / Nested", "Tech"])
    expect(doc.folders.find((f) => f.name === "Tech")?.outlines[0]?.title).toBe("Signal & Noise")
  })
})

describe("SQLite persistence", () => {
  const now = 1_750_000_000_000
  const feed = new Feed({
    id: FeedId.make("f1"),
    url: "https://example.com/rss",
    siteUrl: null,
    title: "Example",
    description: null,
    iconUrl: null,
    categoryId: null,
    position: 0,
    lastFetchedAt: null,
    lastError: null,
    etag: null,
    lastModified: null,
    createdAt: now,
    updatedAt: now,
  })
  const entry = (id: string, publishedAt: number, extra: Partial<ConstructorParameters<typeof Entry>[0]> = {}) =>
    new Entry({
      id: EntryId.make(id),
      feedId: feed.id,
      guid: `guid-${id}`,
      url: null,
      title: `Entry ${id}`,
      author: null,
      summary: "",
      content: null,
      publishedAt,
      fetchedAt: now,
      isRead: false,
      isSaved: false,
      readAt: null,
      savedAt: null,
      ...extra,
    })

  it("ingests idempotently, queries with cursors, and prunes read items", async () => {
    const program = Effect.gen(function* () {
      const feeds = yield* FeedRepository
      const entries = yield* EntryRepository
      const uow = yield* UnitOfWork
      yield* feeds.save(feed)
      const batch = [entry("a", 1), entry("b", 2), entry("c", 3)]
      const added = yield* uow.transaction(entries.ingest(batch))
      const again = yield* entries.ingest([...batch, entry("d", 4)])
      const page = yield* entries.query({ unreadOnly: false, savedOnly: false, limit: 2 })
      const rest = yield* entries.query({ unreadOnly: false, savedOnly: false, limit: 10, before: { publishedAt: 3, id: EntryId.make("c") } })
      yield* entries.setRead([EntryId.make("a"), EntryId.make("b")], true, now)
      const pruned = yield* entries.prune(feed.id, 3)
      const stats = yield* entries.stats
      const search = yield* entries.query({ unreadOnly: false, savedOnly: false, limit: 10, search: "entry d" })
      return { added, again, page: page.map((e) => e.id), rest: rest.map((e) => e.id), pruned, stats, search: search.map((e) => e.id) }
    })
    const result = await Effect.runPromise(program.pipe(Effect.provide(SqlitePersistenceLive({ path: ":memory:" }))))
    expect(result.added).toBe(3)
    expect(result.again).toBe(1)
    expect(result.page).toEqual(["d", "c"])
    expect(result.rest).toEqual(["b", "a"])
    expect(result.pruned).toBe(1)
    expect(result.stats).toEqual({ unread: 2, saved: 0 })
    expect(result.search).toEqual(["d"])
  })

  it("lists without loading article bodies, and counts read and saved independently", async () => {
    const program = Effect.gen(function* () {
      const feeds = yield* FeedRepository
      const entries = yield* EntryRepository
      yield* feeds.save(feed)
      yield* entries.ingest([
        entry("a", 1, { content: "<p>a body</p>", summary: "a excerpt" }),
        entry("b", 2, { content: "<p>b body</p>", summary: "b excerpt", isRead: true, isSaved: true }),
      ])
      const listed = yield* entries.query({ unreadOnly: false, savedOnly: false, limit: 10 })
      const full = yield* entries.findById(EntryId.make("a"))
      return { listed, full, stats: yield* entries.stats }
    })
    const { listed, full, stats } = await Effect.runPromise(
      program.pipe(Effect.provide(SqlitePersistenceLive({ path: ":memory:" }))),
    )

    // The list projection carries what a list renders and nothing more. Reading
    // bodies here costs megabytes a page and no caller ever looks at them.
    expect(listed.map((e) => e.id)).toEqual(["b", "a"])
    expect(listed[0]).not.toHaveProperty("content")
    expect(listed.map((e) => e.summary)).toEqual(["b excerpt", "a excerpt"])

    // Opening one entry still gets the body.
    expect(Option.getOrThrow(full).content).toBe("<p>a body</p>")

    // "b" is both read and saved, so the two counts must not be derived from
    // each other or from a single pass that assumes they are exclusive.
    expect(stats).toEqual({ unread: 1, saved: 1 })
  })

  it("rolls back a failed transaction", async () => {
    const program = Effect.gen(function* () {
      const feeds = yield* FeedRepository
      const uow = yield* UnitOfWork
      yield* uow
        .transaction(Effect.gen(function* () {
          yield* feeds.save(feed)
          yield* Effect.fail("boom")
        }))
        .pipe(Effect.ignore)
      return yield* feeds.findAll
    })
    const all = await Effect.runPromise(program.pipe(Effect.provide(SqlitePersistenceLive({ path: ":memory:" }))))
    expect(all).toHaveLength(0)
  })

  it("keeps layers composable: repositories share one database", async () => {
    const layer = SqlitePersistenceLive({ path: ":memory:" })
    const program = Effect.gen(function* () {
      const feeds = yield* FeedRepository
      const entries = yield* EntryRepository
      yield* feeds.save(feed)
      yield* entries.ingest([entry("x", 1)])
      yield* feeds.remove(feed.id)
      return yield* entries.stats
    })
    const stats = await Effect.runPromise(program.pipe(Effect.provide(Layer.fresh(layer))))
    expect(stats.unread).toBe(0)
  })
})
