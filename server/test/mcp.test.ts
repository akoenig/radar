import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { Effect, Fiber, Layer, Redacted } from "effect"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { HttpServerLive } from "../src/adapters/inbound/http/HttpServerLive.js"
import { StaticFeedCatalogLive } from "../src/adapters/outbound/catalog/StaticFeedCatalog.js"
import { FastXmlOpmlCodecLive } from "../src/adapters/outbound/opml/FastXmlOpmlCodec.js"
import { SqlitePersistenceLive } from "../src/adapters/outbound/sqlite/index.js"
import { CryptoIdGeneratorLive } from "../src/adapters/outbound/system/CryptoIdGenerator.js"
import { ApplicationLive } from "../src/application/index.js"
import { MemoryFeedSource, makeState, parsedFeed } from "./support/InMemoryAdapters.js"

const TOKEN = "test-token-not-a-secret"
const PORT = 3699
const ENDPOINT = `http://127.0.0.1:${PORT}/mcp`

const state = makeState()
state.remote.set("https://example.com/rss", parsedFeed())

/** The real server, with only the network and the clock faked out. */
const TestServer = HttpServerLive({
  host: "127.0.0.1",
  port: PORT,
  staticDir: new URL("./fixtures", import.meta.url).pathname,
  mcpToken: Redacted.make(TOKEN),
}).pipe(
  Layer.provide(
    ApplicationLive.pipe(
      Layer.provide(SqlitePersistenceLive({ path: ":memory:" })),
      Layer.provide(MemoryFeedSource(state)),
      Layer.provide(CryptoIdGeneratorLive),
      Layer.provide(FastXmlOpmlCodecLive),
      Layer.provide(StaticFeedCatalogLive),
    ),
  ),
)

let shutdown: (() => Promise<void>) | undefined

const connect = async (token = TOKEN) => {
  const client = new Client({ name: "test", version: "1.0.0" })
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  })
  // The SDK types sessionId as optional-undefined, which exactOptionalPropertyTypes
  // rejects against its own Transport interface.
  await client.connect(transport as unknown as Parameters<typeof client.connect>[0])
  return client
}

const textOf = (result: unknown): string =>
  ((result as { content: Array<{ text?: string }> }).content ?? []).map((c) => c.text ?? "").join("\n")

beforeAll(async () => {
  const fiber = Effect.runFork(Layer.launch(TestServer))
  shutdown = async () => {
    await Effect.runPromise(Fiber.interrupt(fiber))
  }
  // Wait for the port to accept connections.
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(ENDPOINT, { method: "POST" })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  throw new Error("server did not start")
}, 20_000)

afterAll(async () => {
  await shutdown?.()
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

  it("reports a domain failure as a readable tool error, not a crash", async () => {
    const client = await connect()
    const result = await client.callTool({ name: "get_entry", arguments: { id: "does-not-exist" } })

    expect((result as { isError?: boolean }).isError).toBe(true)
    expect(textOf(result)).toContain("No entry with id")
    await client.close()
  })
})
