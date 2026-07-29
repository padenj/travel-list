# Active Family Packing List Design

## Summary

Add a family-wide "active packing list" feature so one user can set the default list for the family.  
The active list becomes the default dashboard selection for all family members.  
Users may still manually switch lists as a temporary personal override, but that override is cleared when the family active list changes.

## Goals

1. Allow users with access to the packing lists page to set a list as active.
2. Show active status in the list UI with an **Active** badge.
3. Auto-select the family active list in dashboards by default.
4. Support per-user manual override until another active list is set.
5. Clear overrides for both online and offline users when family active list changes.
6. Update online users in real time.

## Non-Goals

1. Role-based restriction beyond existing page access control.
2. New admin workflows or permission model changes.
3. Additional family-level list policies.

## Existing System Context

- Server persists `families.active_packing_list_id`.
- Existing endpoint exists:
  - `PATCH /families/:familyId/active-packing-list` (validates family/list relationship and updates family record).
- Client already has:
  - `setActivePackingList(familyId, listId)` API helper.
  - `ActivePackingListContext` that manages selected list and local storage persistence.
- `ManagePackingLists` currently renders list rows with Edit/Copy/Delete actions.

## Proposed Design

### 1. UI: Manage Packing Lists

For each packing list row in `ManagePackingLists`:

- If row list ID equals family `active_packing_list_id`:
  - render an **Active** badge.
  - do not render Set as active button for that row.
- If row is not active:
  - render **Set as active** button.
  - clicking calls `setActivePackingList(familyId, listId)`.
  - on success, refresh list data and update badge state.
  - on failure, keep UI unchanged and show error notification.

### 2. Authoritative State Model

Family active list is authoritative and server-backed:

- `family.active_packing_list_id` = family default list.

Client effective selection formula:

- `effectiveListId = userOverrideListId ?? familyActiveListId`.

Manual selection in dashboard creates/updates override metadata.  
Family active list changes invalidate that metadata and force re-selection to family active list.

### 3. Override Persistence and Invalidation

Replace plain persisted `activePackingListId` with family-scoped metadata:

- storage key format: `activePackingListOverride:<familyId>`
- value shape:
  - `overrideListId: string`
  - `baseFamilyActiveListId: string | null`

Rules:

1. User manually selects list:
   - persist override with `baseFamilyActiveListId = currentFamilyActiveListId`.
2. App load or list refresh:
   - read current family active list from server profile.
   - if persisted override exists and `baseFamilyActiveListId === currentFamilyActiveListId` and list still exists, apply override.
   - otherwise clear override and use family active.
3. Family active changes:
   - clear override metadata for that family.
   - set active selection to new family active list immediately.

This guarantees offline users also lose stale overrides after they reconnect/reload.

### 4. Real-Time Behavior

On successful family active update:

- server broadcasts SSE event:
  - `type: "family_active_list_changed"`
  - `familyId`
  - `listId`

`ActivePackingListContext` listens for this event and only applies it when it matches current effective family (including impersonation context).

On match:

1. clear family-scoped override metadata.
2. set in-memory selected list to `listId`.
3. refresh available lists if needed for consistency.

### 5. Dashboard Behavior

Dashboard continues to consume selected list from `ActivePackingListContext`.

Effects:

- If no manual override is valid, dashboard opens on family active list.
- If user manually picks another list, dashboard uses it until next family active change.
- When family active change event arrives, dashboard switches immediately to new active list.

## API and Data Contracts

### Existing Route (kept)

`PATCH /families/:familyId/active-packing-list`

Request:

```json
{ "listId": "<packing-list-id>" }
```

Validation:

1. list exists.
2. list belongs to `:familyId`.
3. caller already authorized by existing family access middleware.

Success response (unchanged):

```json
{ "message": "Active packing list updated" }
```

Additional behavior:

- emit SSE `family_active_list_changed` after successful DB update.

## Error Handling

1. **Set active failures** (`403`, `404`, `500`):
   - show error notification, no optimistic UI mutation retained.
2. **Deleted active list**:
   - on refresh, if active list no longer valid, clear selection and fall back to current valid family active if present.
3. **SSE disconnects**:
   - load-time reconciliation remains source of truth; reconnect refresh re-aligns state.
4. **Malformed local storage**:
   - ignore and fall back to family active.
5. **Cross-family safety**:
   - namespace override keys by family ID and apply SSE only for matching family.

## Testing Strategy

### Server

1. Route test for `PATCH /families/:familyId/active-packing-list`:
   - accepts valid same-family list.
   - rejects cross-family list.
   - persists `active_packing_list_id`.
2. Event test:
   - verifies successful update emits `family_active_list_changed` with correct payload.

### Client Context

1. Applies family active as default when no valid override.
2. Keeps override only when `baseFamilyActiveListId` matches current family active.
3. Clears override and switches list on SSE family active change.
4. Clears stale override on load-time reconciliation when family active changed while user was offline.

### UI Components

1. `ManagePackingLists`:
   - active row shows **Active** badge.
   - non-active rows show **Set as active**.
   - clicking **Set as active** updates active badge state.
2. `Dashboard`:
   - switches immediately when active-change SSE arrives.
   - manual override persists only until next family active change.

## Rollout and Compatibility

1. Backward compatibility:
   - if old `activePackingListId` key exists, ignore/migrate by favoring new family-scoped metadata.
2. No DB migration required (column already exists).
3. No permission model changes required (page-level access rule accepted by product decision).

