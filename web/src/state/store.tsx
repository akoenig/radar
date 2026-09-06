import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from "react"
import type { View } from "../lib/types"

export type Theme = "light" | "dark" | "system"

/** "split" = sidebar + list + reading pane. "stream" = one column, entries expand in place. */
export type Layout = "split" | "stream"

/** Row height in the entry list. "compact" trims padding and hides the snippet. */
export type Density = "cozy" | "compact"

export type DialogState =
  | null
  | { readonly type: "add"; readonly url?: string }
  | { readonly type: "editFeed"; readonly feedId: string }
  | { readonly type: "categories" }
  | { readonly type: "opml" }
  | { readonly type: "shortcuts" }

export interface State {
  readonly view: View
  readonly unreadOnly: boolean
  readonly search: string
  readonly searchOpen: boolean
  readonly selectedId: string | null
  readonly dialog: DialogState
  readonly theme: Theme
  readonly layout: Layout
  readonly density: Density
  readonly sidebarOpen: boolean
  /** Which pane is visible on narrow screens. */
  readonly mobilePane: "list" | "article"
  readonly collapsed: ReadonlySet<string>
}

export type Action =
  | { type: "setView"; view: View }
  | { type: "setUnreadOnly"; unreadOnly: boolean }
  | { type: "setSearch"; search: string }
  | { type: "setSearchOpen"; open: boolean }
  | { type: "select"; id: string | null }
  | { type: "openDialog"; dialog: Exclude<DialogState, null> }
  | { type: "closeDialog" }
  | { type: "setTheme"; theme: Theme }
  | { type: "setLayout"; layout: Layout }
  | { type: "setDensity"; density: Density }
  | { type: "setSidebarOpen"; open: boolean }
  | { type: "setMobilePane"; pane: "list" | "article" }
  | { type: "toggleCollapsed"; id: string }

const STORAGE = {
  unreadOnly: "reader.unreadOnly",
  theme: "reader.theme",
  layout: "reader.layout",
  density: "reader.density",
  collapsed: "reader.collapsed",
}

const read = <T,>(key: string, fallback: T, parse: (raw: string) => T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : parse(raw)
  } catch {
    return fallback
  }
}

const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage may be unavailable; state simply won't persist.
  }
}

export const viewToHash = (view: View): string => {
  switch (view.kind) {
    case "all":
      return "#/all"
    case "saved":
      return "#/saved"
    case "discover":
      return "#/discover"
    case "feed":
      return `#/feed/${encodeURIComponent(view.id)}`
    case "category":
      return `#/category/${encodeURIComponent(view.id)}`
  }
}

export const hashToView = (hash: string): View => {
  const parts = hash.replace(/^#\/?/, "").split("/")
  if (parts[0] === "saved") return { kind: "saved" }
  if (parts[0] === "discover") return { kind: "discover" }
  if (parts[0] === "feed" && parts[1]) return { kind: "feed", id: decodeURIComponent(parts[1]) }
  if (parts[0] === "category" && parts[1]) return { kind: "category", id: decodeURIComponent(parts[1]) }
  return { kind: "all" }
}

const sameView = (a: View, b: View) => a.kind === b.kind && ("id" in a ? a.id : null) === ("id" in b ? b.id : null)

const initialState = (): State => ({
  view: hashToView(window.location.hash),
  unreadOnly: read(STORAGE.unreadOnly, true, (r) => r === "true"),
  search: "",
  searchOpen: false,
  selectedId: null,
  dialog: null,
  theme: read(STORAGE.theme, "system", (r) => (r === "light" || r === "dark" ? r : "system")),
  layout: read(STORAGE.layout, "split", (r) => (r === "stream" ? "stream" : "split")),
  density: read(STORAGE.density, "cozy", (r) => (r === "compact" ? "compact" : "cozy")),
  sidebarOpen: false,
  mobilePane: "list",
  collapsed: read(STORAGE.collapsed, new Set<string>(), (r) => new Set(JSON.parse(r) as string[])),
})

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "setView":
      if (sameView(state.view, action.view)) return { ...state, sidebarOpen: false, mobilePane: "list" }
      return { ...state, view: action.view, selectedId: null, search: "", searchOpen: false, sidebarOpen: false, mobilePane: "list" }
    case "setUnreadOnly":
      return { ...state, unreadOnly: action.unreadOnly, selectedId: null }
    case "setSearch":
      return { ...state, search: action.search, selectedId: null }
    case "setSearchOpen":
      return { ...state, searchOpen: action.open, search: action.open ? state.search : "" }
    case "select":
      return { ...state, selectedId: action.id, mobilePane: action.id ? "article" : "list" }
    case "openDialog":
      return { ...state, dialog: action.dialog }
    case "closeDialog":
      return { ...state, dialog: null }
    case "setTheme":
      return { ...state, theme: action.theme }
    case "setDensity":
      return { ...state, density: action.density }
    case "setLayout":
      // Leaving the article pane behind should not strand the mobile view on it.
      return { ...state, layout: action.layout, mobilePane: action.layout === "stream" ? "list" : state.mobilePane }
    case "setSidebarOpen":
      return { ...state, sidebarOpen: action.open }
    case "setMobilePane":
      return { ...state, mobilePane: action.pane }
    case "toggleCollapsed": {
      const next = new Set(state.collapsed)
      if (next.has(action.id)) next.delete(action.id)
      else next.add(action.id)
      return { ...state, collapsed: next }
    }
  }
}

const StoreContext = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null)

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  // Persisted preferences.
  useEffect(() => write(STORAGE.unreadOnly, String(state.unreadOnly)), [state.unreadOnly])
  useEffect(() => write(STORAGE.collapsed, JSON.stringify([...state.collapsed])), [state.collapsed])
  useEffect(() => write(STORAGE.layout, state.layout), [state.layout])
  useEffect(() => write(STORAGE.density, state.density), [state.density])
  useEffect(() => {
    write(STORAGE.theme, state.theme)
    const root = document.documentElement
    if (state.theme === "system") delete root.dataset.theme
    else root.dataset.theme = state.theme
  }, [state.theme])

  // Two-way hash routing for the current view.
  useEffect(() => {
    const target = viewToHash(state.view)
    if (window.location.hash !== target) history.replaceState(null, "", target)
  }, [state.view])
  useEffect(() => {
    const onHash = () => dispatch({ type: "setView", view: hashToView(window.location.hash) })
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export const useStore = () => {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used within StoreProvider")
  return ctx
}
