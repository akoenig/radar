import { Context, Effect } from "effect"

/**
 * Runs an effect atomically with respect to persistence. Adapters that cannot
 * offer transactions may implement this as identity.
 */
export interface UnitOfWorkShape {
  readonly transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}

export class UnitOfWork extends Context.Service<UnitOfWork, UnitOfWorkShape>()("@radar/UnitOfWork") {}
