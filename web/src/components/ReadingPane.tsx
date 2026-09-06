import type { RefObject } from "react"
import type { Entry, EntrySummary, Feed } from "../lib/types"
import { Article } from "./Article"
import { BackIcon, BookmarkIcon, CircleIcon, ExternalIcon } from "./Icons"

interface ReadingPaneProps {
  readonly summary: EntrySummary | null
  readonly entry: Entry | undefined
  readonly feed: Feed | undefined
  readonly isLoading: boolean
  readonly error: Error | null
  readonly scrollRef: RefObject<HTMLDivElement | null>
  readonly onToggleSaved: () => void
  readonly onToggleRead: () => void
  readonly onBack: () => void
  readonly onSelectFeed: (feedId: string) => void
}

export const ReadingPane = ({
  summary,
  entry,
  feed,
  isLoading,
  error,
  scrollRef,
  onToggleSaved,
  onToggleRead,
  onBack,
  onSelectFeed,
}: ReadingPaneProps) => {
  if (!summary) {
    return (
      <section className="reading-pane" aria-label="Reading pane">
        <div className="reading-empty">
          <div className="reading-empty-mark" aria-hidden>
            ¶
          </div>
          <p className="reading-empty-title">Select something to read</p>
          <ul className="hint-list">
            <li>
              <kbd>j</kbd> <kbd>k</kbd> move between items
            </li>
            <li>
              <kbd>s</kbd> save for later · <kbd>m</kbd> toggle read
            </li>
            <li>
              <kbd>1</kbd> <kbd>2</kbd> switch layout · <kbd>?</kbd> all shortcuts
            </li>
          </ul>
        </div>
      </section>
    )
  }

  const link = entry?.url ?? summary.url

  return (
    <section className="reading-pane" aria-label="Reading pane">
      <div className="reading-toolbar">
        <button type="button" className="icon-button only-phone" onClick={onBack} aria-label="Back to list">
          <BackIcon />
        </button>
        <div className="reading-toolbar-actions">
          <button type="button" className={`pill${summary.isSaved ? " on" : ""}`} onClick={onToggleSaved} title="Read later (s)">
            <BookmarkIcon size={14} filled={summary.isSaved} />
            <span>{summary.isSaved ? "Saved" : "Read later"}</span>
            <kbd>s</kbd>
          </button>
          <button type="button" className="pill" onClick={onToggleRead} title="Toggle read (m)">
            <CircleIcon size={14} />
            <span>{summary.isRead ? "Mark unread" : "Mark read"}</span>
            <kbd>m</kbd>
          </button>
          {link && (
            <a className="pill" href={link} target="_blank" rel="noopener noreferrer" title="Open original (v)">
              <ExternalIcon size={14} />
              <span>Open</span>
              <kbd>v</kbd>
            </a>
          )}
        </div>
      </div>

      <div className="reading-scroll" ref={scrollRef} tabIndex={-1}>
        <div className="reading-measure" key={summary.id}>
          <Article
            summary={summary}
            entry={entry}
            feed={feed}
            isLoading={isLoading}
            error={error}
            onSelectFeed={onSelectFeed}
          />
        </div>
      </div>
    </section>
  )
}
