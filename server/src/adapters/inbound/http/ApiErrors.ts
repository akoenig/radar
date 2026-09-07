import { Effect, Schema } from "effect"
import type {
  CatalogEntryNotFound,
  CategoryNotFound,
  EntryNotFound,
  FeedAlreadyExists,
  FeedNotFound,
  FeedNotParseable,
  FeedUnreachable,
  InvalidFeedUrl,
  InvalidOpml,
  NoFeedDiscovered,
} from "../../../domain/errors.js"

/**
 * Wire-level errors. Domain errors are translated here so the HTTP contract
 * can evolve independently of the domain vocabulary.
 */
export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  { resource: Schema.Literals(["feed", "entry", "category", "catalog"]), id: Schema.String },
  { httpApiStatus: 404 },
) {}

export class Conflict extends Schema.TaggedError<Conflict>()(
  "Conflict",
  { message: Schema.String, existingId: Schema.NullOr(Schema.String) },
  { httpApiStatus: 409 },
) {}

export class UnprocessableFeed extends Schema.TaggedError<UnprocessableFeed>()(
  "UnprocessableFeed",
  {
    kind: Schema.Literals(["invalid-url", "unreachable", "not-parseable", "not-discovered"]),
    url: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 422 },
) {}

export class BadRequest extends Schema.TaggedError<BadRequest>()(
  "BadRequest",
  { message: Schema.String },
  { httpApiStatus: 400 },
) {}

type DomainError =
  | CatalogEntryNotFound
  | FeedNotFound
  | EntryNotFound
  | CategoryNotFound
  | FeedAlreadyExists
  | InvalidFeedUrl
  | FeedUnreachable
  | FeedNotParseable
  | NoFeedDiscovered
  | InvalidOpml

export type ApiError = NotFound | Conflict | UnprocessableFeed | BadRequest

export const toApiError = (error: DomainError): ApiError => {
  switch (error._tag) {
    case "FeedNotFound":
      return new NotFound({ resource: "feed", id: error.id })
    case "EntryNotFound":
      return new NotFound({ resource: "entry", id: error.id })
    case "CategoryNotFound":
      return new NotFound({ resource: "category", id: error.id })
    case "CatalogEntryNotFound":
      return new NotFound({ resource: "catalog", id: error.id })
    case "FeedAlreadyExists":
      return new Conflict({ message: `Already subscribed to ${error.url}`, existingId: error.existingId })
    case "InvalidFeedUrl":
      return new UnprocessableFeed({ kind: "invalid-url", url: error.url, message: error.reason })
    case "FeedUnreachable":
      return new UnprocessableFeed({ kind: "unreachable", url: error.url, message: error.reason })
    case "FeedNotParseable":
      return new UnprocessableFeed({ kind: "not-parseable", url: error.url, message: error.reason })
    case "NoFeedDiscovered":
      return new UnprocessableFeed({ kind: "not-discovered", url: error.url, message: "No feed found at this address" })
    case "InvalidOpml":
      return new BadRequest({ message: error.reason })
  }
}

/** The API error a given domain error maps to, so handlers keep precise error types. */
export type ToApiError<E> = E extends FeedNotFound | EntryNotFound | CategoryNotFound | CatalogEntryNotFound
  ? NotFound
  : E extends FeedAlreadyExists
    ? Conflict
    : E extends InvalidFeedUrl | FeedUnreachable | FeedNotParseable | NoFeedDiscovered
      ? UnprocessableFeed
      : E extends InvalidOpml
        ? BadRequest
        : never

/** Translate every domain failure of an effect into its API counterpart. */
export const mapDomainErrors = <A, E extends DomainError, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, ToApiError<E>, R> => Effect.mapError(effect, (e) => toApiError(e) as ToApiError<E>)
