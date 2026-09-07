<p align="center">
  <img src="docs/logo.png" width="112" alt="Radar logo">
</p>

<h1 align="center">Radar</h1>

<p align="center">
  <strong>A keyboard-first feed reader for one person.</strong><br>
  Run it on a server, or install it on your desktop. Same reader, same data model, one codebase.
</p>

<p align="center">
  <img alt="Effect v4" src="https://img.shields.io/badge/Effect-v4-1f2937?style=flat-square">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-1f2937?style=flat-square&logo=react&logoColor=61dafb">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-1f2937?style=flat-square&logo=typescript&logoColor=3178c6">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-1f2937?style=flat-square">
  <img alt="Desktop" src="https://img.shields.io/badge/Desktop-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-1f2937?style=flat-square">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-14%20tools-2563eb?style=flat-square">
</p>

<p align="center">
  <a href="#two-ways-to-run-it">Two ways to run it</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#keyboard">Keyboard</a> ·
  <a href="#discover">Discover</a> ·
  <a href="#agents-mcp">Agents</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#configuration">Configuration</a>
</p>

<br>

<p align="center">
  <img src="docs/screenshot.png" alt="Radar in split view: subscriptions on the left, entries with summaries in the middle, an article open on the right." width="100%">
</p>

<br>

Radar is what Google Reader would be if someone built it today: dense, quick, and driven
from the keyboard. It is single-user by design, with no accounts and no sign-in screen.
The backend is [Effect v4](https://effect.website) in a hexagonal architecture, which is
why a browser, a desktop window, an HTTP API and an MCP client all drive the same reader
without four implementations.

## Two ways to run it

|  | **Server** | **Desktop** |
| --- | --- | --- |
| **What it is** | Deployed behind a private reverse proxy, used in the browser or installed as a PWA | A local-first app for macOS, Windows and Linux |
| **Where the data lives** | On the server, in SQLite | On your machine, in SQLite |
| **Reach it from** | Every device you own | The machine it is installed on |
| **Authentication** | Your reverse proxy. Radar has none of its own | None needed, it listens on loopback only |
| **Agents (MCP)** | `https://<instance>/mcp`, authenticated by your platform | `http://127.0.0.1:8787/mcp`, with a token the app generates |
| **Start with** | `bottle app deploy` or the `Dockerfile` | `pnpm desktop:package` |

They are the same application: identical domain, use cases and adapters, differing only in
which composition root starts them and where the database file sits. The desktop app runs
the whole backend inside Electron's main process. SQLite comes from `node:sqlite`, part of
the runtime Electron already ships, so there is no native module to rebuild and no
separate server to install.

They do not sync with each other. Pick the one that matches how you read: one machine, or
all of them.

## Highlights

<table>
<tr>
<td width="50%" valign="top">

**Reads everything.**
RSS 2.0, Atom, RSS 1.0 and JSON Feed. Paste a site URL and autodiscovery finds the feed.
Background refresh sends conditional requests, so it asks a publisher *whether* there is
news instead of downloading the whole feed again.

</td>
<td width="50%" valign="top">

**Discover, properly.**
Live search over millions of feeds, with reader counts, posting cadence and an icon on
every result. It is the directory Feedly used to have. Preview the latest posts before you
subscribe.

</td>
</tr>
<tr>
<td valign="top">

**Built for the keyboard.**
`j`/`k` through entries, `s` to save, `m` to toggle read, `v` to open the original,
`g a`/`g s`/`g d` to jump around. On desktop each button carries its own shortcut, so you
learn them by using the app.

</td>
<td valign="top">

**Two layouts.**
Split view with a reading pane, or one expanded column. A compact row density. Light and
dark themes on cool neutrals with a blue accent. Radar remembers each of those choices.

</td>
</tr>
<tr>
<td valign="top">

**Installable and offline.**
A PWA with a hand-written service worker. It precaches the shell and keeps the feeds and
articles you have opened readable when the network is gone. Responsive from a 320px phone
to a wide desktop.

</td>
<td valign="top">

**Open to agents.**
Fourteen MCP tools over Streamable HTTP for listing, reading, triaging, subscribing and
searching the directory, all on the same application services the UI uses. Your platform's
token authenticates the caller, or Radar's own does.

</td>
</tr>
</table>

Also: folders, unread counts, read later, full-text search over what you have, OPML
import and export.

## Quick start

### Run it locally

```sh
pnpm install
pnpm dev            # API on :8080 (tsx watch) + Vite on :5173 proxying /api
```

Then open <http://localhost:5173>, press `a`, and paste a URL.

```sh
pnpm test           # server unit + adapter tests (vitest)
pnpm typecheck
pnpm build          # web/dist + server/dist
pnpm start          # serves the API and the built client on $PORT (default 8080)
```

### Install the desktop app

Grab an installer from [Releases](https://github.com/akoenig/radar/releases): `.dmg` for
macOS, `.exe` for Windows, `.AppImage` or `.deb` for Linux. GitHub Actions builds every
published release on all three platforms and attaches the installers to it.

Or build it yourself:

```sh
pnpm install
pnpm desktop                # build everything, then launch the Electron app
pnpm desktop:package        # installers in desktop/release for the current OS
```

Data lives in Electron's per-user directory: `~/Library/Application Support/Radar` on
macOS, `%APPDATA%\Radar` on Windows, `~/.config/Radar` on Linux. **File → Open data
folder** takes you there. **File → Copy MCP endpoint** puts the local URL and its token on
the clipboard, which is all a local agent needs.

Packaged builds are unsigned, so macOS asks you to confirm on first launch (right-click →
Open) and Windows shows a SmartScreen notice. Signing is configuration, not code: add
`mac.identity` and a `CSC_LINK` for Windows in `desktop/electron-builder.yml`, and the
matching secrets to the release workflow. The Apple side needs a paid Developer account
before notarization will work at all.

**Cutting a release.** Publish a GitHub release tagged `vX.Y.Z`, and
`.github/workflows/release.yml` typechecks, tests, builds on macOS, Windows and Linux, and
attaches the installers. The tag sets the version stamped into the app, so the download
names match the release. To try the pipeline without publishing anything, run the workflow
by hand. It uploads the installers as workflow artifacts instead.

### Run the image

```sh
docker build -t radar .
docker run -p 8080:8080 -v radar-data:/app/data radar
```

### Deploy to Cloud in a Bottle

`cloudinabottle.toml` and the multi-stage `Dockerfile` are ready. The CLI deploys from a
git repository, so push this one somewhere your instance can reach first:

```sh
bottle instance login                                # interactive, one time
bottle app deploy <git-url> --name radar --wait
bottle app logs radar --follow
```

Radar listens on `8080`, keeps its database under `BOTTLE_APP_DATA_DIR`, answers the
router's health check at `/api/health`, and relies on the router's owner authentication.
No path is public.

## Keyboard

Press `?` inside the app for the same list.

| Navigate | | Act | | Manage | |
| --- | --- | --- | --- | --- | --- |
| `j` `↓` | Next item | `m` | Toggle read | `c` | Compact rows |
| `k` `↑` | Previous item | `s` | Save for later | `1` | Expanded view |
| `space` | Scroll article, then next | `v` | Open original | `2` | Split view |
| `J` `]` | Next subscription | `A` | Mark all as read | `a` | Add subscription |
| `K` `[` | Previous subscription | `r` | Refresh feeds | `e` | Edit subscription |
| `g a` | All items | `u` | Unread only | `/` | Search |
| `g s` | Read later | | | `?` | Shortcuts |
| `g d` | Discover | | | `esc` | Close / clear |
| `o` `enter` | Focus the article | | | | |

## Discover

Search runs against `cloud.feedly.com/v3/search/feeds`, the index behind Feedly's own
search box. It answers with reader counts, posts per week and an icon, which is what lets
you judge a stranger's feed before subscribing. No account or key needed, because Feedly
leaves this endpoint open. It is also undocumented, so the adapter treats every failure as
expected. It caches results for fifteen minutes, a changed field costs one result rather
than the whole search, and when the directory cannot be reached at all a bundled catalog
of about forty feeds answers instead, and the client says so.

Two consequences worth knowing. Search terms leave your instance. Radar sends Feedly the
query and nothing else, no account, no cookie, no subscription list. And the directory is
someone else's service, so `FeedDirectory` is a port like any other. Swapping in a
different index, or one that never leaves the machine, is a change in the composition root
and nowhere else.

## Agents (MCP)

Radar speaks the [Model Context Protocol](https://modelcontextprotocol.io) at `/mcp`
(Streamable HTTP). It is a driving adapter over the same application services as the
HTTP API. No separate data path, no separate rules.

Tools: `list_feeds`, `list_entries`, `get_entry`, `get_stats`, `list_categories`,
`mark_read`, `mark_all_read`, `set_saved`, `subscribe`, `unsubscribe`, `discover_feeds`,
`browse_catalog`, `search_feeds`, `refresh`. `get_entry` returns article text with the
markup stripped, which is what an agent actually wants to read.

### Connecting

`MCP_AUTH` decides who authenticates the caller, and the right answer differs on and off
a Cloud in a Bottle instance.

**On an instance, let the platform do it (`MCP_AUTH=router`, what the image ships).**
Every route of a non-public app already requires the owner, and that means an API token
as much as a browser session. So an MCP client needs no login:

```sh
bottle tokens create --name radar-mcp --expiry-hours never
```

Point a client at `https://<your-instance>/mcp` with that token as
`Authorization: Bearer <token>`. `/mcp` stays out of `public_paths`, so it is never
exposed to the internet, and there is no second secret to manage.

In this mode Radar does not check a token of its own. It cannot. There is one
`Authorization` header, and by the time the request arrives it carries the router's token,
so a second check could only reject a caller the owner already approved. Which is why the
mode holds *only* while `/mcp` sits behind the login. The server reads
`cloudinabottle.toml` at startup, and if `public_paths` covers `/mcp` it refuses router
mode and falls back to its own token rather than serving the reader open. The manifest
cannot set environment variables, so `MCP_AUTH` lives in the `Dockerfile`.

**Locally, or behind a public path, use the app's own token (`MCP_AUTH=token`).**

```sh
MCP_AUTH=token MCP_TOKEN=$(openssl rand -hex 32) pnpm start
```

Radar serves the endpoint only when a token is configured. With none there is nothing to
authenticate with, so the route answers 404 rather than serving Radar open. It compares
tokens in constant time. On a deployed instance the token comes from the secrets service:
`cloudinabottle.toml` asks the owner to grant `READER_MCP_TOKEN`, and the server fetches
it at startup through `$BOTTLE_ROUTER_URL/api/services/v2/call/secrets/get`. The granted
secret wins over `MCP_TOKEN`. Use this mode if you ever add `/mcp` to `public_paths`. It is
deliberately not the default, because it moves the endpoint out from behind the router's
authentication and leaves one token in front of everything.

## Architecture

```
server/   Effect v4 backend, hexagonal
  src/domain           entities, value objects, errors, and ports (interfaces only)
  src/application      use cases: SubscriptionService, RefreshService, EntryService, …
  src/adapters
    inbound/http       HttpApi definition + handlers            (driving)
    inbound/mcp        MCP tools over Streamable HTTP           (driving)
    inbound/scheduler  periodic refresh                         (driving)
    outbound/sqlite    repositories over node:sqlite            (driven)
    outbound/feed      HTTP fetcher, parser, autodiscovery      (driven)
    outbound/directory Feedly feed search                       (driven)
    outbound/catalog   bundled Discover catalog                 (driven)
    outbound/opml      OPML codec                               (driven)
    outbound/secrets   Cloud in a Bottle secrets service        (driven)
    outbound/system    id generation                            (driven)
  src/infrastructure   composition root: config + layer wiring
  test/                in-memory adapters, application and adapter tests
web/      Vite + React 19 client, TanStack Query, hand-written service worker
desktop/  Electron main process: the second composition root
  src/main.ts   window, menu, data directory, and the embedded server
  src/port.ts   picks a stable port, so the origin and its localStorage survive
  build.mjs     bundles the main process and the server into one file with esbuild
```

Every port is an Effect `Context.Service`, and every adapter is a `Layer`. The application
layer depends on ports only, and `infrastructure/AppLayer.ts` is the single place that
decides which adapter satisfies which port. That is why a desktop build costs one new
entry point instead of a second implementation. `desktop/src/main.ts` calls the same
`makeAppLayer` with a different data directory and a loopback address. Tests swap in
`test/support/InMemoryAdapters.ts` and exercise the real use cases without SQLite or the
network.

Radar serves OpenAPI at `/api/openapi.json`. The main endpoints:

- `GET/POST /api/feeds`, `PATCH/DELETE /api/feeds/:id`, `POST /api/feeds/:id/refresh`
- `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id`
- `GET /api/entries?feed=&category=&unread=&saved=&q=&cursor=`, `GET /api/entries/:id`
- `POST /api/entries/mark`, `POST /api/entries/mark-all`, `PUT /api/entries/:id/saved`
- `GET /api/stats`, `POST /api/refresh`, `GET /api/discover?url=`, `GET|POST /api/opml`
- `GET /api/catalog`, `GET /api/catalog/search?q=`, `GET /api/catalog/:id/preview`

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | Listen address |
| `DATA_DIR` | `$BOTTLE_APP_DATA_DIR` or `./data` | Persistent directory |
| `DATABASE_PATH` | `$DATA_DIR/radar.db` | SQLite file |
| `STATIC_DIR` | `../web/dist` | Built client to serve |
| `REFRESH_INTERVAL_MINUTES` | `15` | Background refresh cadence |
| `MCP_AUTH` | `token` | `router` trusts Cloud in a Bottle to authenticate `/mcp`; `token` makes Radar the only gate. The image ships `router`. |
| `MCP_TOKEN` | none | Bearer token for `/mcp` in `token` mode. On an instance the granted `READER_MCP_TOKEN` secret wins. |
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | none | Honoured on every outbound fetch |

## Notes

- **Docker.** The image is Debian-based on purpose: `effect` depends on `msgpackr`, whose
  optional native accelerator only ships glibc prebuilds, so an Alpine build would try to
  compile it from source and fail.
- **Build resources.** Building needs far more memory than running: `pnpm install` peaks
  around 604 MB and `tsc` around 584 MB, against roughly 185 MB for the running server.
  `build_memory_mb` in `cloudinabottle.toml` defaults to `memory_mb`, so it is set
  explicitly; too low a value shows up as a build killed with exit status 137.
