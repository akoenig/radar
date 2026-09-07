import { Clock, Context, Effect, Layer, Option } from "effect"
import type { InvalidOpml } from "../domain/errors.js"
import { Feed } from "../domain/model/Feed.js"
import { FeedId } from "../domain/model/Ids.js"
import { CategoryRepository } from "../domain/ports/CategoryRepository.js"
import { FeedRepository } from "../domain/ports/FeedRepository.js"
import { IdGenerator } from "../domain/ports/IdGenerator.js"
import { OpmlCodec, type OpmlOutline } from "../domain/ports/OpmlCodec.js"
import { CategoryService } from "./CategoryService.js"

export interface ImportSummary {
  readonly feedsAdded: number
  readonly feedsSkipped: number
  readonly categoriesAdded: number
}

export interface OpmlServiceShape {
  readonly exportOpml: Effect.Effect<string>
  /**
   * Adds every subscription in the document that is not already present.
   * Feeds are not fetched here; a refresh afterwards fills them in.
   */
  readonly importOpml: (xml: string) => Effect.Effect<ImportSummary, InvalidOpml>
}

export class OpmlService extends Context.Service<OpmlService, OpmlServiceShape>()("@radar/OpmlService") {}

export const OpmlServiceLive = Layer.effect(
  OpmlService,
  Effect.gen(function* () {
    const codec = yield* OpmlCodec
    const feeds = yield* FeedRepository
    const categories = yield* CategoryRepository
    const categoryService = yield* CategoryService
    const ids = yield* IdGenerator

    const exportOpml: OpmlServiceShape["exportOpml"] = Effect.gen(function* () {
      const [allFeeds, allCategories] = yield* Effect.all([feeds.findAll, categories.findAll])
      const outline = (f: Feed): OpmlOutline => ({ title: f.title, xmlUrl: f.url, htmlUrl: f.siteUrl })
      return yield* codec.render({
        title: "Reader subscriptions",
        uncategorized: allFeeds.filter((f) => f.categoryId === null).map(outline),
        folders: allCategories.map((c) => ({
          name: c.name,
          outlines: allFeeds.filter((f) => f.categoryId === c.id).map(outline),
        })),
      })
    })

    const importOpml: OpmlServiceShape["importOpml"] = (xml) =>
      Effect.gen(function* () {
        const doc = yield* codec.parse(xml)
        const before = (yield* categories.findAll).length
        const now = yield* Clock.currentTimeMillis
        let added = 0
        let skipped = 0
        let position = (yield* feeds.findAll).length

        const add = (outline: OpmlOutline, categoryId: Feed["categoryId"]) =>
          Effect.gen(function* () {
            const url = outline.xmlUrl.trim()
            if (url.length === 0 || Option.isSome(yield* feeds.findByUrl(url))) {
              skipped += 1
              return
            }
            yield* feeds.save(
              new Feed({
                id: FeedId.make(yield* ids.next),
                url,
                siteUrl: outline.htmlUrl,
                title: outline.title.trim() || url,
                description: null,
                iconUrl: null,
                categoryId,
                position: position++,
                lastFetchedAt: null,
                lastError: null,
                etag: null,
                lastModified: null,
                createdAt: now,
                updatedAt: now,
              }),
            )
            added += 1
          })

        yield* Effect.forEach(doc.uncategorized, (o) => add(o, null), { discard: true })
        yield* Effect.forEach(
          doc.folders,
          (folder) =>
            Effect.gen(function* () {
              const category = yield* categoryService.ensure(folder.name)
              yield* Effect.forEach(folder.outlines, (o) => add(o, category.id), { discard: true })
            }),
          { discard: true },
        )
        const after = (yield* categories.findAll).length
        return { feedsAdded: added, feedsSkipped: skipped, categoriesAdded: after - before }
      })

    return { exportOpml, importOpml }
  }),
)
