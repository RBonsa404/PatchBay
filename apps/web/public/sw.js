/* global self, caches, fetch, URL, Response */
// IST Network Lab offline support. Once the game has been opened online, it keeps working without a connection (a
// lab with no Internet, a phone in the bus).
// - The page itself: network first (an update is picked up as soon as there is a connection), cache as fallback.
// - Files whose name carries a content hash (Vite's assets/): they never change, so cache first.
// - Every other file (3D models, people, textures, panoramas, lessons): their names stay the same from one version to
//   the next, so network first as well, the cache only when offline. Cache first here kept old or broken copies for
//   good: the people of a new version never showed in a browser that had opened the game before.
// - An HTML page is never kept in place of a file.
const CACHE = 'ist-network-lab-v3';
const HASHED = /\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest', './icon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function keep(request, response) {
  const type = response.headers.get('content-type') ?? '';
  if (!response.ok || type.includes('text/html')) return;
  const copy = response.clone();
  void caches.open(CACHE).then((cache) => cache.put(request, copy));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Music streams by ranges, which the cache refuses; offline, the game falls back on its generated piece.
  if (request.headers.has('range') || url.pathname.includes('/music/') || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('./', copy));
          return response;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }
  if (HASHED.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            keep(request, response);
            return response;
          }),
      ),
    );
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        keep(request, response);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
  );
});
