/*
 * Service worker for web push (Home Screen app on iPhone, Chrome on Android
 * and desktop). Firebase Cloud Messaging delivers the push; this shows it and
 * opens the right page when tapped. Kept free of the Firebase SDK so it needs
 * no config. Registered on every page load (components/register-sw.tsx), which
 * with the fetch handler below is what lets Chrome on Android offer Install.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// Network only — no offline cache (the app needs live data). Chrome counts a
// fetch handler toward installability.
self.addEventListener('fetch', () => {});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { payload = {}; }
  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || data.title || 'Aaromach';
  event.waitUntil(self.registration.showNotification(title, {
    body: n.body || data.body || '',
    icon: '/icons/icon-192.png',
    // Status-bar icon: Android uses only its shape, so it must be white on
    // transparent (a full-colour icon shows as a white square).
    badge: '/icons/badge-96.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        // navigate() rejects for a window this worker doesn't control yet
        // (opened before it installed) — fall back to opening the link.
        try { if (await w.navigate(url)) return; } catch (e) { /* fall through */ }
        break;
      }
    }
    return self.clients.openWindow(url);
  })());
});
