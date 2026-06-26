// SELF-DESTRUCT service worker.
// A previous cache-first SW was serving stale builds. This version clears every
// cache, unregisters itself, and reloads open tabs so the app always loads fresh
// from the network. (No fetch handler -> nothing is intercepted or cached.)
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
        await self.registration.unregister()
        const clients = await self.clients.matchAll({ type: 'window' })
        clients.forEach((c) => c.navigate(c.url))
      } catch {
        /* ignore */
      }
    })(),
  )
})
