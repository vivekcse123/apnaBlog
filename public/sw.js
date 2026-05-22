const CACHE = 'apnainsights-v2';
const PRECACHE = ['/', '/offline.html', '/site.webmanifest', '/logo-96.png', '/web-app-manifest-192x192.png', '/web-app-manifest-512x512.png'];

// ── Install: pre-cache shell assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

// ── Activate: claim all clients immediately ───────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first, fall back to cache ─────────────────────────────────
// This handler is REQUIRED for Chrome to fire beforeinstallprompt
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Skip cross-origin, chrome-extension, and API requests
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(request)
      .then(res => {
        // Cache successful navigation responses
        if (res.ok && (request.mode === 'navigate' || url.pathname.match(/\.(png|jpg|svg|ico|webmanifest)$/))) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then(cached => {
        if (cached) return cached;
        // For navigation requests, serve the offline page instead of a blank error
        if (request.mode === 'navigate') return caches.match('/offline.html');
        return Response.error();
      }))
  );
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'ApnaInsights', body: event.data.text() }; }
  const title = data.title || 'ApnaInsights';
  const options = {
    body:    data.body  || 'New content available',
    icon:    data.icon  || '/logo-96.png',
    badge:   data.badge || '/logo-96.png',
    data:    { url: data.url || '/' },
    vibrate: [100, 50, 100],
    actions: [{ action: 'open', title: 'Read Now' }],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
