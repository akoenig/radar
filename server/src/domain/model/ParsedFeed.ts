/**
 * The FeedSource port's output: a feed document reduced to what the domain
 * cares about, independent of RSS/Atom/JSON Feed syntax.
 */
export interface ParsedItem {
  readonly guid: string
  readonly url: string | null
  readonly title: string
  readonly author: string | null
  readonly summary: string
  readonly content: string | null
  /** Epoch millis; null when the feed gives no date. */
  readonly publishedAt: number | null
}

export interface ParsedFeed {
  readonly title: string | null
  readonly siteUrl: string | null
  readonly description: string | null
  readonly iconUrl: string | null
  readonly items: ReadonlyArray<ParsedItem>
}

export interface FetchHints {
  readonly etag: string | null
  readonly lastModified: string | null
}

export type FetchOutcome =
  | { readonly _tag: "NotModified" }
  | { readonly _tag: "Fetched"; readonly feed: ParsedFeed; readonly hints: FetchHints; readonly finalUrl: string }

export interface DiscoveredFeed {
  readonly url: string
  readonly title: string | null
  readonly type: string | null
}
