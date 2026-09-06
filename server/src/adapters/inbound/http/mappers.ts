import type { Category } from "../../../domain/model/Category.js"
import type { Entry } from "../../../domain/model/Entry.js"
import type { Feed } from "../../../domain/model/Feed.js"
import { EntryId } from "../../../domain/model/Ids.js"
import type { CategoryDto, EntryDto, EntrySummaryDto, FeedDto } from "./Api.js"

export const feedToDto = (feed: Feed, unread: number): FeedDto => ({
  id: feed.id,
  url: feed.url,
  siteUrl: feed.siteUrl,
  title: feed.title,
  description: feed.description,
  iconUrl: feed.iconUrl,
  categoryId: feed.categoryId,
  position: feed.position,
  lastFetchedAt: feed.lastFetchedAt,
  lastError: feed.lastError,
  unread,
  createdAt: feed.createdAt,
})

export const categoryToDto = (c: Category): CategoryDto => ({ id: c.id, name: c.name, position: c.position })

export const entryToSummaryDto = (e: Entry): EntrySummaryDto => ({
  id: e.id,
  feedId: e.feedId,
  url: e.url,
  title: e.title,
  author: e.author,
  summary: e.summary,
  publishedAt: e.publishedAt,
  isRead: e.isRead,
  isSaved: e.isSaved,
})

export const entryToDto = (e: Entry): EntryDto => ({ ...entryToSummaryDto(e), content: e.content })

/** Cursors are `<publishedAt>.<id>`; both parts are needed for a stable order. */
export const encodeCursor = (c: { readonly publishedAt: number; readonly id: string }): string => `${c.publishedAt}.${c.id}`

export const decodeCursor = (raw: string): { readonly publishedAt: number; readonly id: EntryId } | null => {
  const dot = raw.indexOf(".")
  if (dot <= 0) return null
  const publishedAt = Number(raw.slice(0, dot))
  const id = raw.slice(dot + 1)
  return Number.isFinite(publishedAt) && id.length > 0 ? { publishedAt, id: EntryId.make(id) } : null
}
