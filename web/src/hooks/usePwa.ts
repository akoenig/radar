import { useEffect, useState } from "react"

interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: window-controls-overlay)").matches ||
  // iOS Safari, which has no beforeinstallprompt at all.
  (navigator as unknown as { standalone?: boolean }).standalone === true

/**
 * Registers the service worker and exposes the browser's install prompt, so the
 * app can offer installation rather than relying on a hidden browser menu.
 */
export const usePwa = () => {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(standalone)

  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator)) return
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined)
    // Registering after load keeps the worker off the critical path.
    if (document.readyState === "complete") register()
    else window.addEventListener("load", register, { once: true })
  }, [])

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const install = async () => {
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice
    setPrompt(null)
  }

  return { canInstall: prompt !== null && !installed, installed, install }
}
