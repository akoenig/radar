import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { EntryService } from "../../../application/EntryService.js"
import { CategoryId, EntryId, FeedId } from "../../../domain/model/Ids.js"
import { ReaderApi } from "./Api.js"
import { BadRequest, mapDomainErrors } from "./ApiErrors.js"
import { decodeCursor, encodeCursor, entryToDto, entryToSummaryDto } from "./mappers.js"

const DEFAULT_PAGE = 60

export const EntriesHandlersLive = HttpApiBuilder.group(ReaderApi, "entries", (handlers) =>
  Effect.gen(function* () {
    const entries = yield* EntryService

    return handlers
      .handle("list", ({ query }) =>
        Effect.gen(function* () {
          const before = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
          if (before === null) return yield* new BadRequest({ message: "Malformed cursor" })
          const page = yield* entries.list({
            ...(query.feed !== undefined ? { feedId: FeedId.make(query.feed) } : {}),
            ...(query.category !== undefined ? { categoryId: CategoryId.make(query.category) } : {}),
            unreadOnly: query.unread === true,
            savedOnly: query.saved === true,
            ...(query.q !== undefined ? { search: query.q } : {}),
            ...(before !== undefined ? { before } : {}),
            limit: query.limit ?? DEFAULT_PAGE,
          })
          return { items: page.items.map(entryToSummaryDto), next: page.next ? encodeCursor(page.next) : null }
        }),
      )
      .handle("get", ({ params }) => mapDomainErrors(entries.get(EntryId.make(params.id))).pipe(Effect.map(entryToDto)))
      .handle("markRead", ({ payload }) => entries.setRead(payload.ids.map((id) => EntryId.make(id)), payload.read))
      .handle("markAllRead", ({ payload }) =>
        Effect.map(
          entries.markAllRead({
            ...(payload.feedId !== undefined ? { feedId: FeedId.make(payload.feedId) } : {}),
            ...(payload.categoryId !== undefined ? { categoryId: CategoryId.make(payload.categoryId) } : {}),
            ...(payload.savedOnly !== undefined ? { savedOnly: payload.savedOnly } : {}),
            ...(payload.publishedBefore !== undefined ? { publishedBefore: payload.publishedBefore } : {}),
          }),
          (count) => ({ count }),
        ),
      )
      .handle("setSaved", ({ params, payload }) =>
        mapDomainErrors(entries.setSaved(EntryId.make(params.id), payload.saved)).pipe(Effect.map(entryToDto)),
      )
  }),
)
