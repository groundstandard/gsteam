// service-worker.js — CABT v1 PWA worker.
//
// Strategy:
//   - App shell (HTML + JSX + manifest + icons): cache-first, fall back to network
//   - Supabase API + OAuth + ESM CDN: bypass entirely (always network, never cached)
//   - On a new build, BUILD_ID changes → old cache is purged on activate
//
// 1777255980 is replaced at build time by scripts/build-pwa.mjs.

const VERSION = '1777496115';
const CACHE   = `cabt-${VERSION}`;

// Files known at install time. Other same-origin requests are cached on first hit.
// Includes all JSX modules + Supabase bundle so first-time-offline doesn't break.
const SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/supabase.min.js',
  '/src/tweaks-panel.jsx',
  '/src/ios-frame.jsx',
  '/src/data.jsx',
  '/src/api.jsx',
  '/src/calc.jsx',
  '/src/ui.jsx',
  '/src/ca-app.jsx',
  '/src/ca-detail.jsx',
  '/src/ca-forms.jsx',
  '/src/ca-scorecard.jsx',
  '/src/sales-app.jsx',
  '/src/admin-app.jsx',
  '/src/admin-extra.jsx',
  '/src/admin-queues.jsx',
  '/src/auth-gate.jsx',
  '/src/app-shell.jsx',
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
  // Use individual cache.add() calls so one 404 doesn't kill the whole install.
  // (cache.addAll is atomic — a single missing file fails everything.)
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch((err) => {
          console.warn('[SW] precache miss:', url, err.message);
        }))
      ))
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

  // Navigation requests get special handling on iOS: ALWAYS prefer /index.html
  // from cache as the fastest reliable response. Skips weird cache-key matching
  // edge cases on iOS Safari standalone where '/' and '/index.html' don't match
  // the same way they do on Android.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        if (cached) {
          // Have cached shell — return it instantly. Background-update if online.
          if (navigator.onLine !== false) {
            fetch('/index.html').then((res) => {
              if (res && res.status === 200 && res.type === 'basic') {
                caches.open(CACHE).then((c) => c.put('/index.html', res.clone()));
              }
            }).catch(() => {});
          }
          return cached;
        }
        // No cached shell — try network, then fall back to offline.html
        return fetch(req).catch(() => caches.match('/offline.html')
          .then((off) => off || new Response('<h1>Offline</h1>', {
            headers: { 'Content-Type': 'text/html' }, status: 503,
          })));
      })
    );
    return;
  }

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
        throw new Error('Offline and no cached response');
      });
    })
  );
});

// Allow the page to trigger a hard refresh by posting {type: 'SKIP_WAITING'}
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Web Push (Chrome / Firefox / Edge — requires VAPID public key on server) ──
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_e) {
    payload = { title: 'gsTeam', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'gsTeam';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || 'gsteam',
    data: payload.data || { url: '/' },
    requireInteraction: !!payload.requireInteraction,
    actions: payload.actions || [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      // Otherwise open a new one
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
