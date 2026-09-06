import { Schema } from "effect"
import { CategoryId, FeedId, Timestamp } from "./Ids.js"

/**
 * A subscription. `url` is the canonical feed document URL; `siteUrl` is the
 * human-facing website the feed describes.
 */
export class Feed extends Schema.Class<Feed>("Feed")({
  id: FeedId,
  url: Schema.String,
  siteUrl: Schema.NullOr(Schema.String),
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  iconUrl: Schema.NullOr(Schema.String),
  categoryId: Schema.NullOr(CategoryId),
  position: Schema.Number,
  lastFetchedAt: Schema.NullOr(Timestamp),
  lastError: Schema.NullOr(Schema.String),
  etag: Schema.NullOr(Schema.String),
  lastModified: Schema.NullOr(Schema.String),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}) {
  /** Conditional-request hints for the next fetch. */
  get cacheHints(): { readonly etag: string | null; readonly lastModified: string | null } {
    return { etag: this.etag, lastModified: this.lastModified }
  }

  /**
   * Refresh site metadata from a fetched document. The title is deliberately
   * left alone: once subscribed, the title belongs to the user.
   */
  withMetadata(
    meta: {
      readonly siteUrl?: string | null
      readonly description?: string | null
      readonly iconUrl?: string | null
    },
    now: Timestamp,
  ): Feed {
    return new Feed({
      ...this,
      siteUrl: meta.siteUrl ?? this.siteUrl,
      description: meta.description ?? this.description,
      iconUrl: meta.iconUrl ?? this.iconUrl,
      updatedAt: now,
    })
  }

  fetched(
    now: Timestamp,
    hints: { readonly etag: string | null; readonly lastModified: string | null },
  ): Feed {
    return new Feed({
      ...this,
      lastFetchedAt: now,
      lastError: null,
      etag: hints.etag,
      lastModified: hints.lastModified,
      updatedAt: now,
    })
  }

  failed(error: string, now: Timestamp): Feed {
    return new Feed({ ...this, lastFetchedAt: now, lastError: error, updatedAt: now })
  }

  edited(
    patch: {
      readonly title?: string
      readonly url?: string
      readonly categoryId?: CategoryId | null
      readonly position?: number
    },
    now: Timestamp,
  ): Feed {
    const urlChanged = patch.url !== undefined && patch.url !== this.url
    return new Feed({
      ...this,
      title: patch.title ?? this.title,
      url: patch.url ?? this.url,
      categoryId: patch.categoryId === undefined ? this.categoryId : patch.categoryId,
      position: patch.position ?? this.position,
      // A new URL invalidates conditional-request state.
      etag: urlChanged ? null : this.etag,
      lastModified: urlChanged ? null : this.lastModified,
      updatedAt: now,
    })
  }
}
