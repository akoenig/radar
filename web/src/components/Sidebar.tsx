import { useMemo, useState } from "react"
import type { Category, Feed, View } from "../lib/types"
import { useStore } from "../state/store"
import { useCategories, useFeeds, useStats } from "../state/queries"
import {
  AlertIcon,
  BookmarkIcon,
  ChevronIcon,
  DotsIcon,
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

const FeedRow = ({ feed, active, onSelect, onEdit }: { feed: Feed; active: boolean; onSelect: () => void; onEdit: () => void }) => (
  <li className={`tree-item feed-row${active ? " active" : ""}${feed.unread === 0 ? " quiet" : ""}`}>
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

  const renderCategory = (category: Category) => {
    const items = grouped.byCategory.get(category.id) ?? []
    const unread = items.reduce((n, f) => n + f.unread, 0)
    const collapsed = state.collapsed.has(category.id)
    const active = sameView(state.view, { kind: "category", id: category.id })
    return (
      <li key={category.id} className="tree-group">
        <div className={`tree-item category-row${active ? " active" : ""}${unread === 0 ? " quiet" : ""}`}>
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
          <ul className="tree-children">
            {items.map((feed) => (
              <FeedRow
                key={feed.id}
                feed={feed}
                active={sameView(state.view, { kind: "feed", id: feed.id })}
                onSelect={() => setView({ kind: "feed", id: feed.id })}
                onEdit={() => edit(feed.id)}
              />
            ))}
            {items.length === 0 && <li className="tree-empty">No feeds yet</li>}
          </ul>
        )}
      </li>
    )
  }

  return (
    <aside className={`sidebar${state.sidebarOpen ? " open" : ""}`} aria-label="Subscriptions">
      <div className="brand">
        <span className="brand-mark">Reader</span>
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

      <ul className="tree">
        {(categories.data ?? []).map(renderCategory)}
        {grouped.loose.map((feed) => (
          <FeedRow
            key={feed.id}
            feed={feed}
            active={sameView(state.view, { kind: "feed", id: feed.id })}
            onSelect={() => setView({ kind: "feed", id: feed.id })}
            onEdit={() => edit(feed.id)}
          />
        ))}
        {feeds.isSuccess && feeds.data.length === 0 && (
          <li className="tree-empty">
            Nothing here yet. Press <kbd>a</kbd> to subscribe.
          </li>
        )}
      </ul>

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
    </aside>
  )
}
