import { useEffect, useRef, useState, type FormEvent } from "react"
import { api, ApiError } from "../lib/api"
import { formatShortDateTime } from "../lib/time"
import type { Feed } from "../lib/types"
import { useStore } from "../state/store"
import {
  useCategories,
  useCreateCategory,
  useFeeds,
  useImportOpml,
  useRefreshAll,
  useRefreshFeed,
  useRemoveCategory,
  useSubscribe,
  useUnsubscribe,
  useUpdateCategory,
  useUpdateFeed,
} from "../state/queries"
import { Dialog } from "./Dialog"
import { CloseIcon, PlusIcon } from "./Icons"
import { useToast } from "./Toast"

const errorMessage = (e: unknown): string => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong.")

// ---------------------------------------------------------------------------
// Add subscription
// ---------------------------------------------------------------------------

export const AddFeedDialog = ({ initialUrl = "" }: { initialUrl?: string }) => {
  const { dispatch } = useStore()
  const toast = useToast()
  const categories = useCategories()
  const subscribe = useSubscribe()
  const [url, setUrl] = useState(initialUrl)
  const [categoryId, setCategoryId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const close = () => dispatch({ type: "closeDialog" })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const feed = await subscribe.mutateAsync({ url: url.trim(), categoryId: categoryId || null })
      toast(`Subscribed to ${feed.title}`, { tone: "success" })
      dispatch({ type: "closeDialog" })
      dispatch({ type: "setView", view: { kind: "feed", id: feed.id } })
    } catch (err) {
      if (err instanceof ApiError && err.body?._tag === "Conflict" && "existingId" in err.body && err.body.existingId) {
        const existingId = err.body.existingId
        setError("You already subscribe to this feed.")
        toast("Already subscribed", { action: { label: "Open it", onClick: () => { dispatch({ type: "closeDialog" }); dispatch({ type: "setView", view: { kind: "feed", id: existingId } }) } } })
      } else setError(errorMessage(err))
    }
  }

  return (
    <Dialog title="Add subscription" subtitle="Paste a site or feed address. Feeds are discovered automatically." onClose={close}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Address</span>
          <input type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </label>
        <label className="field">
          <span>Folder</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No folder</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={subscribe.isPending || url.trim().length === 0}>
            {subscribe.isPending ? "Fetching…" : "Subscribe"}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Edit subscription
// ---------------------------------------------------------------------------

export const EditFeedDialog = ({ feedId }: { feedId: string }) => {
  const { state, dispatch } = useStore()
  const toast = useToast()
  const feeds = useFeeds()
  const categories = useCategories()
  const update = useUpdateFeed()
  const unsubscribe = useUnsubscribe()
  const refresh = useRefreshFeed()
  const feed: Feed | undefined = feeds.data?.find((f) => f.id === feedId)
  const [title, setTitle] = useState(feed?.title ?? "")
  const [url, setUrl] = useState(feed?.url ?? "")
  const [categoryId, setCategoryId] = useState(feed?.categoryId ?? "")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => dispatch({ type: "closeDialog" })

  useEffect(() => {
    if (feed) {
      setTitle(feed.title)
      setUrl(feed.url)
      setCategoryId(feed.categoryId ?? "")
    }
  }, [feed?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!feed) {
    return (
      <Dialog title="Subscription" onClose={close}>
        <p>This subscription no longer exists.</p>
      </Dialog>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await update.mutateAsync({ id: feed.id, title: title.trim(), url: url.trim(), categoryId: categoryId || null })
      toast("Subscription updated", { tone: "success" })
      close()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    try {
      await unsubscribe.mutateAsync(feed.id)
      toast(`Unsubscribed from ${feed.title}`)
      close()
      if (state.view.kind === "feed" && state.view.id === feed.id) dispatch({ type: "setView", view: { kind: "all" } })
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const refetch = async () => {
    try {
      const result = await refresh.mutateAsync(feed.id)
      toast(result.error ? `Refresh failed: ${result.error}` : result.added > 0 ? `${result.added} new item${result.added === 1 ? "" : "s"}` : "Nothing new", { tone: result.error ? "error" : "neutral" })
    } catch (err) {
      toast(errorMessage(err), { tone: "error" })
    }
  }

  return (
    <Dialog title="Edit subscription" subtitle={feed.siteUrl ?? feed.url} onClose={close}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Title</span>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="field">
          <span>Feed address</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} required />
        </label>
        <label className="field">
          <span>Folder</span>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No folder</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="feed-status">
          <span>{feed.lastFetchedAt ? `Last checked ${formatShortDateTime(feed.lastFetchedAt)}` : "Never fetched"}</span>
          {feed.lastError && <span className="feed-status-error">{feed.lastError}</span>}
          <button type="button" className="link" onClick={refetch} disabled={refresh.isPending}>
            {refresh.isPending ? "Checking…" : "Check now"}
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions split">
          <button type="button" className={`button danger${confirmDelete ? " confirm" : ""}`} onClick={remove} disabled={unsubscribe.isPending}>
            {confirmDelete ? "Really unsubscribe?" : "Unsubscribe"}
          </button>
          <div>
            <button type="button" className="button" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={update.isPending}>
              Save
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export const CategoriesDialog = () => {
  const { dispatch } = useStore()
  const toast = useToast()
  const categories = useCategories()
  const feeds = useFeeds()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const remove = useRemoveCategory()
  const [name, setName] = useState("")
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const close = () => dispatch({ type: "closeDialog" })

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await create.mutateAsync(name.trim())
    setName("")
  }

  const rename = async () => {
    if (!editing) return
    if (editing.name.trim()) await update.mutateAsync({ id: editing.id, name: editing.name.trim() })
    setEditing(null)
  }

  return (
    <Dialog title="Folders" subtitle="Group subscriptions. Deleting a folder keeps its feeds." onClose={close}>
      <ul className="manage-list">
        {(categories.data ?? []).map((c) => {
          const count = (feeds.data ?? []).filter((f) => f.categoryId === c.id).length
          const isEditing = editing?.id === c.id
          return (
            <li key={c.id} className="manage-row">
              {isEditing ? (
                <input
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                  onBlur={rename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename()
                    if (e.key === "Escape") setEditing(null)
                  }}
                />
              ) : (
                <button type="button" className="manage-name" onClick={() => setEditing({ id: c.id, name: c.name })} title="Rename">
                  {c.name}
                  <span className="manage-count">
                    {count} feed{count === 1 ? "" : "s"}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label={`Delete ${c.name}`}
                onClick={async () => {
                  await remove.mutateAsync(c.id)
                  toast(`Deleted folder ${c.name}`)
                }}
              >
                <CloseIcon size={14} />
              </button>
            </li>
          )
        })}
        {categories.isSuccess && categories.data.length === 0 && <li className="manage-empty">No folders yet.</li>}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <input type="text" placeholder="New folder" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="button primary" disabled={!name.trim() || create.isPending} aria-label="Add folder">
          <PlusIcon size={14} /> Add
        </button>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// OPML
// ---------------------------------------------------------------------------

export const OpmlDialog = () => {
  const { dispatch } = useStore()
  const toast = useToast()
  const importOpml = useImportOpml()
  const refreshAll = useRefreshAll()
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const close = () => dispatch({ type: "closeDialog" })

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    try {
      const summary = await importOpml.mutateAsync(await f.text())
      toast(`Imported ${summary.feedsAdded} feed${summary.feedsAdded === 1 ? "" : "s"}${summary.feedsSkipped ? `, skipped ${summary.feedsSkipped}` : ""}`, { tone: "success" })
      close()
      if (summary.feedsAdded > 0) refreshAll.mutate()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Dialog title="Import / Export" subtitle="OPML works with every feed reader." onClose={close}>
      <div className="stack">
        <div className="card">
          <h3>Import</h3>
          <p>Bring subscriptions from another reader. Existing feeds are left untouched; new ones are fetched in the background.</p>
          <input ref={file} type="file" accept=".opml,.xml,text/xml,text/x-opml" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" className="button primary" onClick={() => file.current?.click()} disabled={importOpml.isPending}>
            {importOpml.isPending ? "Importing…" : "Choose OPML file"}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="card">
          <h3>Export</h3>
          <p>Download your folders and subscriptions.</p>
          <a className="button" href={api.system.exportOpmlUrl} download="reader-subscriptions.opml">
            Download OPML
          </a>
        </div>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Shortcuts
// ---------------------------------------------------------------------------

const SHORTCUTS: ReadonlyArray<{ group: string; items: ReadonlyArray<[keys: ReadonlyArray<string>, label: string]> }> = [
  {
    group: "Navigate",
    items: [
      [["j", "↓"], "Next item"],
      [["k", "↑"], "Previous item"],
      [["space"], "Scroll article, then next"],
      [["shift+j", "]"], "Next subscription"],
      [["shift+k", "["], "Previous subscription"],
      [["g a"], "All items"],
      [["g s"], "Read later"],
      [["o", "enter"], "Focus the article"],
    ],
  },
  {
    group: "Act",
    items: [
      [["m"], "Toggle read"],
      [["s"], "Save for later"],
      [["v"], "Open original"],
      [["shift+a"], "Mark all as read"],
      [["r"], "Refresh feeds"],
      [["u"], "Toggle unread only"],
    ],
  },
  {
    group: "Manage",
    items: [
      [["c"], "Compact rows"],
      [["1"], "Expanded view"],
      [["2"], "Split view"],
      [["a"], "Add subscription"],
      [["e"], "Edit current subscription"],
      [["/"], "Search"],
      [["?"], "Shortcuts"],
      [["esc"], "Close / clear"],
    ],
  },
]

export const ShortcutsDialog = () => {
  const { dispatch } = useStore()
  return (
    <Dialog title="Keyboard shortcuts" onClose={() => dispatch({ type: "closeDialog" })} wide>
      <div className="shortcut-groups">
        {SHORTCUTS.map((g) => (
          <section key={g.group} className="shortcut-group">
            <h3>{g.group}</h3>
            <dl>
              {g.items.map(([keys, label]) => (
                <div key={label} className="shortcut">
                  <dt>
                    {keys.map((k, i) => (
                      <span key={k}>
                        {i > 0 && <span className="shortcut-or">or</span>}
                        {k.split(" ").map((part) => (
                          <kbd key={part}>{part}</kbd>
                        ))}
                      </span>
                    ))}
                  </dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
