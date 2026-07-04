// Service worker offline-first : cache l'app-shell et la sert hors-ligne (FR-21).

const CACHE = 'cadence-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './scheduler.worker.js',
  './manifest.webmanifest',
  './icon-512.png',
  './icon-512-maskable.png',
  './assets/fonts/saira-condensed-500.woff2',
  './assets/fonts/saira-condensed-600.woff2',
  './assets/fonts/saira-condensed-700.woff2',
  './assets/fonts/ibm-plex-mono-400.woff2',
  './assets/fonts/ibm-plex-mono-500.woff2',
  './assets/fonts/ibm-plex-mono-600.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
