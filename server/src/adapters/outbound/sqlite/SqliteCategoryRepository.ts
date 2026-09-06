import { Effect, Layer, Option } from "effect"
import { Category } from "../../../domain/model/Category.js"
import { CategoryId } from "../../../domain/model/Ids.js"
import { CategoryRepository, type CategoryRepositoryShape } from "../../../domain/ports/CategoryRepository.js"
import { SqliteDatabase, type SqlValue } from "./SqliteDatabase.js"

interface CategoryRow {
  id: string
  name: string
  position: number
  created_at: number
  [key: string]: SqlValue
}

const toCategory = (row: CategoryRow): Category =>
  new Category({ id: CategoryId.make(row.id), name: row.name, position: row.position, createdAt: row.created_at })

export const SqliteCategoryRepositoryLive = Layer.effect(
  CategoryRepository,
  Effect.gen(function* () {
    const db = yield* SqliteDatabase
    const SELECT = "SELECT id, name, position, created_at FROM categories"

    const findAll: CategoryRepositoryShape["findAll"] = Effect.map(
      db.all<CategoryRow>(`${SELECT} ORDER BY position ASC, LOWER(name) ASC`),
      (rows) => rows.map(toCategory),
    )
    const findById: CategoryRepositoryShape["findById"] = (id) =>
      Effect.map(db.get<CategoryRow>(`${SELECT} WHERE id = ?`, [id]), (row) =>
        Option.fromNullishOr(row).pipe(Option.map(toCategory)),
      )
    const findByName: CategoryRepositoryShape["findByName"] = (name) =>
      Effect.map(db.get<CategoryRow>(`${SELECT} WHERE name = ? COLLATE NOCASE`, [name]), (row) =>
        Option.fromNullishOr(row).pipe(Option.map(toCategory)),
      )
    const save: CategoryRepositoryShape["save"] = (c) =>
      Effect.asVoid(
        db.run(
          `INSERT INTO categories (id, name, position, created_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, position = excluded.position`,
          [c.id, c.name, c.position, c.createdAt],
        ),
      )
    const remove: CategoryRepositoryShape["remove"] = (id) =>
      Effect.asVoid(db.run("DELETE FROM categories WHERE id = ?", [id]))

    return { findAll, findById, findByName, save, remove }
  }),
)
