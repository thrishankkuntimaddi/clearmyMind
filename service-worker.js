// ClearMyMind — Service Worker
// Caches only the app's own static files (never your data — that lives in
// Firestore, which this worker ignores as a cross-origin request).
//   • Navigations (HTML)       → network-first, fall back to the cached app shell
//   • Hashed JS/CSS in /assets → cache-first (file names change on every build)
//   • Other same-origin files  → network-first with cache fallback

const CACHE_VERSION = 'v4'
const CACHE_NAME    = `clearmymind-${CACHE_VERSION}`
const SHELL_URL     = new URL('./', self.registration.scope).href

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

function putInCache(key, response) {
  if (response && response.ok && response.type === 'basic') {
    const copy = response.clone()
    caches.open(CACHE_NAME).then((cache) => cache.put(key, copy))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return

  if (request.mode === 'navigate') {
    // Every navigation is the same SPA shell — store it under one key
    event.respondWith(
      fetch(request)
        .then((res) => putInCache(SHELL_URL, res))
        .catch(() => caches.match(SHELL_URL)),
    )
    return
  }

  if (/\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((res) => putInCache(request, res))),
    )
    return
  }

  event.respondWith(
    fetch(request)
      .then((res) => putInCache(request, res))
      .catch(() => caches.match(request)),
  )
})
