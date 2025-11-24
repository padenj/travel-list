import React, { useEffect, useState } from 'react';
import { Badge, Tooltip } from '@mantine/core';

type SWState = 'unknown' | 'sw-connected' | 'page-sse' | 'disconnected' | 'waiting' | 'unsupported';

export default function ServiceWorkerStatus({ compact }: { compact?: boolean }): React.ReactElement {
  const [state, setState] = useState<SWState>('unknown');
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const setSW = (d?: string) => { if (!mounted) return; setState('sw-connected'); setDetail(d || 'Controlled by active service worker'); };
    const setPage = (d?: string) => { if (!mounted) return; setState('page-sse'); setDetail(d || 'Page SSE delivering events'); };
    const setNone = (d?: string) => { if (!mounted) return; setState('disconnected'); setDetail(d || 'No SW controller or SSE activity'); };

    if (!('serviceWorker' in navigator)) {
      setState('unsupported');
      setDetail('Service workers not supported');
      return () => { mounted = false; };
    }

    // Detect controller presence
    const updateController = () => {
      try {
        if (navigator.serviceWorker.controller) {
          setSW('Controlled by active service worker');
        } else {
          // do not immediately mark disconnected - page SSE may be active
          setState(s => s === 'page-sse' ? s : 'disconnected');
          setDetail('No active service worker controller');
        }
      } catch (e) {}
    };

    updateController();

    // Try to proactively register/refresh the service worker on page load
    const tryEnsureRegistration = async () => {
      try {
        if (!('serviceWorker' in navigator)) return;
        // If a controller exists already, try to ping it
        if (navigator.serviceWorker.controller) {
          try { navigator.serviceWorker.controller.postMessage({ type: 'ping' }); } catch (e) {}
          return;
        }

        // Try to find an existing registration for /sw.js
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          // Attempt to register the service worker (best-effort)
          try {
            reg = await navigator.serviceWorker.register('/sw.js');
            // If successfully registered, try to send a ping to any worker instance
            if (reg.installing) reg.installing.postMessage?.({ type: 'ping' });
            if (reg.waiting) reg.waiting.postMessage?.({ type: 'ping' });
            if (reg.active) reg.active.postMessage?.({ type: 'ping' });
          } catch (e) {
            // registration may fail in environments (incognito, strict blocking) — ignore
          }
        } else {
          // We have a registration; try to signal it to refresh SSE or ping
          try {
            if (reg.active) reg.active.postMessage?.({ type: 'ping' });
            if (reg.waiting) reg.waiting.postMessage?.({ type: 'ping' });
            // Ask the worker to ensure SSE connection is running
            if (reg.active) reg.active.postMessage?.({ type: 'refreshSSE' });
          } catch (e) {}
        }
      } catch (e) {}
    };

    // Run immediately on load to update UI right away
    tryEnsureRegistration();
    // Also retry once when the page load event fires (some environments delay SW availability)
    const onLoad = () => tryEnsureRegistration();
    window.addEventListener('load', onLoad);

    const onController = () => updateController();
    navigator.serviceWorker.addEventListener('controllerchange', onController);

    // Listen for SW messages
    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = (ev && ev.data) || {};
        if (msg && msg.type === 'sw-ping') {
          setSW('Service worker ping at ' + new Date().toLocaleTimeString());
        }
        if (msg && msg.type === 'updateAvailable') {
          if (mounted) { setState('waiting'); setDetail('Update available'); }
        }
      } catch (e) {}
    };
    navigator.serviceWorker.addEventListener('message', onMessage as any);

    // Listen for page SSE 'server-event' to detect page-level connectivity
    let lastServerEventAt = 0;
    const onServerEvent = (ev: Event) => {
      lastServerEventAt = Date.now();
      // If SW is present prefer SW, otherwise mark page SSE
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        // prefer SW status
        updateController();
      } else {
        setPage('Received server-event at ' + new Date(lastServerEventAt).toLocaleTimeString());
      }
    };
    window.addEventListener('server-event', onServerEvent as any);

    // Poll to determine if neither SW nor SSE are providing events
    const checker = setInterval(() => {
      const controllerPresent = !!navigator.serviceWorker.controller;
      const now = Date.now();
      const recentSSE = (now - lastServerEventAt) < 90_000; // 90s
      if (controllerPresent) {
        setSW();
      } else if (recentSSE) {
        setPage();
      } else {
        setNone();
      }
      // try to elicit a response from SW if present
      try { if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'ping' }); } catch (e) {}
    }, 20000); // check every 20s

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onController);
      navigator.serviceWorker.removeEventListener('message', onMessage as any);
      window.removeEventListener('server-event', onServerEvent as any);
      window.removeEventListener('load', onLoad);
      clearInterval(checker);
    };
  }, []);

  const color = state === 'sw-connected' ? 'green' : state === 'page-sse' ? 'blue' : state === 'waiting' ? 'yellow' : state === 'unsupported' ? 'gray' : 'red';
  const label = state === 'sw-connected' ? 'SW ✓' : state === 'page-sse' ? 'Page SSE' : state === 'waiting' ? 'SW ↑' : state === 'unsupported' ? 'SW N/A' : 'SW ✗';

  // Compact mode: render a small colored dot (no floating). Otherwise render a badge with tooltip.
  if (compact) {
    const dotStyle: React.CSSProperties = {
      width: 12,
      height: 12,
      borderRadius: 12,
      backgroundColor: color === 'green' ? '#22c55e' : color === 'blue' ? '#3b82f6' : color === 'yellow' ? '#f59e0b' : color === 'gray' ? '#9ca3af' : '#ef4444',
      display: 'inline-block',
      verticalAlign: 'middle',
      marginRight: 6,
    };
    return (
      <div title={detail || label} style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span style={dotStyle} />
        <span style={{ fontSize: 11, color: 'var(--mantine-color-gray-6)', verticalAlign: 'middle' }}>{/* small label omitted to save space */}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <Tooltip label={detail || ''} withArrow>
        <Badge color={color} variant="filled">{label}</Badge>
      </Tooltip>
    </div>
  );
}
