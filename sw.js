// METRO TYCOON service worker — app-shell cache-first with background revalidation.
// Bump CACHE whenever a deployed version changes so old shells don't stick around.
const CACHE = 'metro-tycoon-v1.9.0';
const ASSETS = [
  './',
  './index.html',
  './css/style.css?v=1.9.0',
  './js/version.js?v=1.9.0',
  './js/achievements.js?v=1.7.0',
  './js/ranking.js?v=1.9.0',
  './js/game.js?v=1.9.0',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // leave fonts / Supabase alone

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(res => {
          if (res && res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
