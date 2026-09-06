import { Context, Effect, Option } from "effect"
import type { Category } from "../model/Category.js"
import type { CategoryId } from "../model/Ids.js"

export interface CategoryRepositoryShape {
  readonly findAll: Effect.Effect<ReadonlyArray<Category>>
  readonly findById: (id: CategoryId) => Effect.Effect<Option.Option<Category>>
  readonly findByName: (name: string) => Effect.Effect<Option.Option<Category>>
  readonly save: (category: Category) => Effect.Effect<void>
  readonly remove: (id: CategoryId) => Effect.Effect<void>
}

export class CategoryRepository extends Context.Service<CategoryRepository, CategoryRepositoryShape>()(
  "@reader/CategoryRepository",
) {}
