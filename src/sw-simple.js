// Simple service worker with exact Workbox injectManifest format

// This must be the exact format for Workbox injectManifest
const precacheManifest = self.__WB_MANIFEST;

const CACHE_NAME = 'travel-list-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(precacheManifest || []))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  if (url.origin !== self.location.origin) return;

  // API routes - network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static resources - cache first
  event.respondWith(
    caches.match(request)
      .then((response) => response || fetch(request))
  );
});