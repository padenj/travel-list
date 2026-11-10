# Every list belongs to a trip

Date: 2026-11-09
Builds on: `2026-11-08-multi-destination-trips-design.md`

## Why

User testing of multi-destination trips showed four problems:

- Destination list names don't match each other. The adopted source list keeps its old name ("Mexico"), and new lists get names like "Cabo – Cabo".
- The Packing Lists page shows each destination as its own row.
- There is no way to edit destinations or split again from the dashboard or the Packing Lists page.
- "Active" is a list, but people think of the active thing as a trip.

The fix is to make the model the same everywhere. **Every packing list belongs to exactly one trip, through exactly one destination**, and the family's active item is a trip.

## Decisions

- Labels are built from the trip and destination names: "Cabo · San Lucas". When the two names are equal (ignoring case and surrounding spaces), the label is just "Cabo".
- The Packing Lists page shows one card per trip. When a trip has two or more destinations, each destination appears as a sub-row inside the card.
- Destinations are managed from a `ManageDestinationsDrawer`. It can be opened from the dashboard, the Edit list dialog and the Packing Lists page.
- Existing lists are moved into trip shells by a migration.
- Splitting becomes "+ Add destination", plus moving people between destinations. The Split dialog is removed.

## Data model

- Every live packing list has exactly one live `trip_destinations` row, and every live trip has at least one destination.
- `families.active_packing_list_id` is kept. The active trip is the trip of that list, and the dashboard always shows the whole trip. The per-user active override (`ActivePackingListContext`) is unchanged.
- `trips.start_date` and `trips.end_date` become optional in the API. The columns are already nullable.
- The stored `packing_lists.name` is always kept equal to the label. It is rewritten when a destination is created or renamed, when a list is adopted, and when the trip is renamed. This way code that only sees the raw list name still shows the right text.

## Migration `20261109_01_trip_shells_for_lists.cjs`

Runs in a transaction. The migration runner already backs up the database first.

1. **Lists linked through `trip_packing_lists` without a destination:**
   - The list becomes a destination of that trip, named after the trip, with the list's members.
   - If any of its members already belongs to another destination of that trip, the list gets its own shell trip instead (step 2).
2. **Every other live list with no destination:**
   - Create a trip with `name` = the list name, no dates, `status` = `'planning'` and the list's `family_id`.
   - Create one destination with the same name, `position` 0, the first destination color, and the list's existing members. Lists with no members are allowed.
   - Link the list through `trip_packing_lists`.
3. **Live trips that still have no destination:** create one, named after the trip, with a new list and every member of the trip's family, matching `POST /trips`.
4. **Renames:** set every destination list's `packing_lists.name` to its label.
5. **Tracking:** record the ids of the trips, destinations and lists created by this migration in a `migration_trip_shells` table.
6. **Down migration:**
   - Deletes the recorded destinations, the lists it created, and the shell trips (links cascade), then drops the tracking table.
   - The old list names are not restored. The pre-migration backup is the fallback for them.

## Server

### Labels

`destinationListLabel(tripName, destinationName)` lives in `server/utils/destinationLabel.ts`. A copy in `client/src/utils/destinationLabel.ts` uses the same logic and the same tests.

### Moving people between destinations

`moveMembersTx(db, { fromListId, toListId, memberIds })` lives in `tripSplitService`. It handles each personal row on the source list (a row whose item is not whole-family):

- If every owner of the row who is on the source list is moving, the row is moved.
- If some of those owners are moving and some are staying, the row is copied for the movers, and the movers' checks and not-needed marks go with the copy.
- Whole-family rows stay where they are.

The existing split runs on this same logic.

It is used by:

- `PUT /trips/:tripId/destinations/:id` with `memberIds`, when the new members include people from another destination of the same trip. The client sends `moveFrom: true` after the user confirms "Move <name> from <destination>?".
- `POST /trips/:tripId/destinations` under the same condition.

### Shared items on the first added destination

`POST /trips/:tripId/destinations` accepts `sharedItemsTo: 'existing' | 'new'`. It is only relevant when the trip had exactly one destination. `'new'` moves every whole-family row to the new list. The default is `'existing'`.

### Endpoint changes

| Endpoint | Change |
|---|---|
| `POST /trips` | `startDate` and `endDate` are optional. Accepts optional `memberIds` (default: all family members). Creates the first destination, named after the trip, together with its list. |
| `PUT /trips/:tripId` | When the name changes, rename every destination whose name matched the old trip name, then rewrite the list names. |
| `DELETE /trips/:tripId` | Also soft-deletes the trip's destinations and lists. |
| `POST /trips/:tripId/copy` | Body `{ name, includeOneOffs }`. Creates a dateless trip with copies of every destination and its list: members, template links, and items without checks. One-off items are copied only if `includeOneOffs` is set. Bookings and dates are not copied. |
| `POST /families/:familyId/packing-lists` | Also creates a shell trip and destination (old clients and New List). |
| `DELETE /packing-lists/:id` | If the list is its trip's only destination, deletes the trip as in `DELETE /trips/:tripId`. Otherwise deletes the destination, using the existing destination-delete rules. |
| `DELETE /trips/:tripId/destinations/:id` | Returns 409 `last_destination` when it is the trip's only destination. |
| `PUT /trips/:tripId/destinations/:id` | Writes the list name from the label. When `name` changes and the old name equalled the trip name and the trip has one destination, the trip is renamed too. |
| `GET /families/:familyId/packing-lists` | `trip_destination` is always present. |
| `GET /trips` | Dateless trips are included. |

`POST /trips/:tripId/split` stays for old clients and runs on the shared move logic.

## Client

- **`ActivePackingListSelector`:**
  - One entry per trip: "<trip>", or "<trip> · N destinations" when the trip has two or more destinations.
  - Order: dated trips by start date, upcoming trips first, then dateless trips by name.
  - Choosing a trip activates its lowest-position destination list.
- **Dashboard:**
  - The "Split by destination" button is replaced by a **Destinations** button next to "Edit list", which opens the drawer.
  - Section labels use `destinationListLabel`.
- **Edit list dialog (`GlobalListEditDrawer`):**
  - The title is the label.
  - The pencil renames the destination through `PUT /trips/:tripId/destinations/:id`.
  - A "Destinations" link opens the drawer.
- **`ManagePackingLists`:**
  - One card per trip. Title: "<trip>" or "<trip> · N destinations". The ACTIVE badge appears when it is the family's active trip.
  - Actions: Set as active, Destinations, Copy (opens the existing copy drawer, then calls `POST /trips/:tripId/copy`) and Delete (confirm, then `DELETE /trips/:tripId`).
  - With two or more destinations, each one is a sub-row: a color dot, the destination name, member names and **Edit**.
  - A one-destination card shows **Edit** directly.
  - New List keeps its current dialog and endpoint.
- **`ManageDestinationsDrawer` (new):**
  - Mantine `Drawer`, `position="bottom"`, full height on phones. It loads the trip by id and renders `TripPackingSection`.
  - `onClose` makes the opener refresh.
- **`TripPackingSection` / `AddDestinationDialog`:**
  - Moving people sends `moveFrom: true` after the confirmation.
  - When the trip has one destination, the dialog asks "Keep shared items in <existing>" or "Move to <new>".
  - Delete is hidden on the last destination.
- **`TripsPage`:** dateless trips appear under a "No dates" heading. Creating a trip no longer requires dates.
- **Removed:** `SplitListDialog`, its tests, and its entry points in Dashboard and ManagePackingLists.
- **Offline:** destination, trip and copy actions are disabled and show "Needs a connection". Checking items still works offline.

## Errors

| Case | Result |
|---|---|
| Deleting the last destination | 409 `last_destination`. The UI hides the action. |
| Moving people fails partway | Transaction rolled back. 500 with a notification. |
| Migration fails | Transaction rolled back. The server refuses to start, as with any failed migration. The backup is kept. |
| Copy fails | Transaction rolled back. Notification. |

## Testing

- **Unit:** `destinationListLabel` (equal names, case and space differences).
- **Server:**
  - Migration: linked lists, a member conflict that creates a shell trip, unlinked lists, lists with no members, renames, down migration.
  - `moveMembersTx`: move, copy with checks, whole-family rows left in place.
  - Trip create without dates creates the first destination.
  - Trip rename and destination rename keep names in step.
  - Copy.
  - `DELETE /packing-lists/:id`, for a one-destination trip and for a trip with several destinations.
  - `last_destination` 409.
  - `POST /families/:familyId/packing-lists` creates a shell trip.
- **Client:**
  - Selector entries and their order.
  - ManagePackingLists trip cards and sub-rows.
  - The drawer opens from each of its three places.
  - The Edit dialog title and rename.
  - The shared-items choice in AddDestinationDialog.
  - The Trips page "No dates" group.
- **Manual check at 390px:** migrate the shared test database, add a second destination to a one-list trip while moving a person, and confirm their items follow them.
