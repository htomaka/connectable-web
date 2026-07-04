// Minimal offline-first service worker.
// Caches the app shell and serves it offline.

const CACHE = 'interval-timer-v6';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './scheduler.worker.js', './manifest.webmanifest', './icon-512.png', './icon-512-maskable.png'];

self.addEventListener('install', (e) => {
  // Pas de skipWaiting auto : le nouveau worker attend le bouton « Recharger »
  // (message SKIP_WAITING) pour ne pas recharger en plein timer.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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
          // Update cache in the background
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
