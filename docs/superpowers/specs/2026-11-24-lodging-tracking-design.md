# Lodging Tracking — Design

**Date:** 2026-11-24
**Branch:** `add-hotel-lodging-tracking`
**Status:** Approved in brainstorming

## Goal

Track hotel and other lodging stays on a trip, the same way flights are tracked:

- The hotel's name, address, phone, website, check-in/out dates and times, and optional trip destination.
- One or more **rooms** per stay. Each room is a booking with its own booking site (e.g. Expedia), site itinerary number, hotel confirmation number, travelers, advertised price and actual paid.
- Advertised price is the **total for the stay** in cash and/or points, with an "includes taxes & fees" flag. Per-night price is derived.
- Actual paid comes from the existing transaction ledger (supports price-drop rebooking with negative amounts and new confirmation numbers).
- Room details: room type, beds, description.
- Amenities per room: preset checklist plus free text.
- Cancellation per room: refundability, cancel-by date/time, policy text. The trip page highlights upcoming deadlines.
- Coupons per room: code, savings in cash or points, note (reference only).
- Notes on the stay and on each room.

## Domain model decisions

- **Stay** = a `trip_elements` row with `element_type = 'hotel'`. `name` is the hotel name; `notes` are stay notes.
- **Room** = a `bookings` row linked to exactly one hotel element through `booking_links`. Multiple rooms on one Expedia itinerary are separate bookings that share the same `site_itinerary_number`.
- A booking links either flights only or exactly one hotel. Mixing element types, or linking a room to more than one hotel, returns 400.
- `advertised_price_cash/points` mean **per person** for flight bookings and **total for the stay** for room bookings.
- **Travelers are optional** on rooms; flights still require at least one. When set, the existing conflict rule applies: a traveler is in at most one room per stay (one booking per element per traveler).
- Coupons do not affect totals. Actual paid is always the sum of transactions.

## 1. Data model

Migration `server/migrations/migrations/20261124_01_lodging.cjs` (runs at server start through `data/migrations.json`, like the other trip migrations). The same final schema is added to `server/db.ts` `initializeDatabase`.

### 1.1 `hotel_element_details` (rebuilt)

```sql
CREATE TABLE hotel_element_details (
  element_id TEXT PRIMARY KEY REFERENCES trip_elements(id) ON DELETE CASCADE,
  address TEXT,                 -- multi-line, paste-friendly
  phone TEXT,
  website TEXT,
  check_in_date TEXT,           -- YYYY-MM-DD
  check_in_time TEXT,           -- HH:mm, local hotel time
  check_out_date TEXT,
  check_out_time TEXT,
  destination_id TEXT REFERENCES trip_destinations(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The migration creates the new table under a temporary name, copies `element_id, address, check_in_date, check_out_date, created_at, updated_at` from the old table, drops the old table and renames the new one. The old columns `room_type`, `booking_source`, `advertised_price_cash`, `advertised_price_points`, `advertised_loyalty_program` are dropped (no UI ever wrote them; the table is empty in the dev database). `down` restores the old shape, copying the same shared columns back.

Destinations are soft-deleted, so `TripDestinationRepository.deleteDestination` also runs `UPDATE hotel_element_details SET destination_id = NULL WHERE destination_id = ?`. Hydration ignores a `destination_id` whose destination is soft-deleted.

### 1.2 `bookings` (new columns)

```sql
ALTER TABLE bookings ADD COLUMN booking_site TEXT;             -- 'Expedia', 'Direct', ...
ALTER TABLE bookings ADD COLUMN site_itinerary_number TEXT;
ALTER TABLE bookings ADD COLUMN advertised_includes_taxes INTEGER NOT NULL DEFAULT 0;
```

`confirmation_number` holds the hotel's confirmation number for rooms. A transaction's `confirmation_number` still overrides it as the current confirmation.

These columns are generic but are only shown in the room form in this pass.

### 1.3 `lodging_room_details` (new)

```sql
CREATE TABLE lodging_room_details (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  room_type TEXT,              -- standard | suite | studio | 1br | 2br | 3br | other
  beds TEXT,                   -- JSON: [{"type":"queen","count":2}, ...]
  room_description TEXT,
  amenities TEXT,              -- JSON: ["breakfast","fridge",...]
  other_amenities TEXT,
  refundability TEXT,          -- free | partial | nonrefundable
  cancel_by TEXT,              -- YYYY-MM-DDTHH:mm, local hotel time (time optional: YYYY-MM-DD)
  cancellation_policy TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- Bed types: `king`, `queen`, `full`, `twin`, `sofa_bed`, `bunk`, `crib`. Count 1–9.
- Amenity keys: `breakfast`, `fridge`, `microwave`, `kitchen`, `pool`, `hot_tub`, `parking`, `wifi`, `laundry`, `airport_shuttle`, `gym`.

### 1.4 `booking_coupons` (new)

```sql
CREATE TABLE booking_coupons (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  savings_cash DECIMAL,
  savings_points INTEGER,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_booking_coupons_booking ON booking_coupons(booking_id);
```

### 1.5 Derived values (not stored)

- `nights` = days between `check_in_date` and `check_out_date`.
- Room per night = advertised cash (and points) ÷ nights. Hidden when there is no price or no valid dates.
- Stay advertised total = sum of its rooms' advertised prices; stay paid = sum of its rooms' transactions.
- Lodging section total = sum over all stays (each room is linked to one stay, so nothing is double-counted).
- Cancel-deadline state, relative to the client's current date: `ok` (more than 7 days away), `soon` (within 7 days, including today), `passed` (before today, or earlier today when a time is set). Only computed for `refundability` `free` or `partial` with a `cancel_by`.

## 2. API

No new routes. Existing routes are extended.

### 2.1 Stays

- `POST /trips/:tripId/elements` with
  `{ elementType: 'hotel', name, notes?, typeSpecificData: { address?, phone?, website?, checkInDate, checkInTime?, checkOutDate, checkOutTime?, destinationId? } }`.
- `PUT /trips/:tripId/elements/:elementId` accepts `name`, `notes` and a partial `typeSpecificData` (`null` clears a field). For a hotel with no details row, a row is created.
- Validation (400 with `{ error }`): `name` required and non-blank; `checkInDate` and `checkOutDate` required, valid `YYYY-MM-DD`, check-out strictly after check-in; times are `HH:mm` when present. `destinationId` must be a non-deleted destination of the trip (404 otherwise).
- `GET /trips/:tripId/elements` and `GET .../elements/:id` return `hotelDetails: { address, phone, website, checkInDate, checkInTime, checkOutDate, checkOutTime, destinationId }` for hotels (bulk-hydrated in `listElements`).

### 2.2 Rooms (bookings)

`POST /trips/:tripId/bookings` and `PATCH /trips/:tripId/bookings/:id` accept, in addition to the existing fields:

```ts
bookingSite?: string | null;
siteItineraryNumber?: string | null;
advertisedIncludesTaxes?: boolean;
room?: {
  roomType: RoomType | null;
  beds: { type: BedType; count: number }[];
  roomDescription: string | null;
  amenities: AmenityKey[];
  otherAmenities: string | null;
  refundability: Refundability | null;
  cancelBy: string | null;
  cancellationPolicy: string | null;
} | null;                                   // null deletes the room row
coupons?: { code: string; savingsCash?: number | null; savingsPoints?: number | null; notes?: string | null }[];
                                            // full replacement, in order
```

- Booking writes (scalars, links, travelers, room, coupons) happen in one SQLite transaction.
- Validation (400): unknown enum values; bed count outside 1–9 or duplicate bed types; unknown amenity keys; `cancelBy` not `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`; coupon with blank code; `room`/`coupons` sent for a booking that links no hotel.
- Element rule (400): a booking's elements must all be flights, or be exactly one hotel.
- Travelers: required (non-empty) only when the booking links flights. For a hotel booking `travelerIds` may be empty or omitted. The conflict rule (409) applies to both.
- `GET /trips/:tripId/bookings` and `GET .../bookings/:id` return `bookingSite`, `siteItineraryNumber`, `advertisedIncludesTaxes`, `room` (or `null`) and `coupons` (ordered by `position`) on every booking. Bulk-hydrated, so the trip page still needs one bookings call.
- `POST .../bookings/:id/elements` applies the same element rule.

Transactions and seats are unchanged.

## 3. UI

### 3.1 Trip page

- `TripHeader`'s single add button becomes **"+ Add"** opening a menu: **Flight**, **Lodging** (`AddMenu`). On mobile it remains the floating action button and opens the same menu.
- The empty-trip call to action becomes two buttons: "Add a flight", "Add lodging".
- **Lodging section** under Flights, same band/row styles and mobile stacked cards:

```
🛏 Lodging (2)                                         Total $1,840 + 40,000 pts
Hotel                         Dates                     Price             Confirm #
Hyatt Ziva Los Cabos          Mar 1 → Mar 5 · 4 nts     $1,612 ($403/nt)  Exp 7231004 / H-88213   2 rooms
  [Paris]  Free cancel until Feb 27                         ← orange when soon, struck through when passed
```

  - Rows sorted by check-in date, then name.
  - Price: stay advertised total with per-night; when nothing is advertised, paid total; else "—".
  - Confirm #: first room's `Site itinerary / hotel confirmation` (whichever exist); "+N" suffix when rooms have different confirmations.
  - Room-count badge; destination chip in the destination's color when set.
  - Deadline line: the earliest non-passed cancel deadline among rooms; if all have passed, the latest passed one, struck through.
- The "N other elements hidden" note no longer counts hotels.

### 3.2 Add Lodging dialog (`AddLodgingDialog`)

Modal, full screen on mobile. Fields: Hotel name, Address (textarea), Phone, Website, Check-in date + time, Check-out date + time, Destination (select; only when the trip has destinations), Notes. Client validation mirrors the server. Check-out date defaults to check-in + 1 day when empty. After a successful save, the dialog closes and the new stay's `ElementDialog` opens on the **Rooms** tab with the room form already open.

### 3.3 Stay dialog

`ElementDialog` with tabs **Details** and **Rooms (n)**. Swipe is disabled while either tab is editing.

**Details (`LodgingDetailsTab`)**: read view of address (with "Open in Maps" link to `https://www.google.com/maps/search/?api=1&query=<encoded address>`), `tel:` phone link, website link (opens in a new tab), check-in/out with times, nights, destination, notes. ✏️ switches to the same form as the Add dialog; 🗑 shows the inline "Delete this stay? Confirm / Cancel". Deleting is the existing soft delete (same as flights): room bookings stay in the database but are no longer shown, because rows and totals are built from non-deleted elements only.

**Rooms (`LodgingRoomsTab`)**: "+ Room" button, then one `RoomBlock` per room booking:

```
King Suite · 1 × King + 1 × Sofa bed      [Jeremy] [Spouse]          ✏️ 🗑
Expedia 7231004 · Hotel H-88213 · orig H-80000
Adv $1,612 total incl. taxes ($403/nt) · Paid $1,580
🟢 Free cancel until Feb 27, 6:00 PM
Breakfast · Fridge · Microwave · Pool · Rooftop bar
Coupons: EXPEDIA10 −$42.18
Notes…
[transactions table + "+ Transaction"]   (existing BookingTransactionList)
```

- "No rooms yet for this stay" when empty.
- 🗑 uses the existing inline confirm ("Delete room H-88213 and its N transactions?").
- Not-in-a-room hint like flights: `Not in a room: Grandma` (only when at least one room has travelers).

**Room form (`RoomForm`)**, two columns on desktop, one on mobile, grouped with small headings:

- *Booking*: Booking site (Autocomplete: Expedia, Hotels.com, Booking.com, Direct, Chase Travel, Amex Travel, Costco Travel, Capital One Travel; free text allowed), Site itinerary #, Hotel confirmation #, Loyalty program.
- *Price*: Advertised total (cash), Advertised total (points), "Includes taxes & fees" checkbox.
- *Room*: Room type (Select), Beds (`BedsEditor`: rows of bed type Select + count NumberInput, "+ Bed", remove), Room description.
- *Amenities*: Chip group of the preset keys + "Other amenities" text.
- *Cancellation*: Refundability (SegmentedControl: Free / Partial / Non-refundable / unset), Cancel-by date + time, Policy (textarea).
- *Coupons* (`CouponsEditor`): rows of Code, Savings $, Savings pts, Note, remove; "+ Coupon".
- *Travelers*: checkboxes (disabled with "(in room H-88213)" when in another room of this stay) + "+ New traveler"; optional.
- *Notes*.

Save sends one create or update request with `elementIds: [stayId]`. Errors show inline; the form stays open.

## 4. Components & files

Server:

- `migrations/migrations/20261124_01_lodging.cjs`; `db.ts` schema.
- `repositories/tripElementRepository.ts` — hotel create/update/hydrate (single + bulk). Delete is unchanged (soft delete).
- `repositories/bookingRepository.ts` — new columns, room upsert/delete, coupon replace, bulk hydration, element-type rule.
- `repositories/tripDestinationRepository.ts` — clear `destination_id` on delete.
- `utils/lodgingValidation.ts` — pure validators: stay payload, room payload, coupons, enum lists.
- `routes/tripRoutes.ts` — validation, optional travelers for hotel bookings, element rule.

Client:

- `types/trip.ts`, `api/tripApi.ts` — `HotelDetails`, `LodgingRoom`, `BookingCoupon`, widened `Booking` and payloads.
- `utils/lodging.ts` — enum lists and labels (room types, beds, amenities, refundability, booking sites), `bedsLabel`, `amenitiesLabel`, `nightsBetweenDates`, `perNight`, `cancelDeadlineState`.
- `utils/lodgingRows.ts` — row model and section totals.
- Components: `AddMenu`, `LodgingSection` (+ CSS module or shared `FlightsSection.module.css` classes), `LodgingStayForm` (shared by Add dialog and Details edit), `AddLodgingDialog`, `LodgingDetailsTab`, `LodgingRoomsTab`, `RoomBlock`, `RoomForm`, `BedsEditor`, `CouponsEditor`.
- `pages/TripDetailPage.tsx` — lodging rows, tab set chosen by element type, open-on-Rooms after create.
- `components/TripHeader.tsx` — uses `AddMenu`.

Docs: `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`, `docs/ServerAPIUsage.md`.

## 5. Error handling

- All errors inline (`Alert color="red"`); forms stay open on error.
- Deletes use inline two-step confirm.
- Server 400/404/409 messages are shown verbatim (existing `handleResponse` behavior).
- A stay with no rooms shows "No rooms yet" in the row's price/confirm columns as "—".

## 6. Testing

- Unit: `lodgingValidation` (dates order, enums, beds, coupons), `utils/lodging` (nights, per-night, deadline states at boundaries 7 days / today / passed, labels), `lodgingRows` (sorting, totals, confirm label and +N, deadline line choice).
- Server repository: hotel create/update/hydrate incl. bulk list; room upsert/null delete; coupon replace and ordering; element-type rule; optional travelers for hotels; traveler conflict across two rooms of one stay; destination delete clears `destination_id`.
- Server routes: validation 400s, 404 for foreign destination, 409 conflict message.
- Migration: up on a database with and without `hotel_element_details` rows (address/dates preserved), down restores the old shape.
- Components: `LodgingSection` (row content, deadline styling, opens dialog), `AddLodgingDialog` (validation, opens Rooms tab), `LodgingDetailsTab` (maps link, edit, delete confirm), `RoomForm` (payload with beds, amenities, coupons, empty travelers), `RoomBlock` (summary lines), `AddMenu`.
- Existing flight/booking tests stay green.
- New test files are added to the `vitest.config.ts` include whitelist.
- Playwright smoke at 1440×900 and 390px: add a stay with one room; no horizontal overflow.

## Out of scope

- Car rental, parking and activity elements.
- Showing booking site, itinerary number or coupons on flight bookings.
- Price-drop alerts or notifications for cancel deadlines.
- Importing Expedia confirmations.
- Time zones (times are local hotel time as entered).
