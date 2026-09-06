import { useEffect, useRef } from "react"

export interface Binding {
  /** Key descriptors like "j", "shift+a", "g a" (chord), "escape", "/" */
  readonly keys: ReadonlyArray<string>
  readonly run: (event: KeyboardEvent) => void
  /** Fire even when focus is in a text field. */
  readonly inInputs?: boolean
}

const CHORD_TIMEOUT = 900

const isEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
}

export const describeKey = (event: KeyboardEvent): string => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase()
  const parts: Array<string> = []
  if (event.ctrlKey) parts.push("ctrl")
  if (event.metaKey) parts.push("meta")
  if (event.altKey) parts.push("alt")
  if (event.shiftKey && event.key.length > 1) parts.push("shift")
  // Letters carry shift through their case ("A" vs "a"); normalize to "shift+a".
  if (event.shiftKey && event.key.length === 1 && /[a-z]/i.test(event.key)) parts.push("shift")
  parts.push(key === " " ? "space" : key)
  return parts.join("+")
}

/**
 * Global keyboard dispatcher with two-key chords ("g a"). Bindings are read
 * through a ref so callers can pass fresh closures every render.
 */
export const useKeyboard = (bindings: ReadonlyArray<Binding>, enabled = true) => {
  const ref = useRef(bindings)
  ref.current = bindings
  const pending = useRef<{ key: string; at: number } | null>(null)

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const described = describeKey(event)
      // Some layouts and automation tools report "?" as Shift+"/"; accept both spellings.
      const shifted = event.shiftKey && event.key.length === 1 && !described.startsWith("shift+") ? `shift+${described}` : null
      const editable = isEditable(event.target)
      const now = Date.now()
      const chord = pending.current && now - pending.current.at < CHORD_TIMEOUT ? `${pending.current.key} ${described}` : null
      pending.current = null

      // Most specific spelling first: a chord, then the shifted form, then the plain key.
      for (const candidate of [chord, shifted, described]) {
        if (candidate === null) continue
        const binding = ref.current.find((b) => b.keys.includes(candidate) && (!editable || b.inInputs))
        if (binding) {
          event.preventDefault()
          binding.run(event)
          return
        }
      }
      // Remember a possible chord prefix.
      if (!editable && ref.current.some((b) => b.keys.some((k) => k.startsWith(`${described} `)))) {
        pending.current = { key: described, at: now }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}
