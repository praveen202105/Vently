/* eslint-disable no-restricted-globals */

// Vently service worker. Single purpose: render Web Push notifications and
// focus the app when the user clicks them. Kept tiny on purpose — no
// pre-caching, no offline strategy. Those are PWA concerns we'll add later.

self.addEventListener('install', () => {
  // Take over immediately so the first push lands without a tab refresh.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  // Server sends a JSON string. If the push has no payload (e.g. legacy
  // browsers, malformed send), fall back to a generic Vently notification.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Vently', body: 'You have a new notification' };
  }
  const title = data.title || 'Vently';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Tag groups consecutive notifications (e.g. multiple messages in one
    // conversation) so the OS replaces instead of stacking.
    tag: data.tag,
    data: { url: data.url || '/' },
    // renotify=true makes the OS re-ring/re-vibrate even when the tag
    // matches an existing notification. Important for second message in a
    // burst — otherwise it silently replaces.
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a Vently tab is already open, focus it and navigate. Otherwise
        // open a new one. This is the standard "deep link into PWA" pattern.
        for (const client of clientList) {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.focus();
            return client.navigate(targetUrl);
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
