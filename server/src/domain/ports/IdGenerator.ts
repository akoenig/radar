import { Context, Effect } from "effect"

export interface IdGeneratorShape {
  readonly next: Effect.Effect<string>
}

export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()("@radar/IdGenerator") {}
