import { useMemo, useState } from "react"
import { ApiError } from "../lib/api"
import { formatRelative } from "../lib/time"
import type { CatalogFeed, CatalogTopic } from "../lib/types"
import { useCatalog, useCatalogPreview, useSubscribe } from "../state/queries"
import { useStore } from "../state/store"
import { hostOf } from "./Article"
import { CheckAllIcon, ChevronIcon, MenuIcon, PlusIcon, SearchIcon } from "./Icons"
import { useToast } from "./Toast"

const matches = (feed: CatalogFeed, needle: string) =>
  `${feed.title} ${feed.description} ${feed.siteUrl}`.toLowerCase().includes(needle)

/** The newest few headlines, fetched only when a card is opened. */
const Preview = ({ id }: { id: string }) => {
  const preview = useCatalogPreview(id, true)
  if (preview.isLoading) return <p className="catalog-preview-status">Fetching the latest posts…</p>
  if (preview.isError) return <p className="catalog-preview-status">Couldn’t reach this feed just now.</p>
  if (!preview.data || preview.data.length === 0) return <p className="catalog-preview-status">This feed has no recent posts.</p>
  return (
    <ul className="catalog-preview">
      {preview.data.map((item, i) => (
        <li key={`${item.url ?? item.title}-${i}`}>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.title}
            </a>
          ) : (
            <span>{item.title}</span>
          )}
          {item.publishedAt !== null && <time dateTime={new Date(item.publishedAt).toISOString()}>{formatRelative(item.publishedAt)}</time>}
        </li>
      ))}
    </ul>
  )
}

const Card = ({ feed }: { feed: CatalogFeed }) => {
  const { dispatch } = useStore()
  const toast = useToast()
  const subscribe = useSubscribe()
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(false)

  const openFeed = () => feed.subscribedAs && dispatch({ type: "setView", view: { kind: "feed", id: feed.subscribedAs } })

  const add = async () => {
    setPending(true)
    try {
      let added
      try {
        added = await subscribe.mutateAsync({ url: feed.url })
      } catch (error) {
        // A publisher may have moved the feed: let the site's autodiscovery answer.
        if (error instanceof ApiError && error.body?._tag === "UnprocessableFeed") {
          added = await subscribe.mutateAsync({ url: feed.siteUrl })
        } else throw error
      }
      toast(`Subscribed to ${added.title}`, {
        tone: "success",
        action: { label: "Open", onClick: () => dispatch({ type: "setView", view: { kind: "feed", id: added.id } }) },
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not subscribe", { tone: "error" })
    } finally {
      setPending(false)
    }
  }

  const subscribed = feed.subscribedAs !== null

  return (
    <li className={`catalog-card${subscribed ? " subscribed" : ""}`}>
      <div className="catalog-card-head">
        <h3 className="catalog-card-title">{feed.title}</h3>
        <span className="catalog-card-host">{hostOf(feed.siteUrl) ?? feed.siteUrl}</span>
      </div>
      <p className="catalog-card-body">{feed.description}</p>
      <div className="catalog-card-foot">
        <button
          type="button"
          className="catalog-preview-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <ChevronIcon size={12} className={open ? "rotated" : ""} />
          {open ? "Hide posts" : "Latest posts"}
        </button>
        {subscribed ? (
          <button type="button" className="button subtle" onClick={openFeed}>
            <CheckAllIcon size={14} /> Subscribed
          </button>
        ) : (
          <button type="button" className="button primary" onClick={add} disabled={pending}>
            {pending ? "Adding…" : <><PlusIcon size={14} /> Subscribe</>}
          </button>
        )}
      </div>
      {open && <Preview id={feed.id} />}
    </li>
  )
}

/**
 * A browsable directory of suggested feeds. Filtering happens on the client:
 * the catalog is small enough that a round trip per keystroke would be worse
 * than useless.
 */
export const DiscoverView = ({ onOpenSidebar }: { onOpenSidebar: () => void }) => {
  const catalog = useCatalog(true)
  const [topicId, setTopicId] = useState<string>("all")
  const [search, setSearch] = useState("")

  const topics: ReadonlyArray<CatalogTopic> = catalog.data ?? []
  const needle = search.trim().toLowerCase()

  const shown = useMemo(() => {
    const chosen = topicId === "all" ? topics : topics.filter((t) => t.id === topicId)
    return chosen
      .map((topic) => ({ ...topic, feeds: needle ? topic.feeds.filter((f) => matches(f, needle)) : topic.feeds }))
      .filter((topic) => topic.feeds.length > 0)
  }, [topics, topicId, needle])

  const total = shown.reduce((n, t) => n + t.feeds.length, 0)

  return (
    <section className="discover" aria-label="Discover feeds">
      <header className="discover-header">
        <div className="discover-header-row">
          <button type="button" className="icon-button only-narrow" onClick={onOpenSidebar} aria-label="Open subscriptions">
            <MenuIcon />
          </button>
          <div>
            <h2 className="discover-title">Discover</h2>
            <p className="discover-subtitle">A starting library of feeds worth reading. Subscribe with one tap.</p>
          </div>
        </div>
        <div className="discover-search">
          <SearchIcon size={15} className="search-glyph" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search the catalog"
            aria-label="Search the catalog"
          />
        </div>
        <div className="topic-rail" role="tablist" aria-label="Topics">
          <button type="button" role="tab" aria-selected={topicId === "all"} className={`chip${topicId === "all" ? " on" : ""}`} onClick={() => setTopicId("all")}>
            Everything
          </button>
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              role="tab"
              aria-selected={topicId === topic.id}
              className={`chip${topicId === topic.id ? " on" : ""}`}
              onClick={() => setTopicId(topic.id)}
            >
              {topic.name}
            </button>
          ))}
        </div>
      </header>

      <div className="discover-scroll">
        {catalog.isLoading && <p className="discover-status">Loading the catalog…</p>}
        {catalog.isError && <p className="discover-status">Could not load the catalog.</p>}
        {!catalog.isLoading && total === 0 && <p className="discover-status">Nothing in the catalog matches “{search}”.</p>}

        {shown.map((topic) => (
          <section key={topic.id} className="catalog-topic">
            <div className="catalog-topic-head">
              <h3>{topic.name}</h3>
              <p>{topic.description}</p>
            </div>
            <ul className="catalog-grid">
              {topic.feeds.map((feed) => (
                <Card key={feed.id} feed={feed} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
