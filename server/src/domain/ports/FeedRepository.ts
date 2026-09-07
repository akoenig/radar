import { Context, Effect, Option } from "effect"
import type { Feed } from "../model/Feed.js"
import type { CategoryId, FeedId } from "../model/Ids.js"

/**
 * Persistence port for subscriptions. Infrastructure failures are defects:
 * the application layer has no meaningful recovery for a broken database.
 */
export interface FeedRepositoryShape {
  readonly findAll: Effect.Effect<ReadonlyArray<Feed>>
  readonly findById: (id: FeedId) => Effect.Effect<Option.Option<Feed>>
  readonly findByUrl: (url: string) => Effect.Effect<Option.Option<Feed>>
  readonly findByCategory: (categoryId: CategoryId) => Effect.Effect<ReadonlyArray<Feed>>
  /** Insert or replace by id. */
  readonly save: (feed: Feed) => Effect.Effect<void>
  readonly saveAll: (feeds: ReadonlyArray<Feed>) => Effect.Effect<void>
  readonly remove: (id: FeedId) => Effect.Effect<void>
}

export class FeedRepository extends Context.Service<FeedRepository, FeedRepositoryShape>()(
  "@radar/FeedRepository",
) {}
