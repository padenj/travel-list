# Flight Element Redesign: Travelers, Bookings & Transactions

**Status:** Approved (design)
**Date:** 2026-08-31
**Scope:** Flight trip elements only. Hotel/car/activity elements are unaffected by this pass but the `bookings`/`booking_transactions` tables are named and shaped generically so they can be reused for those element types in a future session without another redesign.

## Background

The current flight element model stores a single flat price (`trip_elements.price_cash/price_points`) and per-leg fields (`flight_legs.price_cash`, `confirmation_number`, `seat_numbers`) that assume one traveler, one confirmation number, and one price for the whole flight. This doesn't support:

- Multiple travelers on the same flight with different confirmation numbers and prices (e.g. Southwest Companion Pass, where the companion is a separate booking paying taxes-only).
- A booking that spans multiple trip elements (e.g. one round-trip PNR covering both a "Departure Flights" and "Return Flights" element).
- Tracking an "advertised" (planned/quoted) price separately from the "actual" amount paid, where actual paid is the sum of individual payment/adjustment transactions (supporting price-drop rebooking history).
- Per-traveler, per-leg seat assignments.
- Managing trip participants/travelers at all — currently a bare, unmanaged database table.

## Goals

1. Add trip participant (traveler) management — both a dedicated panel and inline creation while assigning travelers to a booking.
2. Introduce a **booking** concept: represents one real-world reservation/PNR, with its own confirmation number and per-person advertised price, covering one or more travelers and one or more trip elements.
3. Introduce a **transaction ledger** per booking: append-only records of actual amounts paid (or adjusted, including negative amounts for price drops), each optionally recording a new confirmation number (for rebooking) and free-text notes (e.g. pasted fee/tax breakdowns). Actual price paid is always derived by summing transactions, never manually entered as a total.
4. Add per-traveler, per-leg seat assignments.
5. Auto-generate flight element names from leg airports (e.g. "DEN → LIM"), while remaining user-editable.
6. Preserve existing multi-leg flight element structure (`flight_legs`) unchanged — legs represent shared physical flight/schedule data independent of who's traveling or how they're booked.

## Non-Goals (this session)

- Building the transaction/expense-tracking feature itself (future session) — this design only lays the ledger groundwork.
- Extending bookings/transactions to hotel, car rental, or activity elements (future session, though the schema is intentionally reusable).
- Trip/schedule/itinerary view (future session).
- Research planner (future session).

## Data Model

### Existing tables (unchanged)

```
trip_participants: id, trip_id, user_id (nullable), display_name, created_at
flight_legs:       id, element_id, leg_order, departure_airport, departure_datetime,
                   arrival_airport, arrival_datetime, airline, flight_number,
                   layover_minutes_after, check_price_url, created_at, updated_at
```

`flight_legs.price_cash`, `price_points`, `loyalty_program`, `confirmation_number`, and `seat_numbers` become **deprecated for new elements** — no longer written to by the new create/edit flows. Columns are left in place (no destructive migration needed on that table) since dropping them isn't required for correctness and avoids unnecessary churn; a later cleanup migration can remove them once confidence is high nothing reads them.

### New tables

```sql
CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  confirmation_number TEXT,
  advertised_price_cash REAL,
  advertised_price_points INTEGER,
  loyalty_program TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE booking_links (
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL REFERENCES trip_elements(id) ON DELETE CASCADE,
  PRIMARY KEY (booking_id, element_id)
);

CREATE TABLE booking_travelers (
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES trip_participants(id) ON DELETE RESTRICT,
  PRIMARY KEY (booking_id, participant_id)
);

CREATE TABLE booking_transactions (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount_cash REAL NOT NULL DEFAULT 0,
  amount_points INTEGER NOT NULL DEFAULT 0,
  transaction_date TEXT NOT NULL,
  confirmation_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE flight_traveler_seats (
  id TEXT PRIMARY KEY,
  leg_id TEXT NOT NULL REFERENCES flight_legs(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES trip_participants(id) ON DELETE CASCADE,
  seat_number TEXT,
  UNIQUE (leg_id, participant_id)
);

CREATE INDEX idx_bookings_trip ON bookings(trip_id);
CREATE INDEX idx_booking_links_element ON booking_links(element_id);
CREATE INDEX idx_booking_travelers_participant ON booking_travelers(participant_id);
CREATE INDEX idx_booking_transactions_booking ON booking_transactions(booking_id);
CREATE INDEX idx_flight_traveler_seats_leg ON flight_traveler_seats(leg_id);
```

Deleting a `trip_participants` row is blocked (`ON DELETE RESTRICT` at the app layer, enforced before hitting `booking_travelers`) if they're attached to any booking or seat, with an explicit error message — history should not silently disappear.

### Derived / computed values (not stored)

- **Booking's current confirmation number** = latest (`created_at` desc) `booking_transactions.confirmation_number` that is non-null, else `bookings.confirmation_number`.
- **Booking's actual total paid** = `SUM(amount_cash)`, `SUM(amount_points)` over its transactions.
- **Booking's actual price per person** = actual total ÷ `COUNT(booking_travelers)`, for comparison against `advertised_price_cash/points`.
- **Element-level rollup** (for list/card display) = aggregate advertised and actual totals across all bookings linked to that element via `booking_links`.

### Why this shape

Bookings are trip-scoped, not element-scoped, because a single real-world reservation can span multiple trip elements (e.g., one round-trip PNR covering a "Departure Flights" element and a separately-modeled "Return Flights" element). Seats stay leg-scoped since they vary per physical flight segment and traveler regardless of which booking a traveler is on. Transactions are the single source of truth for money actually paid — this cleanly separates "advertised" (a planning number, editable directly) from "actual" (an append-only ledger), and gives price-change history and rebooking support without extra modeling: a rebook-at-lower-price event is just a new transaction with a negative amount and a new confirmation number.

## API Surface

```
# Participants
GET    /trips/:tripId/participants
POST   /trips/:tripId/participants          { displayName, userId? }
PATCH  /trips/:tripId/participants/:id
DELETE /trips/:tripId/participants/:id      -- 409 if attached to bookings/seats

# Bookings
GET    /trips/:tripId/bookings                     ?elementId= (optional filter)
POST   /trips/:tripId/bookings                     { confirmationNumber?, advertisedPriceCash?, advertisedPricePoints?, loyaltyProgram?, notes?, elementIds: [...], travelerIds: [...] }
GET    /trips/:tripId/bookings/:id                 -- includes travelers, linked elements, transactions, computed totals
PATCH  /trips/:tripId/bookings/:id
DELETE /trips/:tripId/bookings/:id                 -- cascades links/travelers/transactions; confirm in UI
POST   /trips/:tripId/bookings/:id/elements        { elementId }
DELETE /trips/:tripId/bookings/:id/elements/:elementId
POST   /trips/:tripId/bookings/:id/travelers       { participantId }
DELETE /trips/:tripId/bookings/:id/travelers/:participantId

# Transactions
GET    /trips/:tripId/bookings/:bookingId/transactions
POST   /trips/:tripId/bookings/:bookingId/transactions   { amountCash?, amountPoints?, transactionDate?, confirmationNumber?, notes? }
PATCH  /trips/:tripId/bookings/:bookingId/transactions/:id
DELETE /trips/:tripId/bookings/:bookingId/transactions/:id

# Seats
PUT    /trips/:tripId/legs/:legId/seats/:participantId   { seatNumber }   -- upsert
DELETE /trips/:tripId/legs/:legId/seats/:participantId
```

Existing element/leg endpoints (create flight element + legs, autofill) are retained as-is; the payload simply stops including per-leg price/confirmation/seat fields going forward.

## UI Flow

1. **Trip participants panel** — list/add/edit/remove travelers on the trip page. Name-only entries (optional `userId` link reserved for future account linking).
2. **Creating a flight element** — add one or more legs (with autofill as already built). Name auto-generates as `"<first leg departure> → <last leg arrival>"` and updates as legs change, but stops auto-updating once the user types a custom name. No pricing/confirmation/seats captured at element-creation time.
3. **Adding a booking** (from the element detail view) — "+ Add Booking" opens a form: confirmation number, advertised price (cash + points, per-person), loyalty program, notes; a traveler multi-select with inline "+ New traveler"; and an "Also applies to" multi-select of other flight elements in the trip to link (e.g. attach the Return element to the same PNR).
4. **Element detail view** — legs display unchanged; a new "Bookings" section lists each linked booking (confirmation number, travelers, advertised price/person, computed actual total + actual/person, expandable transaction list). Bookings shared with other elements show "Also covers: <element name>" with a link.
5. **Recording a transaction** — "+ Add Transaction" on a booking card: amount cash/points (can be negative), date (defaults today), optional new confirmation number, free-text notes. Displayed chronologically with running total.
6. **Seats** — per leg, an inline editable seat-number row per traveler (only travelers from bookings linked to that element are selectable).
7. **Trip elements list page** — element card still shows legs summary; price display becomes the aggregated advertised/actual totals across all linked bookings.

## Error Handling & Validation

- Deleting a participant attached to bookings/seats: blocked with an explicit error, not cascaded.
- Deleting a booking: cascades links/travelers/transactions only; confirmation dialog required since transaction history is lost.
- Unlinking the last element from a booking: allowed, with a warning that the booking becomes unattached (still visible from a trip-level bookings view).
- Seats: free-text, no format validation (seat formats vary by airline).
- Transactions: at least one of cash/points must be non-zero to save; date defaults to today if omitted.
- Booking advertised price is optional at creation (can be filled in later).

## Testing Approach

- Repository tests: `bookingRepository` (create, link/unlink elements, add/remove travelers, transaction CRUD, computed totals), `flightTravelerSeatRepository`.
- Route tests: new endpoints for auth, validation, 404s.
- Component tests: participant panel, booking form (inline new traveler + multi-element linking), transaction list/add, seat assignment grid, flight name auto-generation (generates, then stops once user overrides).
- Migration: dev data reset is acceptable (per explicit approval) — no backfill/migration of existing test flight data required.

## Open Follow-ups (explicitly deferred)

- Reusing `bookings`/`booking_transactions` for hotel/car/activity elements.
- Wiring `booking_transactions` into the future expense-tracking feature.
- Removing deprecated columns from `flight_legs` once new model is proven out.
