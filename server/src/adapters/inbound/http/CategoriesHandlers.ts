import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { CategoryService } from "../../../application/CategoryService.js"
import { CategoryId } from "../../../domain/model/Ids.js"
import { RadarApi } from "./Api.js"
import { mapDomainErrors } from "./ApiErrors.js"
import { categoryToDto } from "./mappers.js"

export const CategoriesHandlersLive = HttpApiBuilder.group(RadarApi, "categories", (handlers) =>
  Effect.gen(function* () {
    const categories = yield* CategoryService
    return handlers
      .handle("list", () => Effect.map(categories.list, (all) => all.map(categoryToDto)))
      .handle("create", ({ payload }) => Effect.map(categories.create(payload.name), categoryToDto))
      .handle("update", ({ params, payload }) =>
        mapDomainErrors(categories.update(CategoryId.make(params.id), payload)).pipe(Effect.map(categoryToDto)),
      )
      .handle("reorder", ({ payload }) =>
        mapDomainErrors(
          categories.reorder(payload.items.map((item) => ({ id: CategoryId.make(item.id), position: item.position }))),
        ).pipe(Effect.flatMap(() => Effect.map(categories.list, (all) => all.map(categoryToDto)))),
      )
      .handle("remove", ({ params }) => mapDomainErrors(categories.remove(CategoryId.make(params.id))))
  }),
)
