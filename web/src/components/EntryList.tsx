import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react"
import type { Entry, EntrySummary, Feed, View } from "../lib/types"
import { formatRelative } from "../lib/time"
import type { Density, Layout } from "../state/store"
import { Article } from "./Article"
import {
  BackIcon,
  BookmarkIcon,
  CheckAllIcon,
  CircleIcon,
  CloseIcon,
  ColumnsIcon,
  CompactIcon,
  ExternalIcon,
  MenuIcon,
  RefreshIcon,
  RowsIcon,
  SearchIcon,
} from "./Icons"

interface EntryListProps {
  readonly view: View
  readonly title: string
  readonly entries: ReadonlyArray<EntrySummary>
  readonly feedsById: ReadonlyMap<string, Feed>
  readonly selectedId: string | null
  readonly unreadOnly: boolean
  readonly search: string
  readonly searchOpen: boolean
  readonly searchRef: RefObject<HTMLInputElement | null>
  readonly listRef: RefObject<HTMLUListElement | null>
  readonly layout: Layout
  readonly density: Density
  /** Body of the selected entry, for the stream layout. */
  readonly entry: Entry | undefined
  readonly entryLoading: boolean
  readonly entryError: Error | null
  readonly isLoading: boolean
  readonly isFetching: boolean
  readonly hasMore: boolean
  readonly refreshing: boolean
  readonly hasFeeds: boolean
  readonly onSelect: (id: string) => void
  readonly onToggleUnreadOnly: () => void
  readonly onSearchChange: (value: string) => void
  readonly onSearchClose: () => void
  readonly onLoadMore: () => void
  readonly onMarkAllRead: () => void
  readonly onRefresh: () => void
  readonly onOpenSidebar: () => void
  readonly onAddFeed: () => void
  readonly onImport: () => void
  readonly onSetLayout: (layout: Layout) => void
  readonly onToggleDensity: () => void
  readonly onToggleSaved: () => void
  readonly onToggleRead: () => void
  readonly onSelectFeed: (feedId: string) => void
}

interface RowProps {
  readonly entry: EntrySummary
  readonly feed: Feed | undefined
  readonly selected: boolean
  readonly layout: Layout
  readonly onSelect: () => void
}

const RowHeader = ({ entry, feed }: { entry: EntrySummary; feed: Feed | undefined }) => (
  <>
    <div className="entry-meta">
      <span className="unread-dot" aria-hidden />
      <span className="entry-feed">{feed?.title ?? "Unknown feed"}</span>
      {entry.isSaved && <BookmarkIcon size={11} filled className="entry-saved" />}
      <time className="entry-time" dateTime={new Date(entry.publishedAt).toISOString()}>
        {formatRelative(entry.publishedAt)}
      </time>
    </div>
    <h3 className="entry-title">{entry.title}</h3>
  </>
)

const Row = ({ entry, feed, selected, layout, onSelect, children }: RowProps & { children?: ReactNode }) => {
  const ref = useRef<HTMLLIElement>(null)
  const expanded = layout === "stream" && selected
  useEffect(() => {
    if (!selected) return
    // An expanded article should start at its own headline, not merely be nudged into view.
    ref.current?.scrollIntoView({ block: expanded ? "start" : "nearest" })
  }, [selected, expanded])
  return (
    <li
      ref={ref}
      className={`entry-row${selected ? " selected" : ""}${entry.isRead ? " read" : " unread"}${expanded ? " expanded" : ""}`}
      role="option"
      aria-selected={selected}
      aria-expanded={layout === "stream" ? selected : undefined}
      onClick={expanded ? undefined : onSelect}
    >
      <div className={expanded ? "entry-head" : undefined} onClick={expanded ? onSelect : undefined}>
        <RowHeader entry={entry} feed={feed} />
      </div>
      {!expanded && entry.summary && <p className="entry-snippet">{entry.summary}</p>}
      {children}
    </li>
  )
}

export const EntryList = (props: EntryListProps) => {
  const sentinel = useRef<HTMLDivElement>(null)
  const listRef = props.listRef
  const stream = props.layout === "stream"
  const compact = props.density === "compact"

  useEffect(() => {
    const node = sentinel.current
    if (!node || !props.hasMore) return
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && props.onLoadMore(), {
      root: listRef.current,
      rootMargin: "600px",
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [props.hasMore, props.onLoadMore, listRef])

  const unreadInList = useMemo(() => props.entries.filter((e) => !e.isRead).length, [props.entries])
  const showFilter = props.view.kind !== "saved"

  return (
    <section className={`list-pane${stream ? " stream" : ""}${compact ? " compact" : ""}`} aria-label="Entries">
      <header className="list-header">
        <div className="list-header-row">
          <button type="button" className="icon-button only-narrow" onClick={props.onOpenSidebar} aria-label="Open subscriptions">
            <MenuIcon />
          </button>
          <h2 className="list-title" title={props.title}>
            {props.title}
          </h2>
          {unreadInList > 0 && <span className="list-count">{unreadInList}</span>}
          <div className="list-actions">
            <div className="segmented layout-toggle" role="group" aria-label="Layout">
              <button
                type="button"
                className={stream ? "" : "on"}
                onClick={() => props.onSetLayout("split")}
                aria-pressed={!stream}
                title="Split view (2)"
              >
                <ColumnsIcon size={14} />
              </button>
              <button
                type="button"
                className={stream ? "on" : ""}
                onClick={() => props.onSetLayout("stream")}
                aria-pressed={stream}
                title="Expanded view (1)"
              >
                <RowsIcon size={14} />
              </button>
            </div>
            <button
              type="button"
              className={`icon-button${compact ? " on" : ""}`}
              onClick={props.onToggleDensity}
              aria-pressed={compact}
              aria-label="Compact rows"
              title="Compact rows (c)"
            >
              <CompactIcon />
            </button>
            <button type="button" className="icon-button" onClick={() => props.searchRef.current?.focus()} aria-label="Search" title="Search (/)">
              <SearchIcon />
            </button>
            <button
              type="button"
              className={`icon-button${props.refreshing ? " spinning" : ""}`}
              onClick={props.onRefresh}
              aria-label="Refresh all feeds"
              title="Refresh (r)"
              disabled={props.refreshing}
            >
              <RefreshIcon />
            </button>
            <button type="button" className="icon-button" onClick={props.onMarkAllRead} aria-label="Mark all as read" title="Mark all as read (shift+a)" disabled={unreadInList === 0}>
              <CheckAllIcon />
            </button>
          </div>
        </div>
        <div className="list-header-row list-tools">
          {showFilter ? (
            <div className="segmented" role="tablist" aria-label="Filter">
              <button type="button" role="tab" aria-selected={props.unreadOnly} className={props.unreadOnly ? "on" : ""} onClick={() => !props.unreadOnly && props.onToggleUnreadOnly()}>
                Unread
              </button>
              <button type="button" role="tab" aria-selected={!props.unreadOnly} className={!props.unreadOnly ? "on" : ""} onClick={() => props.unreadOnly && props.onToggleUnreadOnly()}>
                All
              </button>
            </div>
          ) : (
            <span className="list-hint">Everything you saved for later</span>
          )}
          <div className={`search${props.searchOpen || props.search ? " open" : ""}`}>
            <SearchIcon size={14} className="search-glyph" />
            <input
              ref={props.searchRef}
              type="search"
              placeholder="Search titles and text"
              value={props.search}
              onChange={(e) => props.onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  props.onSearchClose()
                  ;(e.target as HTMLInputElement).blur()
                }
                if (e.key === "Enter") (e.target as HTMLInputElement).blur()
              }}
              aria-label="Search entries"
            />
            {props.search && (
              <button type="button" className="icon-button search-clear" onClick={props.onSearchClose} aria-label="Clear search">
                <CloseIcon size={13} />
              </button>
            )}
          </div>
        </div>
      </header>

      <ul className="entry-list" role="listbox" aria-label="Entries" ref={listRef} tabIndex={-1}>
        {props.entries.map((entry) => {
          const selected = entry.id === props.selectedId
          const feed = props.feedsById.get(entry.feedId)
          return (
            <Row key={entry.id} entry={entry} feed={feed} selected={selected} layout={props.layout} onSelect={() => props.onSelect(entry.id)}>
              {stream && selected && (
                <div className="entry-expanded">
                  <Article
                    summary={entry}
                    entry={props.entry}
                    feed={feed}
                    isLoading={props.entryLoading}
                    error={props.entryError}
                    onSelectFeed={props.onSelectFeed}
                    headless
                  />
                  <div className="entry-actions">
                    <button type="button" className={`pill${entry.isSaved ? " on" : ""}`} onClick={props.onToggleSaved} title="Read later (s)">
                      <BookmarkIcon size={14} filled={entry.isSaved} />
                      <span>{entry.isSaved ? "Saved" : "Read later"}</span>
                      <kbd>s</kbd>
                    </button>
                    <button type="button" className="pill" onClick={props.onToggleRead} title="Toggle read (m)">
                      <CircleIcon size={14} />
                      <span>{entry.isRead ? "Mark unread" : "Mark read"}</span>
                      <kbd>m</kbd>
                    </button>
                    {(props.entry?.url ?? entry.url) && (
                      <a className="pill" href={props.entry?.url ?? entry.url ?? undefined} target="_blank" rel="noopener noreferrer" title="Open original (v)">
                        <ExternalIcon size={14} />
                        <span>Open</span>
                        <kbd>v</kbd>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </Row>
          )
        })}
        {props.hasMore && <div ref={sentinel} className="list-sentinel" />}
        {props.isLoading && (
          <li className="list-status" aria-busy>
            Loading…
          </li>
        )}
        {!props.isLoading && props.entries.length === 0 && (
          <li className="list-empty">
            {!props.hasFeeds ? (
              <div className="onboarding">
                <p className="onboarding-title">Your reader is empty.</p>
                <p>Subscribe to a site by pasting its address, or bring your subscriptions from another reader.</p>
                <div className="onboarding-actions">
                  <button type="button" className="button primary" onClick={props.onAddFeed}>
                    Add a subscription <kbd>a</kbd>
                  </button>
                  <button type="button" className="button" onClick={props.onImport}>
                    Import OPML
                  </button>
                </div>
              </div>
            ) : props.search ? (
              <p>Nothing matches “{props.search}”.</p>
            ) : props.view.kind === "saved" ? (
              <p>
                Nothing saved yet. Press <kbd>s</kbd> on an item to keep it for later.
              </p>
            ) : props.unreadOnly ? (
              <p>
                All caught up. <button type="button" className="link" onClick={props.onToggleUnreadOnly}>Show everything</button> or press <kbd>u</kbd>.
              </p>
            ) : (
              <p>No entries here yet.</p>
            )}
          </li>
        )}
        {props.isFetching && !props.isLoading && props.entries.length > 0 && <li className="list-status subtle">Updating…</li>}
      </ul>
      <button type="button" className="mobile-back only-phone" onClick={props.onOpenSidebar} aria-label="Subscriptions">
        <BackIcon size={14} /> Subscriptions
      </button>
    </section>
  )
}
