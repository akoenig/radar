import { Duration, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { FeedNotParseable, FeedUnreachable, InvalidFeedUrl } from "../../../domain/errors.js"
import type { DiscoveredFeed, FetchHints, FetchOutcome } from "../../../domain/model/ParsedFeed.js"
import { FeedSource, type FeedSourceShape } from "../../../domain/ports/FeedSource.js"
import { COMMON_FEED_PATHS, discoverInHtml } from "./FeedDiscovery.js"
import { ParseError, parseFeed } from "./FeedParser.js"
import { decodeBody, looksLikeHtml } from "./text.js"

export const USER_AGENT = "Radar/0.1 (feed fetcher)"
const ACCEPT =
  "application/rss+xml, application/atom+xml, application/feed+json, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.8, text/html;q=0.5, */*;q=0.2"
const TIMEOUT = Duration.seconds(25)
const MAX_BODY_BYTES = 8 * 1024 * 1024

interface Fetched {
  readonly status: number
  readonly finalUrl: string
  readonly contentType: string | undefined
  readonly body: string
  readonly hints: FetchHints
}

const NO_HINTS: FetchHints = { etag: null, lastModified: null }

const validateUrl = (raw: string): Effect.Effect<string, InvalidFeedUrl> =>
  Effect.suspend(() => {
    const trimmed = raw.trim()
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
      const url = new URL(candidate)
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return new InvalidFeedUrl({ url: raw, reason: `Unsupported protocol ${url.protocol}` })
      }
      return Effect.succeed(url.toString())
    } catch {
      return new InvalidFeedUrl({ url: raw, reason: "Not a valid URL" })
    }
  })

const tryParse = (body: string, url: string): Effect.Effect<FetchOutcome, FeedNotParseable> =>
  Effect.try({
    try: () => parseFeed(body, url),
    catch: (e) => new FeedNotParseable({ url, reason: e instanceof ParseError ? e.message : String(e) }),
  }).pipe(Effect.map((feed) => ({ _tag: "Fetched", feed, hints: NO_HINTS, finalUrl: url }) as const))

export const HttpFeedSourceLive = Layer.effect(
  FeedSource,
  Effect.gen(function* () {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.followRedirects(5),
      HttpClient.mapRequest(HttpClientRequest.setHeaders({ "user-agent": USER_AGENT, accept: ACCEPT })),
    )

    const download = (url: string, hints?: FetchHints): Effect.Effect<Fetched, FeedUnreachable> =>
      Effect.gen(function* () {
        const headers: Record<string, string> = {}
        if (hints?.etag) headers["if-none-match"] = hints.etag
        if (hints?.lastModified) headers["if-modified-since"] = hints.lastModified
        const response = yield* client.get(url, { headers })
        const contentType = response.headers["content-type"]
        const finalUrl = response.request.url
        if (response.status === 304) {
          return { status: 304, finalUrl, contentType, body: "", hints: hints ?? NO_HINTS }
        }
        if (response.status >= 400) {
          return yield* new FeedUnreachable({ url, reason: `Server responded with HTTP ${response.status}` })
        }
        const buffer = yield* response.arrayBuffer
        if (buffer.byteLength > MAX_BODY_BYTES) {
          return yield* new FeedUnreachable({ url, reason: "Document is too large" })
        }
        return {
          status: response.status,
          finalUrl,
          contentType,
          body: decodeBody(new Uint8Array(buffer), contentType),
          hints: { etag: response.headers["etag"] ?? null, lastModified: response.headers["last-modified"] ?? null },
        }
      }).pipe(
        Effect.timeout(TIMEOUT),
        Effect.catchTags({
          TimeoutError: () => new FeedUnreachable({ url, reason: "Timed out" }),
          HttpClientError: (e) => new FeedUnreachable({ url, reason: describeClientError(e) }),
        }),
        Effect.withSpan("HttpFeedSource.download", { attributes: { url } }),
      )

    const fetch: FeedSourceShape["fetch"] = (raw, hints) =>
      Effect.gen(function* () {
        const url = yield* validateUrl(raw)
        const fetched = yield* download(url, hints)
        if (fetched.status === 304) return { _tag: "NotModified" } as const
        if (looksLikeHtml(fetched.body)) {
          return yield* new FeedNotParseable({ url, reason: "The URL points to a web page, not a feed" })
        }
        const parsed = yield* tryParse(fetched.body, fetched.finalUrl)
        return parsed._tag === "Fetched" ? { ...parsed, hints: fetched.hints } : parsed
      })

    /** Cheap probe used by discovery: is there a parseable feed at this URL? */
    const isFeed = (url: string): Effect.Effect<boolean> =>
      download(url).pipe(
        Effect.flatMap((f) =>
          f.status === 304 || looksLikeHtml(f.body) ? Effect.succeed(false) : Effect.as(tryParse(f.body, url), true),
        ),
        Effect.orElseSucceed(() => false),
      )

    const discover: FeedSourceShape["discover"] = (raw) =>
      Effect.gen(function* () {
        const url = yield* validateUrl(raw)
        const page = yield* download(url)
        if (!looksLikeHtml(page.body)) {
          // Already a feed document.
          return [{ url: page.finalUrl, title: null, type: page.contentType ?? null }]
        }
        const advertised = discoverInHtml(page.body, page.finalUrl)
        if (advertised.length > 0) return advertised
        // Fall back to probing conventional locations, in order of likelihood.
        const origin = new URL(page.finalUrl).origin
        const candidates = COMMON_FEED_PATHS.map((path) => `${origin}${path}`)
        const checks = yield* Effect.forEach(candidates, (c) => Effect.map(isFeed(c), (ok) => (ok ? c : null)), {
          concurrency: 4,
        })
        const hit = checks.find((c): c is string => c !== null)
        return hit ? [{ url: hit, title: null, type: null } satisfies DiscoveredFeed] : []
      }).pipe(Effect.withSpan("HttpFeedSource.discover"))

    return { fetch, discover }
  }),
)

interface ClientErrorLike {
  readonly reason: { readonly _tag: string; readonly description?: string | undefined; readonly cause?: unknown }
}

const describeClientError = (error: ClientErrorLike): string => {
  const reason = error.reason
  const detail = reason.description ?? (reason.cause instanceof Error ? reason.cause.message : undefined)
  switch (reason._tag) {
    case "TransportError":
      return detail ? `Could not connect: ${detail}` : "Could not connect"
    case "InvalidUrlError":
      return "Invalid URL"
    case "StatusCodeError":
      return detail ?? "Unexpected status code"
    default:
      return detail ?? reason._tag
  }
}
