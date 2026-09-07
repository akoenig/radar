import { Effect, Layer, Option, Redacted } from "effect"
import { describe, expect, it } from "vitest"
import { extractSecret, Secrets, type SecretsShape } from "../src/adapters/outbound/secrets/BottleSecrets.js"
import { MCP_TOKEN_SECRET, parseMcpAuth, resolveMcpToken } from "../src/infrastructure/Config.js"

const withSecrets = (get: SecretsShape["get"]) => Layer.succeed(Secrets, { get })

const granted = (value: string) =>
  withSecrets((key) =>
    Effect.succeed(key === MCP_TOKEN_SECRET ? Option.some(Redacted.make(value)) : Option.none()),
  )

const nothing = withSecrets(() => Effect.succeed(Option.none<Redacted.Redacted<string>>()))

const run = <A>(effect: Effect.Effect<A, never, Secrets>, layer: Layer.Layer<Secrets>) =>
  Effect.runPromise(Effect.provide(effect, layer))

describe("secret extraction", () => {
  // The service's envelope is not pinned down by the docs, so accept the
  // plausible shapes rather than guessing one and failing silently on another.
  it("finds the key at the top level or one level down", () => {
    expect(extractSecret({ READER_MCP_TOKEN: "abc" }, "READER_MCP_TOKEN")).toBe("abc")
    expect(extractSecret({ values: { READER_MCP_TOKEN: "abc" } }, "READER_MCP_TOKEN")).toBe("abc")
    expect(extractSecret({ secrets: { READER_MCP_TOKEN: "abc" } }, "READER_MCP_TOKEN")).toBe("abc")
    expect(extractSecret({ data: { READER_MCP_TOKEN: "abc" } }, "READER_MCP_TOKEN")).toBe("abc")
  })

  it("reports nothing rather than a wrong value", () => {
    expect(extractSecret({ OTHER: "abc" }, "READER_MCP_TOKEN")).toBeNull()
    expect(extractSecret({ READER_MCP_TOKEN: 42 }, "READER_MCP_TOKEN")).toBeNull()
    expect(extractSecret(null, "READER_MCP_TOKEN")).toBeNull()
    expect(extractSecret("not json", "READER_MCP_TOKEN")).toBeNull()
  })
})

describe("MCP token resolution", () => {
  it("prefers the granted secret over the environment", async () => {
    const token = await run(resolveMcpToken(Redacted.make("from-env")), granted("from-secrets"))
    expect(token && Redacted.value(token)).toBe("from-secrets")
  })

  it("falls back to MCP_TOKEN when nothing is granted", async () => {
    const token = await run(resolveMcpToken(Redacted.make("from-env")), nothing)
    expect(token && Redacted.value(token)).toBe("from-env")
  })

  it("is null when neither is present, which leaves MCP disabled", async () => {
    expect(await run(resolveMcpToken(null), nothing)).toBeNull()
  })
})

describe("MCP auth mode", () => {
  it("guards itself unless the platform is named explicitly", () => {
    expect(parseMcpAuth("")).toBe("token")
    // A typo must not silently drop the check.
    expect(parseMcpAuth("rooter")).toBe("token")
    expect(parseMcpAuth("none")).toBe("token")
  })

  it("hands authentication to the platform on request", () => {
    expect(parseMcpAuth("router")).toBe("router")
    expect(parseMcpAuth(" Router ")).toBe("router")
  })
})
