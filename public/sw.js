// Service worker: makes the app open instantly and offline.
//
// Strategy is stale-while-revalidate for everything under the app's scope:
// serve what we have, refresh in the background. Because index.html and its
// hashed assets are cached together, a stale page never references assets
// that are missing from the cache. The first visit after a deploy shows the
// previous version; the next visit shows the new one.

const CACHE = 'bbc-v4';
const PRECACHE = ['./', './data/index.json', './manifest.webmanifest', './board/', './board/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  // The map's tiles file is read by byte range; the Cache API can neither store a 206 nor slice a cached copy.
  if (request.headers.has('range')) return;
  event.respondWith(staleWhileRevalidate(event));
});

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    // Keep the worker alive until the background refresh has landed.
    event.waitUntil(refresh);
    return cached;
  }
  const fresh = await refresh;
  if (fresh) return fresh;
  return new Response('Offline and not cached', { status: 503, headers: { 'content-type': 'text/plain' } });
}
