import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { choosePort, fileStore, isFree, PREFERRED_PORT, type PortStore } from "../src/port.js"

const memory = (initial: number | null = null) => {
  const store = {
    saved: initial,
    read: () => store.saved,
    write: (port: number) => {
      store.saved = port
    },
  }
  return store satisfies PortStore & { saved: number | null }
}

const allFree = async () => true
const allTaken = async () => false

describe("choosing a port", () => {
  it("keeps last launch's port, so preferences and caches survive", async () => {
    expect(await choosePort(memory(8790), allFree)).toBe(8790)
  })

  it("takes the preferred port on a first launch and remembers it", async () => {
    const store = memory()
    expect(await choosePort(store, allFree)).toBe(PREFERRED_PORT)
    expect(store.saved).toBe(PREFERRED_PORT)
  })

  it("moves on when the remembered port is taken, and remembers the new one", async () => {
    const store = memory(8790)
    const free = async (port: number) => port !== 8790 && port !== PREFERRED_PORT
    expect(await choosePort(store, free)).toBe(PREFERRED_PORT + 1)
    expect(store.saved).toBe(PREFERRED_PORT + 1)
  })

  it("falls back to any free port rather than refusing to start", async () => {
    const store = memory(8790)
    expect(await choosePort(store, allTaken)).toBe(0)
    // Nothing was chosen, so nothing should be remembered.
    expect(store.saved).toBe(8790)
  })
})

describe("the remembered port on disk", () => {
  it("round-trips, and ignores a file that is not a port", () => {
    const dir = mkdtempSync(join(tmpdir(), "radar-port-"))
    const store = fileStore(join(dir, "port"))

    expect(store.read()).toBeNull()
    store.write(8791)
    expect(readFileSync(join(dir, "port"), "utf8")).toBe("8791")
    expect(store.read()).toBe(8791)

    writeFileSync(join(dir, "port"), "not a port")
    expect(store.read()).toBeNull()
    writeFileSync(join(dir, "port"), "99999")
    expect(store.read()).toBeNull()
  })

  it("reports a port in use as taken", async () => {
    const held = createServer()
    await new Promise<void>((resolve) => held.listen(0, "127.0.0.1", resolve))
    const port = (held.address() as { port: number }).port
    expect(await isFree(port)).toBe(false)
    held.close()
  })
})
