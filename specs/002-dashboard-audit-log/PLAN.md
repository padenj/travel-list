# Dashboard Audit Log (Per Packing List)

Date: 2026-02-08

## Goal
Track user-triggered actions on the Dashboard in an audit log, with a separate log per packing list:
- Item checked / unchecked
- Item marked not needed / needed
- Item added to list
- Item removed from list

UI requirements:
- A panel at the bottom of the Dashboard, hidden/collapsed by default, that can be opened to reveal the audit log.
- Clicking/tapping an item name opens a small mobile-friendly popup showing audit history for that item only.
- Auto-refresh the audit UI when the packing list changes (prefer SSE-driven refresh).
- Paginate when there are more than 50 entries.

Non-goals (for first iteration):
- Editing/clearing audit history
- Cross-list audit views

## Data Model
Add a dedicated table (do NOT reuse the existing auth-focused `audit_log` table).

Proposed table: `packing_list_audit_log`

Columns:
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `packing_list_id TEXT NOT NULL`
- `packing_list_item_id TEXT NULL` (null for list-level events)
- `actor_user_id TEXT NULL` (null => system)
- `action TEXT NOT NULL` (enum-like string)
- `applies_to_scope TEXT NOT NULL` (`'family' | 'member'`)
- `applies_to_member_id TEXT NULL` (when scope is `member`)
- `details TEXT NULL` (short human-readable description)
- `metadata_json TEXT NULL` (JSON string for future-proofing)
- `created_at TEXT NOT NULL DEFAULT (datetime('now'))`

Indexes:
- `(packing_list_id, id DESC)`
- `(packing_list_id, packing_list_item_id, id DESC)`
- `(actor_user_id, id DESC)` (optional; not required for MVP)

### Actions
- `ITEM_CHECKED`
- `ITEM_UNCHECKED`
- `ITEM_NOT_NEEDED`
- `ITEM_NEEDED`
- `ITEM_ADDED`
- `ITEM_REMOVED`

## Attribution Rules (Actor)
Primary requirement: record the *user that triggered the action*.

- For direct Dashboard actions (check/uncheck, not-needed, add, remove): use `req.user.id`.
- For items added because a template was added to the list: use the user who added/updated the templates on the list (the user in that request).
- For items added to a list because an item was added to a template:
  - If we can plumb `actorUserId` through the in-request template mutation endpoint into the reconcile/propagate path, use that user.
  - If the operation runs asynchronously without request context, fall back to `system`.

Implementation note: the current code has async propagation helpers that lose request context; those paths should record `actor_user_id = NULL` and `details`/`metadata_json` indicating system propagation.

## Applies-To (Scope)
Audit entries must record who the action applied to:
- Whole-family items: `applies_to_scope='family'`, `applies_to_member_id=NULL`
- Per-member items: `applies_to_scope='member'`, `applies_to_member_id=<memberId>`

For check/not-needed routes:
- If request includes `memberId`, scope is `member`.
- Otherwise scope is `family`.

## API
Add two read endpoints:

### List audit
`GET /api/packing-lists/:listId/audit?limit=50&beforeId=<id>`

Response:
```json
{
  "items": [
    {
      "id": 123,
      "packingListId": "...",
      "packingListItemId": "...",
      "actorUserId": "...",
      "actorName": "...",
      "action": "ITEM_CHECKED",
      "appliesToScope": "family",
      "appliesToMemberId": null,
      "details": "...",
      "createdAt": "2026-02-08 12:34:56"
    }
  ],
  "nextBeforeId": 101
}
```

### Item audit
`GET /api/packing-lists/:listId/items/:packingListItemId/audit?limit=50&beforeId=<id>`

Same shape.

Pagination:
- Default `limit=50`, max `100`.
- Use cursor `beforeId` (fetch rows with `id < beforeId`), ordered `id DESC`.

## Server Write Hooks
Write audit entries server-side *after* successful DB writes for:
- `PATCH /packing-lists/:listId/items/:itemId/check`
- `PATCH /packing-lists/:listId/items/:itemId/not-needed`
- `POST /packing-lists/:listId/items` (add)
- `DELETE /packing-lists/:listId/items/:itemId` (remove)

Template-driven list item adds/removes:
- On routes that modify list templates or template contents and then reconcile lists, emit audit entries for newly added/removed list items using actor where available; otherwise `system`.

## UI
### Bottom panel
- Add a collapsed-by-default panel at the bottom of Dashboard.
- Shows latest N (50) audit entries for the active packing list.
- Provides a "Load more" button when `nextBeforeId` is present.
- Auto-refresh:
  - When open, refetch on SSE `packing_list_changed` for the active list.
  - When closed, do not refetch (or only refetch when opened).

### Item popup
- Clicking/tapping an item name opens a small mobile-friendly popup (Mantine `Modal` with `fullScreen` on small screens, or `Drawer` on mobile).
- Displays that item’s audit entries (with pagination).
- Auto-refresh while open on SSE.

## Testing
Server tests:
- Verifies audit rows created for check/uncheck, not-needed/needed, add, remove.
- Verifies per-list query pagination (limit=50, cursor works).
- Verifies per-item query returns only that item.

Client tests (optional):
- Basic render + open/close panel + open modal (if existing client test scaffolding is stable).

## Rollout Notes
- Schema is created via `CREATE TABLE IF NOT EXISTS` at startup (consistent with existing `server/db.ts`).
- Existing databases will auto-create the table on next server start.
