import { Context, Effect } from "effect"
import type { FeedNotParseable, FeedUnreachable, InvalidFeedUrl } from "../errors.js"
import type { DiscoveredFeed, FetchHints, FetchOutcome } from "../model/ParsedFeed.js"

/**
 * Where feed documents come from. The adapter owns HTTP, parsing and
 * autodiscovery; the application only sees domain-shaped results.
 */
export interface FeedSourceShape {
  readonly fetch: (
    url: string,
    hints?: FetchHints,
  ) => Effect.Effect<FetchOutcome, InvalidFeedUrl | FeedUnreachable | FeedNotParseable>
  /** Given any URL (feed or web page), list feed documents it advertises. */
  readonly discover: (url: string) => Effect.Effect<ReadonlyArray<DiscoveredFeed>, InvalidFeedUrl | FeedUnreachable>
}

export class FeedSource extends Context.Service<FeedSource, FeedSourceShape>()("@radar/FeedSource") {}
