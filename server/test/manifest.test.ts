import { Effect } from "effect"
import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { MCP_PATH } from "../src/adapters/inbound/mcp/McpHttp.js"
import { isPublic, publicPaths, readManifest } from "../src/infrastructure/Manifest.js"

describe("public_paths", () => {
  it("reads the array out of the routing section", () => {
    expect(
      publicPaths(`[app]\nname = "radar"\n\n[routing]\nhealth_check = "/api/health"\npublic_paths = ["/mcp", "/rss"]\n`),
    ).toEqual(["/mcp", "/rss"])
  })

  it("ignores a commented-out example", () => {
    expect(publicPaths(`[routing]\n# public_paths = ["/mcp"]\n`)).toEqual([])
    expect(publicPaths(`[routing]\npublic_paths = ["/rss"]  # not ["/mcp"]\n`)).toEqual(["/rss"])
  })

  it("stops at the next section, so a later array is not mistaken for one", () => {
    expect(publicPaths(`[routing]\nhealth_check = "/api/health"\n\n[[services.v2.consumes]]\ngrants = ["/mcp"]\n`)).toEqual(
      [],
    )
  })

  it("treats entries as prefixes, the way the router does", () => {
    expect(isPublic(["/mcp"], "/mcp")).toBe(true)
    expect(isPublic(["/"], "/mcp")).toBe(true)
    expect(isPublic(["/mcp/"], "/mcp")).toBe(true)
    expect(isPublic(["/rss", "/api"], "/mcp")).toBe(false)
    expect(isPublic([], "/mcp")).toBe(false)
  })
})

describe("this repository's manifest", () => {
  it("keeps /mcp behind the platform, which is what router mode relies on", async () => {
    const manifest = await Effect.runPromise(readManifest)
    expect(manifest).not.toBeNull()
    expect(isPublic(publicPaths(manifest ?? ""), MCP_PATH)).toBe(false)
  })

  it("allows mobile installers to fetch metadata and icons without exposing reader data", async () => {
    const manifest = await Effect.runPromise(readManifest)
    expect(manifest).not.toBeNull()
    const paths = publicPaths(manifest ?? "")
    const webManifest = JSON.parse(
      await readFile(new URL("../../web/public/manifest.webmanifest", import.meta.url), "utf8"),
    ) as { icons: Array<{ src: string }>; display: string }

    expect(webManifest.display).toBe("standalone")
    for (const path of ["/manifest.webmanifest", "/apple-touch-icon.png", "/favicon.svg", ...webManifest.icons.map((icon) => icon.src)]) {
      expect(isPublic(paths, path), path).toBe(true)
      // A missing asset would fall through to the HTML shell instead of an icon.
      expect((await readFile(new URL(`../../web/public${path}`, import.meta.url))).length).toBeGreaterThan(0)
    }
    for (const path of ["/", "/index.html", "/api/entries", "/api/feeds", "/api/opml", MCP_PATH]) {
      expect(isPublic(paths, path), path).toBe(false)
    }
  })
})
