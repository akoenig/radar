import { useEffect, useRef, type ReactNode } from "react"
import { CloseIcon } from "./Icons"

interface DialogProps {
  readonly title: string
  readonly subtitle?: string
  readonly onClose: () => void
  readonly children: ReactNode
  readonly wide?: boolean
}

/**
 * Minimal modal: scrim, Escape to close, focus moved inside on open and
 * restored on close.
 */
export const Dialog = ({ title, subtitle, onClose, children, wide }: DialogProps) => {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>("input, select, textarea, button:not(.dialog-close)")
    ;(first ?? panel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        onClose()
      }
      // Rudimentary focus trap.
      if (e.key === "Tab" && panel.current) {
        const focusable = [...panel.current.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(
          (el) => !el.hasAttribute("disabled"),
        )
        const firstEl = focusable[0]
        const lastEl = focusable[focusable.length - 1]
        if (!firstEl || !lastEl) return
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? " dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}>
        <header className="dialog-header">
          <div>
            <h2 className="dialog-title">{title}</h2>
            {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  )
}
