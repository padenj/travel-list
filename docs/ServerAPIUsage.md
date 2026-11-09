# Server API Usage Map

Generated on 2025-12-30

This document maps server routes implemented in `server/routes.ts` to their purpose and the corresponding client helper (if any) exported from `client/src/api.ts`. Routes that are not used by the client are flagged as **UNUSED**.

---

## Templates

- POST /templates
  - Purpose: Create a new template for a family.
  - Client helper: `createTemplate`

- GET /templates/:familyId
  - Purpose: List templates for a family.
  - Client helper: `getTemplates`

- GET /template/:id
  - Purpose: Get a single template by id.
  - Client helper: `getTemplate`

- PUT /template/:id
  - Purpose: Update a template and enqueue propagation to assigned packing lists.
  - Client helper: `updateTemplate`

- DELETE /template/:id
  - Purpose: Soft-delete a template.
  - Client helper: `deleteTemplate`

- POST /template/:id/categories/:categoryId
  - Purpose: Assign a category to a template.
  - Client helper: `assignCategoryToTemplate`

- DELETE /template/:id/categories/:categoryId
  - Purpose: Remove a category from a template.
  - Client helper: `removeCategoryFromTemplate`

- POST /template/:id/items/:itemId
  - Purpose: Assign an item to a template (synchronously propagates to lists).
  - Client helper: `assignItemToTemplate`

- DELETE /template/:id/items/:itemId
  - Purpose: Remove an item from a template.
  - Client helper: `removeItemFromTemplate`

- POST /template/:id/sync-items
  - Purpose: Replace template item set with provided `itemIds` list.
  - Client helper: `syncTemplateItems`

- GET /template/:id/categories
  - Purpose: List categories assigned to a template.
  - Client helper: `getCategoriesForTemplate`

- GET /template/:id/items
  - Purpose: List items assigned to a template.
  - Client helper: `getItemsForTemplate`

- GET /template/:id/expanded-items
  - Purpose: Get categories + items (expanded view) for a template.
  - Client helper: `getExpandedItemsForTemplate`

---

## Items

- POST /items
  - Purpose: Create a master item for a family.
  - Client helper: `createItem`

- GET /items/:familyId
  - Purpose: List master items for a family.
  - Client helper: `getItems`

- PUT /items/:id
  - Purpose: Update an item (name, isOneOff).
  - Client helper: `updateItem`

- DELETE /items/:id
  - Purpose: Soft-delete an item and remove related packing-list rows.
  - Client helper: `deleteItem`

- GET /items/:itemId/categories
  - Purpose: List categories an item belongs to.
  - Client helper: `getCategoriesForItem`

- GET /categories/:categoryId/items
  - Purpose: List items in a category.
  - Client helper: `getItemsForCategory`

- GET /items/:itemId/members
  - Purpose: List members assigned to an item.
  - Client helper: `getMembersForItem`

- GET /items/:itemId/edit-data
  - Purpose: Return aggregated edit-data used by the item editor (categories, members, whole-family state).
  - Client helper: `getItemEditData`

- GET /items/:itemId/whole-family
  - Purpose: Return whole-family assignment (404 if none).
  - Client helper: `isAssignedToWholeFamily`

- POST /items/:itemId/members/:memberId
  - Purpose: Assign an item to a member and broadcast updates.
  - Client helper: `assignToMember`

- DELETE /items/:itemId/members/:memberId
  - Purpose: Remove an item assignment from a member and broadcast updates.
  - Client helper: `removeFromMember`

- POST /items/:itemId/whole-family/:familyId
  - Purpose: Assign item to whole family.
  - Client helper: `assignToWholeFamily`

- DELETE /items/:itemId/whole-family
  - Purpose: Remove whole-family assignment.
  - Client helper: `removeFromWholeFamily`

- PUT /items/:id/checked
  - Purpose: Legacy endpoint to set a single `checked` flag on an item.
  - Client helper: `setChecked`

- POST /items/:itemId/categories/:categoryId
  - Purpose: Assign item -> category.
  - Client helper: `assignItemToCategory`

- DELETE /items/:itemId/categories/:categoryId
  - Purpose: Remove item -> category.
  - Client helper: `removeItemFromCategory`

---

## Categories

- POST /categories
  - Purpose: Create a category for a family.
  - Client helper: `createCategory`

- GET /categories/:familyId
  - Purpose: List categories for a family.
  - Client helper: `getCategories`

- PUT /categories/:id
  - Purpose: Update a category name.
  - Client helper: `updateCategory`

- DELETE /categories/:id
  - Purpose: Soft-delete a category.
  - Client helper: `deleteCategory`

- PUT /categories/:familyId/order
  - Purpose: Update category ordering for a family.
  - Client helper: `updateCategoryOrder`

---

## Packing Lists

- GET /families/:familyId/packing-lists
  - Purpose: List packing lists for family (with member ids and `trip_destination` summary attached).
  - Client helper: `getFamilyPackingLists`

- POST /families/:familyId/packing-lists
  - Purpose: Create a packing list for a family (optionally populate from template). The list gets its own dateless trip with one destination named after the list.
  - Client helper: `createPackingList`

- GET /packing-lists/:id
  - Purpose: Fetch detailed packing list with items, checks, not_needed rows, template ids and `trip_destination` (trip context with all destinations, or null).
  - Client helper: `getPackingList`

- POST /packing-lists/:id/populate-from-template
  - Purpose: Populate an existing list from a template and reconcile items.
  - Client helper: `populatePackingListFromTemplate`

- PUT /packing-lists/:id
  - Purpose: Update packing list metadata (name, template assignments, memberIds, etc.). With `memberIds` on a destination list, enforces the one-destination-per-person rule (409 `member_in_other_destination`). A `name` on a destination list renames the destination; the stored list name becomes its label ("<trip> · <destination>", or the trip name when they match).
  - Client helper: `updatePackingList`

- DELETE /packing-lists/:id
  - Purpose: Delete a packing list. If it is its trip's only destination, the whole trip is deleted (as `DELETE /trips/:tripId`). Otherwise its destination is deleted with the list (`deleteList`).
  - Client helper: `deletePackingList`

- POST /packing-lists/:id/items
  - Purpose: Add an item to the packing list (master item or one-off creation).
  - Client helper: `addItemToPackingList`

- DELETE /packing-lists/:listId/items/:itemId
  - Purpose: Remove a packing-list item (accepts packing_list_item id or master item id).
  - Client helper: `deletePackingListItem`

- PATCH /packing-lists/:listId/items/:itemId/check
  - Purpose: Toggle/set per-user checked state for a packing-list item.
  - Client helper: `togglePackingListItemCheck`

- PATCH /packing-lists/:listId/items/:itemId/not-needed
  - Purpose: Set not-needed flag per-member or legacy whole-item flag.
  - Client helpers: `setPackingListItemNotNeeded`, `setPackingListItemNotNeededForMember`

- POST /packing-lists/:listId/items/:packingListItemId/promote
  - Purpose: Promote a one-off to a master item and (optionally) create a template.
  - Client helper: `promotePackingListOneOff`

- POST /packing-lists/:listId/items/:pliId/move
  - Purpose: Move a shared (whole-family) item to another destination list of the same trip; merges with an existing row for the same master item. 400 for personal items or lists from different trips.
  - Client helper: `movePackingListItem`

---

## Trips

- GET /trips
  - Purpose: The family's trips, including dateless ones.
  - Client helper: `tripApi.listTrips`

- POST /trips
  - Purpose: Create a trip. Only `name` is required; dates are optional. The trip starts with one destination named after it, with `memberIds` (default: every family member).
  - Client helper: `tripApi.createTrip`

- PUT /trips/:tripId
  - Purpose: Update a trip. A rename also renames any destination that had the trip's old name, then renames the destination lists to their new labels.
  - Client helper: `tripApi.updateTrip`

- DELETE /trips/:tripId
  - Purpose: Delete a trip with its destinations and their lists.
  - Client helper: `tripApi.deleteTrip`

- POST /trips/:tripId/copy
  - Purpose: Body `{ name, includeOneOffs }`. Creates a dateless trip with a copy of every destination and its list (members, item groups, unchecked items; one-off items only with `includeOneOffs`). Returns 201 `{ trip, destinations }`.
  - Client helper: `tripApi.copyTrip`

---

## Trip Destinations

- GET /trips/:tripId/destinations
  - Purpose: Destinations of a trip ordered by position, each `{ id, tripId, name, color, position, packingListId, memberIds }`.
  - Client helper: `tripApi.listDestinations`

- POST /trips/:tripId/destinations
  - Purpose: Create a destination with a new list (or adopt `packingListId`, which must have no trip or be the only destination of a dateless "shell" trip — no dates, elements, bookings, locations, guests or other lists; otherwise 400 `list_in_other_trip`), set members, add item groups. 409 `member_in_other_destination` when a person is already in another destination, unless `moveFrom: true`, which moves them with their items. `sharedItemsTo: 'existing' | 'new'` (only used when the trip had one destination) decides where whole-family items go.
  - Client helper: `tripApi.createDestination`

- PUT /trips/:tripId/destinations/:destinationId
  - Purpose: Rename, recolor, reorder or change members (same 409 rule; `moveFrom: true` moves people with their items; 400 `would_empty_destination` if that would leave another destination with nobody). Renaming updates the list name to the label.
  - Client helper: `tripApi.updateDestination`

- DELETE /trips/:tripId/destinations/:destinationId
  - Purpose: Remove a destination atomically. Body `{ moveSharedItemsTo?, deleteList? }`; 409 `last_destination` when it is the trip's only destination; 409 `destination_has_items` when the list has items and neither is given. A kept list moves into its own new trip.
  - Client helper: `tripApi.deleteDestination`

- POST /trips/:tripId/split
  - Purpose: Kept for old clients. Split a list into destinations in one transaction on the shared move logic (personal items follow their people with their checks; shared items go to the chosen destination). Returns `{ destinations, skippedCount }`.
  - Client helper: `tripApi.splitList`

---

## Families & Members

- GET /families
  - Purpose: List all families (SystemAdmin only).
  - Client helper: `getFamilies`

- GET /families/:id
  - Purpose: Get family + members.
  - Client helper: `getFamily`

- POST /families
  - Purpose: Create a family (SystemAdmin only); seeds templates for the new family.
  - Client helper: `createFamily`

- DELETE /families/:id
  - Purpose: Soft-delete a family (SystemAdmin only).
  - Client helper: `deleteFamily`

- POST /families/:familyId/members
  - Purpose: Create a family member (optionally with login credentials).
  - Client helper: `createFamilyMember`

- PUT /families/:familyId/members/:memberId
  - Purpose: Update family member metadata.
  - Client helper: `editFamilyMember`

- POST /families/:familyId/members/:memberId/reset-password
  - Purpose: Reset a member's password (SystemAdmin or FamilyAdmin).
  - Client helper: `resetFamilyMemberPassword`

- PUT /families/:familyId/members/order
  - Purpose: Update ordering/positions of family members.
  - Client helper: `updateFamilyMemberOrder`

- PATCH /families/:familyId/active-packing-list
  - Purpose: Set the active packing list for the family.
  - Client helper: `setActivePackingList`

---

## Users & Auth

- POST /login
  - Purpose: Authenticate and return a JWT token + role.
  - Client helper: `login`

- POST /logout
  - Purpose: Server-side logout endpoint (no-op). **UNUSED** by client — client clears token locally.

- POST /change-password
  - Purpose: Change password for a user (self).
  - Client helper: `changePassword`

- POST /reset-password
  - Purpose: Admin password reset endpoint (admin or family admin flows). **UNUSED** by client — client does not call this route.

- GET /users
  - Purpose: List all users (SystemAdmin only).
  - Client helper: `getUsers`

- GET /users/me
  - Purpose: Get current user profile and family + members.
  - Client helper: `getCurrentUserProfile`

- POST /users
  - Purpose: Create a user (SystemAdmin only).
  - Client helper: `createUser`

- DELETE /users/:id
  - Purpose: Delete a user (SystemAdmin only).
  - Client helper: `deleteUser`

---

## SSE / Events / Debug / Build-info

- GET /events
  - Purpose: SSE endpoint for real-time updates. Client connects directly via `fetch`/EventSource in `client/src/App.tsx` and service worker files; not proxied through `client/src/api.ts`.

- GET /debug/sse-clients
  - Purpose: Debug endpoint that lists SSE clients. **UNUSED** by client.

- GET /build-info
  - Purpose: Return build-time info (version, vcs_ref, build_date) if present.
  - Client helper: `getBuildInfo` (implemented as a direct `fetch` inside `client/src/api.ts`)

---

## Summary of Unused Routes

The following server routes are implemented but not referenced by `client/src/api.ts` or other client code (based on a scan of `client/src`):

- POST /logout — the client clears tokens locally instead of calling this endpoint.
- POST /reset-password — admin-level reset; no UI calls found.
- GET /debug/sse-clients — debug endpoint for server operators.

If you want any of these exposed to the client (for admin UI or user flows), I can add corresponding helpers to `client/src/api.ts` and update `client/src/APIUsage.md`.

---

If you'd like, I can also:
- Commit this file (done).
- Add missing client helpers for any UNUSED routes you want exposed.
- Add a CI check that warns when new API functions or routes are added without updating these docs.

What should I do next?