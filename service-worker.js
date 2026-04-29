// service-worker.js — CABT v1 PWA worker.
//
// Strategy:
//   - App shell (HTML + JSX + manifest + icons): cache-first, fall back to network
//   - Supabase API + OAuth + ESM CDN: bypass entirely (always network, never cached)
//   - On a new build, BUILD_ID changes → old cache is purged on activate
//
// 1777255980 is replaced at build time by scripts/build-pwa.mjs.

const VERSION = '1777473382';
const CACHE   = `cabt-${VERSION}`;

// Files known at install time. Other same-origin requests are cached on first hit.
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

// Hostnames we never cache — always go to network.
const BYPASS = [
  'supabase.co',
  'supabase.in',
  'googleapis.com',
  'accounts.google.com',
  'gstatic.com',
  'esm.sh',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Always-network domains
  if (BYPASS.some((host) => url.hostname.endsWith(host))) return;

  // Only handle same-origin GETs
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache successful, complete responses
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => {
        // Offline + not in cache → fall back to index for SPA-style nav
        if (req.mode === 'navigate') return caches.match('/index.html');
        throw new Error('Offline and no cached response');
      });
    })
  );
});

// Optional: allow the page to trigger a hard refresh by posting {type: 'SKIP_WAITING'}
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
