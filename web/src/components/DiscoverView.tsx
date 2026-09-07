import { useEffect, useMemo, useState } from "react"
import { ApiError } from "../lib/api"
import { formatRelative } from "../lib/time"
import type { CatalogFeed, CatalogTopic } from "../lib/types"
import { useCatalog, useCatalogPreview, useCatalogSearch, useSubscribe } from "../state/queries"
import { useStore } from "../state/store"
import { hostOf } from "./Article"
import { CheckAllIcon, ChevronIcon, MenuIcon, PlusIcon, SearchIcon } from "./Icons"
import { useToast } from "./Toast"

const matches = (feed: CatalogFeed, needle: string) =>
  `${feed.title} ${feed.description} ${feed.siteUrl}`.toLowerCase().includes(needle)

/** 4.8k reads better than 4812 at a glance, which is all this number is for. */
const compact = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k` : String(n)

const cadence = (postsPerWeek: number): string => {
  if (postsPerWeek >= 7) return `${Math.round(postsPerWeek / 7)}/day`
  if (postsPerWeek >= 1) return `${Math.round(postsPerWeek)}/week`
  return "occasional"
}

/** Reach and cadence, shown only for feeds the directory could measure. */
const Reach = ({ feed }: { feed: CatalogFeed }) => {
  const reach = feed.reach
  if (!reach) return null
  const facts = [
    reach.subscribers !== null && reach.subscribers > 0 ? `${compact(reach.subscribers)} readers` : null,
    reach.postsPerWeek !== null && reach.postsPerWeek > 0 ? cadence(reach.postsPerWeek) : null,
    reach.lastPublishedAt !== null ? `updated ${formatRelative(reach.lastPublishedAt)}` : null,
  ].filter((fact): fact is string => fact !== null)
  if (facts.length === 0) return null
  return <p className="catalog-card-reach">{facts.join(" · ")}</p>
}

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
        {feed.reach?.iconUrl && (
          // Decorative: the title beside it already names the feed. A broken
          // directory icon should leave a clean card, not a torn-image glyph.
          <img
            className="catalog-card-icon"
            src={feed.reach.iconUrl}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
        )}
        <div className="catalog-card-heading">
          <h3 className="catalog-card-title">{feed.title}</h3>
          <span className="catalog-card-host">{hostOf(feed.siteUrl) ?? feed.siteUrl}</span>
        </div>
      </div>
      <p className="catalog-card-body">{feed.description}</p>
      <Reach feed={feed} />
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

/** Long enough that a burst of typing is one request, short enough to feel live. */
const DEBOUNCE_MILLIS = 300

const useDebounced = (value: string) => {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), DEBOUNCE_MILLIS)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

/**
 * Feed discovery: a live search over the wider directory, with the bundled
 * catalog as the landing page and as the answer when the directory cannot be
 * reached. Typing searches the directory; a topic chip asks it the same
 * question by topic, which is why browsing shows real feeds rather than a
 * hand-picked list.
 */
export const DiscoverView = ({ onOpenSidebar }: { onOpenSidebar: () => void }) => {
  const catalog = useCatalog(true)
  const [topicId, setTopicId] = useState<string>("all")
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search)

  const topics: ReadonlyArray<CatalogTopic> = catalog.data ?? []
  // A typed query wins over a chip; a chip asks the directory by topic.
  const term = debounced.trim() || (topicId === "all" ? "" : `#${topicId}`)
  const results = useCatalogSearch(term)
  const browsing = term.length === 0

  const bundled = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return topics
      .map((topic) => ({ ...topic, feeds: needle ? topic.feeds.filter((f) => matches(f, needle)) : topic.feeds }))
      .filter((topic) => topic.feeds.length > 0)
  }, [topics, search])

  const chooseTopic = (id: string) => {
    setTopicId(id)
    setSearch("")
  }

  const onType = (value: string) => {
    setSearch(value)
    if (value.trim().length > 0) setTopicId("all")
  }

  return (
    <section className="discover" aria-label="Discover feeds">
      <header className="discover-header">
        <div className="discover-header-row">
          <button type="button" className="icon-button only-narrow" onClick={onOpenSidebar} aria-label="Open subscriptions">
            <MenuIcon />
          </button>
          <div>
            <h2 className="discover-title">Discover</h2>
            <p className="discover-subtitle">Search millions of feeds by name or topic. Subscribe with one tap.</p>
          </div>
        </div>
        <div className="discover-search">
          <SearchIcon size={15} className="search-glyph" />
          <input
            type="search"
            value={search}
            onChange={(e) => onType(e.target.value)}
            placeholder="Search for a publication or topic"
            aria-label="Search for feeds"
          />
        </div>
        <div className="topic-rail" role="tablist" aria-label="Topics">
          <button type="button" role="tab" aria-selected={topicId === "all"} className={`chip${topicId === "all" ? " on" : ""}`} onClick={() => chooseTopic("all")}>
            Everything
          </button>
          {topics.map((topic) => (
            <button
              key={topic.id}
              type="button"
              role="tab"
              aria-selected={topicId === topic.id}
              className={`chip${topicId === topic.id ? " on" : ""}`}
              onClick={() => chooseTopic(topic.id)}
            >
              {topic.name}
            </button>
          ))}
        </div>
      </header>

      <div className="discover-scroll">
        {browsing ? (
          <>
            {catalog.isLoading && <p className="discover-status">Loading the catalog…</p>}
            {catalog.isError && <p className="discover-status">Could not load the catalog.</p>}
            {bundled.map((topic) => (
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
          </>
        ) : (
          <section className="catalog-topic">
            <div className="catalog-topic-head">
              <h3>{debounced.trim() ? `Results for “${debounced.trim()}”` : (topics.find((t) => t.id === topicId)?.name ?? "Results")}</h3>
              <p>
                {results.isFetching && results.data === undefined
                  ? "Searching…"
                  : results.data?.source === "bundled"
                    ? "The feed directory is unreachable, so these are matches from the built-in catalog."
                    : `${results.data?.feeds.length ?? 0} ${results.data?.feeds.length === 1 ? "feed" : "feeds"}, most read first.`}
              </p>
            </div>
            {results.isError && <p className="discover-status">Could not search for feeds just now.</p>}
            {results.data && results.data.feeds.length === 0 && !results.isFetching && (
              <p className="discover-status">Nothing found for “{term.replace(/^#/, "")}”.</p>
            )}
            <ul className={`catalog-grid${results.isFetching ? " searching" : ""}`}>
              {(results.data?.feeds ?? []).map((feed) => (
                <Card key={feed.id} feed={feed} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  )
}
