/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

/** Replaced at build time with the hashed asset list (see vite.config.ts). */
declare const __PRECACHE__: ReadonlyArray<string>
declare const __VERSION__: string

const SHELL = `radar-shell-${__VERSION__}`
const DATA = "radar-data-v1"

const isApiGet = (request: Request, url: URL) => request.method === "GET" && url.pathname.startsWith("/api/")

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([...__PRECACHE__]))
      // A single failed asset should not wedge the whole install.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== SHELL && n !== DATA).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting()
})

/** Content-hashed assets never change under a given URL, so serve them from disk first. */
const cacheFirst = async (request: Request) => {
  const hit = await caches.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) void (await caches.open(SHELL)).put(request, response.clone())
  return response
}

/**
 * How many API responses the offline copy keeps.
 *
 * It is a safety net, not an archive. Cache Storage has no expiry and no size
 * limit of its own, so an uncapped data cache grows for the life of the
 * install: every list page under every filter and cursor, and every article
 * ever opened, bodies included. A few hundred entries is far more than the
 * offline case needs and keeps the store from becoming the largest thing the
 * app owns.
 */
const DATA_LIMIT = 256

/** Trimming on every write would cost a keys() scan per request. */
const TRIM_EVERY = 32
let writesSinceTrim = 0

const remember = async (cache: Cache, request: Request, response: Response) => {
  await cache.put(request, response)
  if (++writesSinceTrim < TRIM_EVERY) return
  writesSinceTrim = 0
  // Keys come back in insertion order, so the front of the list is the oldest.
  const keys = await cache.keys()
  for (const stale of keys.slice(0, keys.length - DATA_LIMIT)) await cache.delete(stale)
}

/**
 * Always read data from the network, falling back to the last good copy only
 * when the network is gone.
 *
 * Serving the cache first and revalidating behind it looks faster but is wrong
 * here: the client refetches precisely when it knows something changed — after
 * subscribing, or when switching filters — and a cached answer leaves it one
 * step behind for as long as it keeps asking. Freshness is the whole point of
 * those requests; the cache exists for the offline case.
 */
const networkFirst = async (request: Request) => {
  const cache = await caches.open(DATA)
  try {
    const response = await fetch(request)
    if (response.ok) void remember(cache, request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request)
    return (
      cached ??
      new Response(JSON.stringify({ _tag: "Offline", message: "You are offline." }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })
    )
  }
}

/** Navigations fall back to the cached shell so the app opens without a network. */
const navigate = async (request: Request) => {
  try {
    return await fetch(request)
  } catch {
    return (await caches.match("/index.html")) ?? (await caches.match("/")) ?? Response.error()
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.method !== "GET") return

  if (request.mode === "navigate") {
    event.respondWith(navigate(request))
    return
  }
  if (isApiGet(request, url)) {
    event.respondWith(networkFirst(request))
    return
  }
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request))
  }
})

export {}
