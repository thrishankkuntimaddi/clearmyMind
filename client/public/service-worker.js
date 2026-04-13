// ClearMyMind — Service Worker
// Strategy:
//   • Navigation requests (HTML) → Network-first so users always get the latest app shell
//   • Static assets (JS/CSS with hash in filename) → Cache-first (immutable)
//   • Everything else → Network-first with cache fallback

// Bump this version on every deploy to evict old stale caches immediately.
const CACHE_VERSION = 'v3'
const CACHE_NAME = `clearmymind-${CACHE_VERSION}`

// ── Install: skip waiting so new SW activates right away ─────────────────────
self.addEventListener('install', () => {
  self.skipWaiting()
})

// ── Activate: remove ALL old caches on upgrade ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  )
  // Take control of all open clients immediately
  self.clients.claim()
})

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Skip cross-origin requests (Firebase, Google Fonts, Analytics, etc.)
  if (url.origin !== self.location.origin) return

  const isNavigation = event.request.mode === 'navigate'

  // ── Hashed static assets (e.g. index-Abc123.js) → cache-first (immutable) ──
  const isHashedAsset = /\/assets\/[^/]+-[A-Za-z0-9]{8,}\.(js|css)$/.test(url.pathname)

  if (isHashedAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // ── Navigation + everything else → Network-first ─────────────────────────
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline fallback: serve from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          // For navigations, serve app shell so React can boot offline
          if (isNavigation) return caches.match('./index.html')
        })
      })
  )
})

