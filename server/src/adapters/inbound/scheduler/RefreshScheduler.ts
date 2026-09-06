import { Cause, Duration, Effect, Layer, Schedule } from "effect"
import { RefreshService } from "../../../application/RefreshService.js"

export interface RefreshSchedulerOptions {
  readonly interval: Duration.Duration
  /** Delay before the first run so startup is not slowed by network I/O. */
  readonly initialDelay: Duration.Duration
}

/**
 * Time-driven adapter: periodically asks the application to refresh every
 * subscription. Failures are logged and never stop the loop.
 */
export const RefreshSchedulerLive = (options: RefreshSchedulerOptions) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const refresh = yield* RefreshService
      const tick = refresh.refreshAll.pipe(
        Effect.asVoid,
        Effect.catchCause((cause) => Effect.logError("scheduled refresh crashed", Cause.pretty(cause))),
      )
      yield* Effect.forkScoped(
        tick.pipe(Effect.delay(options.initialDelay), Effect.repeat(Schedule.spaced(options.interval))),
      )
      yield* Effect.annotateLogs(Effect.logInfo("refresh scheduler started"), {
        intervalMinutes: Duration.toMinutes(options.interval),
      })
    }),
  )
