# Milestone 6 — Offline storage & sync

Goal
------
Make the Travel List app usable on mobile devices when the network is poor or offline. The app must continue to create, edit, and delete packing lists and items while offline, queue changes locally, and reliably sync with the server when connectivity is restored.

Assumptions
----------
- Mobile clients run modern web browsers with IndexedDB available (use a small wrapper like `idb` or `localforage`).
- Server remains authoritative. We'll ship additive server endpoints if needed to support sync (change feeds / bulk sync endpoints).
- We prefer a conservative sync strategy: client-first optimistic local changes + server reconciliation and simple conflict resolution by last-write-wins (timestamp/clock) for MVP.
- We'll keep changes minimal and iterative: implement storage, queueing, sync, tests, then polish UX and conflict UI.

Contract (short)
-----------------
- Inputs: user operations on packing lists/items (create, update, delete) performed while online or offline.
- Outputs: local persistence of operations; eventual consistency with server — the server reflects client changes after a successful sync; client receives relevant server-side updates (templates, shared lists, remote edits).
- Error modes: network failures, DB corruption, conflicting edits. We'll surface errors to the user and retry automatically.

Edge cases to plan for
----------------------
- Concurrent edits on the same entity from multiple devices.
- Deletes vs updates ordering (tombstones).
- Partial sync (network dropped mid-sync).
- Large batched payloads (rate limiting / chunking).
- Schema migrations for local DB and server.

Acceptance criteria
-------------------
- App can create/edit/delete packing lists and items while offline and persist them locally.
- Local changes are queued and applied to server when connectivity returns.
- Tests: unit tests for sync queue and local store; integration tests exercising offline workflow; at least one E2E simulation of offline then online sync.
- Typescript builds cleanly (npx tsc --noEmit) and current test suite still passes.

Implementation checklist
------------------------
(Work will be done incrementally; make each step small and testable)

1) Design & scaffolding
- [x] Add `docs/milestone6.md` (this file).
- [x] Design data model for local change log (tombstone + op type + entity id + payload + clientTs + serverTs? + opId). Document in a short spec and add to `docs/`.
- [x] Decide storage library (IndexedDB wrapper). Add to `package.json` if approved (suggest `idb` or `localforage`).
  - Progress: `idb` declared in `package.json` (added). Offline op types added to `src/shared/types.ts`.

2) Client: local persistent store
- [x] Create client-side storage layer under `src/contexts/offlineStore.ts` or `src/lib/offlineStore.ts`:
  - [ ] Tables/collections: entities (packingLists, items), changeQueue (op entries), metadata (lastSyncAt, clientId, schemaVersion).
  - [ ] Provide atomic operations: applyLocalChange(op), getPendingOps(), markOpSuccess(opId, serverAppliedAt), markOpFailure(opId, err).
  - [ ] Expose simple CRUD APIs that mirror existing client APIs (so UI code calls the same methods whether online or offline).
- [ ] Unit tests for offline store (happy path + DB initialization + migration test).
  - Progress: `src/lib/offlineStore.ts` created with stores for packing lists, items, change_queue and meta. Basic methods added. Initial unit test added at `src/__tests__/offlineStore.test.ts`.

3) Client: queueing user actions
- [ ] Patch UI action handlers (or wrap API client `src/api.ts`) to:
  - [ ] Write change to local store immediately and update UI optimistically.
  - [ ] If online, attempt immediate sync of this op (fast path). If offline, leave it queued.
- [ ] Add metadata: opId (UUID), clientTs, retries count.
- [ ] Tests for optimistic update behavior.

4) Server: sync endpoints
- [ ] Add server endpoint(s) under `server/routes.ts` and route handlers in `server/repositories.ts` (or a new `sync` repo):
  - [ ] POST /api/sync/push — accepts an array of client ops (id, type, entity, payload, clientTs, clientId). Server applies ops in order and returns per-op result (success/failure, serverTs, resolved entity state).
  - [ ] GET /api/sync/pull?since=timestamp — returns server-side changes since lastSyncAt (templates, remote edits, deletions).
- [ ] Implement idempotency checks (opId) so re-sent ops don't cause duplicates.
- [ ] Add tests for sync endpoints (unit + integration using `server/__tests__`).

5) Client: sync engine
- [ ] Implement a small sync engine `src/contexts/syncEngine.ts`:
  - [ ] Periodic background sync (configurable interval, e.g., 15s or on reconnect).
  - [ ] Push local pending ops in reasonably sized batches, handle per-op results, mark ops as applied, and update local entities with server responses.
  - [ ] Pull server changes since lastSyncAt and apply them locally, resolving conflicts.
  - [ ] Retry/backoff strategy for failures.
- [ ] Hook sync engine into app lifecycle (start on app mount, pause on logout).
- [ ] Unit tests for sync engine logic (mock network responses).

6) Conflict resolution & UX
- [ ] Implement MVP conflict policy: last-write-wins using serverTs (documented).
- [ ] Add data model support for tombstones (deletions).
- [ ] Add small conflict UI where needed (`src/components/ConflictToast.tsx`) to show non-trivial conflicts and let user choose resolution (defer to a follow-up for full UI).
- [ ] Tests for conflict application.

7) Service Worker / background sync (optional MVP)
- [ ] Add a lightweight Service Worker `public/sw.js` to let the app work offline and cache shell assets (basic offline support). Keep it minimal; full Workbox not required.
- [ ] Consider Background Sync API (deferred — flag as optional). If implementing, add a registration and fallback polling.

8) Server: DB bookkeeping
- [ ] Add server-side change tracking (lastModified timestamp and optional change log table) if not present; ensure all mutating operations record serverTs.
- [ ] Migrations: add SQL migration(s) under `server/migrations/` for any new tables/columns.
- [ ] Update `server/seed-templates.ts` if templates need to be versioned for sync.
- [ ] Add tests for DB change tracking.

9) Tests & CI
- [ ] Unit tests for offline store, queue, sync engine.
- [ ] Integration tests for server sync endpoints and for end-to-end offline-flow in `server/__tests__/` (use existing integration test patterns).
- [ ] E2E test(s) simulating offline mode then online restore (Playwright or local integration test harness). At minimum simulate by stubbing network responses in tests.
- [ ] Run `npx tsc --noEmit` and `npm test` and fix failures.

10) Docs & rollout
- [ ] Update `docs/implementation-checklist.md` to mark milestone 6 tasks added.
- [ ] Add a short `docs/offline-sync.md` describing the design, data shapes, conflict policy, and how to test.
- [ ] Add release notes and migration instructions (server migrations to run).

11) Post-MVP improvements (follow-ups)
- [ ] Better conflict UI and merge tooling for lists/items.
- [ ] CRDT or operation-transformation based merge for critical shared resources (long-term).
- [ ] Background Sync API integration and push notifications for remote changes.
- [ ] Performance: chunking, compression of sync payloads, bandwidth-saving heuristics.

Quality gates (before merge)
----------------------------
- [ ] Typecheck: `npx tsc --noEmit` — pass.
- [ ] Tests: `npm test` — pass (existing tests + new tests).
- [ ] Linting: `npm run lint` — pass (if lint configured).
- [ ] Manual smoke: create family and templates, then simulate offline create/change and sync.

Estimates & priorities
----------------------
- M1 (core): client local store + queue + basic sync push/pull, server push/pull endpoints, unit tests — 2–4 days.
- M2 (hardening): conflict UI, service worker, integration/E2E tests, migration — 1–2 days.
- M3 (polish): background sync, CRDT research, performance tuning — follow-up work.

Notes & assumptions to confirm
------------------------------
- Confirm acceptable conflict policy (LWW vs manual merge). For MVP I'll use LWW.
- Confirm preferred IndexedDB wrapper (I suggest `idb`).
- Confirm whether server will accept a new sync endpoint or we should reuse existing APIs with added idempotency fields.

Next steps (if you approve)
---------------------------
- I'll open an implementation plan for the first small increment: add a client `offlineStore` module with unit tests and type definitions in `src/shared/types.ts` for queued ops. Then implement basic local persistence and wrap API calls to write to the store.

Requirements coverage
---------------------
- Offline persistence: planned and scoped — Done (this doc).
- Local queueing and sync: planned in tasks 2–5.
- Tests: explicit test tasks in 9.
- Server endpoints: planned in 4 and 8.

