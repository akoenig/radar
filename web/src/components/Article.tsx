import { useMemo } from "react"
import { absolutize, sanitize } from "../lib/sanitize"
import { formatFull } from "../lib/time"
import type { Entry, EntrySummary, Feed } from "../lib/types"
import { ExternalIcon } from "./Icons"
import { FeedIcon } from "./Sidebar"

export const hostOf = (url: string | null): string | null => {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

interface ArticleProps {
  readonly summary: EntrySummary
  readonly entry: Entry | undefined
  readonly feed: Feed | undefined
  readonly isLoading: boolean
  readonly error: Error | null
  readonly onSelectFeed: (feedId: string) => void
  /** Stream rows already show the feed and title in their own header. */
  readonly headless?: boolean
}

/**
 * One article's header and sanitized body. Shared by the reading pane and the
 * expanded rows of the stream layout so both render identically.
 */
export const Article = ({ summary, entry, feed, isLoading, error, onSelectFeed, headless }: ArticleProps) => {
  const html = useMemo(() => (entry?.content ? sanitize(absolutize(entry.content, entry.url)) : ""), [entry])
  const current = entry ?? summary
  const link = current.url
  const site = hostOf(link) ?? hostOf(feed?.siteUrl ?? null)
  const author = current.author?.trim()
  const byline = author && author.toLowerCase() !== feed?.title.trim().toLowerCase() ? author : null

  return (
    <article className="article">
      {!headless && (
        <header className="article-header">
          <div className="article-meta">
            {feed && (
              <button type="button" className="feed-chip" onClick={() => onSelectFeed(feed.id)}>
                <FeedIcon feed={feed} size={14} />
                <span>{feed.title}</span>
              </button>
            )}
            {/* Many feeds set the author to the publication name; saying it twice is noise. */}
            {byline && (
              <>
                <span className="article-sep" aria-hidden>
                  ·
                </span>
                <span className="article-author">{byline}</span>
              </>
            )}
            <span className="article-sep" aria-hidden>
              ·
            </span>
            <time dateTime={new Date(current.publishedAt).toISOString()}>{formatFull(current.publishedAt)}</time>
          </div>
          <h1 className="article-title">
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer">
                {current.title}
              </a>
            ) : (
              current.title
            )}
          </h1>
        </header>
      )}

      {isLoading && !entry && <div className="article-loading">Loading…</div>}
      {error && <p className="article-error">Couldn’t load this entry: {error.message}</p>}
      {entry && html && <div className="article-body" dangerouslySetInnerHTML={{ __html: html }} />}
      {entry && !html && <p className="article-body article-nocontent">{summary.summary || "This entry has no content."}</p>}

      {link && (
        <footer className="article-footer">
          <a className="button" href={link} target="_blank" rel="noopener noreferrer">
            Continue on {site ?? "the original site"} <ExternalIcon size={14} />
          </a>
        </footer>
      )}
    </article>
  )
}
