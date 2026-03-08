const CACHE_NAME = 'timebox-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy for the app
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
