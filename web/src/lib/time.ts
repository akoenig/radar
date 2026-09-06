const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Compact relative time for list rows: "now", "12m", "3h", "Yesterday", "Sep 2", "Sep 2, 2025". */
export const formatRelative = (ms: number, now = Date.now()): string => {
  const diff = now - ms
  if (diff < MINUTE) return "now"
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`
  const then = new Date(ms)
  const today = new Date(now)
  if (diff < DAY && sameDay(then, today)) return `${Math.floor(diff / HOUR)}h`
  const yesterday = new Date(now - DAY)
  if (sameDay(then, yesterday)) return "Yesterday"
  const options: Intl.DateTimeFormatOptions =
    then.getFullYear() === today.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }
  return then.toLocaleDateString(undefined, options)
}

/** Full date for article headers. */
export const formatFull = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })

export const formatShortDateTime = (ms: number): string =>
  new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
