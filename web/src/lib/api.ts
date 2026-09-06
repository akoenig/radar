import type {
  ApiErrorBody,
  Category,
  DiscoveredFeed,
  Entry,
  EntryPage,
  Feed,
  ImportSummary,
  RefreshResult,
  Stats,
  View,
} from "./types"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | null,
  ) {
    super(describe(status, body))
    this.name = "ApiError"
  }
}

const describe = (status: number, body: ApiErrorBody | null): string => {
  if (body && "message" in body && typeof body.message === "string") return body.message
  if (body?._tag === "NotFound") return "That item no longer exists."
  if (status === 0) return "Could not reach the server."
  return `Request failed (${status}).`
}

async function request<T>(method: string, path: string, options: { json?: unknown; text?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" }
  let body: string | undefined
  if (options.json !== undefined) {
    headers["content-type"] = "application/json"
    body = JSON.stringify(options.json)
  } else if (options.text !== undefined) {
    headers["content-type"] = "text/plain"
    body = options.text
  }
  let response: Response
  try {
    response = await fetch(path, { method, headers, body })
  } catch {
    throw new ApiError(0, null)
  }
  if (!response.ok) {
    let parsed: ApiErrorBody | null = null
    try {
      parsed = (await response.json()) as ApiErrorBody
    } catch {
      parsed = null
    }
    throw new ApiError(response.status, parsed)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const query = (params: Record<string, string | number | boolean | undefined>): string => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value))
  const s = search.toString()
  return s ? `?${s}` : ""
}

export interface EntryListParams {
  readonly view: View
  readonly unreadOnly: boolean
  readonly search: string
  readonly cursor?: string
  readonly limit?: number
}

export const api = {
  feeds: {
    list: () => request<ReadonlyArray<Feed>>("GET", "/api/feeds"),
    subscribe: (input: { url: string; title?: string; categoryId?: string | null }) =>
      request<Feed>("POST", "/api/feeds", { json: input }),
    update: (id: string, patch: { title?: string; url?: string; categoryId?: string | null; position?: number }) =>
      request<Feed>("PATCH", `/api/feeds/${encodeURIComponent(id)}`, { json: patch }),
    remove: (id: string) => request<void>("DELETE", `/api/feeds/${encodeURIComponent(id)}`),
    refresh: (id: string) => request<RefreshResult>("POST", `/api/feeds/${encodeURIComponent(id)}/refresh`),
  },
  categories: {
    list: () => request<ReadonlyArray<Category>>("GET", "/api/categories"),
    create: (name: string) => request<Category>("POST", "/api/categories", { json: { name } }),
    update: (id: string, patch: { name?: string; position?: number }) =>
      request<Category>("PATCH", `/api/categories/${encodeURIComponent(id)}`, { json: patch }),
    remove: (id: string) => request<void>("DELETE", `/api/categories/${encodeURIComponent(id)}`),
  },
  entries: {
    list: ({ view, unreadOnly, search, cursor, limit }: EntryListParams) =>
      request<EntryPage>(
        "GET",
        `/api/entries${query({
          feed: view.kind === "feed" ? view.id : undefined,
          category: view.kind === "category" ? view.id : undefined,
          saved: view.kind === "saved" ? true : undefined,
          unread: unreadOnly && view.kind !== "saved" ? true : undefined,
          q: search.trim() || undefined,
          cursor,
          limit,
        })}`,
      ),
    get: (id: string) => request<Entry>("GET", `/api/entries/${encodeURIComponent(id)}`),
    markRead: (ids: ReadonlyArray<string>, read: boolean) =>
      request<void>("POST", "/api/entries/mark", { json: { ids, read } }),
    markAllRead: (scope: { feedId?: string; categoryId?: string; savedOnly?: boolean; publishedBefore?: number }) =>
      request<{ count: number }>("POST", "/api/entries/mark-all", { json: scope }),
    setSaved: (id: string, saved: boolean) =>
      request<Entry>("PUT", `/api/entries/${encodeURIComponent(id)}/saved`, { json: { saved } }),
  },
  system: {
    stats: () => request<Stats>("GET", "/api/stats"),
    refreshAll: () => request<ReadonlyArray<RefreshResult>>("POST", "/api/refresh"),
    discover: (url: string) => request<ReadonlyArray<DiscoveredFeed>>("GET", `/api/discover${query({ url })}`),
    importOpml: (xml: string) => request<ImportSummary>("POST", "/api/opml", { text: xml }),
    exportOpmlUrl: "/api/opml",
  },
}
