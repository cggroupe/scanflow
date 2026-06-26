// ScanFlow service worker — network-first so a fresh deploy is always picked up
// (cache is only an offline fallback). Bump CACHE to force-clear old caches.
const CACHE = 'scanflow-v3'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Never touch cross-origin requests (OpenCV CDN, Supabase API/realtime, fonts, pdf.js).
  if (url.origin !== self.location.origin) return

  // Network-first for everything same-origin: always fresh when online; cache is a
  // pure offline fallback. (Previously cache-first served stale builds after a deploy.)
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
  )
})
