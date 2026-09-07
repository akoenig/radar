import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react"
import { AddFeedDialog, CategoriesDialog, EditFeedDialog, OpmlDialog, ShortcutsDialog } from "./components/dialogs"
import { DiscoverView } from "./components/DiscoverView"
import { EntryList } from "./components/EntryList"
import { ReadingPane } from "./components/ReadingPane"
import { Sidebar } from "./components/Sidebar"
import { useToast } from "./components/Toast"
import { useKeyboard, type Binding } from "./hooks/useKeyboard"
import { useOnline } from "./hooks/useOnline"
import type { Feed, View } from "./lib/types"
import {
  prefetchEntry,
  useCategories,
  useEntries,
  useEntry,
  useFeeds,
  useMarkAllRead,
  useMarkRead,
  useRefreshAll,
  useSetSaved,
} from "./state/queries"
import { useStore } from "./state/store"

const viewTitle = (view: View, feeds: ReadonlyArray<Feed>, categories: ReadonlyArray<{ id: string; name: string }>): string => {
  switch (view.kind) {
    case "all":
      return "All items"
    case "saved":
      return "Read later"
    case "discover":
      return "Discover"
    case "feed":
      return feeds.find((f) => f.id === view.id)?.title ?? "Subscription"
    case "category":
      return categories.find((c) => c.id === view.id)?.name ?? "Folder"
  }
}

export const App = () => {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const online = useOnline()
  const client = useQueryClient()
  const feeds = useFeeds()
  const categories = useCategories()
  const list = useEntries(state.view, state.unreadOnly, state.search)
  const entry = useEntry(state.selectedId)
  const markRead = useMarkRead()
  const setSaved = useSetSaved()
  const markAllRead = useMarkAllRead()
  const refreshAll = useRefreshAll()
  const searchRef = useRef<HTMLInputElement>(null)
  const readingScroll = useRef<HTMLDivElement>(null)
  const listScroll = useRef<HTMLUListElement>(null)
  const stream = state.layout === "stream"
  const discovering = state.view.kind === "discover"
  /** Whichever element scrolls the article body in the current layout. */
  const articleScroll = (): HTMLElement | null => (stream ? listScroll.current : readingScroll.current)

  const feedList = feeds.data ?? []
  const feedsById = useMemo(() => new Map(feedList.map((f) => [f.id, f])), [feedList])
  const entries = list.entries
  const selectedIndex = state.selectedId ? entries.findIndex((e) => e.id === state.selectedId) : -1
  const selected = selectedIndex >= 0 ? entries[selectedIndex] ?? null : null

  // Fall back to "all" if the current feed or folder disappears.
  useEffect(() => {
    if (!feeds.isSuccess || !categories.isSuccess) return
    const view = state.view
    if (view.kind === "feed" && !feedsById.has(view.id)) dispatch({ type: "setView", view: { kind: "all" } })
    if (view.kind === "category" && !categories.data.some((c) => c.id === view.id)) dispatch({ type: "setView", view: { kind: "all" } })
  }, [feeds.isSuccess, categories.isSuccess, categories.data, feedsById, state.view, dispatch])

  const select = useCallback(
    (id: string | null) => {
      dispatch({ type: "select", id })
      if (id === null) return
      const target = entries.find((e) => e.id === id)
      if (target && !target.isRead) markRead.mutate({ entries: [target], read: true })
      // Warm the cache for the neighbours so j/k feel instant.
      const index = entries.findIndex((e) => e.id === id)
      for (const neighbour of [entries[index + 1], entries[index - 1]]) if (neighbour) void prefetchEntry(client, neighbour.id)
      if (!stream) readingScroll.current?.scrollTo({ top: 0 })
    },
    [dispatch, entries, markRead, client, stream],
  )

  const move = useCallback(
    (delta: number) => {
      if (entries.length === 0) return
      const next = selectedIndex < 0 ? (delta > 0 ? 0 : entries.length - 1) : Math.min(entries.length - 1, Math.max(0, selectedIndex + delta))
      const target = entries[next]
      if (target && target.id !== state.selectedId) select(target.id)
      if (delta > 0 && next >= entries.length - 5 && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage()
    },
    [entries, selectedIndex, state.selectedId, select, list],
  )

  const toggleRead = useCallback(() => {
    if (selected) markRead.mutate({ entries: [selected], read: !selected.isRead })
  }, [selected, markRead])

  const toggleSaved = useCallback(() => {
    if (!selected) return
    setSaved.mutate({ id: selected.id, saved: !selected.isSaved })
    toast(selected.isSaved ? "Removed from Read later" : "Saved for later")
  }, [selected, setSaved, toast])

  const openOriginal = useCallback(() => {
    const url = entry.data?.url ?? selected?.url
    if (url) window.open(url, "_blank", "noopener,noreferrer")
  }, [entry.data, selected])

  const doMarkAllRead = useCallback(() => {
    const unread = entries.filter((e) => !e.isRead).length
    if (unread === 0 && entries.length === 0) return
    const newest = entries[0]?.publishedAt ?? Date.now()
    markAllRead.mutate(
      { view: state.view, feeds: feedList, publishedBefore: Math.max(newest, Date.now()) },
      { onSuccess: ({ count }) => toast(count > 0 ? `Marked ${count} item${count === 1 ? "" : "s"} as read` : "Nothing to mark") },
    )
  }, [entries, markAllRead, state.view, feedList, toast])

  const doRefresh = useCallback(() => {
    if (refreshAll.isPending) return
    refreshAll.mutate(undefined, {
      onSuccess: (results) => {
        const added = results.reduce((n, r) => n + r.added, 0)
        const failed = results.filter((r) => r.error).length
        toast(
          added > 0 ? `${added} new item${added === 1 ? "" : "s"}${failed ? `, ${failed} feed${failed === 1 ? "" : "s"} failed` : ""}` : failed ? `${failed} feed${failed === 1 ? "" : "s"} failed to refresh` : "You're up to date",
          { tone: failed ? "error" : "neutral" },
        )
      },
      onError: (e) => toast(e.message, { tone: "error" }),
    })
  }, [refreshAll, toast])

  const moveFeed = useCallback(
    (delta: number) => {
      if (feedList.length === 0) return
      const ordered = [...feedList].sort((a, b) => {
        const ca = categories.data?.findIndex((c) => c.id === a.categoryId) ?? -1
        const cb = categories.data?.findIndex((c) => c.id === b.categoryId) ?? -1
        return (ca === -1 ? 1e9 : ca) - (cb === -1 ? 1e9 : cb) || a.position - b.position
      })
      const view = state.view
      const current = view.kind === "feed" ? ordered.findIndex((f) => f.id === view.id) : -1
      const next = current < 0 ? (delta > 0 ? 0 : ordered.length - 1) : (current + delta + ordered.length) % ordered.length
      const target = ordered[next]
      if (target) dispatch({ type: "setView", view: { kind: "feed", id: target.id } })
    },
    [feedList, categories.data, state.view, dispatch],
  )

  const scrollArticle = useCallback(
    (direction: 1 | -1) => {
      const el = articleScroll()
      if (!el || !selected) {
        move(direction)
        return
      }
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
      if (direction > 0 && atEnd) move(1)
      else el.scrollBy({ top: direction * (el.clientHeight - 80), behavior: "smooth" })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [move, selected, stream],
  )

  const currentFeedId = state.view.kind === "feed" ? state.view.id : (selected?.feedId ?? null)

  const bindings = useMemo<ReadonlyArray<Binding>>(
    () => [
      { keys: ["j", "arrowdown"], run: () => move(1) },
      { keys: ["k", "arrowup"], run: () => move(-1) },
      { keys: ["space"], run: () => scrollArticle(1) },
      { keys: ["shift+space"], run: () => scrollArticle(-1) },
      { keys: ["o", "enter"], run: () => articleScroll()?.focus() },
      { keys: ["m"], run: toggleRead },
      { keys: ["s"], run: toggleSaved },
      { keys: ["v"], run: openOriginal },
      { keys: ["shift+a"], run: doMarkAllRead },
      { keys: ["r"], run: doRefresh },
      { keys: ["u"], run: () => dispatch({ type: "setUnreadOnly", unreadOnly: !state.unreadOnly }) },
      { keys: ["a"], run: () => dispatch({ type: "openDialog", dialog: { type: "add" } }) },
      {
        keys: ["e"],
        run: () =>
          currentFeedId
            ? dispatch({ type: "openDialog", dialog: { type: "editFeed", feedId: currentFeedId } })
            : toast("Select an item or open a subscription to edit it"),
      },
      { keys: ["shift+j", "]"], run: () => moveFeed(1) },
      { keys: ["shift+k", "["], run: () => moveFeed(-1) },
      { keys: ["g a"], run: () => dispatch({ type: "setView", view: { kind: "all" } }) },
      { keys: ["g s"], run: () => dispatch({ type: "setView", view: { kind: "saved" } }) },
      { keys: ["g d"], run: () => dispatch({ type: "setView", view: { kind: "discover" } }) },
      { keys: ["c"], run: () => dispatch({ type: "setDensity", density: state.density === "compact" ? "cozy" : "compact" }) },
      { keys: ["1"], run: () => dispatch({ type: "setLayout", layout: "stream" }) },
      { keys: ["2"], run: () => dispatch({ type: "setLayout", layout: "split" }) },
      { keys: ["shift+/", "?"], run: () => dispatch({ type: "openDialog", dialog: { type: "shortcuts" } }) },
      {
        keys: ["/"],
        run: () => {
          dispatch({ type: "setSearchOpen", open: true })
          // The input is always mounted, so focus synchronously: no keystroke can slip past.
          searchRef.current?.focus()
        },
      },
      {
        keys: ["escape"],
        inInputs: true,
        run: () => {
          if (state.sidebarOpen) dispatch({ type: "setSidebarOpen", open: false })
          else if (state.search || state.searchOpen) dispatch({ type: "setSearchOpen", open: false })
          else if (state.mobilePane === "article") dispatch({ type: "setMobilePane", pane: "list" })
        },
      },
    ],
    [move, scrollArticle, toggleRead, toggleSaved, openOriginal, doMarkAllRead, doRefresh, dispatch, state.unreadOnly, state.sidebarOpen, state.search, state.searchOpen, state.mobilePane, currentFeedId, moveFeed, toast, stream, state.density],
  )
  useKeyboard(bindings, state.dialog === null)

  const title = viewTitle(state.view, feedList, categories.data ?? [])
  useEffect(() => {
    const unread = feedList.reduce((n, f) => n + f.unread, 0)
    document.title = `${unread > 0 ? `(${unread}) ` : ""}${title} · Radar`
  }, [title, feedList])

  const loadMore = useCallback(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage()
  }, [list])

  return (
    <div
      className={`app layout-${discovering ? "stream" : state.layout} pane-${stream || discovering ? "list" : state.mobilePane}${state.sidebarOpen ? " sidebar-open" : ""}`}
      // Only the desktop grid reads this; the overlay sidebar keeps its default width.
      style={{ "--sidebar-user-w": `${state.sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar />
      {state.sidebarOpen && <div className="sidebar-scrim only-narrow" onClick={() => dispatch({ type: "setSidebarOpen", open: false })} />}
      {discovering ? (
        <DiscoverView onOpenSidebar={() => dispatch({ type: "setSidebarOpen", open: true })} />
      ) : (
      <EntryList
        view={state.view}
        title={title}
        entries={entries}
        feedsById={feedsById}
        selectedId={state.selectedId}
        unreadOnly={state.unreadOnly}
        search={state.search}
        searchOpen={state.searchOpen}
        searchRef={searchRef}
        listRef={listScroll}
        layout={state.layout}
        density={state.density}
        entry={entry.data}
        entryLoading={entry.isLoading}
        entryError={entry.error}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        hasMore={Boolean(list.hasNextPage)}
        refreshing={refreshAll.isPending}
        hasFeeds={feedList.length > 0}
        onSelect={select}
        onToggleUnreadOnly={() => dispatch({ type: "setUnreadOnly", unreadOnly: !state.unreadOnly })}
        onSearchChange={(value) => dispatch({ type: "setSearch", search: value })}
        onSearchClose={() => dispatch({ type: "setSearchOpen", open: false })}
        onLoadMore={loadMore}
        onMarkAllRead={doMarkAllRead}
        onRefresh={doRefresh}
        onOpenSidebar={() => dispatch({ type: "setSidebarOpen", open: true })}
        onAddFeed={() => dispatch({ type: "openDialog", dialog: { type: "add" } })}
        onImport={() => dispatch({ type: "openDialog", dialog: { type: "opml" } })}
        onSetLayout={(layout) => dispatch({ type: "setLayout", layout })}
        onToggleDensity={() => dispatch({ type: "setDensity", density: state.density === "compact" ? "cozy" : "compact" })}
        onToggleSaved={toggleSaved}
        onToggleRead={toggleRead}
        onSelectFeed={(feedId) => dispatch({ type: "setView", view: { kind: "feed", id: feedId } })}
      />
      )}
      {!stream && !discovering && (
        <ReadingPane
          summary={selected}
          entry={entry.data}
          feed={selected ? feedsById.get(selected.feedId) : undefined}
          isLoading={entry.isLoading}
          error={entry.error}
          scrollRef={readingScroll}
          onToggleSaved={toggleSaved}
          onToggleRead={toggleRead}
          onBack={() => dispatch({ type: "setMobilePane", pane: "list" })}
          onSelectFeed={(feedId) => dispatch({ type: "setView", view: { kind: "feed", id: feedId } })}
        />
      )}

      {!online && (
        <div className="offline-bar" role="status">
          Offline — showing what was already downloaded.
        </div>
      )}

      {state.dialog?.type === "add" && <AddFeedDialog initialUrl={state.dialog.url ?? ""} />}
      {state.dialog?.type === "editFeed" && <EditFeedDialog feedId={state.dialog.feedId} />}
      {state.dialog?.type === "categories" && <CategoriesDialog />}
      {state.dialog?.type === "opml" && <OpmlDialog />}
      {state.dialog?.type === "shortcuts" && <ShortcutsDialog />}
    </div>
  )
}
