import { Layer, type Redacted } from "effect"
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { NodeHttpServer } from "@effect/platform-node"
import { createServer } from "node:http"
import { McpHttpLive } from "../mcp/McpHttp.js"
import { ReaderApi } from "./Api.js"
import { CategoriesHandlersLive } from "./CategoriesHandlers.js"
import { EntriesHandlersLive } from "./EntriesHandlers.js"
import { FeedsHandlersLive } from "./FeedsHandlers.js"
import { SystemHandlersLive } from "./SystemHandlers.js"

export interface HttpServerOptions {
  readonly host: string
  readonly port: number
  /** Directory holding the built web client; served with SPA fallback. */
  readonly staticDir: string
  /** Bearer token guarding the MCP endpoint; when null the endpoint is not served. */
  readonly mcpToken: Redacted.Redacted<string> | null
}

const ApiLive = HttpApiBuilder.layer(ReaderApi, { openapiPath: "/api/openapi.json" }).pipe(
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
export const HttpServerLive = (options: HttpServerOptions) =>
  HttpRouter.serve(
    Layer.mergeAll(
      ApiLive,
      ApiFallback,
      McpHttpLive(options.mcpToken),
      HttpStaticServer.layer({
        root: options.staticDir,
        spa: true,
        cacheControl: "public, max-age=0, must-revalidate",
        // Not in the default table, and browsers refuse a manifest served as octet-stream.
        mimeTypes: { webmanifest: "application/manifest+json" },
      }),
    ),
  ).pipe(Layer.provide(NodeHttpServer.layer(createServer, { host: options.host, port: options.port })))
