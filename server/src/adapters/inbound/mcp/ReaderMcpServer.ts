import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { Effect } from "effect"
import { z } from "zod"
import { CatalogService } from "../../../application/CatalogService.js"
import { CategoryService } from "../../../application/CategoryService.js"
import { EntryService } from "../../../application/EntryService.js"
import { RefreshService } from "../../../application/RefreshService.js"
import { SubscriptionService } from "../../../application/SubscriptionService.js"
import type { Entry } from "../../../domain/model/Entry.js"
import type { Feed } from "../../../domain/model/Feed.js"
import { CategoryId, EntryId, FeedId } from "../../../domain/model/Ids.js"
import { htmlToText } from "../../../shared/html.js"

export const MCP_SERVER_NAME = "reader"
export const MCP_SERVER_VERSION = "0.1.0"

/** Entries returned per page when the caller does not say. */
const DEFAULT_LIMIT = 25

/** The SDK's own result type, so the shape can never drift from what it accepts. */
type ToolResult = CallToolResult

const text = (body: string): ToolResult => ({ content: [{ type: "text", text: body }] })
const failure = (body: string): ToolResult => ({ content: [{ type: "text", text: body }], isError: true })
const json = (value: unknown): ToolResult => text(JSON.stringify(value, null, 2))

/** Domain failures are answers, not crashes: an agent should read why and adjust. */
const describe = (error: { readonly _tag: string; readonly [key: string]: unknown }): string => {
  switch (error._tag) {
    case "FeedNotFound":
      return `No subscription with id ${String(error.id)}. Call list_feeds for current ids.`
    case "EntryNotFound":
      return `No entry with id ${String(error.id)}. Ids change when a feed is re-fetched; call list_entries again.`
    case "CategoryNotFound":
      return `No folder with id ${String(error.id)}. Call list_categories for current ids.`
    case "CatalogEntryNotFound":
      return `No catalog feed with id ${String(error.id)}. Call browse_catalog for valid ids.`
    case "FeedAlreadyExists":
      return `Already subscribed to ${String(error.url)} (id ${String(error.existingId)}).`
    case "InvalidFeedUrl":
      return `Not a usable URL: ${String(error.reason)}`
    case "FeedUnreachable":
      return `Could not reach ${String(error.url)}: ${String(error.reason)}`
    case "FeedNotParseable":
      return `${String(error.url)} is not a feed this reader understands: ${String(error.reason)}`
    case "NoFeedDiscovered":
      return `No feed advertised at ${String(error.url)}.`
    default:
      return `Failed: ${error._tag}`
  }
}

/** Runs an application effect and turns either outcome into a tool result. */
const run = <A>(effect: Effect.Effect<A, { readonly _tag: string }>, render: (value: A) => ToolResult): Promise<ToolResult> =>
  Effect.runPromise(
    Effect.match(effect, {
      onSuccess: render,
      onFailure: (error) => failure(describe(error as never)),
    }),
  )

const iso = (millis: number) => new Date(millis).toISOString()

const feedSummary = (feed: Feed, unread: number) => ({
  id: feed.id,
  title: feed.title,
  url: feed.url,
  siteUrl: feed.siteUrl,
  categoryId: feed.categoryId,
  unread,
  lastFetchedAt: feed.lastFetchedAt === null ? null : iso(feed.lastFetchedAt),
  lastError: feed.lastError,
})

const entrySummary = (entry: Entry, feedTitle: string | undefined) => ({
  id: entry.id,
  feedId: entry.feedId,
  feed: feedTitle ?? "unknown feed",
  title: entry.title,
  author: entry.author,
  url: entry.url,
  publishedAt: iso(entry.publishedAt),
  isRead: entry.isRead,
  isSaved: entry.isSaved,
  summary: entry.summary,
})

/**
 * The reader as MCP tools.
 *
 * A driving adapter like the HTTP API: it holds no state and owns no rules, it
 * only translates tool calls into application calls. Tool descriptions are part
 * of the interface — they are what an agent reads to decide what to call.
 */
export const makeReaderMcpServer = Effect.gen(function* () {
  const subscriptions = yield* SubscriptionService
  const entries = yield* EntryService
  const categories = yield* CategoryService
  const refresh = yield* RefreshService
  const catalog = yield* CatalogService

  const feedTitles = () => Effect.map(subscriptions.list, (all) => new Map(all.map((f) => [f.feed.id as string, f.feed.title])))

  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      instructions:
        "Read and triage the owner's RSS/Atom subscriptions. Use list_entries to survey, get_entry to read " +
        "an article's full text, and mark_read / set_saved to triage. Entry and feed ids come from the list " +
        "tools; do not invent them. Prefer unreadOnly=true when catching up.",
    },
  )

  // --- reading ------------------------------------------------------------

  server.registerTool(
    "list_feeds",
    {
      title: "List subscriptions",
      description: "Every subscribed feed with its unread count, folder, and last fetch status.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(subscriptions.list, (all) => json(all.map(({ feed, unread }) => feedSummary(feed, unread)))),
  )

  server.registerTool(
    "list_entries",
    {
      title: "List entries",
      description:
        "Newest-first entries, optionally narrowed to one feed or folder, to unread or saved only, or to a " +
        "search over titles, summaries and authors. Returns a nextCursor when more remain.",
      inputSchema: {
        feedId: z.string().optional().describe("Only entries from this feed (from list_feeds)."),
        categoryId: z.string().optional().describe("Only entries from feeds in this folder."),
        unreadOnly: z.boolean().optional().describe("Only unread entries. Default false."),
        savedOnly: z.boolean().optional().describe("Only entries saved for later. Default false."),
        search: z.string().optional().describe("Free-text match on title, summary, author and feed title."),
        limit: z.number().int().min(1).max(100).optional().describe(`Entries to return. Default ${DEFAULT_LIMIT}.`),
        cursor: z.string().optional().describe("nextCursor from a previous call, to continue past it."),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) =>
      run(
        Effect.gen(function* () {
          const titles = yield* feedTitles()
          const page = yield* entries.list({
            ...(args.feedId !== undefined ? { feedId: FeedId.make(args.feedId) } : {}),
            ...(args.categoryId !== undefined ? { categoryId: CategoryId.make(args.categoryId) } : {}),
            unreadOnly: args.unreadOnly === true,
            savedOnly: args.savedOnly === true,
            ...(args.search !== undefined ? { search: args.search } : {}),
            ...(args.cursor !== undefined ? { before: decodeCursor(args.cursor) } : {}),
            limit: args.limit ?? DEFAULT_LIMIT,
          })
          return { page, titles }
        }),
        ({ page, titles }) =>
          json({
            entries: page.items.map((entry) => entrySummary(entry, titles.get(entry.feedId))),
            nextCursor: page.next ? `${page.next.publishedAt}.${page.next.id}` : null,
          }),
      ),
  )

  server.registerTool(
    "get_entry",
    {
      title: "Read an entry",
      description:
        "The full text of one entry, with markup stripped. Use this before summarising or answering questions " +
        "about an article — list_entries only returns a short excerpt.",
      inputSchema: { id: z.string().describe("Entry id from list_entries.") },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) =>
      run(entries.get(EntryId.make(id)), (entry) => {
        const body = entry.content ? htmlToText(entry.content) : entry.summary
        const header = [
          entry.title,
          entry.author ? `by ${entry.author}` : null,
          iso(entry.publishedAt),
          entry.url,
        ].filter((line): line is string => line !== null)
        return text(`${header.join("\n")}\n\n${body || "(no content)"}`)
      }),
  )

  server.registerTool(
    "get_stats",
    {
      title: "Unread and saved counts",
      description: "Total unread and saved counts across all subscriptions.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(entries.stats, json),
  )

  server.registerTool(
    "list_categories",
    {
      title: "List folders",
      description: "The folders subscriptions are grouped into.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () => run(categories.list, (all) => json(all.map((c) => ({ id: c.id, name: c.name })))),
  )

  // --- triage -------------------------------------------------------------

  server.registerTool(
    "mark_read",
    {
      title: "Mark entries read or unread",
      description: "Set the read state of specific entries. Ids come from list_entries.",
      inputSchema: {
        ids: z.array(z.string()).min(1).describe("Entry ids."),
        read: z.boolean().describe("true marks read, false marks unread."),
      },
      annotations: { idempotentHint: true },
    },
    async ({ ids, read }) =>
      run(
        entries.setRead(ids.map((id) => EntryId.make(id)), read),
        () => text(`${ids.length} ${ids.length === 1 ? "entry" : "entries"} marked ${read ? "read" : "unread"}.`),
      ),
  )

  server.registerTool(
    "mark_all_read",
    {
      title: "Mark everything read",
      description:
        "Mark every unread entry read, optionally only within one feed or folder. Not reversible in bulk — " +
        "prefer mark_read when the caller named specific entries.",
      inputSchema: {
        feedId: z.string().optional().describe("Limit to this feed."),
        categoryId: z.string().optional().describe("Limit to feeds in this folder."),
      },
      annotations: { idempotentHint: true },
    },
    async (args) =>
      run(
        entries.markAllRead({
          ...(args.feedId !== undefined ? { feedId: FeedId.make(args.feedId) } : {}),
          ...(args.categoryId !== undefined ? { categoryId: CategoryId.make(args.categoryId) } : {}),
        }),
        (count) => text(`${count} ${count === 1 ? "entry" : "entries"} marked read.`),
      ),
  )

  server.registerTool(
    "set_saved",
    {
      title: "Save an entry for later",
      description: "Add or remove an entry from the reader's Read later list.",
      inputSchema: {
        id: z.string().describe("Entry id from list_entries."),
        saved: z.boolean().describe("true saves, false removes."),
      },
      annotations: { idempotentHint: true },
    },
    async ({ id, saved }) =>
      run(entries.setSaved(EntryId.make(id), saved), (entry) =>
        text(`"${entry.title}" ${saved ? "saved for later" : "removed from Read later"}.`),
      ),
  )

  // --- subscriptions ------------------------------------------------------

  server.registerTool(
    "subscribe",
    {
      title: "Subscribe to a feed",
      description:
        "Subscribe by feed URL or by site URL — a site is checked for an advertised feed. Fetches immediately, " +
        "so the entries are available straight away.",
      inputSchema: {
        url: z.string().describe("Feed or website address."),
        title: z.string().optional().describe("Override the feed's own title."),
        categoryId: z.string().optional().describe("Folder to file it under."),
      },
    },
    async (args) =>
      run(
        subscriptions.subscribe({
          url: args.url,
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.categoryId !== undefined ? { categoryId: CategoryId.make(args.categoryId) } : {}),
        }),
        (feed) => text(`Subscribed to "${feed.title}" (${feed.url}), id ${feed.id}.`),
      ),
  )

  server.registerTool(
    "unsubscribe",
    {
      title: "Unsubscribe",
      description: "Remove a subscription and all of its entries. This cannot be undone.",
      inputSchema: { id: z.string().describe("Feed id from list_feeds.") },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => run(subscriptions.unsubscribe(FeedId.make(id)), () => text(`Unsubscribed ${id}.`)),
  )

  server.registerTool(
    "discover_feeds",
    {
      title: "Find feeds at a URL",
      description: "List the feeds a web page advertises, without subscribing. Useful before calling subscribe.",
      inputSchema: { url: z.string().describe("Website address to inspect.") },
      annotations: { readOnlyHint: true },
    },
    async ({ url }) => run(subscriptions.discover(url), json),
  )

  server.registerTool(
    "browse_catalog",
    {
      title: "Browse suggested feeds",
      description:
        "The built-in directory of suggested feeds by topic, each flagged with whether it is already subscribed.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(catalog.browse, (topics) =>
        json(
          topics.map((topic) => ({
            topic: topic.name,
            feeds: topic.feeds.map((f) => ({
              id: f.id,
              title: f.title,
              url: f.url,
              description: f.description,
              subscribed: f.subscribedAs !== null,
            })),
          })),
        ),
      ),
  )

  server.registerTool(
    "refresh",
    {
      title: "Fetch new entries",
      description:
        "Fetch every subscription now, or just one. The reader also refreshes on its own schedule, so this is " +
        "only needed when the caller wants the very latest before reading.",
      inputSchema: { feedId: z.string().optional().describe("Refresh only this feed.") },
      annotations: { idempotentHint: true },
    },
    async ({ feedId }) =>
      feedId === undefined
        ? run(refresh.refreshAll, (results) =>
            json({
              feeds: results.length,
              added: results.reduce((n, r) => n + r.added, 0),
              failed: results.filter((r) => r.error !== null).map((r) => ({ feed: r.title, error: r.error })),
            }),
          )
        : run(refresh.refreshFeed(FeedId.make(feedId)), (result) =>
            json({ feed: result.title, added: result.added, error: result.error }),
          ),
  )

  return server
})

/** Mirrors the HTTP adapter's cursor format so the two agree. */
const decodeCursor = (raw: string) => {
  const dot = raw.indexOf(".")
  const publishedAt = Number(raw.slice(0, dot))
  const id = raw.slice(dot + 1)
  if (dot <= 0 || !Number.isFinite(publishedAt) || id.length === 0) {
    throw new Error(`Malformed cursor "${raw}". Pass back the nextCursor from a previous list_entries call.`)
  }
  return { publishedAt, id: EntryId.make(id) }
}
