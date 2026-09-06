/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

/** Replaced at build time with the hashed asset list (see vite.config.ts). */
declare const __PRECACHE__: ReadonlyArray<string>
declare const __VERSION__: string

const SHELL = `reader-shell-${__VERSION__}`
const DATA = "reader-data-v1"

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
 * Read data fresh when the network allows, but keep the last good copy so an
 * offline launch still shows the feeds and articles already fetched.
 */
const staleWhileRevalidate = async (request: Request) => {
  const cache = await caches.open(DATA)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  if (cached) {
    void network
    return cached
  }
  const response = await network
  return response ?? new Response(JSON.stringify({ _tag: "Offline", message: "You are offline." }), {
    status: 503,
    headers: { "content-type": "application/json" },
  })
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
    event.respondWith(staleWhileRevalidate(request))
    return
  }
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|webmanifest|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request))
  }
})

export {}
