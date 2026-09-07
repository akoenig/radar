import { createServer } from "node:net"
import { readFileSync, writeFileSync } from "node:fs"

/**
 * Picking the port the local server listens on.
 *
 * It would be easier to bind port 0 and take whatever the operating system
 * gives, but the port is part of the origin, and the origin is what localStorage
 * and the service worker cache belong to. A fresh port every launch would
 * silently reset the theme, the layout and everything else the reader
 * remembers. So: reuse last time's port, and only move when it is taken.
 */
export const PREFERRED_PORT = 8787

/** How many ports past the preferred one to try before giving up on stability. */
const RANGE = 16

export const isFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = createServer()
    probe.once("error", () => resolve(false))
    probe.once("listening", () => probe.close(() => resolve(true)))
    probe.listen(port, "127.0.0.1")
  })

export interface PortStore {
  readonly read: () => number | null
  readonly write: (port: number) => void
}

/** The remembered port lives in a file beside the database. */
export const fileStore = (path: string): PortStore => ({
  read: () => {
    try {
      const port = Number.parseInt(readFileSync(path, "utf8").trim(), 10)
      return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
    } catch {
      // First launch, so there is nothing to remember yet.
      return null
    }
  },
  write: (port) => {
    try {
      writeFileSync(path, String(port))
    } catch {
      // Not being able to remember costs preferences on the next launch, which
      // is not worth refusing to start over.
    }
  },
})

/**
 * The remembered port if it is still free, else the first free one nearby.
 * Zero means every candidate was taken and the caller should let the operating
 * system choose — at the cost of this launch starting with fresh preferences.
 */
export const choosePort = async (
  store: PortStore,
  free: (port: number) => Promise<boolean> = isFree,
): Promise<number> => {
  const remembered = store.read()
  const candidates = [
    ...(remembered === null ? [] : [remembered]),
    ...(remembered === PREFERRED_PORT ? [] : [PREFERRED_PORT]),
    ...Array.from({ length: RANGE }, (_, i) => PREFERRED_PORT + 1 + i),
  ]
  for (const candidate of candidates) {
    if (await free(candidate)) {
      if (candidate !== remembered) store.write(candidate)
      return candidate
    }
  }
  return 0
}
