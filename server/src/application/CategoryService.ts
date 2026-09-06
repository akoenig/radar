import { Clock, Context, Effect, Layer, Option } from "effect"
import { CategoryNotFound } from "../domain/errors.js"
import { Category } from "../domain/model/Category.js"
import { CategoryId } from "../domain/model/Ids.js"
import { CategoryRepository } from "../domain/ports/CategoryRepository.js"
import { FeedRepository } from "../domain/ports/FeedRepository.js"
import { IdGenerator } from "../domain/ports/IdGenerator.js"
import { UnitOfWork } from "../domain/ports/UnitOfWork.js"

export interface CategoryPatch {
  readonly name?: string | undefined
  readonly position?: number | undefined
}

export interface CategoryServiceShape {
  readonly list: Effect.Effect<ReadonlyArray<Category>>
  readonly create: (name: string) => Effect.Effect<Category>
  /** Idempotent create-by-name used by imports. */
  readonly ensure: (name: string) => Effect.Effect<Category>
  readonly update: (id: CategoryId, patch: CategoryPatch) => Effect.Effect<Category, CategoryNotFound>
  /** Deleting a category leaves its feeds uncategorized. */
  readonly remove: (id: CategoryId) => Effect.Effect<void, CategoryNotFound>
}

export class CategoryService extends Context.Service<CategoryService, CategoryServiceShape>()("@reader/CategoryService") {}

export const CategoryServiceLive = Layer.effect(
  CategoryService,
  Effect.gen(function* () {
    const categories = yield* CategoryRepository
    const feeds = yield* FeedRepository
    const ids = yield* IdGenerator
    const uow = yield* UnitOfWork

    const requireCategory = (id: CategoryId) =>
      Effect.flatMap(
        categories.findById(id),
        Option.match({ onNone: () => new CategoryNotFound({ id }), onSome: Effect.succeed }),
      )

    const create: CategoryServiceShape["create"] = (name) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const all = yield* categories.findAll
        const category = new Category({
          id: CategoryId.make(yield* ids.next),
          name: name.trim() || "Untitled",
          position: all.length,
          createdAt: now,
        })
        yield* categories.save(category)
        return category
      })

    const ensure: CategoryServiceShape["ensure"] = (name) =>
      Effect.flatMap(
        categories.findByName(name.trim()),
        Option.match({ onNone: () => create(name), onSome: Effect.succeed }),
      )

    const update: CategoryServiceShape["update"] = (id, patch) =>
      Effect.gen(function* () {
        let category = yield* requireCategory(id)
        if (patch.name !== undefined && patch.name.trim().length > 0) category = category.rename(patch.name.trim())
        if (patch.position !== undefined) category = category.moveTo(patch.position)
        yield* categories.save(category)
        return category
      })

    const remove: CategoryServiceShape["remove"] = (id) =>
      Effect.gen(function* () {
        yield* requireCategory(id)
        const now = yield* Clock.currentTimeMillis
        const orphans = yield* feeds.findByCategory(id)
        yield* uow.transaction(
          Effect.gen(function* () {
            yield* feeds.saveAll(orphans.map((f) => f.edited({ categoryId: null }, now)))
            yield* categories.remove(id)
          }),
        )
      })

    return { list: categories.findAll, create, ensure, update, remove }
  }),
)
