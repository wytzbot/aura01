/* AURA shared service worker: PWA cache + Firebase Cloud Messaging */
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');
importScripts('/config.js');

const CACHE='aura-shell-v3';

try {
  if (globalThis.AURA_FIREBASE_CONFIG && !firebase.apps.length) {
    firebase.initializeApp(globalThis.AURA_FIREBASE_CONFIG);
  }
  if (firebase.messaging.isSupported()) {
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(payload => {
      const n = payload.notification || {};
      const d = payload.data || {};
      const title = n.title || d.title || 'AURA AI';
      const options = {
        body: n.body || d.body || 'You have a new update from AURA.',
        icon: n.icon || d.icon || '/icon-512.png',
        badge: d.badge || '/icon-512.png',
        tag: d.tag || 'aura-notification',
        data: { url: d.url || '/' },
        renotify: true
      };
      self.registration.showNotification(title, options);
    });
  }
} catch (e) {
  // Keep the PWA service worker alive even if FCM initialization is unavailable.
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(['/','/manifest.json']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === location.origin && !url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request))
    );
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
