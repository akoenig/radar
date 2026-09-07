import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Effect, Layer, Redacted } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { makeReaderMcpServer } from "./ReaderMcpServer.js"

export const MCP_PATH = "/mcp"

/**
 * How a caller at /mcp is authenticated.
 *
 * "router": Cloud in a Bottle has already done it. Every route of a non-public
 * app requires the owner's session or an API token (`bottle tokens create`),
 * and the router enforces that before the request reaches us — so checking a
 * second token here would only fight over the one Authorization header, which
 * by then carries the router's token and not ours.
 *
 * "token": we are the only gate, for when /mcp has been listed in
 * `public_paths` and the router waves everything through.
 */
export type McpAccess =
  | { readonly _tag: "Disabled" }
  | { readonly _tag: "Router" }
  | { readonly _tag: "Token"; readonly token: Redacted.Redacted<string> }

/**
 * Picks the mode from configuration. "router" needs no token of our own — the
 * platform is the gate — so it stays on whether or not a secret was granted.
 */
export const mcpAccess = (mode: "router" | "token", token: Redacted.Redacted<string> | null): McpAccess =>
  mode === "router" ? { _tag: "Router" } : token === null ? { _tag: "Disabled" } : { _tag: "Token", token }

const disabled = HttpServerResponse.jsonUnsafe(
  {
    error: "mcp_disabled",
    message: "The MCP endpoint is not enabled on this instance. Set MCP_TOKEN and restart.",
  },
  { status: 404 },
)

const unauthorized = HttpServerResponse.jsonUnsafe(
  { error: "unauthorized", message: "Send Authorization: Bearer <MCP_TOKEN>." },
  { status: 401, headers: { "www-authenticate": 'Bearer realm="reader"' } },
)

/** Constant-time compare, so a wrong token cannot be found one byte at a time. */
const tokenMatches = (presented: string, expected: string): boolean => {
  if (presented.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < presented.length; i++) diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

const bearer = (header: string | undefined): string | null => {
  if (header === undefined) return null
  const [scheme, ...rest] = header.split(" ")
  return scheme?.toLowerCase() === "bearer" && rest.length > 0 ? rest.join(" ") : null
}

/**
 * Serves the reader's tools over MCP's Streamable HTTP transport.
 *
 * Stateless: a fresh server and transport per request, since every tool is a
 * single call with no subscriptions to keep alive. That means no session table
 * to leak and no cross-request state to get wrong.
 *
 * Who authenticates the caller depends on the mode — see McpAccess. In the
 * default "token" mode there must be a token, because without one there is
 * nothing to authenticate with and no tools are served.
 *
 * The route is registered either way. Leaving it unregistered when disabled
 * does not make the path unreachable, it makes it *someone else's*: the static
 * server's single-page fallback answers any extensionless path that accepts
 * HTML, so a browser at /mcp was handed the reader itself, which then routed to
 * #/all. An API path answering with the app is worse than a plain refusal, so
 * this owns the path and says why it is closed.
 */
export const McpHttpLive = (access: McpAccess) =>
  HttpRouter.add(
    "*",
    MCP_PATH,
    Effect.gen(function* () {
      if (access._tag === "Disabled") return disabled

      const request = yield* HttpServerRequest.HttpServerRequest
      if (
        access._tag === "Token" &&
        !tokenMatches(bearer(request.headers["authorization"]) ?? "", Redacted.value(access.token))
      ) {
        return unauthorized
      }

      const server = yield* makeReaderMcpServer
      // enableJsonResponse: a tool call is one request and one reply, so a
      // buffered JSON body is both simpler and safe to hand on after the
      // transport is torn down. Left as SSE, the body would stream.
      const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
      const webRequest = yield* HttpServerRequest.toWeb(request)

      const response = yield* Effect.promise(async () => {
        try {
          await server.connect(transport)
          const raw = await transport.handleRequest(webRequest)
          // Read the body before closing: teardown kills the underlying stream,
          // and a half-written body leaves the client waiting.
          const body = await raw.arrayBuffer()
          const empty = body.byteLength === 0 || raw.status === 204 || raw.status === 304
          return new Response(empty ? null : body, { status: raw.status, headers: raw.headers })
        } finally {
          await server.close().catch(() => undefined)
        }
      })

      return HttpServerResponse.fromWeb(response)
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.as(
          Effect.logError("MCP request failed", cause),
          HttpServerResponse.jsonUnsafe({ error: "internal_error" }, { status: 500 }),
        ),
      ),
    ),
  ).pipe(Layer.provideMerge(Layer.effectDiscard(announce(access))))

const announce = (access: McpAccess) => {
  switch (access._tag) {
    case "Disabled":
      return Effect.logInfo(`MCP disabled at ${MCP_PATH}: grant READER_MCP_TOKEN or set MCP_TOKEN to enable it`)
    case "Token":
      return Effect.logInfo(`MCP listening on ${MCP_PATH}, authenticated by its own bearer token`)
    case "Router":
      return Effect.logWarning(
        `MCP listening on ${MCP_PATH}, trusting the platform to authenticate callers. ` +
          `${MCP_PATH} must NOT appear in public_paths — if it does, this endpoint is open to anyone.`,
      )
  }
}
