/*
  Custom service worker entry for injectManifest.
  The Vite PWA plugin will inject a precache manifest into self.__WB_MANIFEST.
*/

const CACHE_VERSION = 'v1';
const PRECACHE = `static-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

let authToken = null;
let sseController = { running: false };

// Precache injected assets
// This will be replaced by Workbox's injectManifest with the actual precache list
const precacheManifest = self.__WB_MANIFEST || [];

self.addEventListener('install', (event) => {
  const urlsToCache = [
    '/',
    '/index.html', 
    '/manifest.json'
  ].concat(precacheManifest.map(entry => entry.url));
  
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(urlsToCache)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => key !== PRECACHE && key !== RUNTIME ? caches.delete(key) : Promise.resolve())
    ))
  ).then(() => {
    self.clients.claim();
    return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        c.postMessage({ type: 'swActivated', version: CACHE_VERSION });
      }
    });
  });
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg && msg.type === 'setToken') {
    authToken = msg.token || null;
  }
  if (msg && msg.type === 'skipWaiting') {
    self.skipWaiting();
  }
  if (msg && msg.type === 'refreshSSE') {
    if (!sseController.running) connectEvents();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (req.method === 'GET' && res && res.status === 200) {
          const copy = res.clone();
          caches.open(RUNTIME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(RUNTIME).then(cache => cache.put(req, copy)); return res; }).catch(() => caches.match('/index.html')));
    return;
  }

  if (req.method === 'GET') {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((resp) => { const copy = resp.clone(); caches.open(RUNTIME).then(cache => cache.put(req, copy)); return resp; }).catch(() => cached)));
  }
});

async function connectEvents() {
  if (sseController.running) return;
  sseController.running = true;
  try {
    const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
    if (!clientsList || clientsList.length === 0) { sseController.running = false; return; }
    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const resp = await fetch('/api/events', { headers, credentials: 'same-origin' });
    if (!resp || !resp.body) throw new Error('No response body');
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        if (chunk.startsWith('data:')) {
          const jsonStr = chunk.replace(/^data:\s*/, '');
          try {
            const parsed = JSON.parse(jsonStr);
            const all = await self.clients.matchAll({ includeUncontrolled: true });
            for (const c of all) {
              c.postMessage({ type: 'sse', event: parsed });
            }
          } catch (e) {
            console.warn('[SW] failed to parse SSE chunk', e);
          }
        }
      }
    }
  } catch (e) {
    console.warn('[SW] connectEvents error', e);
    sseController.running = false;
    setTimeout(() => connectEvents(), 5000);
  }
}

connectEvents();
