import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"

export interface ToastOptions {
  readonly tone?: "neutral" | "success" | "error"
  readonly action?: { readonly label: string; readonly onClick: () => void }
  readonly duration?: number
}

interface Toast extends ToastOptions {
  readonly id: number
  readonly message: string
}

const ToastContext = createContext<((message: string, options?: ToastOptions) => void) | null>(null)

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ReadonlyArray<Toast>>([])
  const counter = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = ++counter.current
      setToasts((all) => [...all.slice(-2), { id, message, ...options }])
      window.setTimeout(() => dismiss(id), options.duration ?? (options.action ? 6000 : 3500))
    },
    [dismiss],
  )

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone ?? "neutral"}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}
