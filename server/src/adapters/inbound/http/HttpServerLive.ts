import { Effect, Layer } from "effect"
import { HttpRouter, HttpServer, HttpServerResponse, HttpStaticServer } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { NodeHttpServer } from "@effect/platform-node"
import { createServer } from "node:http"
import { McpHttpLive, type McpAccess } from "../mcp/McpHttp.js"
import { RadarApi } from "./Api.js"
import { CategoriesHandlersLive } from "./CategoriesHandlers.js"
import { EntriesHandlersLive } from "./EntriesHandlers.js"
import { FeedsHandlersLive } from "./FeedsHandlers.js"
import { SystemHandlersLive } from "./SystemHandlers.js"

export interface HttpServerOptions {
  readonly host: string
  readonly port: number
  /** Directory holding the built web client; served with SPA fallback. */
  readonly staticDir: string
  /** How the MCP endpoint authenticates its callers, if it serves them at all. */
  readonly mcpAccess: McpAccess
  /**
   * Called with the address once the socket is bound. An embedder — the
   * desktop app — asks for port 0 so the operating system picks a free port,
   * and this is how it learns which one it got.
   */
  readonly onListening?: (address: string) => void
}

const ApiLive = HttpApiBuilder.layer(RadarApi, { openapiPath: "/api/openapi.json" }).pipe(
  Layer.provide([FeedsHandlersLive, CategoriesHandlersLive, EntriesHandlersLive, SystemHandlersLive]),
)

/** Unknown API paths answer with JSON rather than falling through to the SPA shell. */
const ApiFallback = HttpRouter.add(
  "*",
  "/api/*",
  HttpServerResponse.jsonUnsafe({ _tag: "NotFound", message: "No such endpoint" }, { status: 404 }),
)

/**
 * The HTTP driving adapter: API routes plus the static client, bound to a
 * Node server. Requires the application services.
 */
export const HttpServerLive = (options: HttpServerOptions) => {
  const report = options.onListening
  return HttpRouter.serve(
    Layer.mergeAll(
      ApiLive,
      ApiFallback,
      McpHttpLive(options.mcpAccess),
      report === undefined
        ? Layer.empty
        : Layer.effectDiscard(HttpServer.addressFormattedWith((address) => Effect.sync(() => report(address)))),
      HttpStaticServer.layer({
        root: options.staticDir,
        spa: true,
        cacheControl: "public, max-age=0, must-revalidate",
        // Not in the default table, and browsers refuse a manifest served as octet-stream.
        mimeTypes: { webmanifest: "application/manifest+json" },
      }),
    ),
  ).pipe(Layer.provide(NodeHttpServer.layer(createServer, { host: options.host, port: options.port })))
}
