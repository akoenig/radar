import { describe, expect, it } from "vitest"
import { parseResults } from "../src/adapters/outbound/directory/FeedlyDirectory.js"
import { directoryId, directoryUrl } from "../src/domain/model/Catalog.js"

/** Trimmed from a live answer, so the shape is the real one. */
const answer = {
  results: [
    {
      feedId: "feed/https://swift.org/atom.xml",
      title: "Swift.org",
      description: "A general-purpose programming language.",
      website: "https://swift.org/",
      iconUrl: "http://storage.googleapis.com/site-assets/icon-15411a6fcb7",
      subscribers: 5358,
      velocity: 0.7,
      lastUpdated: 1788552960000,
      topics: ["ios", "programming"],
      valid: true,
    },
  ],
  success: true,
}

describe("directory results", () => {
  it("maps a result onto a catalog entry", () => {
    const [feed] = parseResults(answer)
    expect(feed).toMatchObject({
      title: "Swift.org",
      url: "https://swift.org/atom.xml",
      siteUrl: "https://swift.org/",
      description: "A general-purpose programming language.",
    })
    expect(feed?.reach).toEqual({
      // Served over plain http, which a page on https would refuse to load.
      iconUrl: "https://storage.googleapis.com/site-assets/icon-15411a6fcb7",
      subscribers: 5358,
      postsPerWeek: 0.7,
      lastPublishedAt: 1788552960000,
      topics: ["ios", "programming"],
    })
  })

  it("survives an unversioned API changing under it", () => {
    // A changed or missing field should cost one result, never the search.
    expect(parseResults({ results: [{ feedId: "feed/https://a.example/rss" }, { feedId: "not-a-url" }, null, 7] })).toHaveLength(1)
    expect(parseResults({ results: [{ feedId: "feed/https://a.example/rss", valid: false }] })).toHaveLength(0)
    expect(parseResults({})).toEqual([])
    expect(parseResults(null)).toEqual([])
    expect(parseResults("nonsense")).toEqual([])
  })

  it("falls back to the origin when a result names no website", () => {
    const [feed] = parseResults({ results: [{ feedId: "feed/https://a.example/deep/rss.xml", title: "A" }] })
    expect(feed?.siteUrl).toBe("https://a.example")
  })

  it("keeps a result addressable without the server remembering the search", () => {
    const url = "https://a.example/rss?tag=x/y"
    const id = directoryId(url)
    // Path-safe, so it survives a URL path parameter unescaped.
    expect(id).not.toMatch(/[/+=]/)
    expect(directoryUrl(id)).toBe(url)
    // A bundled slug is not a directory id and must not decode to one.
    expect(directoryUrl("hacker-news")).toBeNull()
  })
})
