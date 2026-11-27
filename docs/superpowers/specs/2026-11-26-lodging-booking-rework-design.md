# Lodging rework: one booking per stay, payment schedule, rooms list

Date: 2026-11-26
Status: Approved design
Builds on: `2026-11-24-lodging-tracking-design.md` (implemented on branch `add-hotel-lodging-tracking`, not yet merged)

## Why

After the first lodging build was tried in the browser, five problems came up:

1. One stay is one reservation. Separate reservations become separate lodging elements. So the booking site, itinerary number, hotel confirmation number, prices, cancellation terms, coupons and transactions belong to the **stay**, not to each room.
2. The user wants both the **average nightly** advertised price and the advertised **total**.
3. The user wants to record what is **due at booking** and what is **due at check-in** (resort fees, taxes), and to see what is **remaining** before reaching the front desk. Car rentals will reuse this later ("due at pickup").
4. Switching tabs while editing a room loses the entered values. Closing with unsaved values must warn.
5. Check-in/out times are always on the hour (check-in usually 3 or 4 PM, check-out 10, 11 or 12). Entry should be one tap.

## Decisions

| Topic | Decision |
|---|---|
| Rooms | A plain list of rooms on the stay: type, beds, description, room amenities, optional travelers. No price or confirmation per room. |
| Amenities | Split. Property-wide amenities are on the stay; room-specific amenities are on each room. |
| Remaining | Remaining = amount due (at booking + at check-in) − paid transactions. Cash and points are computed separately. |
| Unsaved edits | Tabs stay mounted, so switching tabs keeps edits. Closing the dialog with dirty forms asks "Discard unsaved changes?" |
| Stay window | Three tabs: Details · Rooms (n) · Payments (n). |
| Data model | Each stay owns exactly one booking, created with the stay in one transaction. The new money fields on `bookings` are generic, so car rentals can reuse them. |
| Times | Hour-only chips plus an "Other" hour select. Storage is unchanged (`HH:00`). |

## 1. Data model

The branch is unmerged, so migration `server/migrations/migrations/20261124_01_lodging.cjs` and `server/db.ts` are **rewritten in place**. No second migration is added. Dev copies that already ran the old version are re-copied from the original database.

### 1.1 `hotel_element_details` (one row per hotel element)

The columns from the first version stay: `element_id` PK/FK cascade, `address`, `phone`, `website`, `check_in_date`, `check_in_time`, `check_out_date`, `check_out_time`, `destination_id` (FK `trip_destinations`), `created_at`, `updated_at`.

Two columns are added:
- `amenities TEXT`: a JSON array of property amenity keys.
- `other_amenities TEXT`

### 1.2 `lodging_rooms` (new)

| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| element_id | TEXT NOT NULL | FK `trip_elements(id)` ON DELETE CASCADE |
| position | INTEGER NOT NULL DEFAULT 0 | display order (creation order) |
| room_type | TEXT | `standard, suite, studio, 1br, 2br, 3br, other` or NULL |
| beds | TEXT | JSON `[{type, count}]`. Bed types: `king, queen, full, twin, sofa_bed, bunk, crib`. Each type at most once; count 1–9 |
| description | TEXT | |
| amenities | TEXT | JSON array of room amenity keys |
| other_amenities | TEXT | |
| created_at, updated_at | TEXT | |

### 1.3 `lodging_room_travelers` (new)

`room_id` FK `lodging_rooms(id)` ON DELETE CASCADE, `participant_id` FK `trip_participants(id)` ON DELETE CASCADE, PK `(room_id, participant_id)`.

Rule: a participant is in at most one room of the same stay. A violation returns 409 with the message `"<name> is already in another room of this stay"`.

### 1.4 `bookings`: new generic columns

| column | type | meaning |
|---|---|---|
| booking_site | TEXT | e.g. Expedia |
| site_itinerary_number | TEXT | |
| advertised_rate_cash | DECIMAL | advertised average per night (per day for future car rentals) |
| advertised_rate_points | INTEGER | |
| advertised_includes_taxes | INTEGER NOT NULL DEFAULT 0 | applies to both the rate and the total |
| due_at_booking_cash | DECIMAL | |
| due_at_booking_points | INTEGER | |
| due_later_cash | DECIMAL | labelled "Due at check-in" for lodging |
| due_later_notes | TEXT | e.g. "Resort fee $35/nt + city tax" |
| refundability | TEXT | `free, partial, nonrefundable` or NULL |
| cancel_by | TEXT | `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` |
| cancellation_policy | TEXT | |

The existing columns keep their meaning. For lodging, `advertised_price_cash/points` is the **advertised total**, and `confirmation_number` is the **hotel confirmation number** (the original). `loyalty_program` and `notes` are unchanged. The transaction ledger, including rebooks with a new confirmation number, is unchanged.

`booking_coupons` is unchanged: `id, booking_id, code, savings_cash, savings_points, notes, position`.

The table `lodging_room_details` from the first version is **removed** from the migration and from `db.ts`.

### 1.5 One booking per stay

- A booking that links a hotel element links **exactly that one element**. This rule is already in place.
- A hotel element has **at most one** live booking. Creating or relinking a second booking to the same stay returns 400 `"This stay already has a booking"`.
- Hotel bookings never require travelers. Room travelers live in `lodging_room_travelers`; the booking's `travelerIds` stays empty for hotels.

### 1.6 Migration backfill

- Rebuild `hotel_element_details` into the new shape, preserving `address`, `check_in_date` and `check_out_date`.
- For every hotel element **without** a booking, create one: `booking_site` = old `booking_source`, `advertised_price_cash/points` = the old advertised price, and `loyalty_program` = the old advertised loyalty program.
- If the old `room_type` had a value, create one `lodging_rooms` row. Use `room_type` when it matches an enum value; otherwise use `other` with the old text as the `description`.
- `down` restores the old `hotel_element_details` shape (address and dates preserved), drops `lodging_rooms`, `lodging_room_travelers` and `booking_coupons`, and drops the new `bookings` columns. Bookings created by the backfill are left in place.

## 2. API

### 2.1 Elements

`POST /trips/:tripId/elements` with `elementType: 'hotel'`:

```jsonc
{
  "elementType": "hotel",
  "name": "Hyatt Ziva",
  "notes": null,
  "typeSpecificData": {
    "address": "...", "phone": null, "website": null,
    "checkInDate": "2027-03-01", "checkInTime": "15:00",
    "checkOutDate": "2027-03-05", "checkOutTime": "11:00",
    "destinationId": null,
    "amenities": ["breakfast", "pool"], "otherAmenities": "Rooftop bar"
  },
  "booking": {
    "bookingSite": "Expedia", "siteItineraryNumber": "7231004",
    "confirmationNumber": "H-88213", "loyaltyProgram": null,
    "advertisedRateCash": 403, "advertisedRatePoints": null,
    "advertisedPriceCash": 1612, "advertisedPricePoints": null,
    "advertisedIncludesTaxes": true,
    "dueAtBookingCash": 1430, "dueAtBookingPoints": null,
    "dueLaterCash": 182.4, "dueLaterNotes": "Resort fee $35/nt + city tax",
    "refundability": "free", "cancelBy": "2027-02-27T18:00", "cancellationPolicy": null,
    "coupons": [{ "code": "EXPEDIA10", "savingsCash": 42.18, "savingsPoints": null, "notes": null }],
    "notes": null
  }
}
```

- The element and its booking are created in **one SQLite transaction**. `booking` is optional; when it is omitted, an empty booking is still created, so every stay has one.
- `PUT /trips/:tripId/elements/:elementId` accepts the same shape. All fields are partial. `booking` fields are applied to the stay's booking in the same transaction, and `coupons`, when present, fully replaces the list.
- Hydrated hotel elements return `hotelDetails` (now also with `amenities` and `otherAmenities`), `rooms: LodgingRoom[]` (ordered by position, each with `travelerIds`), and `bookingId: string | null`.

### 2.2 Rooms

- `POST /trips/:tripId/elements/:elementId/rooms`: body `{roomType, beds, description, amenities, otherAmenities, travelerIds}`. Returns 201 with the room. Returns 400 if the element is not a hotel, 404 if it is not found.
- `PUT /trips/:tripId/rooms/:roomId`: partial update; `travelerIds`, when present, is a full replacement.
- `DELETE /trips/:tripId/rooms/:roomId`: hard delete.
- Traveler conflict: 409, as in §1.3. Travelers must belong to the trip, otherwise 404.

### 2.3 Bookings

The existing booking endpoints accept and return the new fields in §1.4 for any booking. They no longer accept `room`. Flight behavior is unchanged: travelers are required, and `advertisedPriceCash` stays "per person" in the flight UI. The flight booking form does not show the new fields in this change. The client reads the stay's booking from the trip-wide bookings list by `element.bookingId`.

### 2.4 Validation (`server/utils/lodgingValidation.ts`)

- **Stay:** name required; check-in/out dates `YYYY-MM-DD`, required on create; check-out after check-in; times `HH:mm`; property amenities from the property list.
- **Room:** room type enum; beds as in §1.2; room amenities from the room list.
- **Booking money:**
  - Cash fields are numbers ≥ 0.
  - Points fields are integers ≥ 0.
  - Refundability is an enum value.
  - `cancelBy` matches `YYYY-MM-DD(THH:mm)?`.
  - Coupons each need a code; savings are ≥ 0.
- **Property amenities:** `breakfast, pool, hot_tub, parking, wifi, laundry, airport_shuttle, gym`.
- **Room amenities:** `fridge, microwave, kitchenette, jetted_tub, balcony`.

## 3. Client

### 3.1 Types and helpers

- `types/trip.ts`:
  - `HotelDetails` gains `amenities` and `otherAmenities`.
  - New `LodgingRoom {id, elementId, position, roomType, beds, description, amenities, otherAmenities, travelerIds}`.
  - `TripElement` gains `rooms?` and `bookingId?`.
  - `Booking` gains the §1.4 fields, all optional on the client type.
  - The per-booking `room` is removed.
- `tripApi`:
  - `createElement` / `updateElement` accept `booking`.
  - New `createRoom(tripId, elementId, payload)`, `updateRoom(tripId, roomId, payload)` and `deleteRoom(tripId, roomId)`.
- `utils/lodging.ts`:
  - Split `PROPERTY_AMENITY_OPTIONS` and `ROOM_AMENITY_OPTIONS`.
  - `HOUR_OPTIONS` (00:00–23:00, labelled "3 PM").
  - `CHECK_IN_QUICK = ['14:00','15:00','16:00','17:00']` and `CHECK_OUT_QUICK = ['10:00','11:00','12:00']`.
  - `nightlyPrice(booking, nights)` returns the advertised rate, else the total ÷ nights, else null.
  - `paymentSummary(booking)` returns `{dueCash, duePoints, paidCash, paidPoints, remainingCash, remainingPoints, atCheckIn: boolean, label}`.
  - Other existing helpers are kept.
- Remaining rules, implemented in `paymentSummary`:
  - `dueCash` = `due_at_booking_cash` + `due_later_cash`, with nulls counted as 0. `duePoints` = `due_at_booking_points`.
  - `remainingCash` = max(0, dueCash − actualTotalCash), and `remainingPoints` = max(0, duePoints − actualTotalPoints).
  - If no due fields are set, the summary is null and there is no remaining line.
  - `atCheckIn` is true when remainingCash > 0, remainingCash ≤ dueLaterCash and remainingPoints = 0.
  - Labels:
    - `Remaining $182.40 at check-in` when `atCheckIn` is true.
    - `Remaining $X (incl. $Y due at booking)` otherwise, where Y = remaining − dueLater, shown when > 0.
    - Points use the same pattern.
    - When everything is paid, the label is `Paid in full`.
- `utils/lodgingRows.ts`:
  - Price column: `$1,612.00 ($403.00/nt)`, using `nightlyPrice`. With no advertised total it falls back to the paid amount, else `—`.
  - Confirm column: `itinerary / confirmation`, whichever exist. There is no "+N" any more.
  - Room count comes from `element.rooms`.
  - The deadline comes from the stay's booking.
  - New `remaining: string | null`, set only while remaining > 0.
  - `lodgingTotals` per stay: the due amounts if any are set, else the advertised total, else the paid amount.

### 3.2 Hour picker (`HourPicker`)

- A chip row of quick hours plus an "Other" Mantine `Select` listing every hour.
- The selected value is highlighted. Clicking the selected chip clears it.
- A non-quick stored value shows in the select. A stored value with minutes (legacy) still shows as "3:30 PM".
- Props: `{label, value: string|null, onChange, quick: string[]}`.
- Used for check-in time (`CHECK_IN_QUICK`) and check-out time (`CHECK_OUT_QUICK`).

### 3.3 Stay form (`LodgingStayForm`), shared by `AddLodgingDialog` and the Details edit view

The form is grouped with small headings, two columns on desktop and one on mobile:

- *Hotel:* name, address (textarea), phone, website, check-in date + `HourPicker`, check-out date + `HourPicker`, destination (only when the trip has destinations). Check-out defaults to check-in + 1 day.
- *Booking:* booking site (Autocomplete with the preset sites, free text allowed), site itinerary #, hotel confirmation #, loyalty program.
- *Price:* advertised nightly (cash), advertised nightly (points), advertised total (cash), advertised total (points), "Includes taxes & fees".
- *Payment schedule:* due at booking (cash), due at booking (points), due at check-in (cash), due-at-check-in note.
- *Cancellation:* refundability (SegmentedControl Free / Partial / Non-refundable / Unset), cancel-by date + `HourPicker`, policy.
- *Property amenities:* chips plus "Other amenities".
- *Coupons:* `CouponsEditor`.
- *Notes.*

Drafts: `utils/stayDraft.ts` holds the hotel and booking fields, coupons and amenities. `stayPayload(draft)` returns `{elementType, name, notes, typeSpecificData, booking}`; `stayDraftFromElement(element, booking)` does the reverse. Client validation mirrors the server.

The add dialog title is "Add lodging", with buttons "Save stay" and "Cancel". After a save, the new stay opens on **Rooms** with the room form open.

### 3.4 Stay dialog

`ElementDialog` for hotels has tabs **Details**, **Rooms (n)** and **Payments (n)**. n is the room count and the transaction count respectively.

**Details (`LodgingDetailsTab`):** the read view, in sections:
- Hotel: address with "Open in Maps", a `tel:` link, the website in a new tab, check-in/out with times, nights, destination.
- Booking: "Expedia 7231004 · Hotel H-88213 · orig H-80000", and the loyalty program.
- Price: "Adv $403.00/nt · $1,612.00 total incl. taxes".
- Payment schedule: "Due at booking $1,430.00 · Due at check-in $182.40 (Resort fee…)".
- Cancellation: the label coloured by deadline state, then the policy.
- Property amenities, coupons and notes.

✏️ switches to `LodgingStayForm` with Save and Cancel. 🗑 shows the inline "Delete this stay?" confirm.

**Rooms (`LodgingRoomsTab`):**
- "+ Room" opens a `RoomForm`; each room is shown as a `RoomBlock`.
- "No rooms yet for this stay" when there are none.
- "Not in a room: …" when at least one room has travelers.
- `RoomForm` fields: room type, beds (`BedsEditor`), description, room amenity chips + "Other", travelers (checkboxes, disabled with "(in another room)" when assigned elsewhere in this stay, plus "+ New traveler").
- `RoomBlock` shows the title "Suite · 1 × King + 1 × Sofa bed" and traveler badges, then the description, then room amenities, with edit/delete and an inline confirm "Delete this room?".

**Payments (`LodgingPaymentsTab`):**
- A summary block: "Due $1,612.40 · Paid $1,430.00", then a bold "Remaining $182.40 at check-in" followed by the due-later note. If no amounts due were entered, it shows "Add amounts due on the Details tab to track what's remaining."
- Then the existing `BookingTransactionList` for the stay's booking.

### 3.5 Unsaved changes

- `ElementDialog` renders tabs with `keepMounted` (true), so form state survives tab switches.
- Each lodging tab and form reports **dirty** state through an `onDirtyChange(dirty: boolean)` prop. Dirty means an edit form is open and its draft differs from the draft it started with. `TripDetailPage` ORs the tabs' dirty flags and passes the result to `ElementDialog` as a new `dirty?: boolean` prop. Flight tabs don't report dirty state; that is unchanged.
- On close (X, Esc, overlay click) when any tab is dirty, a confirm modal shows "Discard unsaved changes?" with **Keep editing** (default) and **Discard**. Discard closes the dialog.
- Swipe between tabs stays disabled while any tab is editing. That behavior is unchanged.
- The same close guard applies to `AddLodgingDialog` when its draft differs from empty.

### 3.6 Trip page

`LodgingSection` rows:
- **Name**
- **Dates:** `Mar 1 → Mar 5 · 4 nts`
- **Price:** `$1,612.00 ($403.00/nt)`
- **Confirm:** `7231004 / H-88213`
- **Room-count badge**
- **Sub-line:** destination chip · deadline (orange when soon, struck through when passed) · **Remaining $182.40 at check-in** (bold, only while > 0)

The band total uses `lodgingTotals`.

### 3.7 Removed or replaced client code

- The per-room booking pieces are removed: the `roomDraft.ts` booking parts, the `RoomForm` booking/price/cancellation/coupons groups, and `roomMoneyLine`.
- `RoomBlock` loses `BookingTransactionList`.
- The old room-booking tests are rewritten for the new shapes.

## 4. Error handling

- All errors show inline (`Alert color="red"`). Forms stay open on error.
- 400/404/409 messages are shown verbatim.
- If a stay unexpectedly has no booking (legacy data), the Details tab shows the booking sections as empty. The first save creates the booking (`PUT` with `booking` upserts).

## 5. Testing

- **Server:**
  - Migration up on a DB with legacy hotel rows: details preserved, booking and room backfilled. Down restores the old shape.
  - Stay create/update with a booking in one transaction, including rollback when booking validation fails.
  - A second booking on a stay returns 400.
  - Room CRUD, ordering, and the traveler conflict 409.
  - Validation of the new money and amenity fields.
  - Flight bookings unchanged.
- **Client helpers:**
  - `paymentSummary`: no dues; partial; at check-in; paid in full; overpaid clamps to 0; points.
  - `nightlyPrice`, hour options, row model (remaining line, nightly fallback, confirm label).
  - Stay draft round trip.
- **Components:**
  - `HourPicker`: quick chip, other select, clear.
  - `LodgingStayForm` / `AddLodgingDialog`: booking payload, then opens Rooms.
  - `LodgingDetailsTab`: sections, edit, delete.
  - `RoomForm` / `RoomBlock`.
  - `LodgingPaymentsTab`: summary and empty hint.
  - `ElementDialog` close guard: dirty → modal, Keep editing keeps it open, Discard closes; a tab switch keeps a typed value.
  - `LodgingSection`: remaining line.
- **Regression:** existing flight and booking tests stay green. New test files are added to the `vitest.config.ts` include list.
- **Playwright smoke at 1440×900 and 390×844, against a DB copy:**
  - Add a stay with a booking and amounts due; add a room; record a payment on Payments.
  - The row shows the correct remaining amount.
  - Typing in the room form, switching to Details and back keeps the value; closing prompts.
  - No horizontal overflow.

## Out of scope

- Car rentals. They will reuse the §1.4 fields later.
- Multiple bookings per stay.
- Per-room prices.
