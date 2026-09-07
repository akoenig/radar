import { Effect } from "effect"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { adoptLegacyDatabase } from "../src/infrastructure/LegacyDatabase.js"

const readOrNull = (path: string) => readFile(path, "utf8").catch(() => null)

describe("renaming the product", () => {
  it("adopts an existing reader.db, sidecars included", async () => {
    const dir = await mkdtemp(join(tmpdir(), "radar-"))
    await writeFile(join(dir, "reader.db"), "db")
    await writeFile(join(dir, "reader.db-wal"), "wal")

    await Effect.runPromise(adoptLegacyDatabase(join(dir, "radar.db")))

    expect(await readOrNull(join(dir, "radar.db"))).toBe("db")
    expect(await readOrNull(join(dir, "radar.db-wal"))).toBe("wal")
    expect(await readOrNull(join(dir, "reader.db"))).toBeNull()
  })

  it("never overwrites a database that is already there", async () => {
    const dir = await mkdtemp(join(tmpdir(), "radar-"))
    await writeFile(join(dir, "reader.db"), "old")
    await writeFile(join(dir, "radar.db"), "current")

    await Effect.runPromise(adoptLegacyDatabase(join(dir, "radar.db")))

    expect(await readOrNull(join(dir, "radar.db"))).toBe("current")
    expect(await readOrNull(join(dir, "reader.db"))).toBe("old")
  })

  it("does nothing on a fresh instance", async () => {
    const dir = await mkdtemp(join(tmpdir(), "radar-"))
    await Effect.runPromise(adoptLegacyDatabase(join(dir, "radar.db")))
    expect(await readOrNull(join(dir, "radar.db"))).toBeNull()
  })
})
