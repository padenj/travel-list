
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import AppRoutes from './AppRoutes';
import UpdateBanner from './components/UpdateBanner';
import { getAuthToken } from './api';
import { ImpersonationProvider } from './contexts/ImpersonationContext';
import { RefreshProvider } from './contexts/RefreshContext';
import { ActivePackingListProvider } from './contexts/ActivePackingListContext';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

// Force cache bust in development
if (process.env.NODE_ENV === 'development') {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = `/static/css/main.css?v=${Date.now()}`;
  link.as = 'style';
  document.head.appendChild(link);
}

function App(): React.ReactElement {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [waitingRegistration, setWaitingRegistration] = useState<ServiceWorkerRegistration | null>(null);
  // Removed legacy simpleOffline localStorage flush logic. The app relies on
  // direct server API calls and SSE for updates. Service worker and page-based
  // SSE connection logic below remain unchanged.

  // Register service worker to receive server events
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        console.log('[SW] Registered', reg);
        const sendTokenToSW = (sw?: ServiceWorker | null) => {
          const token = (window as any).getAuthToken ? (window as any).getAuthToken() : null;
          try {
            if (!token) {
              console.log('[SW] No token available to send');
              return;
            }
            // Prefer the controller, but fall back to registration worker references
            if (navigator.serviceWorker.controller) {
              console.log('[SW] Sending token to controller');
              navigator.serviceWorker.controller.postMessage({ type: 'setToken', token });
              return;
            }
            const target = sw || reg.active || reg.waiting || reg.installing;
            if (target) {
              console.log('[SW] Sending token to registration worker (state=' + (target.state || 'unknown') + ')');
              target.postMessage({ type: 'setToken', token });
            } else {
              console.log('[SW] No worker instance available on registration to send token');
            }
          } catch (e) { console.warn('[SW] failed to postMessage token', e); }
        };
        // Try now using registration workers
        sendTokenToSW();
        // Also send when controller changes (page becomes controlled)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[SW] controllerchange event');
          sendTokenToSW();
          // Reload once to ensure the page uses the new service worker
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });
        // If worker is installing/waiting, send token when it becomes active
        if (reg.installing) reg.installing.addEventListener('statechange', () => { sendTokenToSW(reg.installing); });
        if (reg.waiting) reg.waiting.addEventListener('statechange', () => { sendTokenToSW(reg.waiting); });
        if (reg.active) reg.active.addEventListener('statechange', () => { sendTokenToSW(reg.active); });
      }).catch(err => console.warn('[SW] Registration failed', err));

      // forward messages from SW to window (already forwarded by SW clients, but ensure we listen)
      navigator.serviceWorker.addEventListener('message', async (ev) => {
        try {
          const msg = (ev as any).data;
          if (!msg) return;
          if (msg.type === 'sse') {
            // re-dispatch as window message for compatibility
            window.dispatchEvent(new CustomEvent('server-event', { detail: msg.event }));
            return;
          }
          if (msg.type === 'swActivated' || msg.type === 'updateAvailable') {
            // Show non-blocking update banner
            setUpdateAvailable(true);
            try {
              const registration = await navigator.serviceWorker.getRegistration();
              if (registration) setWaitingRegistration(registration);
            } catch (e) {}
          }
        } catch (e) {}
      });
    }
  }, []);

  // Page-based event stream fallback: connect from the window context so network
  // activity is visible in DevTools and headers can be set (Authorization).
  useEffect(() => {
    let stopped = false;
    let backoff = 1000;
    let connecting = false;
    let connected = false;

    const connectWindowEvents = async () => {
      if (stopped || connecting || connected) return;
      connecting = true;
      const token = getAuthToken();
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      try {
        console.log('[Events] connecting to /api/events (window)');
        const resp = await fetch('/api/events', { headers, credentials: 'same-origin' });
        if (!resp || !resp.body) throw new Error('No response body');
        console.log('[Events] connected (window)');
        connecting = false;
        connected = true;
        backoff = 1000;
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
                const ev = JSON.parse(jsonStr);
                window.dispatchEvent(new CustomEvent('server-event', { detail: ev }));
              } catch (e) { console.warn('[Events] failed to parse chunk', e); }
            }
          }
        }
        console.log('[Events] connection closed (window)');
        connected = false;
      } catch (e) {
        console.warn('[Events] connection error (window)', e);
        connecting = false;
        connected = false;
        // reconnect with backoff
        setTimeout(() => { if (!stopped) connectWindowEvents(); }, backoff);
        backoff = Math.min(30000, backoff * 1.5);
      }
    };

    connectWindowEvents();
    // reconnect on focus only if not currently connected
    const onFocus = () => { 
      if (!connected && !connecting) {
        console.log('[Events] window focus - attempting reconnect');
        connectWindowEvents(); 
      } else {
        console.log('[Events] window focus - already connected, skipping');
      }
    };
    window.addEventListener('focus', onFocus);
    return () => { stopped = true; window.removeEventListener('focus', onFocus); };
  }, []);
  const doUpdate = async () => {
    try {
      if (waitingRegistration && waitingRegistration.waiting) {
        waitingRegistration.waiting.postMessage({ type: 'skipWaiting' });
      } else if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'skipWaiting' });
      }
    } catch (e) { console.warn('[SW] update request failed', e); }
    setUpdateAvailable(false);
  };

  const dismissUpdate = () => { setUpdateAvailable(false); };

  return (
    <MantineProvider>
      <ModalsProvider>
        <Notifications />
        <Router>
          <RefreshProvider>
            <ImpersonationProvider>
              <ActivePackingListProvider>
                <AppRoutes />
                {updateAvailable ? <UpdateBanner onUpdate={doUpdate} onDismiss={dismissUpdate} /> : null}
              </ActivePackingListProvider>
            </ImpersonationProvider>
          </RefreshProvider>
        </Router>
      </ModalsProvider>
    </MantineProvider>
  );
}

export default App;
