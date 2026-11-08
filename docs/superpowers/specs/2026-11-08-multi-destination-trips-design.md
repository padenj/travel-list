# Multi-Destination Trips

Date: 2026-11-08

## Goal

Let a family pack for one trip where members go to different places. For example, the parents go to Paris while the kids stay at Grandma's. Each destination has its own packing list, including its own shared ("whole family") items. The dashboard shows the whole trip at once and is easy to use with one hand on a phone.

## Decisions

- The **Trip** owns its destinations. Each destination links to exactly one packing list.
- Each person belongs to **exactly one** destination per trip.
- A split trip can be set up by **splitting an existing list** or **from scratch** on the Trip page.
- When a list is split, all of its shared items go to **one chosen destination**. They can be moved later, one at a time.
- The dashboard has a **Person / Columns** toggle on every list. It is remembered per device and defaults to Person on phones (below the `sm` breakpoint) and Columns on wider screens.

## Data model

New table `trip_destinations` (added by migration `server/migrations/migrations/20261108_02_add_trip_destinations.cjs` and to the schema in `server/db.ts`):

| Column | Notes |
|---|---|
| `id` | TEXT PRIMARY KEY |
| `trip_id` | References `trips(id)`, ON DELETE CASCADE |
| `name` | TEXT NOT NULL |
| `color` | TEXT. A Mantine color name such as `blue` or `green`, assigned in order when the destination is created |
| `position` | INTEGER, used for display order |
| `packing_list_id` | References `packing_lists(id)`. UNIQUE among rows that are not deleted |
| `created_at`, `updated_at`, `deleted_at` | Standard columns |

- **Who is at each destination** comes from the existing `packing_list_members` of the destination's list. Membership is not stored a second time.
- **One destination per person:** when members are written, the server returns 409 if a user is already a member of another destination's list in the same trip.
- **Trip links:** each destination's list is also added to `trip_packing_lists`.
- **Family users only:** only family users (`users` rows) can be assigned to a destination. External guests (participants with no `user_id`) cannot.
- **Trip participants:** whenever a person is assigned to a destination, the server adds them as a trip participant if they aren't one already (`display_name` = the user's name).
- **Item ownership is unchanged:** an item belongs to people through `item_members` on the master item. A person sees an item in a list when they are both assigned to the item and a member of the list.

## Server API

All routes require authentication and check that the trip belongs to the user's family.

| Route | Behavior |
|---|---|
| `GET /trips/:tripId/destinations` | Returns destinations ordered by `position`, each with `{ id, name, color, position, packingListId, memberIds }`. |
| `POST /trips/:tripId/destinations` | Body: `{ name, memberIds, itemGroupIds?, packingListId? }`. Creates a new list named `"<trip name> – <destination name>"`, or adopts the existing `packingListId`. Then sets the members, adds the item groups using the existing populate-from-template logic, and links the list to the trip. |
| `PUT /trips/:tripId/destinations/:destinationId` | Body: any of `{ name, color, position, memberIds }`. Member changes enforce the one-destination rule. |
| `DELETE /trips/:tripId/destinations/:destinationId` | Body: `{ moveSharedItemsTo?: destinationId, deleteList?: boolean }`. Returns 409 if the list has items and neither option is given. Without `deleteList`, the list is kept as an ordinary list. |
| `POST /trips/:tripId/split` | Body: `{ sourceListId, destinations: [{ name, memberIds }], sharedItemsDestinationIndex }`. See "Split" below. |
| `POST /packing-lists/:listId/items/:pliId/move` | Body: `{ toListId }`. Both lists must be destinations of the same trip. See "Move" below. |
| `GET /packing-lists/:id` | Adds `trip_destination: { tripId, tripName, destinations: [...] } \| null` to the response. |
| `GET /families/:familyId/packing-lists` | Adds `trip_destination` (`{ tripId, tripName, destinationId, destinationName, position, destinationCount }` or null) to each list so the selector and Manage Lists can group and label them. |

### Split (single transaction)

1. Destination 0 adopts the source list. The source list keeps its id, notes and audit history.
2. A new list is created for each other destination, and members are set on every destination's list.
3. For each item in the source list:
   - **Whole-family item:** moved to the destination at `sharedItemsDestinationIndex` (stays in place when that index is 0).
   - **Personal item:** a copy is placed in every destination that has at least one person assigned to the item. The original stays in destination 0 if any of its people are there; otherwise it moves to the first matching destination. Each person's check and not-needed rows move with them, to the copy in that person's destination.
   - **Item belonging to no one at any destination:** left in destination 0 and counted in the response as `skippedCount`.
4. A `packing_list_changed` event (`change: 'split'`) is sent for every affected list.

If any step fails, the whole transaction rolls back and the server returns 500. Nothing is changed.

### Move

- Moves a whole-family item, along with its check and not-needed rows, to `toListId`.
- If the target list already has an item with the same master item id, the two are merged. The merged item is checked if either was checked.
- A `packing_list_changed` event (`change: 'move'`) is sent for both lists.
- Only whole-family items can be moved. Personal items return 400, because they follow their person.

### Deleting a trip

Trips are soft-deleted, so `TripRepository.deleteTrip` also soft-deletes the trip's `trip_destinations` rows. Their packing lists are kept as ordinary lists.

## Client: setup

### Split dialog (`SplitListDialog`)

Opened from "Split by destination" in the dashboard list menu and in Manage Lists. Uses a Mantine `Modal`, full screen on phones.

1. **Trip:** pick an existing trip, or create a new trip (the default) with a name (defaults to the list name) and start and end dates (required by the trips API).
2. **Who goes where:** destination chips that can be renamed (default two, named "Destination 1" and "Destination 2"; "+" adds more). Each person gets a row with a segmented control to choose their destination. "Next" stays disabled until every list member is assigned and every destination has at least one person.
3. **Shared items:** "Where should the N shared items go?" with one radio button per destination. A note explains that personal items follow each person and that checks are kept.

Confirming calls `POST /trips/:tripId/split`. When the user picked "new trip", the client first creates the trip with the existing create-trip API. If `skippedCount > 0`, the success notification says how many items were left in the first destination.

### Trip page: Packing section (`TripPackingSection`)

- **Destination cards:** shown on `TripDetailPage` below the travelers strip. Each card shows the colored bar, name, member names, item count and percent packed. Tapping a card makes that list active and opens the dashboard.
- **Adding a destination (`AddDestinationDialog`):** the "+ Add destination" button (labeled "Set up packing" when the trip has no destinations) opens a dialog with a name field, member chips and optional item-group chips. A member already assigned elsewhere is dimmed. Tapping them asks "Move <name> from <destination>?" and confirming moves them.
- **Use an existing list:** a link that adopts an existing list as a destination.
- **Card menu:** Rename, Change members, Delete. Delete follows the rules for `DELETE /trips/:tripId/destinations/:destinationId`.

## Client: dashboard

### Data

The item-grouping logic inside `Dashboard.tsx`'s load effect moves into a pure helper, `buildDestinationGroup()` in `client/src/utils/dashboardGroups.ts`. The load effect stays in `Dashboard.tsx` (its notes tests depend on it) and now produces `groups: DestinationGroup[]` plus `trip: { id, name } | null`, where each `DestinationGroup` is `{ destinationId | null, name, color, listId, members, userLists, wholeFamilyItems, notNeededByUser, notNeededWhole, notes }`.

- **Ordinary list:** the load produces one group with `destinationId: null`.
- **Split trip:** it loads all destination lists in parallel.
- **Real-time updates:** the dashboard reloads when a `server-event` arrives for any list id in `groups`.

### Selector

`ActivePackingListSelector` replaces a trip's destination lists with a single entry, "<trip name> · N destinations". Selecting it sets the active list to the destination with the lowest `position`.

This works with the existing family active list and per-user override (`ActivePackingListContext`, `families.active_packing_list_id`). Whichever destination list is active, the dashboard shows the whole trip.

- **Selector match:** the selector treats the trip entry as selected when the active id is any of the trip's destination lists.
- **Manage Lists:** destination lists show a "<trip name> · <destination>" badge. "Set as active" on any of them makes the trip active for the family.

### View toggle

A `SegmentedControl` (Person / Columns) sits in the dashboard header. The choice is stored in `localStorage` under `dashboardView`. Without a stored value, it defaults to Person below the `sm` breakpoint and Columns at `sm` and wider.

### Person view (`PersonView`)

- **Chip row:** pinned to the top and horizontally scrollable, one chip per person across all groups. Chips are ordered with the current user first, then by group order and member order. Each chip has its group's color and shows the number of unpacked items still needed (✓ when it reaches zero).
- **Initial selection:** the current user if they are on this list, otherwise the first person.
- **Sections:** below the chips are two sections, the person's own items (titled "<name> · <destination>", or just "<name>" for ordinary lists) and their group's shared list (titled "<destination> shared", or "Shared" for ordinary lists).
  - Unpacked items are listed first. Packed items collapse into a "▸ N packed" row that expands when tapped.
  - Each section's ＋ opens `AddItemsDrawer` for that person or for the group's whole-family column.
- **Swiping:** a horizontal swipe of at least 50px, mostly sideways, selects the next or previous person. Swipes are ignored when they start in an input or a horizontally scrollable element.
- **Shared item ⋯ menu:**
  - Not needed (existing toggle).
  - "Move to <destination>", one entry per other group. Shown only for split trips, and disabled while offline.
  - History (existing item audit).

### Columns view (`DestinationColumns`)

Each group is rendered with the existing `PackingListsSideBySide` under a header band in the group's color: "<destination> · <member names>". The whole-family column is titled "Shared". Ordinary lists render exactly as they do today, with no band.

### Notes and history

The notes editor and the audit panel act on one group. In Person view, that is the selected person's group. In Columns view, a small destination `Select` above the panel picks the group. Ordinary lists don't show the picker.

## Edge cases

- **Removing a person from a destination:** this removes them from that list's members, the same as today. Their checks stay in the list's history but no longer show.
- **A trip with one destination left:** it works as a single group (one band, one "<destination> shared" section). Nothing needs to be merged back.
- **Selecting a destination list directly** (for example, an old active-list id or a tap on a Trip page card): the dashboard still loads the whole trip, because the trip is found through `trip_destination` on the list response.

## Offline

Checking items and toggling not-needed work offline through the existing per-list sync. Split, move, and destination changes need a connection. While offline their buttons are disabled and show "Needs a connection".

## Error handling

| Case | Response | Client behavior |
|---|---|---|
| Person already in another destination | 409 `{ error: 'member_in_other_destination', memberId, destinationId }` | Asks whether to move them. Confirming re-sends the request with the member removed from the other destination first. |
| Delete a destination that has items, without an option | 409 | Offers "Move shared items to <X> and delete" or "Delete list too". |
| Move a personal item | 400 | Not possible from the UI, because only shared items show the action. |
| Lists not in the same trip, or a trip from another family | 400 / 403 | Generic error notification. |
| Split fails | 500, rolled back | Notification. The list is unchanged. |

## Components and files

| Unit | Responsibility |
|---|---|
| `server/repositories/tripDestinationRepository.ts` | CRUD, the one-destination rule, member updates. |
| `server/services/tripSplitService.ts` | Split and move logic, run inside transactions. |
| `server/utils/transaction.ts` | `withTransaction(db, fn)` helper. |
| `server/routes/tripRoutes.ts` | Destination, split and move routes. |
| `client/src/api/tripApi.ts` | `tripApi.listDestinations`, `createDestination`, `updateDestination`, `deleteDestination`, `splitList`. A 409 response throws `ApiConflictError`, which carries the response body. |
| `client/src/api.ts` | Helper `movePackingListItem`. |
| `client/src/utils/dashboardGroups.ts` | Pure helpers: build one destination group from a list response; person ordering and counts for Person view. |
| `client/src/components/PersonView.tsx` | Person-first view. |
| `client/src/components/DestinationColumns.tsx` | Grouped columns. |
| `client/src/components/SplitListDialog.tsx` | Three-step split dialog. |
| `client/src/components/TripPackingSection.tsx`, `AddDestinationDialog.tsx` | Packing section of the Trip page. |
| `Dashboard.tsx` | Becomes a thin container: header, toggle, view and panels. |

Docs to update: `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`, `docs/ServerAPIUsage.md`.

## Testing

- **Server (vitest):**
  - Destination repository CRUD and the 409 for a person in two destinations.
  - Split: a personal item shared across destinations is copied with each person's checks; shared items go to the chosen destination; skipped items are counted; a failure partway through rolls back.
  - Move, including the merge case.
  - `GET /packing-lists/:id` includes `trip_destination`.
  - Deleting a trip keeps its lists.
- **Client (vitest):**
  - `buildDestinationGroup` and the person-ordering helpers, for ordinary lists and split trips.
  - PersonView: chip order, counts, the packed-items row, swiping.
  - DestinationColumns: header bands.
  - SplitListDialog: step validation.
- **Manual check in a browser at 390px width** (the repo's Playwright setup is only a scaffold with no login): split a list, check an item in Person view, move a shared item, and confirm it appears in the other destination.

## Out of scope

- Packing columns for guests.
- A person in more than one destination.
- Merging destinations back into one list.
- Moving personal items between destinations.
