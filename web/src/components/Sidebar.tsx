import { useCallback, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react"
import type { Category, Feed, View } from "../lib/types"
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, useStore } from "../state/store"
import { usePwa } from "../hooks/usePwa"
import { useCategories, useFeeds, useReorderCategories, useReorderFeeds, useStats } from "../state/queries"
import {
  AlertIcon,
  BookmarkIcon,
  ChevronIcon,
  CompassIcon,
  DotsIcon,
  DownloadIcon,
  FolderIcon,
  ImportIcon,
  InboxIcon,
  KeyboardIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
} from "./Icons"

const sameView = (a: View, b: View) => a.kind === b.kind && ("id" in a ? a.id : null) === ("id" in b ? b.id : null)

export const FeedIcon = ({ feed, size = 16 }: { feed: Feed; size?: number }) => {
  const [broken, setBroken] = useState(false)
  const initial = (feed.title.trim()[0] ?? "?").toUpperCase()
  if (!feed.iconUrl || broken) {
    return (
      <span className="feed-icon feed-icon-letter" style={{ width: size, height: size, fontSize: size * 0.6 }} aria-hidden>
        {initial}
      </span>
    )
  }
  return (
    <img
      className="feed-icon"
      src={feed.iconUrl}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  )
}

const Count = ({ n }: { n: number }) => (n > 0 ? <span className="count">{n > 999 ? "999+" : n}</span> : null)

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

/**
 * The sidebar uses the browser's own drag-and-drop rather than a pointer-event
 * reimplementation: it gives us the drag image, the cursor feedback and the
 * escape-to-cancel behaviour for free.
 */
type Dragged = { readonly kind: "feed" | "category"; readonly id: string }

type DropTarget =
  /** Between two feeds — `id` is the feed the pointer is over. */
  | { readonly kind: "row"; readonly id: string; readonly edge: "before" | "after" }
  /** Into a folder, appended at its end. */
  | { readonly kind: "folder"; readonly id: string }
  /** Out of every folder, at the end of the loose feeds. */
  | { readonly kind: "loose" }
  /** Between two folders. */
  | { readonly kind: "folderEdge"; readonly id: string; readonly edge: "before" | "after" }

const sameTarget = (a: DropTarget | null, b: DropTarget | null): boolean => {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  return "id" in a && "id" in b ? a.id === b.id && ("edge" in a ? a.edge : null) === ("edge" in b ? b.edge : null) : true
}

/** Which half of the row the pointer is in. */
const edgeOf = (event: DragEvent<HTMLElement>): "before" | "after" => {
  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientY - rect.top < rect.height / 2 ? "before" : "after"
}

const dropClass = (target: DropTarget | null, match: DropTarget): string => {
  if (!sameTarget(target, match)) return ""
  if (match.kind === "folder" || match.kind === "loose") return " drop-into"
  return match.kind === "row" || match.kind === "folderEdge" ? ` drop-${match.edge}` : ""
}

// ---------------------------------------------------------------------------
// Resizer
// ---------------------------------------------------------------------------

const STEP = 16

/**
 * The split between the sidebar and the list. Pointer capture keeps the drag
 * alive over the panes to the right, and the same handle answers to the arrow
 * keys so the width is not mouse-only.
 */
const SidebarResizer = () => {
  const { state, dispatch } = useStore()
  const width = state.sidebarWidth

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    const startX = event.clientX
    const startWidth = width
    handle.setPointerCapture(event.pointerId)
    document.body.classList.add("resizing-sidebar")

    const onMove = (move: PointerEvent) => dispatch({ type: "setSidebarWidth", width: startWidth + move.clientX - startX })
    const onDone = () => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onDone)
      handle.removeEventListener("pointercancel", onDone)
      document.body.classList.remove("resizing-sidebar")
    }
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onDone)
    handle.addEventListener("pointercancel", onDone)
  }

  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => dispatch({ type: "setSidebarWidth", width: SIDEBAR_DEFAULT })}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") dispatch({ type: "setSidebarWidth", width: width - STEP })
        else if (event.key === "ArrowRight") dispatch({ type: "setSidebarWidth", width: width + STEP })
        else if (event.key === "Home") dispatch({ type: "setSidebarWidth", width: SIDEBAR_DEFAULT })
        else return
        event.preventDefault()
      }}
      title="Drag to resize — double-click to reset"
    >
      <span className="sidebar-resizer-grip" aria-hidden />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface FeedRowProps {
  readonly feed: Feed
  readonly active: boolean
  readonly dragging: boolean
  readonly dropHint: string
  readonly onSelect: () => void
  readonly onEdit: () => void
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void
  readonly onDragEnd: () => void
  readonly onDrop: (event: DragEvent<HTMLElement>) => void
}

const FeedRow = ({ feed, active, dragging, dropHint, onSelect, onEdit, onDragStart, onDragOver, onDragEnd, onDrop }: FeedRowProps) => (
  <li
    className={`tree-item feed-row${active ? " active" : ""}${feed.unread === 0 ? " quiet" : ""}${dragging ? " dragging" : ""}${dropHint}`}
    draggable
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDragEnd={onDragEnd}
    onDrop={onDrop}
  >
    <button type="button" className="tree-button" onClick={onSelect} title={feed.lastError ? `Last fetch failed: ${feed.lastError}` : feed.url}>
      <FeedIcon feed={feed} />
      <span className="tree-label">{feed.title}</span>
      {feed.lastError && <AlertIcon size={13} className="feed-warning" />}
      <Count n={feed.unread} />
    </button>
    <button type="button" className="tree-more icon-button" onClick={onEdit} aria-label={`Edit ${feed.title}`}>
      <DotsIcon size={14} />
    </button>
  </li>
)

export const Sidebar = () => {
  const { state, dispatch } = useStore()
  const feeds = useFeeds()
  const categories = useCategories()
  const stats = useStats()
  const pwa = usePwa()
  const reorderFeeds = useReorderFeeds()
  const reorderCategories = useReorderCategories()

  const [dragged, setDragged] = useState<Dragged | null>(null)
  const [target, setTarget] = useState<DropTarget | null>(null)
  // dragenter/dragleave fire in pairs as the pointer crosses child rows, so the
  // tree only forgets its target once the counter unwinds to zero.
  const depth = useRef(0)

  const categoryList = useMemo(() => categories.data ?? [], [categories.data])

  const grouped = useMemo(() => {
    const byCategory = new Map<string, Array<Feed>>()
    const loose: Array<Feed> = []
    for (const feed of feeds.data ?? []) {
      if (feed.categoryId === null) loose.push(feed)
      else {
        const bucket = byCategory.get(feed.categoryId) ?? []
        bucket.push(feed)
        byCategory.set(feed.categoryId, bucket)
      }
    }
    return { byCategory, loose }
  }, [feeds.data])

  const setView = (view: View) => dispatch({ type: "setView", view })
  const edit = (feedId: string) => dispatch({ type: "openDialog", dialog: { type: "editFeed", feedId } })
  const toggleTheme = () => {
    const dark = document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches)
    dispatch({ type: "setTheme", theme: dark ? "light" : "dark" })
  }

  const endDrag = useCallback(() => {
    depth.current = 0
    setDragged(null)
    setTarget(null)
  }, [])

  const startDrag = (item: Dragged) => (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.effectAllowed = "move"
    // Firefox refuses to start a drag without payload; the id also lets a drop
    // survive a re-render that clears our own state.
    event.dataTransfer.setData("text/plain", item.id)
    event.stopPropagation()
    setDragged(item)
  }

  /** Records a hover target, and tells the browser this is a legal drop. */
  const hover = (event: DragEvent<HTMLElement>, next: DropTarget | null) => {
    if (next === null) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "move"
    setTarget((current) => (sameTarget(current, next) ? current : next))
  }

  /** Where a feed hovering over `feed` would land. Null when it changes nothing. */
  const feedRowTarget = (feed: Feed, event: DragEvent<HTMLElement>): DropTarget | null => {
    if (dragged?.kind !== "feed" || dragged.id === feed.id) return null
    return { kind: "row", id: feed.id, edge: edgeOf(event) }
  }

  const categoryRowTarget = (category: Category, event: DragEvent<HTMLElement>): DropTarget | null => {
    if (dragged === null) return null
    if (dragged.kind === "feed") return { kind: "folder", id: category.id }
    return dragged.id === category.id ? null : { kind: "folderEdge", id: category.id, edge: edgeOf(event) }
  }

  // -------------------------------------------------------------------------
  // Committing a drop
  // -------------------------------------------------------------------------

  const moveFeed = useCallback(
    (feedId: string, to: DropTarget) => {
      const all = feeds.data ?? []
      const feed = all.find((f) => f.id === feedId)
      if (!feed) return

      // Rebuild the sidebar as ordered buckets, move the row, then renumber.
      // Positions are a single global sequence, so a flat pass is enough.
      const buckets = new Map<string | null, Array<Feed>>()
      for (const category of categoryList) buckets.set(category.id, [...(grouped.byCategory.get(category.id) ?? [])])
      buckets.set(null, [...grouped.loose])
      for (const bucket of buckets.values()) {
        const index = bucket.findIndex((f) => f.id === feedId)
        if (index >= 0) bucket.splice(index, 1)
      }

      if (to.kind === "folder") buckets.get(to.id)?.push(feed)
      else if (to.kind === "loose") buckets.get(null)?.push(feed)
      else if (to.kind === "row") {
        const destination = all.find((f) => f.id === to.id)?.categoryId ?? null
        const bucket = buckets.get(destination)
        if (!bucket) return
        const index = bucket.findIndex((f) => f.id === to.id)
        if (index < 0) return
        bucket.splice(to.edge === "before" ? index : index + 1, 0, feed)
      } else return

      const arranged: Array<{ id: string; categoryId: string | null; position: number }> = []
      for (const key of [...categoryList.map((c) => c.id), null]) {
        for (const item of buckets.get(key) ?? []) arranged.push({ id: item.id, categoryId: key, position: arranged.length })
      }

      // A drop that lands where the row already was is not worth a request.
      const unchanged = arranged.every((item, index) => {
        const before = all[index]
        return before?.id === item.id && before.categoryId === item.categoryId
      })
      if (unchanged) return

      // Dropping into a collapsed folder would otherwise look like the feed vanished.
      if (to.kind === "folder" && state.collapsed.has(to.id)) dispatch({ type: "toggleCollapsed", id: to.id })
      reorderFeeds.mutate(arranged)
    },
    [feeds.data, categoryList, grouped, reorderFeeds, state.collapsed, dispatch],
  )

  const moveCategory = useCallback(
    (categoryId: string, to: Extract<DropTarget, { kind: "folderEdge" }>) => {
      const next = [...categoryList]
      const from = next.findIndex((c) => c.id === categoryId)
      const moved = next[from]
      if (from < 0 || !moved) return
      next.splice(from, 1)
      const anchor = next.findIndex((c) => c.id === to.id)
      if (anchor < 0) return
      next.splice(to.edge === "before" ? anchor : anchor + 1, 0, moved)
      if (next.every((c, index) => c.id === categoryList[index]?.id)) return
      reorderCategories.mutate(next.map((c, position) => ({ id: c.id, position })))
    },
    [categoryList, reorderCategories],
  )

  const drop = (to: DropTarget | null) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const item = dragged
    endDrag()
    if (!item || to === null) return
    if (item.kind === "feed") moveFeed(item.id, to)
    else if (to.kind === "folderEdge") moveCategory(item.id, to)
  }

  const renderCategory = (category: Category) => {
    const items = grouped.byCategory.get(category.id) ?? []
    const unread = items.reduce((n, f) => n + f.unread, 0)
    const collapsed = state.collapsed.has(category.id)
    const active = sameView(state.view, { kind: "category", id: category.id })
    const rowHint =
      dragged?.kind === "feed"
        ? dropClass(target, { kind: "folder", id: category.id })
        : dropClass(target, { kind: "folderEdge", id: category.id, edge: "before" }) ||
          dropClass(target, { kind: "folderEdge", id: category.id, edge: "after" })
    return (
      <li key={category.id} className={`tree-group${dragged?.kind === "category" && dragged.id === category.id ? " dragging" : ""}`}>
        <div
          className={`tree-item category-row${active ? " active" : ""}${unread === 0 ? " quiet" : ""}${rowHint}`}
          draggable
          onDragStart={startDrag({ kind: "category", id: category.id })}
          onDragOver={(event) => hover(event, categoryRowTarget(category, event))}
          onDragEnd={endDrag}
          onDrop={(event) => drop(categoryRowTarget(category, event))(event)}
        >
          <button
            type="button"
            className="tree-toggle icon-button"
            onClick={() => dispatch({ type: "toggleCollapsed", id: category.id })}
            aria-label={collapsed ? `Expand ${category.name}` : `Collapse ${category.name}`}
            aria-expanded={!collapsed}
          >
            <ChevronIcon size={12} className={collapsed ? "" : "rotated"} />
          </button>
          <button type="button" className="tree-button" onClick={() => setView({ kind: "category", id: category.id })}>
            <FolderIcon size={15} className="tree-glyph" />
            <span className="tree-label">{category.name}</span>
            <Count n={unread} />
          </button>
        </div>
        {!collapsed && (
          <ul
            className="tree-children"
            onDragOver={(event) => hover(event, dragged?.kind === "feed" ? { kind: "folder", id: category.id } : null)}
            onDrop={(event) => drop(dragged?.kind === "feed" ? { kind: "folder", id: category.id } : null)(event)}
          >
            {items.map((feed) => (
              <FeedRow
                key={feed.id}
                feed={feed}
                active={sameView(state.view, { kind: "feed", id: feed.id })}
                dragging={dragged?.kind === "feed" && dragged.id === feed.id}
                dropHint={
                  dropClass(target, { kind: "row", id: feed.id, edge: "before" }) ||
                  dropClass(target, { kind: "row", id: feed.id, edge: "after" })
                }
                onSelect={() => setView({ kind: "feed", id: feed.id })}
                onEdit={() => edit(feed.id)}
                onDragStart={startDrag({ kind: "feed", id: feed.id })}
                onDragOver={(event) => hover(event, feedRowTarget(feed, event))}
                onDragEnd={endDrag}
                onDrop={(event) => drop(feedRowTarget(feed, event))(event)}
              />
            ))}
            {items.length === 0 && (
              <li className={`tree-empty${dropClass(target, { kind: "folder", id: category.id })}`}>
                {dragged?.kind === "feed" ? "Drop here" : "No feeds yet"}
              </li>
            )}
          </ul>
        )}
      </li>
    )
  }

  return (
    <aside className={`sidebar${state.sidebarOpen ? " open" : ""}`} aria-label="Subscriptions">
      <div className="brand">
        <span className="brand-mark">Radar</span>
        {stats.data && stats.data.unread > 0 && <span className="brand-count">{stats.data.unread}</span>}
      </div>

      <nav className="nav">
        <button type="button" className={`nav-item${state.view.kind === "all" ? " active" : ""}`} onClick={() => setView({ kind: "all" })}>
          <InboxIcon size={16} />
          <span className="tree-label">All items</span>
          <Count n={stats.data?.unread ?? 0} />
        </button>
        <button type="button" className={`nav-item${state.view.kind === "saved" ? " active" : ""}`} onClick={() => setView({ kind: "saved" })}>
          <BookmarkIcon size={16} />
          <span className="tree-label">Read later</span>
          <Count n={stats.data?.saved ?? 0} />
        </button>
        <button type="button" className={`nav-item${state.view.kind === "discover" ? " active" : ""}`} onClick={() => setView({ kind: "discover" })}>
          <CompassIcon size={16} />
          <span className="tree-label">Discover</span>
        </button>
      </nav>

      <div className="section-head">
        <span>Subscriptions</span>
        <div className="section-actions">
          <button type="button" className="icon-button" onClick={() => dispatch({ type: "openDialog", dialog: { type: "categories" } })} aria-label="Manage folders" title="Manage folders">
            <FolderIcon size={14} />
          </button>
          <button type="button" className="icon-button" onClick={() => dispatch({ type: "openDialog", dialog: { type: "add" } })} aria-label="Add subscription" title="Add subscription (a)">
            <PlusIcon size={14} />
          </button>
        </div>
      </div>

      <ul
        className={`tree${dragged ? " dragging-within" : ""}`}
        onDragEnter={() => {
          depth.current += 1
        }}
        onDragLeave={() => {
          depth.current -= 1
          if (depth.current <= 0) setTarget(null)
        }}
      >
        {categoryList.map(renderCategory)}
        {grouped.loose.map((feed) => (
          <FeedRow
            key={feed.id}
            feed={feed}
            active={sameView(state.view, { kind: "feed", id: feed.id })}
            dragging={dragged?.kind === "feed" && dragged.id === feed.id}
            dropHint={
              dropClass(target, { kind: "row", id: feed.id, edge: "before" }) ||
              dropClass(target, { kind: "row", id: feed.id, edge: "after" })
            }
            onSelect={() => setView({ kind: "feed", id: feed.id })}
            onEdit={() => edit(feed.id)}
            onDragStart={startDrag({ kind: "feed", id: feed.id })}
            onDragOver={(event) => hover(event, feedRowTarget(feed, event))}
            onDragEnd={endDrag}
            onDrop={(event) => drop(feedRowTarget(feed, event))(event)}
          />
        ))}
        {/* Somewhere to let go of a feed that should belong to no folder. */}
        {dragged?.kind === "feed" && (
          <li
            className={`tree-dropzone${dropClass(target, { kind: "loose" })}`}
            onDragOver={(event) => hover(event, { kind: "loose" })}
            onDrop={drop({ kind: "loose" })}
          >
            Outside every folder
          </li>
        )}
        {feeds.isSuccess && feeds.data.length === 0 && (
          <li className="tree-empty">
            Nothing here yet. Press <kbd>a</kbd> to subscribe.
          </li>
        )}
      </ul>

      {pwa.canInstall && (
        <button type="button" className="install-banner" onClick={() => void pwa.install()}>
          <DownloadIcon size={15} />
          <span>
            <strong>Install Radar</strong>
            <small>Open it like a native app, and read offline.</small>
          </span>
        </button>
      )}

      <footer className="sidebar-footer">
        <button type="button" className="footer-button" onClick={() => dispatch({ type: "openDialog", dialog: { type: "opml" } })}>
          <ImportIcon size={15} />
          <span>Import / Export</span>
        </button>
        <div className="footer-icons">
          <button type="button" className="icon-button" onClick={() => dispatch({ type: "openDialog", dialog: { type: "shortcuts" } })} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <KeyboardIcon size={16} />
          </button>
          <button type="button" className="icon-button theme-toggle" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
            <SunIcon size={16} className="only-dark" />
            <MoonIcon size={16} className="only-light" />
          </button>
        </div>
      </footer>

      <SidebarResizer />
    </aside>
  )
}
