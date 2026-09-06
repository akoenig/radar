import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi"
import { BadRequest, Conflict, NotFound, UnprocessableFeed } from "./ApiErrors.js"

// ---------------------------------------------------------------------------
// Transfer objects
// ---------------------------------------------------------------------------

export const FeedDto = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  siteUrl: Schema.NullOr(Schema.String),
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  iconUrl: Schema.NullOr(Schema.String),
  categoryId: Schema.NullOr(Schema.String),
  position: Schema.Number,
  lastFetchedAt: Schema.NullOr(Schema.Number),
  lastError: Schema.NullOr(Schema.String),
  unread: Schema.Number,
  createdAt: Schema.Number,
})
export type FeedDto = typeof FeedDto.Type

export const CategoryDto = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  position: Schema.Number,
})
export type CategoryDto = typeof CategoryDto.Type

export const EntrySummaryDto = Schema.Struct({
  id: Schema.String,
  feedId: Schema.String,
  url: Schema.NullOr(Schema.String),
  title: Schema.String,
  author: Schema.NullOr(Schema.String),
  summary: Schema.String,
  publishedAt: Schema.Number,
  isRead: Schema.Boolean,
  isSaved: Schema.Boolean,
})
export type EntrySummaryDto = typeof EntrySummaryDto.Type

export const EntryDto = Schema.Struct({
  ...EntrySummaryDto.fields,
  content: Schema.NullOr(Schema.String),
})
export type EntryDto = typeof EntryDto.Type

export const EntryPageDto = Schema.Struct({
  items: Schema.Array(EntrySummaryDto),
  /** Opaque cursor for the next page, or null at the end. */
  next: Schema.NullOr(Schema.String),
})
export type EntryPageDto = typeof EntryPageDto.Type

export const RefreshResultDto = Schema.Struct({
  feedId: Schema.String,
  title: Schema.String,
  added: Schema.Number,
  error: Schema.NullOr(Schema.String),
})
export type RefreshResultDto = typeof RefreshResultDto.Type

export const DiscoveredFeedDto = Schema.Struct({
  url: Schema.String,
  title: Schema.NullOr(Schema.String),
  type: Schema.NullOr(Schema.String),
})

export const CatalogFeedDto = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  url: Schema.String,
  siteUrl: Schema.String,
  /** The reader's feed id when already subscribed, otherwise null. */
  subscribedAs: Schema.NullOr(Schema.String),
})

export const CatalogTopicDto = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  feeds: Schema.Array(CatalogFeedDto),
})
export type CatalogTopicDto = typeof CatalogTopicDto.Type

export const StatsDto = Schema.Struct({ unread: Schema.Number, saved: Schema.Number })
export type StatsDto = typeof StatsDto.Type

export const ImportSummaryDto = Schema.Struct({
  feedsAdded: Schema.Number,
  feedsSkipped: Schema.Number,
  categoriesAdded: Schema.Number,
})

const Id = { id: Schema.String }

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

export const SubscribePayload = Schema.Struct({
  url: Schema.String,
  title: Schema.optionalKey(Schema.String),
  categoryId: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

export const FeedPatchPayload = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  categoryId: Schema.optionalKey(Schema.NullOr(Schema.String)),
  position: Schema.optionalKey(Schema.Number),
})

export const FeedsGroup = HttpApiGroup.make("feeds")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(FeedDto) }),
    HttpApiEndpoint.post("subscribe", "/", {
      payload: SubscribePayload,
      success: FeedDto,
      error: [NotFound, Conflict, UnprocessableFeed],
    }),
    HttpApiEndpoint.patch("update", "/:id", {
      params: Id,
      payload: FeedPatchPayload,
      success: FeedDto,
      error: [NotFound, Conflict],
    }),
    HttpApiEndpoint.make("DELETE")("unsubscribe", "/:id", { params: Id, error: NotFound }),
    HttpApiEndpoint.post("refresh", "/:id/refresh", { params: Id, success: RefreshResultDto, error: NotFound }),
  )
  .prefix("/feeds")

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CategoryPayload = Schema.Struct({ name: Schema.String })
export const CategoryPatchPayload = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  position: Schema.optionalKey(Schema.Number),
})

export const CategoriesGroup = HttpApiGroup.make("categories")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(CategoryDto) }),
    HttpApiEndpoint.post("create", "/", { payload: CategoryPayload, success: CategoryDto }),
    HttpApiEndpoint.patch("update", "/:id", { params: Id, payload: CategoryPatchPayload, success: CategoryDto, error: NotFound }),
    HttpApiEndpoint.make("DELETE")("remove", "/:id", { params: Id, error: NotFound }),
  )
  .prefix("/categories")

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export const EntryListQuery = Schema.Struct({
  feed: Schema.optionalKey(Schema.String),
  category: Schema.optionalKey(Schema.String),
  unread: Schema.optionalKey(Schema.Boolean),
  saved: Schema.optionalKey(Schema.Boolean),
  q: Schema.optionalKey(Schema.String),
  cursor: Schema.optionalKey(Schema.String),
  limit: Schema.optionalKey(Schema.Number),
})

export const MarkReadPayload = Schema.Struct({ ids: Schema.Array(Schema.String), read: Schema.Boolean })
export const MarkAllReadPayload = Schema.Struct({
  feedId: Schema.optionalKey(Schema.String),
  categoryId: Schema.optionalKey(Schema.String),
  savedOnly: Schema.optionalKey(Schema.Boolean),
  publishedBefore: Schema.optionalKey(Schema.Number),
})
export const SavedPayload = Schema.Struct({ saved: Schema.Boolean })

export const EntriesGroup = HttpApiGroup.make("entries")
  .add(
    HttpApiEndpoint.get("list", "/", { query: EntryListQuery, success: EntryPageDto, error: BadRequest }),
    HttpApiEndpoint.post("markRead", "/mark", { payload: MarkReadPayload }),
    HttpApiEndpoint.post("markAllRead", "/mark-all", {
      payload: MarkAllReadPayload,
      success: Schema.Struct({ count: Schema.Number }),
    }),
    HttpApiEndpoint.get("get", "/:id", { params: Id, success: EntryDto, error: NotFound }),
    HttpApiEndpoint.put("setSaved", "/:id/saved", { params: Id, payload: SavedPayload, success: EntryDto, error: NotFound }),
  )
  .prefix("/entries")

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export const OpmlText = Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/x-opml" }))
export const PlainText = Schema.String.pipe(HttpApiSchema.asText())

export const SystemGroup = HttpApiGroup.make("system").add(
  HttpApiEndpoint.get("health", "/health", { success: Schema.Struct({ ok: Schema.Boolean, version: Schema.String }) }),
  HttpApiEndpoint.get("stats", "/stats", { success: StatsDto }),
  HttpApiEndpoint.post("refreshAll", "/refresh", { success: Schema.Array(RefreshResultDto) }),
  HttpApiEndpoint.get("discover", "/discover", {
    query: { url: Schema.String },
    success: Schema.Array(DiscoveredFeedDto),
    error: UnprocessableFeed,
  }),
  HttpApiEndpoint.get("catalog", "/catalog", { success: Schema.Array(CatalogTopicDto) }),
  HttpApiEndpoint.get("exportOpml", "/opml", { success: OpmlText }),
  HttpApiEndpoint.post("importOpml", "/opml", { payload: PlainText, success: ImportSummaryDto, error: BadRequest }),
)

export const ReaderApi = HttpApi.make("reader").add(FeedsGroup, CategoriesGroup, EntriesGroup, SystemGroup).prefix("/api")
