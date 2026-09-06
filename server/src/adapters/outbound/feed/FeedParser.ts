import { XMLParser } from "fast-xml-parser"
import he from "he"
import { createHash } from "node:crypto"
import type { ParsedFeed, ParsedItem } from "../../../domain/model/ParsedFeed.js"
import { htmlToText, originOf, parseDate, resolveUrl, summarize } from "./text.js"

type Node = string | number | boolean | null | undefined | ReadonlyArray<Node> | { readonly [key: string]: Node }
type ObjectNode = { readonly [key: string]: Node }

export class ParseError extends Error {
  override readonly name = "ParseError"
}

const ARRAY_PATHS = new Set([
  "rss.channel.item",
  "feed.entry",
  "feed.link",
  "feed.entry.link",
  "feed.entry.author",
  "feed.author",
  "rdf:RDF.item",
])

/**
 * Elements whose inner markup must survive verbatim. The parser hands these
 * back as raw strings instead of a tree, which keeps mixed content (Atom
 * `type="xhtml"`) intact.
 */
const RAW_CONTENT_PATHS = [
  "rss.channel.item.content:encoded",
  "rss.channel.item.description",
  "feed.entry.content",
  "feed.entry.summary",
  "rdf:RDF.item.content:encoded",
  "rdf:RDF.item.description",
]

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  stopNodes: RAW_CONTENT_PATHS,
  isArray: (_name, jpath) => typeof jpath === "string" && ARRAY_PATHS.has(jpath),
})

const isObject = (n: Node): n is ObjectNode => typeof n === "object" && n !== null && !Array.isArray(n)

const asArray = (n: Node): ReadonlyArray<Node> => (Array.isArray(n) ? n : n === undefined || n === null ? [] : [n])

const text = (n: Node): string | null => {
  if (typeof n === "string") return n
  if (typeof n === "number" || typeof n === "boolean") return String(n)
  if (isObject(n)) {
    const inner = n["#text"]
    if (typeof inner === "string") return inner
    if (typeof inner === "number") return String(inner)
  }
  return null
}

const attr = (n: Node, name: string): string | null => {
  if (!isObject(n)) return null
  const value = n[`@_${name}`]
  return typeof value === "string" ? value : null
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * HTML from a raw (stop-node) element. CDATA sections are unwrapped as-is;
 * escaped markup is decoded; explicitly plain text is escaped so it renders
 * literally.
 */
const html = (n: Node): string | null => {
  const raw = text(n)
  if (raw === null) return null
  const type = attr(n, "type")
  if (type === "xhtml") return raw.trim()
  if (raw.includes("<![CDATA[")) return raw.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim()
  const decoded = he.decode(raw).trim()
  return type === "text" ? escapeHtml(decoded) : decoded
}

const first = (...values: ReadonlyArray<string | null | undefined>): string | null => {
  for (const v of values) if (v !== null && v !== undefined && v.trim().length > 0) return v.trim()
  return null
}

const hash = (...parts: ReadonlyArray<string | null>): string =>
  createHash("sha1")
    .update(parts.map((p) => p ?? "").join(" "))
    .digest("hex")

const stableGuid = (guid: string | null, url: string | null, title: string | null, date: string | null): string =>
  guid ?? url ?? `sha1:${hash(title, date)}`

const nonEmpty = (html: string | null): string | null => (html && htmlToText(html).length > 0 ? html : null)

const plain = (n: Node): string | null => {
  const value = text(n)
  return value === null ? null : htmlToText(value) || null
}

const favicon = (url: string): string | null => {
  const origin = originOf(url)
  return origin ? `${origin}/favicon.ico` : null
}

// ---------------------------------------------------------------------------
// RSS 2.0
// ---------------------------------------------------------------------------

const parseRss = (rss: ObjectNode, base: string): ParsedFeed => {
  const channel = isObject(rss.channel) ? rss.channel : {}
  const siteUrl = resolveUrl(text(channel.link), base)
  const image = isObject(channel.image) ? channel.image : null
  const items = asArray(channel.item)
    .filter(isObject)
    .map((item): ParsedItem => {
      const content = nonEmpty(html(item["content:encoded"]))
      const description = nonEmpty(html(item.description))
      const guidText = text(item.guid)?.trim() || null
      const guidIsLink = attr(item.guid, "isPermaLink") !== "false" && /^https?:/i.test(guidText ?? "")
      const url = resolveUrl(first(text(item.link), guidIsLink ? guidText : null), base)
      const dateText = first(text(item.pubDate), text(item["dc:date"]))
      return {
        guid: stableGuid(guidText, url, text(item.title), dateText),
        url,
        title: plain(item.title) ?? "(untitled)",
        author: first(text(item["dc:creator"]), text(item.author), isObject(item.author) ? text(item.author.name) : null),
        summary: summarize(description ?? content),
        content: content ?? description,
        publishedAt: parseDate(dateText),
      }
    })
  return {
    title: plain(channel.title),
    siteUrl,
    description: plain(channel.description),
    iconUrl: resolveUrl(image ? text(image.url) : null, base) ?? favicon(siteUrl ?? base),
    items,
  }
}

// ---------------------------------------------------------------------------
// Atom 1.0
// ---------------------------------------------------------------------------

const atomLink = (links: Node, rel: string): string | null => {
  const all = asArray(links).filter(isObject)
  const match =
    all.find((l) => (attr(l, "rel") ?? "alternate") === rel && (attr(l, "type") ?? "text/html").includes("html")) ??
    all.find((l) => (attr(l, "rel") ?? "alternate") === rel)
  return match ? attr(match, "href") : null
}

const parseAtom = (feed: ObjectNode, base: string): ParsedFeed => {
  const siteUrl = resolveUrl(atomLink(feed.link, "alternate"), base)
  const feedAuthor = asArray(feed.author).filter(isObject)[0]
  const entries = asArray(feed.entry)
    .filter(isObject)
    .map((entry): ParsedItem => {
      const content = nonEmpty(html(entry.content))
      const summary = nonEmpty(html(entry.summary))
      const url = resolveUrl(atomLink(entry.link, "alternate"), base)
      const author = asArray(entry.author).filter(isObject)[0] ?? feedAuthor
      const dateText = first(text(entry.published), text(entry.updated))
      return {
        guid: stableGuid(text(entry.id)?.trim() || null, url, text(entry.title), dateText),
        url,
        title: plain(entry.title) ?? "(untitled)",
        author: author ? first(text(author.name)) : null,
        summary: summarize(summary ?? content),
        content: content ?? summary,
        publishedAt: parseDate(dateText),
      }
    })
  return {
    title: plain(feed.title),
    siteUrl,
    description: plain(feed.subtitle),
    iconUrl: resolveUrl(first(text(feed.icon), text(feed.logo)), base) ?? favicon(siteUrl ?? base),
    items: entries,
  }
}

// ---------------------------------------------------------------------------
// RSS 1.0 (RDF)
// ---------------------------------------------------------------------------

const parseRdf = (rdf: ObjectNode, base: string): ParsedFeed => {
  const channel = isObject(rdf.channel) ? rdf.channel : {}
  const siteUrl = resolveUrl(text(channel.link), base)
  const items = asArray(rdf.item)
    .filter(isObject)
    .map((item): ParsedItem => {
      const content = nonEmpty(html(item["content:encoded"]))
      const description = nonEmpty(html(item.description))
      const url = resolveUrl(first(text(item.link), attr(item, "rdf:about")), base)
      const dateText = first(text(item["dc:date"]))
      return {
        guid: stableGuid(attr(item, "rdf:about"), url, text(item.title), dateText),
        url,
        title: plain(item.title) ?? "(untitled)",
        author: first(text(item["dc:creator"])),
        summary: summarize(description ?? content),
        content: content ?? description,
        publishedAt: parseDate(dateText),
      }
    })
  return {
    title: plain(channel.title),
    siteUrl,
    description: plain(channel.description),
    iconUrl: favicon(siteUrl ?? base),
    items,
  }
}

// ---------------------------------------------------------------------------
// JSON Feed
// ---------------------------------------------------------------------------

const parseJsonFeed = (json: ObjectNode, base: string): ParsedFeed => {
  const siteUrl = resolveUrl(text(json.home_page_url), base)
  const items = asArray(json.items)
    .filter(isObject)
    .map((item): ParsedItem => {
      const contentText = text(item.content_text)
      const content = nonEmpty(text(item.content_html)) ?? (contentText ? `<p>${contentText}</p>` : null)
      const summary = text(item.summary)
      const url = resolveUrl(text(item.url), base)
      const dateText = first(text(item.date_published), text(item.date_modified))
      const authors = asArray(item.authors).filter(isObject)
      const author = authors[0] ?? (isObject(item.author) ? item.author : null)
      return {
        guid: stableGuid(text(item.id), url, text(item.title), dateText),
        url,
        title: text(item.title)?.trim() || "(untitled)",
        author: author ? first(text(author.name)) : null,
        summary: summary?.trim() || summarize(content),
        content,
        publishedAt: parseDate(dateText),
      }
    })
  return {
    title: text(json.title)?.trim() || null,
    siteUrl,
    description: text(json.description)?.trim() || null,
    iconUrl: resolveUrl(first(text(json.icon), text(json.favicon)), base) ?? favicon(siteUrl ?? base),
    items,
  }
}

// ---------------------------------------------------------------------------

/**
 * Parse a feed document of any supported flavor. Throws ParseError when the
 * body is not a recognizable feed.
 */
export const parseFeed = (body: string, baseUrl: string): ParsedFeed => {
  const trimmed = body.trimStart()
  if (trimmed.startsWith("{")) {
    let json: unknown
    try {
      json = JSON.parse(trimmed)
    } catch (e) {
      throw new ParseError(`Invalid JSON: ${(e as Error).message}`)
    }
    const node = json as Node
    if (isObject(node) && typeof node.version === "string" && node.version.includes("jsonfeed")) {
      return parseJsonFeed(node, baseUrl)
    }
    throw new ParseError("JSON document is not a JSON Feed")
  }

  let doc: Node
  try {
    doc = parser.parse(trimmed) as Node
  } catch (e) {
    throw new ParseError(`Malformed XML: ${(e as Error).message}`)
  }
  if (!isObject(doc)) throw new ParseError("Empty document")
  if (isObject(doc.rss)) return parseRss(doc.rss, baseUrl)
  if (isObject(doc.feed)) return parseAtom(doc.feed, baseUrl)
  if (isObject(doc["rdf:RDF"])) return parseRdf(doc["rdf:RDF"], baseUrl)
  const root = Object.keys(doc).filter((k) => k !== "?xml")[0]
  throw new ParseError(root ? `Unsupported document root <${root}>` : "No feed element found")
}
