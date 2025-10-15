# Milestone 7 — PWA Features & Deployment

Goal: finish Progressive Web App installation experience and finalize deployment so the app can be installed on mobile devices and run reliably (online/offline) in production.

## Tasks

1) PWA Manifest & App Metadata
- [x] Create web app manifest (`public/manifest.json`) with full metadata (name, short_name, start_url, display, orientation, theme_color, background_color)
- [x] Provide multi-size icons (192, 256, 512) and maskable icon in `public/icons/` (placeholder SVGs added)
- [x] Add meta tags to `index.html` (theme-color, mobile-web-app-capable) and apple-touch-icon entries

2) Service worker & caching strategy
- [x] Review/upgrade `public/sw.js` to production-ready behavior (cache-first static, network-first API, skipWaiting/clients.claim flow). Custom SW moved to `src/sw.js` and configured for injectManifest.
 - [x] Implement update UX (non-disruptive "New version available" prompt + reload). Client-side handler added to `src/App.tsx` and `src/components/UpdateBanner.tsx` provides in-app UI.

Progress: The project uses a manual post-build injection script (`tools/inject-precache.cjs`) to write a precache list into `dist/sw.js` after `vite build` runs. This was used to generate `dist/sw.js` with the hashed asset entries.

3) Offline sync & background sync queue
- [ ] Implement IndexedDB queue and Background Sync API fallback
- [ ] Add or adapt server endpoints for sync (batch apply, idempotent)

4) Push notifications (deferred)
- [ ] Deferred for now — not required in this milestone

5) Install prompt & UX
- [ ] Implement in-app "Add to Home Screen" prompt using `beforeinstallprompt` event and custom CTA
- [ ] Add iOS manual install guidance in Help UI

6) Accessibility, icons, splash screens, and iOS support
- [ ] Generate splash images or metadata for iOS/Android
- [ ] Verify contrast, accessible labels, keyboard behavior for install flows

7) Deployment & Docker
- [ ] Update Dockerfile and multi-stage build to copy `manifest.json`, `sw.js`, and icons into the image
- [ ] Provide docker-compose example with nginx reverse proxy and TLS guidance (production will use external reverse proxy)

8) Testing, QA & rollout
- [ ] Add Lighthouse PWA checks to CI (baseline + thresholds)
- [ ] Integration tests for offline queue (simulate offline)
- [ ] Manual QA checklist for mobile installs

## Acceptance criteria
- App is installable on Android and prompts users
- Offline behaviors are reliable and queued ops sync after reconnect
- Docker image serves PWA assets correctly; deployment docs present

## Lighthouse recommendation

Best practices for CI enforcement:
- Require the PWA baseline checks: manifest present, service worker registered, icons present, start_url reachable.
- Recommended thresholds for blocking CI (adjustable):
  - PWA: >= 90 (baseline to ensure installability and correct metadata)
  - Accessibility: >= 90
  - Best Practices: >= 90
  - Performance: >= 75 (can be relaxed for complex initial loads; focus on TTI & caching)
  - SEO: >= 80

Rationale: PWA and Accessibility should be strict to guarantee installability and usable offline behavior. Performance can be tuned over time; start with a realistic target (75) and raise as the caching strategy and image optimizations land.

## Agreed thresholds (confirmed)

- PWA: >= 90
- Accessibility: >= 90
- Best Practices: >= 90
- Performance: >= 75
- SEO: >= 80

These are the thresholds we'll enforce in CI for Milestone 7 unless you request changes.

## Notes
- Production will use an external reverse proxy for TLS — the container does not need to terminate TLS.
- Push notifications are deferred; we will add web-push later if requested.

We'll start by creating the manifest and wiring `index.html`, plus placeholder icons. Update this file as tasks complete.
