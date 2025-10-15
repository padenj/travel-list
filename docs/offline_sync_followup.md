## Offline sync follow-up

Date: 2025-10-15

Summary
-------
This note records the findings from a codebase review focused on Milestone 6 (Offline Support & Sync).

What exists today
- `sync_ops` table in `server/db.ts` (change-tracking / idempotency scaffolding).
- Service Worker implementation at `public/sw.js` that connects to server-sent events (`/api/events`) and forwards events to clients.
- Server-side provenance and packing-list reconciliation logic already implemented (packing-list templates, provenance rows, and propagation/broadcasting via SSE).
- Template sync endpoint exists (`POST /template/:id/sync-items`) and has integration tests.
- Documentation describing a more ambitious push/pull sync design exists in `docs/OFFLINE_SYNC_IMPLEMENTATION.md` and related docs.

What is intentionally *not* implemented
- Incremental sync endpoints for client push/pull (`POST /api/sync/push`, `GET /api/sync/pull`) are not present in `server/routes.ts` (docs indicate they were removed).
- Client-side background sync engine (e.g. `src/lib/syncEngine.ts` or `src/contexts/syncEngine.ts`) is not present; there is no IndexedDB-backed ops queue implementation in the repository.

Assessment
----------
The current implementation provides the essential pieces to support typical online usage and near-real-time collaboration:

- Packing lists, templates, and reconciliation logic are implemented and well-tested.
- SSE + Service Worker provide a real-time pathway to surface server-side changes to clients while the app is running or installed.
- The `sync_ops` table exists as a server-side scaffold in case we add push/pull behavior later.

Given the project's current priorities and the team note that "the current implementation is sufficient for now", I agree this is an acceptable baseline:

- The application works well when online and for most collaborative flows via SSE.
- Full offline-first sync (client ops queue, push/pull endpoints, conflict resolution surface) is more complex and can be planned as a discrete, testable milestone when needed.

Recommended follow-ups (deferred work)
- If/when full offline-first sync is required, implement the following in an isolated PR:
  - Server: `POST /api/sync/push` to accept client ops and persist results to `sync_ops` (idempotent application and serverTs return).
  - Server: `GET /api/sync/pull?since=<timestamp>` to return server-side deltas (creates/updates/deletes) since the given timestamp.
  - Client: a small `syncEngine` (IndexedDB-backed queue) that pushes pending ops, applies server responses, and pulls deltas.
  - Tests: unit + integration coverage for push/pull flows and conflict resolution (last-writer-wins or chosen strategy).

- In the interim, add a short README or release-note entry documenting the current offline surface (SSE + SW) and the decision to defer push/pull sync.

If you'd like, I can scaffold minimal `POST /api/sync/push` and a `syncEngine` client in a follow-up change.
