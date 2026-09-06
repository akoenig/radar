import { Clock, Context, Effect, Layer, Option } from "effect"
import { EntryNotFound } from "../domain/errors.js"
import type { Entry, EntryQuery, EntryScope } from "../domain/model/Entry.js"
import type { EntryId } from "../domain/model/Ids.js"
import { EntryRepository, type EntryStats } from "../domain/ports/EntryRepository.js"

export interface EntryPage {
  readonly items: ReadonlyArray<Entry>
  /** Present when more items exist beyond this page. */
  readonly next: { readonly publishedAt: number; readonly id: EntryId } | null
}

export interface EntryServiceShape {
  readonly list: (query: EntryQuery) => Effect.Effect<EntryPage>
  readonly get: (id: EntryId) => Effect.Effect<Entry, EntryNotFound>
  readonly setRead: (ids: ReadonlyArray<EntryId>, read: boolean) => Effect.Effect<void>
  readonly markAllRead: (scope: EntryScope) => Effect.Effect<number>
  readonly setSaved: (id: EntryId, saved: boolean) => Effect.Effect<Entry, EntryNotFound>
  readonly stats: Effect.Effect<EntryStats>
}

export class EntryService extends Context.Service<EntryService, EntryServiceShape>()("@reader/EntryService") {}

export const MAX_PAGE_SIZE = 200

export const EntryServiceLive = Layer.effect(
  EntryService,
  Effect.gen(function* () {
    const entries = yield* EntryRepository

    const get: EntryServiceShape["get"] = (id) =>
      Effect.flatMap(entries.findById(id), Option.match({ onNone: () => new EntryNotFound({ id }), onSome: Effect.succeed }))

    const list: EntryServiceShape["list"] = (query) =>
      Effect.gen(function* () {
        const limit = Math.max(1, Math.min(query.limit, MAX_PAGE_SIZE))
        // Fetch one extra row to learn whether a next page exists.
        const rows = yield* entries.query({ ...query, limit: limit + 1 })
        const items = rows.slice(0, limit)
        const last = items[items.length - 1]
        const next = rows.length > limit && last ? { publishedAt: last.publishedAt, id: last.id } : null
        return { items, next }
      })

    const setRead: EntryServiceShape["setRead"] = (ids, read) =>
      ids.length === 0
        ? Effect.void
        : Effect.flatMap(Clock.currentTimeMillis, (now) => entries.setRead(ids, read, now))

    const markAllRead: EntryServiceShape["markAllRead"] = (scope) =>
      Effect.flatMap(Clock.currentTimeMillis, (now) => entries.markAllRead(scope, now))

    const setSaved: EntryServiceShape["setSaved"] = (id, saved) =>
      Effect.gen(function* () {
        const entry = yield* get(id)
        const now = yield* Clock.currentTimeMillis
        const updated = entry.markSaved(saved, now)
        yield* entries.save(updated)
        return updated
      })

    return { list, get, setRead, markAllRead, setSaved, stats: entries.stats }
  }),
)
