import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Effect, Layer, Redacted } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { makeReaderMcpServer } from "./ReaderMcpServer.js"

export const MCP_PATH = "/mcp"

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
 * The endpoint exists only when a token is configured. Cloud in a Bottle keeps
 * non-public paths behind the owner login, but an MCP client cannot carry that
 * session, so reaching this route from outside means listing it in
 * `public_paths` — at which point this token is the only thing in front of the
 * reader. Absent a token there is nothing to authenticate with, so the route is
 * not registered at all rather than served open.
 */
export const McpHttpLive = (token: Redacted.Redacted<string> | null) =>
  token === null
    ? Layer.effectDiscard(Effect.logInfo("MCP endpoint disabled: set MCP_TOKEN to enable it"))
    : HttpRouter.add(
        "*",
        MCP_PATH,
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          if (!tokenMatches(bearer(request.headers["authorization"]) ?? "", Redacted.value(token))) {
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
              // Read the body before closing: teardown kills the underlying
              // stream, and a half-written body leaves the client waiting.
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
      ).pipe(Layer.provideMerge(Layer.effectDiscard(Effect.logInfo(`MCP endpoint listening on ${MCP_PATH}`))))
