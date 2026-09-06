import { Schema } from "effect"
import { CategoryId, Timestamp } from "./Ids.js"

export class Category extends Schema.Class<Category>("Category")({
  id: CategoryId,
  name: Schema.String,
  position: Schema.Number,
  createdAt: Timestamp,
}) {
  rename(name: string): Category {
    return new Category({ ...this, name })
  }
  moveTo(position: number): Category {
    return new Category({ ...this, position })
  }
}
