import { Schema } from "effect"
import { CategoryId, EntryId, FeedId, Timestamp } from "./Ids.js"

/**
 * An item from a feed. Read/saved state is user state and lives on the entry
 * (there is a single user).
 */
export class Entry extends Schema.Class<Entry>("Entry")({
  id: EntryId,
  feedId: FeedId,
  guid: Schema.String,
  url: Schema.NullOr(Schema.String),
  title: Schema.String,
  author: Schema.NullOr(Schema.String),
  /** Plain-text excerpt used in list views. */
  summary: Schema.String,
  /** Full HTML content, if the feed provides it. Sanitized at render time. */
  content: Schema.NullOr(Schema.String),
  publishedAt: Timestamp,
  fetchedAt: Timestamp,
  isRead: Schema.Boolean,
  isSaved: Schema.Boolean,
  readAt: Schema.NullOr(Timestamp),
  savedAt: Schema.NullOr(Timestamp),
}) {
  markRead(read: boolean, now: Timestamp): Entry {
    return new Entry({ ...this, isRead: read, readAt: read ? now : null })
  }
  markSaved(saved: boolean, now: Timestamp): Entry {
    return new Entry({ ...this, isSaved: saved, savedAt: saved ? now : null })
  }
}

/**
 * What a list view needs, which is everything but the article body.
 *
 * Bodies are the largest thing in the database and no list renders one, so
 * lists read this projection instead of whole entries. Reading full entries to
 * build a list costs megabytes per page to produce kilobytes of JSON, and it
 * is paid on every scroll, filter change and view switch.
 */
export interface EntrySummary {
  readonly id: EntryId
  readonly feedId: FeedId
  readonly url: string | null
  readonly title: string
  readonly author: string | null
  readonly summary: string
  readonly publishedAt: Timestamp
  readonly isRead: boolean
  readonly isSaved: boolean
}

/** Sort key used for stable cursor pagination (newest first). */
export interface EntryCursor {
  readonly publishedAt: Timestamp
  readonly id: EntryId
}

/** Which entries to list. All filters are ANDed. */
export interface EntryQuery {
  readonly feedId?: FeedId
  readonly categoryId?: CategoryId
  readonly unreadOnly: boolean
  readonly savedOnly: boolean
  readonly search?: string
  readonly before?: EntryCursor
  readonly limit: number
}

/** Which entries a bulk read operation applies to. */
export interface EntryScope {
  readonly feedId?: FeedId
  readonly categoryId?: CategoryId
  readonly savedOnly?: boolean
  /** Only entries published at or before this time (protects newly arrived items). */
  readonly publishedBefore?: Timestamp
}

