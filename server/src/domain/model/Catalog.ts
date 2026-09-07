/**
 * A browsable directory of suggested feeds. This is reference data, not user
 * data: nothing here is persisted, and the catalog says nothing about what the
 * user is subscribed to.
 */
/**
 * What a directory knows about a feed beyond its address: how many people read
 * it, how often it posts, what it looks like. Absent on bundled entries, which
 * are a hand-picked list with nothing to measure.
 */
export interface FeedReach {
  readonly iconUrl: string | null
  readonly subscribers: number | null
  /** Posts per week, as the directory measures it. */
  readonly postsPerWeek: number | null
  readonly lastPublishedAt: number | null
  readonly topics: ReadonlyArray<string>
}

export interface CatalogFeed {
  /** Stable slug, unique across the whole catalog. */
  readonly id: string
  readonly title: string
  readonly description: string
  /** The feed document. */
  readonly url: string
  /** The human-facing site, used as a fallback for autodiscovery. */
  readonly siteUrl: string
  readonly reach?: FeedReach
}

export interface CatalogTopic {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly feeds: ReadonlyArray<CatalogFeed>
}

/**
 * Directory results have no curated slug, so their id carries the feed address
 * itself. That keeps a result addressable — for a preview, say — without the
 * server holding on to every search anyone has ever run.
 */
const DIRECTORY_PREFIX = "d~"

export const directoryId = (url: string): string => `${DIRECTORY_PREFIX}${Buffer.from(url).toString("base64url")}`

/** The address inside a directory id, or null for a bundled catalog slug. */
export const directoryUrl = (id: string): string | null => {
  if (!id.startsWith(DIRECTORY_PREFIX)) return null
  const decoded = Buffer.from(id.slice(DIRECTORY_PREFIX.length), "base64url").toString("utf8")
  return decoded.length > 0 ? decoded : null
}
