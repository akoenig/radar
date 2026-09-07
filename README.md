# Reader

A modern, keyboard-first feed reader in the spirit of Google Reader. Single user, no
accounts: it is meant to run behind the owner login of a
[Cloud in a Bottle](https://cloudinabottle.org) instance (or any private reverse proxy).

- Subscribe by pasting a site or feed URL (RSS 2.0, Atom, RSS 1.0 and JSON Feed, with
  autodiscovery from web pages), or browse **Discover**, a curated catalog of feeds
  grouped by topic.
- Folders, unread counts, read/unread, "read later", search, OPML import/export.
- Background refresh with conditional requests (ETag / Last-Modified).
- Two layouts, switchable with `1` (expanded: one column, entries open in place) and
  `2` (split: list beside a reading pane), plus a compact row density on `c`. Both
  choices are remembered.
- Everything reachable from the keyboard: `j`/`k`, `s`, `m`, `v`, `a`, `/`, `g a`, `?` …
- Compact, keyboard-first interface in one sans typeface, with light and dark themes
  built on cool neutrals and a blue accent.
- Exposes the whole reader to agents over **MCP** (13 tools), off by default.
- Installable as a PWA, and readable offline: the shell is precached and feeds and
  articles you have already opened are served from cache when the network is gone.
- Responsive from a 320px phone to a wide desktop, with touch-sized targets and
  safe-area handling when installed.

## Layout

```
server/   Effect v4 backend, hexagonal architecture
  src/domain        entities, value objects, errors and *ports* (interfaces only)
  src/application   use cases (SubscriptionService, RefreshService, EntryService, …)
  src/adapters
    inbound/http    HttpApi definition + handlers (driving adapter)
    inbound/scheduler  periodic refresh (driving adapter)
    inbound/mcp     MCP tools over Streamable HTTP (driving adapter)
    outbound/sqlite repositories over node:sqlite (driven adapter)
    outbound/feed   HTTP fetcher, parser, autodiscovery (driven adapter)
    outbound/catalog  curated Discover catalog (driven adapter)
  outbound/opml   OPML codec (driven adapter)
    outbound/system id generation (driven adapter)
  src/infrastructure  composition root: config + layer wiring
  test/             in-memory adapters + application/adapter tests
web/      Vite + React client
```

Every port is an Effect `Context.Service`; adapters are `Layer`s. The application layer
depends only on ports, and `infrastructure/AppLayer.ts` is the single place that decides
which adapter satisfies which port. Tests swap in `test/support/InMemoryAdapters.ts`.

## Develop

```sh
pnpm install
pnpm dev            # server on :8080 (tsx watch) + Vite on :5173 proxying /api
pnpm test           # server unit + adapter tests (vitest)
pnpm typecheck
```

## Build & run

```sh
pnpm build          # web/dist + server/dist
pnpm start          # serves API and the built client on $PORT (default 8080)
```

Configuration (environment variables):

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Listen address |
| `DATA_DIR` | `$BOTTLE_APP_DATA_DIR` or `./data` | Persistent directory |
| `DATABASE_PATH` | `$DATA_DIR/reader.db` | SQLite file |
| `STATIC_DIR` | `../web/dist` | Built client to serve |
| `REFRESH_INTERVAL_MINUTES` | `15` | Background refresh cadence |
| `MCP_TOKEN` | — | Bearer token for `/mcp`, for local runs. On a deployed instance the granted `READER_MCP_TOKEN` secret wins. Neither set means MCP is off. |

## Deploy to Cloud in a Bottle

`cloudinabottle.toml` and the multi-stage `Dockerfile` are ready to go. The CLI deploys
from a git repo, so push this repository somewhere your instance can reach first:

```sh
bottle instance login          # interactive, one time
bottle app deploy <git-url> --name reader --wait
bottle app logs reader --follow
```

The app listens on `8080`, stores its database under `BOTTLE_APP_DATA_DIR`, exposes
`/api/health` for the router's health check, and relies on the router's owner
authentication (no routes are public).

## API

OpenAPI is served at `/api/openapi.json`. Main endpoints:

- `GET/POST /api/feeds`, `PATCH/DELETE /api/feeds/:id`, `POST /api/feeds/:id/refresh`
- `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id`
- `GET /api/entries?feed=&category=&unread=&saved=&q=&cursor=`, `GET /api/entries/:id`
- `POST /api/entries/mark`, `POST /api/entries/mark-all`, `PUT /api/entries/:id/saved`
- `GET /api/stats`, `POST /api/refresh`, `GET /api/discover?url=`, `GET|POST /api/opml`
- `GET /api/catalog` — the Discover directory, each entry flagged if already subscribed

## MCP

The reader speaks the [Model Context Protocol](https://modelcontextprotocol.io) at `/mcp`
(Streamable HTTP), so an agent can read and triage your subscriptions. It is a driving
adapter over the same application services as the HTTP API — no separate data path.

Tools: `list_feeds`, `list_entries`, `get_entry`, `get_stats`, `list_categories`,
`mark_read`, `mark_all_read`, `set_saved`, `subscribe`, `unsubscribe`, `discover_feeds`,
`browse_catalog`, `refresh`. `get_entry` returns article text with markup stripped, which
is what an agent actually wants to read.

Locally:

```sh
MCP_TOKEN=$(openssl rand -hex 32) pnpm start
```

On a Cloud in a Bottle instance the token comes from the secrets service instead.
`cloudinabottle.toml` asks the owner to grant `READER_MCP_TOKEN`:

```toml
[[services.v2.consumes]]
service = "github.com/imbue-openhost/openhost/services/secrets"
shortname = "secrets"
version = ">=0.1.0"
grants = [{key = "READER_MCP_TOKEN"}]
```

A grant only says the app *may* read that key — nothing is injected into the
environment — so the server fetches it at startup through
`$BOTTLE_ROUTER_URL/api/services/v2/call/secrets/get` using `$BOTTLE_APP_TOKEN`, and
uses it as the MCP token. Put the value in the secrets app under that name and restart.
The granted secret wins over `MCP_TOKEN`; the env var remains for local runs, where there
is no secrets service.

Then point a client at `https://<your-instance>/mcp` with the token as
`Authorization: Bearer <token>`.

**Security.** The endpoint is served only when `MCP_TOKEN` is set — with no token there is
nothing to authenticate with, so the route is not registered at all rather than served
open. Tokens are compared in constant time.

Cloud in a Bottle keeps non-public paths behind the owner login, which an MCP client
cannot carry, so reaching `/mcp` from outside the instance means adding it to
`public_paths` in `cloudinabottle.toml`:

```toml
[routing]
health_check = "/api/health"
public_paths = ["/mcp"]   # only with MCP_TOKEN set — this bypasses the owner login
```

That is deliberately not enabled by default: it moves `/mcp` out from behind the router's
authentication, leaving `MCP_TOKEN` as the only thing in front of your reader.

## Notes

- **Proxies.** Feed fetching honours `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY`. On a
  host whose only egress is a proxy, this is what keeps refreshes from timing out.
- **Docker.** The image is Debian-based on purpose: `effect` depends on `msgpackr`,
  whose optional native accelerator only ships glibc prebuilds, so an Alpine build
  would try to compile it from source and fail.
- **Build resources.** Building needs far more memory than running: `pnpm install`
  peaks around 604 MB and `tsc` around 584 MB, against roughly 185 MB for the
  running server. `build_memory_mb` in `cloudinabottle.toml` defaults to
  `memory_mb`, so it is set explicitly; too low a value shows up as a build killed
  with exit status 137.
