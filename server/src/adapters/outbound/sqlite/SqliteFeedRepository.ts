import { Effect, Layer, Option } from "effect"
import { Feed } from "../../../domain/model/Feed.js"
import { CategoryId, FeedId } from "../../../domain/model/Ids.js"
import { FeedRepository, type FeedRepositoryShape } from "../../../domain/ports/FeedRepository.js"
import { SqliteDatabase, type SqlValue } from "./SqliteDatabase.js"

interface FeedRow {
  id: string
  url: string
  site_url: string | null
  title: string
  description: string | null
  icon_url: string | null
  category_id: string | null
  position: number
  last_fetched_at: number | null
  last_error: string | null
  etag: string | null
  last_modified: string | null
  created_at: number
  updated_at: number
  [key: string]: SqlValue
}

const toFeed = (row: FeedRow): Feed =>
  new Feed({
    id: FeedId.make(row.id),
    url: row.url,
    siteUrl: row.site_url,
    title: row.title,
    description: row.description,
    iconUrl: row.icon_url,
    categoryId: row.category_id === null ? null : CategoryId.make(row.category_id),
    position: row.position,
    lastFetchedAt: row.last_fetched_at,
    lastError: row.last_error,
    etag: row.etag,
    lastModified: row.last_modified,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })

const COLUMNS =
  "id, url, site_url, title, description, icon_url, category_id, position, last_fetched_at, last_error, etag, last_modified, created_at, updated_at"

const UPSERT = `INSERT INTO feeds (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    url = excluded.url, site_url = excluded.site_url, title = excluded.title,
    description = excluded.description, icon_url = excluded.icon_url, category_id = excluded.category_id,
    position = excluded.position, last_fetched_at = excluded.last_fetched_at, last_error = excluded.last_error,
    etag = excluded.etag, last_modified = excluded.last_modified, updated_at = excluded.updated_at`

const params = (f: Feed): ReadonlyArray<SqlValue> => [
  f.id, f.url, f.siteUrl, f.title, f.description, f.iconUrl, f.categoryId, f.position,
  f.lastFetchedAt, f.lastError, f.etag, f.lastModified, f.createdAt, f.updatedAt,
]

export const SqliteFeedRepositoryLive = Layer.effect(
  FeedRepository,
  Effect.gen(function* () {
    const db = yield* SqliteDatabase
    const ORDER = "ORDER BY position ASC, LOWER(title) ASC"

    const findAll: FeedRepositoryShape["findAll"] = Effect.map(
      db.all<FeedRow>(`SELECT ${COLUMNS} FROM feeds ${ORDER}`),
      (rows) => rows.map(toFeed),
    )
    const findById: FeedRepositoryShape["findById"] = (id) =>
      Effect.map(db.get<FeedRow>(`SELECT ${COLUMNS} FROM feeds WHERE id = ?`, [id]), (row) =>
        Option.fromNullishOr(row).pipe(Option.map(toFeed)),
      )
    const findByUrl: FeedRepositoryShape["findByUrl"] = (url) =>
      Effect.map(db.get<FeedRow>(`SELECT ${COLUMNS} FROM feeds WHERE url = ?`, [url]), (row) =>
        Option.fromNullishOr(row).pipe(Option.map(toFeed)),
      )
    const findByCategory: FeedRepositoryShape["findByCategory"] = (categoryId) =>
      Effect.map(
        db.all<FeedRow>(`SELECT ${COLUMNS} FROM feeds WHERE category_id = ? ${ORDER}`, [categoryId]),
        (rows) => rows.map(toFeed),
      )
    const save: FeedRepositoryShape["save"] = (feed) => Effect.asVoid(db.run(UPSERT, params(feed)))
    const saveAll: FeedRepositoryShape["saveAll"] = (feeds) =>
      db.transaction(Effect.forEach(feeds, save, { discard: true }))
    const remove: FeedRepositoryShape["remove"] = (id) => Effect.asVoid(db.run("DELETE FROM feeds WHERE id = ?", [id]))

    return { findAll, findById, findByUrl, findByCategory, save, saveAll, remove }
  }),
)
