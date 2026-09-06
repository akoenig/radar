import type { DiscoveredFeed } from "../../../domain/model/ParsedFeed.js"
import { resolveUrl } from "./text.js"

const FEED_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/json",
  "application/rdf+xml",
  "text/xml",
]

const attribute = (tag: string, name: string): string | null => {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null
}

/** Feeds advertised by `<link rel="alternate">` tags in an HTML document. */
export const discoverInHtml = (html: string, baseUrl: string): ReadonlyArray<DiscoveredFeed> => {
  const found: Array<DiscoveredFeed> = []
  const seen = new Set<string>()
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attribute(tag, "rel") ?? "").toLowerCase().split(/\s+/)
    const type = (attribute(tag, "type") ?? "").toLowerCase()
    if (!rel.includes("alternate") || !FEED_TYPES.some((t) => type.startsWith(t))) continue
    const url = resolveUrl(attribute(tag, "href"), baseUrl)
    if (!url || seen.has(url)) continue
    seen.add(url)
    found.push({ url, title: attribute(tag, "title"), type })
  }
  return found
}

/** Conventional feed locations to probe when a page advertises nothing. */
export const COMMON_FEED_PATHS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feed/",
  "/feeds/posts/default",
]
