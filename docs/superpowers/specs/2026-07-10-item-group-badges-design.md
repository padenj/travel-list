# Item Group Badges on Manage Categories and Item Groups

## Overview

Add item-group badges to item rows on:

1. **Manage Categories** page (card layout)
2. **Item Groups** page (list layout)

Each item should display badges for every item group that currently contains that item. On the Item Groups page, this includes the currently selected item group.

## Goals

1. Show item group memberships directly on both pages without extra user action.
2. Reuse existing item-fetch flows already used by each page.
3. Keep changes backward-compatible for existing API consumers.

## Non-goals

1. Add a new standalone membership endpoint.
2. Introduce overflow behavior such as `+N`; all badges should render.
3. Include group IDs in badge payloads; names only are required.

## API and Data Contract

Extend existing item payloads returned by the current endpoints used by:

1. Manage Categories item retrieval
2. Item Groups item retrieval

Add an additive field:

```ts
itemGroupNames: string[]
```

Rules:

1. Contains every item group name that includes the item.
2. Includes the currently selected group when viewing the Item Groups page.
3. Uses alphabetical ordering for stable rendering.
4. Returns `[]` when the item belongs to no groups.

This field is optional for consumers and does not remove or rename existing response fields.

## Backend Design

1. Keep existing endpoint routing and request shapes unchanged.
2. In the response-building layer for item list endpoints, enrich each item with `itemGroupNames`.
3. Build memberships from existing item-group relationship data already available in persistence.
4. Prefer one membership lookup per response scope (family/group context) and map results by item ID to avoid per-item DB fan-out.

## Frontend Design

### Manage Categories page

1. In each item card, render a badge row adjacent to the item name area.
2. Render all values from `item.itemGroupNames`.
3. Allow wrapping to multiple lines.
4. Preserve existing member-assignment text and action icons.

### Item Groups page

1. In each item list row, render badges on the right side of the row.
2. Render all values from `item.itemGroupNames`.
3. Keep existing edit/remove actions and membership text behavior.
4. Allow wrapping without clipping.

### Badge styling

1. Small chip-like badges consistent with existing Mantine UI language.
2. Subtle background/border for readability; no overflow indicator.
3. Deterministic visual ordering using the already-sorted `itemGroupNames` from API.

## Error Handling

1. If membership enrichment cannot be produced, do not fail the entire page load by default.
2. Return items with `itemGroupNames: []` when memberships are unavailable.
3. Preserve existing endpoint success/error semantics and status codes for current flows.
4. Frontend treats missing/empty `itemGroupNames` as no badges.

## Testing Strategy

### Backend

Add/extend endpoint tests covering:

1. Item in zero groups returns `itemGroupNames: []`.
2. Item in one group returns one name.
3. Item in multiple groups returns all names sorted.
4. Item Groups endpoint includes the current group in `itemGroupNames` when item belongs to it.

### Frontend

Add/extend tests for:

1. Manage Categories: renders all badges for an item and supports wrap layout.
2. Item Groups: renders badges on the right side per item row.
3. Empty `itemGroupNames` renders no badges and does not break existing row content.

## Rollout and Compatibility

1. No migration required.
2. Existing clients remain compatible since payload change is additive.
3. UX improvement is immediate once both backend enrichment and page rendering ship.

