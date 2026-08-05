/* Offline support: cache the shell, always try the network for data first so a
   freshly regenerated brief shows up without anyone clearing anything. */

const VERSION = 'dota-buddy-v6';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'store.js',
  'config.js',
  'analytics.js',
  'icon.svg',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  /* addAll() fetches through the HTTP cache, and GitHub Pages sends max-age=600.
     So a worker installing within ten minutes of a deploy precached the *old*
     app.js — and because that copy satisfied every later request, the stale code
     survived reloads indefinitely. Same `cache: 'no-cache'` the fetch handler
     already uses, for the same reason. */
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.all(SHELL.map((url) =>
        fetch(new Request(url, { cache: 'no-cache' }))
          .then((res) => (res.ok ? cache.put(url, res) : null)))))
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
     someone remembered to bump VERSION — not worth the few milliseconds it saved.

     `cache: 'no-cache'` forces a conditional request (cheap: a 304 when unchanged).
     Without it a plain fetch() is still served by the HTTP cache, and GitHub Pages
     sends max-age=600 — so for ten minutes after a deploy you could get fresh
     data/*.json alongside a stale app.js. Mismatched code and data renders worse
     than either being uniformly old. */
  event.respondWith(
    fetch(new Request(request.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit
        || (request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
