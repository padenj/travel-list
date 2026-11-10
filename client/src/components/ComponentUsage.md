## Component Usage Map

_Generated on 2025-12-30_

This document lists all components in `src/components`, where they are used, and marks unused components for follow up.
## Component Usage Map

_Generated on 2025-12-30 (updated)_

This document lists current supporting components in `src/components` and where they are used. Page components have been moved to `src/pages` and are listed first.

---

## Pages (moved to src/pages)
- CategoryManagementPage — used by `AppRoutes` at `/categories`
- FamilyAdminPage — used by `AppRoutes` at `/admin/family` and `/settings/family`
- PackingListPage — used by `AppRoutes` at `/packing-lists`
- SystemAdminPage — used by `AppRoutes` at `/admin/system`

---

## Components (supporting)

### FamilyMembersTable
**Used in:**
  - `src/pages/FamilyAdminPage`
  - `src/pages/SystemAdminPage`

### CategoryManagementPage (supporting parts)
Uses a searchable Mantine `Select` to choose the active category while preserving custom drag-sort order before showing that category's detail card.
**Used in:**
  - `src/pages/CategoryManagementPage`

### SettingsSecurity
**Used in:**
  - AppRoutes (settings/security)

### ServiceWorkerStatus
**Used in:**
  - `SplitRailLayout`

### SettingsProfile
**Used in:**
  - AppRoutes (settings/profile)

### PasswordRequirements
**Used in:**
  - `FamilyMembersTable`
  - `PasswordChangePage`

### TemplateManager
Searchable item-group manager using a Mantine `Select` picker, an item-only list, an `Add Item` action via `AddItemsDrawer`, and an `Add from categories` snapshot modal.
**Used in:**
  - Route `/templates`
  - `__tests__/TemplateManager.test.tsx`

### AddItemsDrawer
**Used in:**
  - `GlobalListEditDrawer`
  - `src/pages/CategoryManagementPage`
  - `TemplateManager`
  - `ManagePackingLists`
  - `Dashboard`

### VersionText
**Used in:**
  - `SplitRailLayout`
  - `Layout`

### ConfirmDelete
**Used in:**
  - `src/pages/CategoryManagementPage`
  - `BulkEditDrawer`

### ActivePackingListSelector
**Used in:**
  - `Dashboard`

One entry per trip, labelled "<trip>" or "<trip> · N destinations" (`utils/listOptions.ts`). Upcoming trips come first by start date, then past trips (most recent first), then dateless trips by name. Choosing a trip activates its first destination's list.

### SplitRailLayout
**Used in:**
  - Top-level layout in `AppRoutes`

### UpdateBanner
**Used in:**
  - `App.tsx`

### ItemEditDrawer
**Used in:**
  - `GlobalListEditDrawer`
  - `PackingListsSideBySide`
  - `AddItemsDrawer`
  - `ManagePackingLists`
  - `TemplateManager`
  - `src/pages/CategoryManagementPage`
  - `Dashboard`

### BulkEditDrawer
**Used in:**
  - `src/pages/CategoryManagementPage`

### Layout
**Used in:**
  - `VersionText` and other layout contexts

### GlobalListEditDrawer
**Used in:**
  - `SplitRailLayout`
  - `ManagePackingLists`

The title is the list's label. On a destination list the pencil renames the destination, "Destinations" opens `ManageDestinationsDrawer`, and Move in the member-conflict alert moves the person with their items (`moveFrom`). When the trip has two or more destinations, a scrollable row of pill tabs (color dot + destination name) switches between destination lists via `openForList`; tabs are disabled while loading, moving or renaming. The dashboard's "Edit list" opens the selected person's destination in Person view.

### ManagePackingLists
**Used in:**
  - `src/pages/PackingListPage`

One card per trip with Set as active, Edit (one-destination trips), Destinations (`ManageDestinationsDrawer`), Copy (`tripApi.copyTrip`) and Delete (`tripApi.deleteTrip`). Trips with several destinations list each destination with its color, people and an Edit button. Trip actions are disabled offline.

### PackingListsSideBySide
**Used in:**
  - `Dashboard`
  - `ItemEditDrawer`

### Dashboard
**Used in:**
  - AppRoutes (route `/`)

### PackingListAuditPanel
**Used in:**
  - `Dashboard`

### PackingListItemAuditModal
**Used in:**
  - `Dashboard`

### FlightsSection
**Used in:**
  - `pages/TripDetailPage.tsx`

Compact flights table (CSS grid) that reflows to cards on mobile; shows legs, layovers, per-person price and totals.

### ElementDialog
**Used in:**
  - `pages/TripDetailPage.tsx` (hosts `FlightDetailsTab`, bookings and `FlightSeatsTab`)

Generic modal with swipeable Details/Bookings/Seats tabs; full-screen on mobile.

### FlightDetailsTab
**Used in:**
  - `pages/TripDetailPage.tsx` (passed into `ElementDialog`)

Flight legs via `FlightLegList` (inline per-leg edit/add/delete), click-to-edit notes, and delete flight. Reports editing state so tab swipe is disabled while a form is open.

### FlightSeatsTab
**Used in:**
  - `pages/TripDetailPage.tsx` (passed into `ElementDialog`)

Per-leg seat grids via `FlightSeatGrid`.

### AddElementDialog
**Used in:**
  - `pages/TripDetailPage.tsx`

Create-flight modal: `FlightLegsEditor` + notes. No name field — the server titles flights `FIRST → LAST`.

### TripHeader
**Used in:**
  - `pages/TripDetailPage.tsx`

Trip title, badge, dates and Add flight button (floating on mobile).

### TripTravelersStrip
**Used in:**
  - `pages/TripDetailPage.tsx`

Traveler chips plus Manage modal wrapping `TripParticipantsPanel`.

### TripParticipantsPanel
**Used in:**
  - `TripTravelersStrip` (Manage modal)

Lists/add/removes trip travelers (family members and outside guests).

### BookingCard
**Used in:**
  - `pages/TripDetailPage.tsx` (Bookings tab of the flight dialog)

Thin container for one flight's bookings. Receives the trip-wide `bookings` list, shows a "Not booked: …" hint, a "+ Booking" button that opens `BookingForm`, and one `BookingBlock` per booking on this flight. Reports editing state (any form open) so tab swipe is disabled.

### BookingForm
**Used in:**
  - `BookingCard` (create)
  - `BookingBlock` (edit)

Create/edit form: confirmation, loyalty program, advertised prices, notes, flight checkboxes (whole flights, date-sorted), traveler checkboxes with conflict hints "(on ABC123)", and inline "+ New traveler". Server errors (e.g. 409 conflicts) show inline.

### BookingBlock
**Used in:**
  - `BookingCard` (one per booking)

Read-mode booking: confirmation (and original), traveler chips, money line, "Covers:" flights and every covered leg, edit (swaps to `BookingForm`) and delete with a confirm naming the transaction count. Renders `BookingTransactionList` and disables its own edit/delete actions via `actionsDisabled` while a sibling booking's form is open.

### BookingTransactionList
**Used in:**
  - `BookingBlock` (only consumer)

Lists/add/removes transactions for a single booking; supports recording price-drop rebookings (negative amount + new confirmation number) and free-text fee/tax breakdown notes. Reports its transaction count via `onCountChange` and whether its add form is open via `onEditingChange` (both read by `BookingBlock`).

### FlightLegsEditor
**Used in:**
  - `AddElementDialog`

Stack of `FlightLegForm`s ("Leg N") with remove, layover lines between legs, and "+ Leg" (prefilled from the previous leg).

### FlightLegForm
**Used in:**
  - `FlightLegsEditor`
  - `FlightLegList`

Controlled single-leg form: one "Flight #" field (e.g. WN1234), one date, time-only Departs/Arrives, arrival-day chip (Same day / +1 / +2, auto +1 for overnight), airports, price-check link, and FlightStats "Look up".

### FlightLegList
**Used in:**
  - `FlightDetailsTab`

Compact leg rows (`WN1234 · DEN 8:00a → DAL 10:00a`) with ✏️/🗑 per leg, inline `FlightLegForm`, "+ Leg", and delete confirm (hidden for the last leg). Saves via `syncLegs`.

### FlightSeatGrid
**Used in:**
  - `FlightSeatsTab` (once per flight leg)

Inline-editable seat number per trip traveler.
### PersonView
**Used in:**
  - `Dashboard` (Person view; receives `categories` from `Dashboard`'s `getCategories` call)

Person-first packing: a sticky chip row (one per traveler, colored by destination, showing items left), the selected person's items and their destination's shared items, a collapsed "N packed · M not needed" row, swipe to the next or previous person, and a ⋯ menu (Not needed / Move to <destination> / History). Move and not-needed actions are disabled offline (`useOnline`). Section titles are "<person> · <destination>" and "<destination> shared" (no trip name). When the person is the only traveler at their destination, both are combined into one category-grouped section with a "shared" badge on shared rows. `showPacked` keeps packed and not-needed items inline in their category instead of behind the fold-out.

### ShowPackedToggle
**Used in:**
  - `Dashboard` (Person view only)

"Show packed" `Switch`. `useShowPacked` stores the choice in `localStorage.personViewShowPacked` (default off).

### DestinationColumns
**Used in:**
  - `Dashboard` (Columns view)

One `PackingListsSideBySide` per destination (passing `wholeTitle` and `fillViewport`), under a colored "<destination> · <members>" band. The shared column is titled "Shared" for trips.

### DashboardViewToggle
**Used in:**
  - `Dashboard`

Person / Columns `SegmentedControl`. `useDashboardViewMode` stores the choice in `localStorage.dashboardView` (defaults: Person on phones, Columns otherwise).

### NotesDestinationPicker
**Used in:**
  - `Dashboard` (Columns view, trips only)

Chooses which destination's notes and history are shown.

### ManageDestinationsDrawer
**Used in:**
  - `Dashboard` ("Destinations")
  - `GlobalListEditDrawer` ("Destinations")
  - `ManagePackingLists` ("Destinations" on a trip card)

Bottom drawer (full height on phones) that hosts `TripPackingSection` for one trip, so destinations can be added, renamed, re-peopled or deleted without leaving the page. Opening a destination list closes it.

### TripPackingSection
**Used in:**
  - `TripDetailPage`
  - `ManageDestinationsDrawer`

Destination cards with travelers and progress. Tapping a card opens the dashboard; the menu renames, changes travelers or deletes. Delete is hidden on a trip's last destination. Calls `onChanged` after a destination is saved or deleted so the page reloads; write actions are disabled offline.

### AddDestinationDialog
**Used in:**
  - `TripPackingSection`

Create or edit a destination: name, travelers (moving someone from another destination asks first, then sends `moveFrom` so their items follow; `MemberConflictAlert` covers server conflicts), optional item groups, or an existing list (one with no trip, or the only destination of another dateless "shell" trip; dated trips' lists are filtered out). When the trip has one destination, asks whether shared items stay or move to the new one. Calls `onChanged` after saving.

### MemberConflictAlert
**Used in:**
  - `AddDestinationDialog`
  - `GlobalListEditDrawer`

Inline alert shown when a person is already in another destination, with a "Move" action (and a warning when they are that destination's only member). Move is disabled offline.

---
**Note:** This file lists current supporting components only; deleted components were removed from the project and are not included here.