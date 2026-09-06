/**
 * A browsable directory of suggested feeds. This is reference data, not user
 * data: nothing here is persisted, and the catalog says nothing about what the
 * user is subscribed to.
 */
export interface CatalogFeed {
  /** Stable slug, unique across the whole catalog. */
  readonly id: string
  readonly title: string
  readonly description: string
  /** The feed document. */
  readonly url: string
  /** The human-facing site, used as a fallback for autodiscovery. */
  readonly siteUrl: string
}

export interface CatalogTopic {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly feeds: ReadonlyArray<CatalogFeed>
}
