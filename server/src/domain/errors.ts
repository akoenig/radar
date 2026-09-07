import { Schema } from "effect"
import { CategoryId, EntryId, FeedId } from "./model/Ids.js"

export class FeedNotFound extends Schema.TaggedError<FeedNotFound>()("FeedNotFound", {
  id: FeedId,
}) {}

export class EntryNotFound extends Schema.TaggedError<EntryNotFound>()("EntryNotFound", {
  id: EntryId,
}) {}

export class CategoryNotFound extends Schema.TaggedError<CategoryNotFound>()("CategoryNotFound", {
  id: CategoryId,
}) {}

export class FeedAlreadyExists extends Schema.TaggedError<FeedAlreadyExists>()("FeedAlreadyExists", {
  url: Schema.String,
  existingId: FeedId,
}) {}

export class InvalidFeedUrl extends Schema.TaggedError<InvalidFeedUrl>()("InvalidFeedUrl", {
  url: Schema.String,
  reason: Schema.String,
}) {}

/** The remote host could not be reached or answered with an error status. */
export class FeedUnreachable extends Schema.TaggedError<FeedUnreachable>()("FeedUnreachable", {
  url: Schema.String,
  reason: Schema.String,
}) {}

/** The document was fetched but is not a feed we can understand. */
export class FeedNotParseable extends Schema.TaggedError<FeedNotParseable>()("FeedNotParseable", {
  url: Schema.String,
  reason: Schema.String,
}) {}

/** No feed could be discovered at a given website URL. */
export class NoFeedDiscovered extends Schema.TaggedError<NoFeedDiscovered>()("NoFeedDiscovered", {
  url: Schema.String,
}) {}

/** A catalog id that is not in the bundled directory. */
export class CatalogEntryNotFound extends Schema.TaggedError<CatalogEntryNotFound>()("CatalogEntryNotFound", {
  id: Schema.String,
}) {}

export class InvalidOpml extends Schema.TaggedError<InvalidOpml>()("InvalidOpml", {
  reason: Schema.String,
}) {}
