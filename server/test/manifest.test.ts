import { Effect } from "effect"
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
})
