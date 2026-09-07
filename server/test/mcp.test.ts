import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { Effect, Fiber, Layer, Redacted } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { HttpServerLive } from "../src/adapters/inbound/http/HttpServerLive.js"
import { mcpAccess, type McpAccess } from "../src/adapters/inbound/mcp/McpHttp.js"
import { directoryId } from "../src/domain/model/Catalog.js"
import { StaticFeedCatalogLive } from "../src/adapters/outbound/catalog/StaticFeedCatalog.js"
import { FastXmlOpmlCodecLive } from "../src/adapters/outbound/opml/FastXmlOpmlCodec.js"
import { SqlitePersistenceLive } from "../src/adapters/outbound/sqlite/index.js"
import { CryptoIdGeneratorLive } from "../src/adapters/outbound/system/CryptoIdGenerator.js"
import { ApplicationLive } from "../src/application/index.js"
import { MemoryDirectory, MemoryFeedSource, makeState, parsedFeed } from "./support/InMemoryAdapters.js"

const TOKEN = "test-token-not-a-secret"
const ENDPOINT = "http://127.0.0.1:3699/mcp"
// A second server in the mode where Cloud in a Bottle authenticates the caller
// and this app serves whoever the router let through.
const ROUTER_ENDPOINT = "http://127.0.0.1:3700/mcp"

/** The real server, with only the network and the clock faked out. */
const makeServer = (port: number, access: McpAccess) => {
  const state = makeState()
  state.remote.set("https://example.com/rss", parsedFeed())
  state.directory.set("racing", [
    {
      id: directoryId("https://racing.example/rss"),
      title: "Racing Weekly",
      description: "Motorsport, weekly.",
      url: "https://racing.example/rss",
      siteUrl: "https://racing.example",
      reach: { iconUrl: null, subscribers: 4200, postsPerWeek: 6, lastPublishedAt: 1788552960000, topics: ["sport"] },
    },
  ])
  return HttpServerLive({
    host: "127.0.0.1",
    port,
    staticDir: new URL("./fixtures", import.meta.url).pathname,
    mcpAccess: access,
  }).pipe(
    Layer.provide(
      ApplicationLive.pipe(
        Layer.provide(SqlitePersistenceLive({ path: ":memory:" })),
        Layer.provide(MemoryFeedSource(state)),
        Layer.provide(MemoryDirectory(state)),
        Layer.provide(CryptoIdGeneratorLive),
        Layer.provide(FastXmlOpmlCodecLive),
        Layer.provide(StaticFeedCatalogLive),
      ),
    ),
  )
}

const shutdowns: Array<() => Promise<void>> = []

const connect = async (token: string | null = TOKEN, endpoint = ENDPOINT) => {
  const client = new Client({ name: "test", version: "1.0.0" })
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    ...(token === null ? {} : { requestInit: { headers: { authorization: `Bearer ${token}` } } }),
  })
  // The SDK types sessionId as optional-undefined, which exactOptionalPropertyTypes
  // rejects against its own Transport interface.
  await client.connect(transport as unknown as Parameters<typeof client.connect>[0])
  return client
}

const textOf = (result: unknown): string =>
  ((result as { content: Array<{ text?: string }> }).content ?? []).map((c) => c.text ?? "").join("\n")

const start = async (endpoint: string, port: number, access: McpAccess) => {
  const fiber = Effect.runFork(Layer.launch(makeServer(port, access)))
  shutdowns.push(() => Effect.runPromise(Fiber.interrupt(fiber)))
  // Wait for the port to accept connections.
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(endpoint, { method: "POST" })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error(`server on ${port} did not start`)
}

beforeAll(async () => {
  await start(ENDPOINT, 3699, mcpAccess("token", Redacted.make(TOKEN)))
  await start(ROUTER_ENDPOINT, 3700, mcpAccess("router", null))
}, 30_000)

afterAll(async () => {
  await Promise.all(shutdowns.map((stop) => stop()))
})

describe("MCP server", () => {
  it("refuses a request without the bearer token", async () => {
    const response = await fetch(ENDPOINT, { method: "POST", body: "{}" })
    expect(response.status).toBe(401)
  })

  it("refuses a wrong token", async () => {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { authorization: "Bearer wrong-token-same-len!!" },
      body: "{}",
    })
    expect(response.status).toBe(401)
  })

  it("never answers with the web app, whatever the request accepts", async () => {
    // The static server's SPA fallback claims any extensionless path that
    // accepts HTML. If this route were left unregistered while disabled, a
    // browser at /mcp would be handed the reader and routed to #/all.
    for (const accept of ["text/html", "*/*", "application/json"]) {
      const response = await fetch(ENDPOINT, { method: "GET", headers: { accept } })
      expect(response.headers.get("content-type") ?? "").not.toContain("text/html")
      expect(await response.text()).not.toContain("<!doctype html")
    }
  })

  it("advertises its tools to a real MCP client", async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()

    expect(names).toContain("list_feeds")
    expect(names).toContain("list_entries")
    expect(names).toContain("get_entry")
    expect(names).toContain("subscribe")
    // Every tool must describe itself: the description is the agent's only guide.
    expect(tools.every((t) => (t.description ?? "").length > 20)).toBe(true)
    await client.close()
  })

  it("subscribes, lists and reads through tools", async () => {
    const client = await connect()

    const subscribed = await client.callTool({ name: "subscribe", arguments: { url: "https://example.com/rss" } })
    expect(textOf(subscribed)).toContain("Subscribed to")

    const feeds = JSON.parse(textOf(await client.callTool({ name: "list_feeds", arguments: {} })))
    expect(feeds).toHaveLength(1)
    expect(feeds[0].unread).toBe(2)

    const listed = JSON.parse(textOf(await client.callTool({ name: "list_entries", arguments: { unreadOnly: true } })))
    expect(listed.entries).toHaveLength(2)
    expect(listed.entries[0].feed).toBe("Example Feed")

    const article = textOf(await client.callTool({ name: "get_entry", arguments: { id: listed.entries[0].id } }))
    // Content arrives as prose, not markup.
    expect(article).toContain("Post B")
    expect(article).not.toContain("<p>")

    await client.close()
  })

  it("marks read and saves, and the counts follow", async () => {
    const client = await connect()
    const listed = JSON.parse(textOf(await client.callTool({ name: "list_entries", arguments: {} })))
    const first = listed.entries[0].id

    await client.callTool({ name: "mark_read", arguments: { ids: [first], read: true } })
    await client.callTool({ name: "set_saved", arguments: { id: first, saved: true } })

    const stats = JSON.parse(textOf(await client.callTool({ name: "get_stats", arguments: {} })))
    expect(stats).toEqual({ unread: 1, saved: 1 })

    const saved = JSON.parse(textOf(await client.callTool({ name: "list_entries", arguments: { savedOnly: true } })))
    expect(saved.entries).toHaveLength(1)
    await client.close()
  })

  it("searches the feed directory through a tool", async () => {
    const client = await connect()
    const found = JSON.parse(
      textOf(await client.callTool({ name: "search_feeds", arguments: { query: "racing" } })),
    )
    expect(found.source).toBe("directory")
    expect(found.feeds[0]).toMatchObject({ title: "Racing Weekly", subscribers: 4200, subscribed: false })
    await client.close()
  })

  it("stays enabled in router mode with no token of its own", async () => {
    // The platform has already authenticated anyone who gets this far, and the
    // Authorization header it forwards carries *its* token, not ours — so a
    // second check here could only reject a caller the owner already approved.
    const client = await connect(null, ROUTER_ENDPOINT)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain("list_feeds")
    await client.close()

    const foreign = await fetch(ROUTER_ENDPOINT, {
      method: "POST",
      headers: { authorization: "Bearer some-bottle-api-token" },
      body: "{}",
    })
    expect(foreign.status).not.toBe(401)
  })

  it("falls back to disabled rather than open when a token mode has no token", () => {
    expect(mcpAccess("token", null)).toEqual({ _tag: "Disabled" })
    expect(mcpAccess("router", null)).toEqual({ _tag: "Router" })
  })

  it("reports a domain failure as a readable tool error, not a crash", async () => {
    const client = await connect()
    const result = await client.callTool({ name: "get_entry", arguments: { id: "does-not-exist" } })

    expect((result as { isError?: boolean }).isError).toBe(true)
    expect(textOf(result)).toContain("No entry with id")
    await client.close()
  })
})
