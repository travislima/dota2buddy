/* Offline support: cache the shell, always try the network for data first so a
   freshly regenerated brief shows up without anyone clearing anything. */

const VERSION = 'dota-buddy-v2';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'icon.svg',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // let hero art hit the CDN normally

  /* Network first for everything we serve ourselves, cache as the offline fallback.
     Cache-first on the shell meant an edited app.js kept serving the old code until
     someone remembered to bump VERSION — not worth the few milliseconds it saved. */
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit
        || (request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
