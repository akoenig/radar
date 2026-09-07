import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query"
import { useMemo } from "react"
import { api } from "../lib/api"
import type { Category, Entry, EntryPage, EntrySummary, Feed, Stats, View } from "../lib/types"

export const keys = {
  feeds: ["feeds"] as const,
  categories: ["categories"] as const,
  stats: ["stats"] as const,
  catalog: ["catalog"] as const,
  // Deliberately not nested under `catalog`: invalidating the catalog after a
  // subscribe must not re-fetch every open preview from its publisher.
  catalogPreview: (id: string) => ["catalog-preview", id] as const,
  entries: (view: View, unreadOnly: boolean, search: string) => ["entries", view, unreadOnly, search] as const,
  entry: (id: string) => ["entry", id] as const,
}

const PAGE_SIZE = 60

export const useFeeds = () =>
  useQuery({ queryKey: keys.feeds, queryFn: api.feeds.list, staleTime: 30_000, refetchInterval: 60_000 })

export const useCategories = () =>
  useQuery({ queryKey: keys.categories, queryFn: api.categories.list, staleTime: 60_000 })

export const useStats = () =>
  useQuery({ queryKey: keys.stats, queryFn: api.system.stats, staleTime: 30_000, refetchInterval: 60_000 })

export const useCatalog = (enabled: boolean) =>
  useQuery({ queryKey: keys.catalog, queryFn: api.system.catalog, enabled, staleTime: 5 * 60_000 })

/** Fetched only once a card is opened, and kept for the session. */
export const useCatalogPreview = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.catalogPreview(id),
    queryFn: () => api.system.catalogPreview(id),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  })

export const useEntries = (view: View, unreadOnly: boolean, search: string) => {
  const query = useInfiniteQuery({
    // Discover has no entries; skip the request entirely.
    enabled: view.kind !== "discover",
    queryKey: keys.entries(view, unreadOnly, search),
    queryFn: ({ pageParam }) => api.entries.list({ view, unreadOnly, search, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    // While a list is on screen it stays put: items you mark read keep their place
    // instead of vanishing mid-read.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    // ...but that stability must not outlive the visit. Switching filter, feed or
    // search swaps the query key, and a kept cache would be replayed on return —
    // an "Unread" list captured before anything was read still lists read items,
    // which is indistinguishable from the filter being broken. Dropping the cache
    // the moment it goes inactive makes coming back re-ask the server.
    gcTime: 0,
  })
  const entries = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data])
  return { ...query, entries }
}

export const useEntry = (id: string | null) =>
  useQuery({
    queryKey: keys.entry(id ?? ""),
    queryFn: () => api.entries.get(id!),
    enabled: id !== null,
    staleTime: 5 * 60_000,
  })

export const prefetchEntry = (client: QueryClient, id: string) =>
  client.prefetchQuery({ queryKey: keys.entry(id), queryFn: () => api.entries.get(id), staleTime: 5 * 60_000 })

// ---------------------------------------------------------------------------
// Cache surgery helpers
// ---------------------------------------------------------------------------

type EntriesData = InfiniteData<EntryPage, string | undefined>

const patchEntries = (client: QueryClient, ids: ReadonlySet<string>, patch: Partial<EntrySummary>) => {
  client.setQueriesData<EntriesData>({ queryKey: ["entries"] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (ids.has(item.id) ? { ...item, ...patch } : item)),
          })),
        }
      : data,
  )
  for (const id of ids) {
    client.setQueryData<Entry>(keys.entry(id), (entry) => (entry ? { ...entry, ...patch } : entry))
  }
}

const patchAllEntries = (client: QueryClient, predicate: (e: EntrySummary) => boolean, patch: Partial<EntrySummary>) => {
  client.setQueriesData<EntriesData>({ queryKey: ["entries"] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (predicate(item) ? { ...item, ...patch } : item)),
          })),
        }
      : data,
  )
}

const adjustUnread = (client: QueryClient, deltas: ReadonlyMap<string, number>) => {
  let total = 0
  client.setQueryData<ReadonlyArray<Feed>>(keys.feeds, (feeds) =>
    feeds?.map((feed) => {
      const delta = deltas.get(feed.id) ?? 0
      total += delta
      return delta === 0 ? feed : { ...feed, unread: Math.max(0, feed.unread + delta) }
    }),
  )
  client.setQueryData<Stats>(keys.stats, (stats) => (stats ? { ...stats, unread: Math.max(0, stats.unread + total) } : stats))
}

const invalidateCounts = (client: QueryClient) =>
  Promise.all([client.invalidateQueries({ queryKey: keys.feeds }), client.invalidateQueries({ queryKey: keys.stats })])

const invalidateAll = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: keys.feeds }),
    client.invalidateQueries({ queryKey: keys.categories }),
    client.invalidateQueries({ queryKey: keys.stats }),
    client.invalidateQueries({ queryKey: ["entries"] }),
    client.invalidateQueries({ queryKey: keys.catalog }),
  ])

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface MarkReadInput {
  readonly entries: ReadonlyArray<Pick<EntrySummary, "id" | "feedId" | "isRead">>
  readonly read: boolean
}

export const useMarkRead = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ entries, read }: MarkReadInput) =>
      api.entries.markRead(
        entries.map((e) => e.id),
        read,
      ),
    onMutate: ({ entries, read }) => {
      const changed = entries.filter((e) => e.isRead !== read)
      const deltas = new Map<string, number>()
      for (const e of changed) deltas.set(e.feedId, (deltas.get(e.feedId) ?? 0) + (read ? -1 : 1))
      patchEntries(client, new Set(changed.map((e) => e.id)), { isRead: read })
      adjustUnread(client, deltas)
    },
    onError: () => invalidateAll(client),
  })
}

export const useSetSaved = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, saved }: { id: string; saved: boolean }) => api.entries.setSaved(id, saved),
    onMutate: ({ id, saved }) => {
      patchEntries(client, new Set([id]), { isSaved: saved })
      client.setQueryData<Stats>(keys.stats, (s) => (s ? { ...s, saved: Math.max(0, s.saved + (saved ? 1 : -1)) } : s))
    },
    onError: () => invalidateAll(client),
    onSettled: () => client.invalidateQueries({ queryKey: keys.stats }),
  })
}

export const useMarkAllRead = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { view: View; feeds: ReadonlyArray<Feed>; publishedBefore: number }) =>
      api.entries.markAllRead({
        feedId: input.view.kind === "feed" ? input.view.id : undefined,
        categoryId: input.view.kind === "category" ? input.view.id : undefined,
        savedOnly: input.view.kind === "saved" ? true : undefined,
        publishedBefore: input.publishedBefore,
      }),
    onSuccess: (_result, { view, feeds, publishedBefore }) => {
      const inScope = (feedId: string) => {
        if (view.kind === "feed") return view.id === feedId
        if (view.kind === "category") return feeds.find((f) => f.id === feedId)?.categoryId === view.id
        return true
      }
      patchAllEntries(
        client,
        (e) => inScope(e.feedId) && e.publishedAt <= publishedBefore && (view.kind !== "saved" || e.isSaved),
        { isRead: true },
      )
      return invalidateCounts(client)
    },
    onError: () => invalidateAll(client),
  })
}

export const useRefreshAll = () => {
  const client = useQueryClient()
  return useMutation({ mutationFn: api.system.refreshAll, onSettled: () => invalidateAll(client) })
}

export const useRefreshFeed = () => {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.feeds.refresh(id), onSettled: () => invalidateAll(client) })
}

export const useSubscribe = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { url: string; title?: string; categoryId?: string | null }) => api.feeds.subscribe(input),
    onSuccess: () => invalidateAll(client),
  })
}

export const useUpdateFeed = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; title?: string; url?: string; categoryId?: string | null }) =>
      api.feeds.update(id, patch),
    onSuccess: (feed) => {
      client.setQueryData<ReadonlyArray<Feed>>(keys.feeds, (feeds) => feeds?.map((f) => (f.id === feed.id ? feed : f)))
      return client.invalidateQueries({ queryKey: keys.feeds })
    },
  })
}

export const useUnsubscribe = () => {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.feeds.remove(id), onSuccess: () => invalidateAll(client) })
}

export const useCreateCategory = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.categories.create(name),
    onSuccess: (category) => {
      client.setQueryData<ReadonlyArray<Category>>(keys.categories, (cats) => [...(cats ?? []), category])
      return client.invalidateQueries({ queryKey: keys.categories })
    },
  })
}

export const useUpdateCategory = () => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.categories.update(id, { name }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.categories }),
  })
}

export const useRemoveCategory = () => {
  const client = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.categories.remove(id), onSuccess: () => invalidateAll(client) })
}

export const useImportOpml = () => {
  const client = useQueryClient()
  return useMutation({ mutationFn: (xml: string) => api.system.importOpml(xml), onSuccess: () => invalidateAll(client) })
}
