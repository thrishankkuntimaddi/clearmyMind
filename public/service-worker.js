// ClearMyMind — Service Worker
// Cache-first strategy: serve cached assets instantly, fall back to network

const CACHE_NAME = 'clearmymind-v1'

// Core shell assets to pre-cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
]

// ── Install: pre-cache the app shell ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS)
    })
  )
  // Activate immediately without waiting for old sw to die
  self.skipWaiting()
})

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  // Take control of all open clients immediately
  self.clients.claim()
})

// ── Fetch: cache-first, fall back to network ──────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return

  // Skip cross-origin requests (fonts, analytics, etc.)
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache; also refresh in background (stale-while-revalidate)
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const cloned = networkResponse.clone()
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, cloned)
              })
            }
            return networkResponse
          })
          .catch(() => {/* ignore network errors in background refresh */})

        // eslint-disable-next-line no-unused-vars
        void fetchPromise
        return cachedResponse
      }

      // Not in cache — fetch from network and cache it
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse
        }
        const cloned = networkResponse.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, cloned)
        })
        return networkResponse
      }).catch(() => {
        // If all else fails for a navigation request, serve index.html
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html')
        }
      })
    })
  )
})
