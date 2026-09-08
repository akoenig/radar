import { Context, Effect, Option } from "effect"
import type { Entry, EntryQuery, EntryScope, EntrySummary } from "../model/Entry.js"
import type { EntryId, FeedId, Timestamp } from "../model/Ids.js"

export interface EntryStats {
  readonly unread: number
  readonly saved: number
}

export interface EntryRepositoryShape {
  readonly findById: (id: EntryId) => Effect.Effect<Option.Option<Entry>>
  readonly findByIds: (ids: ReadonlyArray<EntryId>) => Effect.Effect<ReadonlyArray<Entry>>
  /** Newest first, cursor paginated. Projected: list views never need article bodies. */
  readonly query: (query: EntryQuery) => Effect.Effect<ReadonlyArray<EntrySummary>>
  /**
   * Insert entries that are new for their feed (by guid) and refresh content of
   * entries already known. Never touches read/saved state. Returns the inserted count.
   */
  readonly ingest: (entries: ReadonlyArray<Entry>) => Effect.Effect<number>
  readonly setRead: (ids: ReadonlyArray<EntryId>, read: boolean, at: Timestamp) => Effect.Effect<void>
  /** Returns the number of entries changed. */
  readonly markAllRead: (scope: EntryScope, at: Timestamp) => Effect.Effect<number>
  readonly save: (entry: Entry) => Effect.Effect<void>
  readonly unreadCountByFeed: Effect.Effect<ReadonlyMap<FeedId, number>>
  readonly stats: Effect.Effect<EntryStats>
  /** Drop the oldest read, unsaved entries of a feed beyond `keep`. Returns count removed. */
  readonly prune: (feedId: FeedId, keep: number) => Effect.Effect<number>
}

export class EntryRepository extends Context.Service<EntryRepository, EntryRepositoryShape>()(
  "@radar/EntryRepository",
) {}
