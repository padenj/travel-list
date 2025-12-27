/*
  Hardened Service Worker
  - Precache static assets (manifest, icons, shell)
  - Cache-first for static assets
  - Network-first for API and navigations with fallback to cache
  - Safe update flow: clients can message 'skipWaiting' to activate immediately
  - SSE connection logic retained: only starts when clients exist and will reconnect on errors
*/

"use strict";

const CACHE_VERSION = 'v1';
const PRECACHE = `static-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

// Files to precache. Keep minimal and safe — build output may change filenames.
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-256.svg',
  '/icons/icon-512.svg'
];

let authToken = null;
let sseController = { running: false };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Build a promise that performs cache cleanup then notifies clients.
  const activationPromise = caches.keys().then((keys) => Promise.all(
    keys.map((key) => {
      if (key !== PRECACHE && key !== RUNTIME) {
        return caches.delete(key);
      }
      // ensure each map entry returns a promise (or resolved value)
      return Promise.resolve();
    })
  )).then(() => {
    // Attempt to claim clients; in some proxied/dev environments this may
    // fail with InvalidStateError if the worker is not the active worker.
    try {
      if (self.clients && typeof self.clients.claim === 'function') {
        self.clients.claim().catch((e) => {
          console.warn('[SW] clients.claim() failed', e);
        });
      }
    } catch (e) {
      console.warn('[SW] clients.claim() threw', e);
    }

    // Notify clients that a new SW is active (useful for update UI)
    return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
      for (const c of clients) {
        try { c.postMessage({ type: 'swActivated', version: CACHE_VERSION }); } catch (err) { /* ignore */ }
      }
    });
  });

  event.waitUntil(activationPromise);
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg && msg.type === 'setToken') {
    authToken = msg.token || null;
    console.log('[SW] Received auth token (length)', authToken ? authToken.length : 0);
  }
  if (msg && msg.type === 'setToken' && authToken && !sseController.running) {
    // start SSE now that we have a token
    try { connectEvents().catch(() => {}); } catch (e) { /* ignore */ }
  }
  if (msg && msg.type === 'skipWaiting') {
    self.skipWaiting();
  }
  if (msg && msg.type === 'refreshSSE') {
    // trigger SSE restart if needed
    if (!sseController.running) connectEvents();
  }
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin requests; let others passthrough
  if (url.origin !== self.location.origin) return;

  // Network-first for API routes
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).then((res) => {
        // Optionally cache successful API GETs
        if (req.method === 'GET' && res && res.status === 200) {
          const copy = res.clone();
          caches.open(RUNTIME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Navigation requests: try network first, fall back to cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        // Update cache with latest shell
        const copy = res.clone();
        caches.open(RUNTIME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For other GET requests (static assets), do cache-first
  if (req.method === 'GET') {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
        // cache static assets on the fly
        const copy = resp.clone();
        caches.open(RUNTIME).then(cache => cache.put(req, copy));
        return resp;
      }).catch(() => {
        // fallback: try manifest or index
        if (req.destination === 'document') return caches.match('/index.html');
        return cached;
      }))
    );
  }
});

// SSE helper: connect to /api/events and forward parsed events to clients
async function connectEvents() {
  if (sseController.running) return;
  sseController.running = true;
  try {
    // only attempt to open SSE if there are clients
      // Only start SSE when we have at least one client and an auth token.
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
      if (!clientsList || clientsList.length === 0 || !authToken) {
        sseController.running = false;
        return;
      }

    const headers = {};
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const resp = await fetch(`/api/events`, { headers, credentials: 'same-origin' });
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
          const jsonStr = chunk.replace(/^data:\s*/,'');
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
    // attempt reconnect with exponential backoff capped to avoid infinite tight loop
    sseController.running = false;
    setTimeout(() => connectEvents(), 5000);
  }
}

// Start SSE when clients are present
self.addEventListener('sync', (ev) => {
  // placeholder if background sync is registered
});

// Kick off SSE when a client becomes visible/controlled
self.addEventListener('clientschange', () => {
  if (!sseController.running) connectEvents();
});

// When the service worker starts, attempt to connect if clients exist
// Wrap initial invocation to avoid unhandled promise rejection in edge cases
try {
  connectEvents().catch((e) => { console.warn('[SW] initial connectEvents error', e); });
} catch (e) {
  console.warn('[SW] initial connectEvents threw', e);
}
