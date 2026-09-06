import { useEffect, useState } from "react"

/** Tracks connectivity so the UI can explain itself instead of just failing. */
export const useOnline = () => {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener("online", up)
    window.addEventListener("offline", down)
    return () => {
      window.removeEventListener("online", up)
      window.removeEventListener("offline", down)
    }
  }, [])
  return online
}
