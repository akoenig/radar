import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { RefreshService } from "../../../application/RefreshService.js"
import { SubscriptionService } from "../../../application/SubscriptionService.js"
import { CategoryId, FeedId } from "../../../domain/model/Ids.js"
import { RadarApi } from "./Api.js"
import { mapDomainErrors } from "./ApiErrors.js"
import { feedToDto } from "./mappers.js"

const categoryId = (value: string | null | undefined): CategoryId | null | undefined =>
  value === undefined ? undefined : value === null ? null : CategoryId.make(value)

export const FeedsHandlersLive = HttpApiBuilder.group(RadarApi, "feeds", (handlers) =>
  Effect.gen(function* () {
    const subscriptions = yield* SubscriptionService
    const refresh = yield* RefreshService

    const withCounts = (feedId: FeedId) =>
      Effect.map(subscriptions.get(feedId), ({ feed, unread }) => feedToDto(feed, unread))

    return handlers
      .handle("list", () => Effect.map(subscriptions.list, (all) => all.map(({ feed, unread }) => feedToDto(feed, unread))))
      .handle("subscribe", ({ payload }) =>
        mapDomainErrors(
          subscriptions.subscribe({ url: payload.url, title: payload.title, categoryId: categoryId(payload.categoryId) }),
        ).pipe(Effect.flatMap((feed) => mapDomainErrors(withCounts(feed.id)))),
      )
      .handle("update", ({ params, payload }) =>
        mapDomainErrors(
          subscriptions.update(FeedId.make(params.id), {
            title: payload.title,
            url: payload.url,
            categoryId: categoryId(payload.categoryId),
            position: payload.position,
          }),
        ).pipe(Effect.flatMap((feed) => mapDomainErrors(withCounts(feed.id)))),
      )
      // Answers with the whole list, in its new order, so the client can swap
      // its cache wholesale instead of reconciling a partial response.
      .handle("reorder", ({ payload }) =>
        mapDomainErrors(
          subscriptions.reorder(
            payload.items.map((item) => ({
              id: FeedId.make(item.id),
              categoryId: item.categoryId === null ? null : CategoryId.make(item.categoryId),
              position: item.position,
            })),
          ),
        ).pipe(Effect.flatMap(() => Effect.map(subscriptions.list, (all) => all.map(({ feed, unread }) => feedToDto(feed, unread))))),
      )
      .handle("unsubscribe", ({ params }) => mapDomainErrors(subscriptions.unsubscribe(FeedId.make(params.id))))
      .handle("refresh", ({ params }) => mapDomainErrors(refresh.refreshFeed(FeedId.make(params.id))))
  }),
)
