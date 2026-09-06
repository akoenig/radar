import { Effect, Layer, Option } from "effect"
import { Entry, type EntryQuery, type EntryScope } from "../../../domain/model/Entry.js"
import { EntryId, FeedId } from "../../../domain/model/Ids.js"
import { EntryRepository, type EntryRepositoryShape } from "../../../domain/ports/EntryRepository.js"
import { SqliteDatabase, type SqlValue } from "./SqliteDatabase.js"

interface EntryRow {
  id: string
  feed_id: string
  guid: string
  url: string | null
  title: string
  author: string | null
  summary: string
  content: string | null
  published_at: number
  fetched_at: number
  is_read: number
  is_saved: number
  read_at: number | null
  saved_at: number | null
  [key: string]: SqlValue
}

const toEntry = (row: EntryRow): Entry =>
  new Entry({
    id: EntryId.make(row.id),
    feedId: FeedId.make(row.feed_id),
    guid: row.guid,
    url: row.url,
    title: row.title,
    author: row.author,
    summary: row.summary,
    content: row.content,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    isRead: row.is_read === 1,
    isSaved: row.is_saved === 1,
    readAt: row.read_at,
    savedAt: row.saved_at,
  })

const COLUMNS =
  "e.id, e.feed_id, e.guid, e.url, e.title, e.author, e.summary, e.content, e.published_at, e.fetched_at, e.is_read, e.is_saved, e.read_at, e.saved_at"

const bool = (b: boolean): number => (b ? 1 : 0)

/** SQLite limits the number of bound parameters; keep batches comfortably below it. */
const BATCH = 200

const chunk = <A>(items: ReadonlyArray<A>, size: number): Array<ReadonlyArray<A>> => {
  const out: Array<ReadonlyArray<A>> = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const placeholders = (n: number): string => Array.from({ length: n }, () => "?").join(", ")

export const SqliteEntryRepositoryLive = Layer.effect(
  EntryRepository,
  Effect.gen(function* () {
    const db = yield* SqliteDatabase

    const findById: EntryRepositoryShape["findById"] = (id) =>
      Effect.map(db.get<EntryRow>(`SELECT ${COLUMNS} FROM entries e WHERE e.id = ?`, [id]), (row) =>
        Option.fromNullishOr(row).pipe(Option.map(toEntry)),
      )

    const findByIds: EntryRepositoryShape["findByIds"] = (ids) =>
      ids.length === 0
        ? Effect.succeed([])
        : Effect.map(
            db.all<EntryRow>(`SELECT ${COLUMNS} FROM entries e WHERE e.id IN (${placeholders(ids.length)})`, ids),
            (rows) => rows.map(toEntry),
          )

    const query: EntryRepositoryShape["query"] = (q: EntryQuery) => {
      const where: Array<string> = []
      const params: Array<SqlValue> = []
      if (q.feedId !== undefined) {
        where.push("e.feed_id = ?")
        params.push(q.feedId)
      }
      if (q.categoryId !== undefined) {
        where.push("f.category_id = ?")
        params.push(q.categoryId)
      }
      if (q.unreadOnly) where.push("e.is_read = 0")
      if (q.savedOnly) where.push("e.is_saved = 1")
      const search = q.search?.trim()
      if (search) {
        const like = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
        where.push("(e.title LIKE ? ESCAPE '\\' OR e.summary LIKE ? ESCAPE '\\' OR e.author LIKE ? ESCAPE '\\' OR f.title LIKE ? ESCAPE '\\')")
        params.push(like, like, like, like)
      }
      if (q.before !== undefined) {
        where.push("(e.published_at < ? OR (e.published_at = ? AND e.id < ?))")
        params.push(q.before.publishedAt, q.before.publishedAt, q.before.id)
      }
      params.push(q.limit)
      const sql = `SELECT ${COLUMNS} FROM entries e JOIN feeds f ON f.id = e.feed_id
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY e.published_at DESC, e.id DESC LIMIT ?`
      return Effect.map(db.all<EntryRow>(sql, params), (rows) => rows.map(toEntry))
    }

    const ingest: EntryRepositoryShape["ingest"] = (entries) =>
      Effect.gen(function* () {
        if (entries.length === 0) return 0
        const feedId = entries[0]!.feedId
        const known = new Set<string>()
        for (const batch of chunk(entries.map((e) => e.guid), BATCH)) {
          const rows = yield* db.all<{ guid: string; [k: string]: SqlValue }>(
            `SELECT guid FROM entries WHERE feed_id = ? AND guid IN (${placeholders(batch.length)})`,
            [feedId, ...batch],
          )
          for (const row of rows) known.add(row.guid)
        }
        let inserted = 0
        for (const entry of entries) {
          if (known.has(entry.guid)) {
            // Publishers frequently edit items after publishing; keep content fresh.
            yield* db.run(
              "UPDATE entries SET title = ?, url = ?, author = ?, summary = ?, content = ? WHERE feed_id = ? AND guid = ?",
              [entry.title, entry.url, entry.author, entry.summary, entry.content, entry.feedId, entry.guid],
            )
          } else {
            const { changes } = yield* db.run(
              `INSERT OR IGNORE INTO entries (id, feed_id, guid, url, title, author, summary, content, published_at, fetched_at, is_read, is_saved, read_at, saved_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                entry.id, entry.feedId, entry.guid, entry.url, entry.title, entry.author, entry.summary, entry.content,
                entry.publishedAt, entry.fetchedAt, bool(entry.isRead), bool(entry.isSaved), entry.readAt, entry.savedAt,
              ],
            )
            inserted += changes
            known.add(entry.guid)
          }
        }
        return inserted
      })

    const setRead: EntryRepositoryShape["setRead"] = (ids, read, at) =>
      Effect.forEach(
        chunk(ids, BATCH),
        (batch) =>
          db.run(
            `UPDATE entries SET is_read = ?, read_at = ? WHERE id IN (${placeholders(batch.length)})`,
            [bool(read), read ? at : null, ...batch],
          ),
        { discard: true },
      )

    const markAllRead: EntryRepositoryShape["markAllRead"] = (scope: EntryScope, at) => {
      const where: Array<string> = ["is_read = 0"]
      const params: Array<SqlValue> = [at]
      if (scope.feedId !== undefined) {
        where.push("feed_id = ?")
        params.push(scope.feedId)
      }
      if (scope.categoryId !== undefined) {
        where.push("feed_id IN (SELECT id FROM feeds WHERE category_id = ?)")
        params.push(scope.categoryId)
      }
      if (scope.savedOnly) where.push("is_saved = 1")
      if (scope.publishedBefore !== undefined) {
        where.push("published_at <= ?")
        params.push(scope.publishedBefore)
      }
      return Effect.map(
        db.run(`UPDATE entries SET is_read = 1, read_at = ? WHERE ${where.join(" AND ")}`, params),
        (r) => r.changes,
      )
    }

    const save: EntryRepositoryShape["save"] = (e) =>
      Effect.asVoid(
        db.run(
          `UPDATE entries SET url = ?, title = ?, author = ?, summary = ?, content = ?, published_at = ?,
             is_read = ?, is_saved = ?, read_at = ?, saved_at = ? WHERE id = ?`,
          [e.url, e.title, e.author, e.summary, e.content, e.publishedAt, bool(e.isRead), bool(e.isSaved), e.readAt, e.savedAt, e.id],
        ),
      )

    const unreadCountByFeed: EntryRepositoryShape["unreadCountByFeed"] = Effect.map(
      db.all<{ feed_id: string; n: number; [k: string]: SqlValue }>(
        "SELECT feed_id, COUNT(*) AS n FROM entries WHERE is_read = 0 GROUP BY feed_id",
      ),
      (rows) => new Map(rows.map((r) => [FeedId.make(r.feed_id), r.n] as const)),
    )

    const stats: EntryRepositoryShape["stats"] = Effect.map(
      db.get<{ unread: number; saved: number; [k: string]: SqlValue }>(
        "SELECT SUM(is_read = 0) AS unread, SUM(is_saved = 1) AS saved FROM entries",
      ),
      (row) => ({ unread: Number(row?.unread ?? 0), saved: Number(row?.saved ?? 0) }),
    )

    const prune: EntryRepositoryShape["prune"] = (feedId, keep) =>
      Effect.map(
        db.run(
          `DELETE FROM entries WHERE feed_id = ? AND is_saved = 0 AND is_read = 1 AND id NOT IN (
             SELECT id FROM entries WHERE feed_id = ? ORDER BY published_at DESC, id DESC LIMIT ?)`,
          [feedId, feedId, keep],
        ),
        (r) => r.changes,
      )

    return { findById, findByIds, query, ingest, setRead, markAllRead, save, unreadCountByFeed, stats, prune }
  }),
)
