# Booking & Flight-Leg Editing — Design

**Date:** 2026-11-08
**Branch:** `feat/booking-leg-editing` (stacked on `feat/bookings-tab-compact`)
**Status:** Approved in brainstorming

## Goal

Make bookings and flight legs fully editable from the flight dialog with the least data entry:

- Edit and delete bookings (delete with confirmation).
- Show the legs a booking covers.
- Enforce: a traveler is on at most one booking per flight.
- Replace the whole-flight edit panel with inline per-leg editing (add / edit / remove legs).
- Auto-generate the flight title from the first origin and last destination (`DEN → MCO`).
- Streamline leg fields: one flight-code field, one date, time-only departure/arrival with an arrival-day offset.

## Domain model decisions

- **A flight element is one directional journey** (one-way), made of one or more legs. A round trip is two flight elements.
- **A booking covers whole flight elements**, never individual legs. One-way = one flight, round trip = two flights. Legs booked separately (e.g. a domestic hop on one PNR plus a multi-leg international on another) are modeled as separate flight elements.
- **Separate bookings per traveler** on the same flight are allowed (each booking has its own traveler set).
- **Rule:** for each (flight element, traveler) pair there is at most one booking. Because bookings cover whole flights, this implies "one booking per traveler per leg".
- The schema is unchanged (`booking_links` already links bookings to elements; `booking_travelers` to participants). No table migration is needed; only a data backfill for flight titles.

## 1. Backend

### 1.1 Traveler-conflict rule

`BookingRepository.findTravelerConflicts(tripId, elementIds, travelerIds, excludeBookingId?)` returns
`{ bookingId, confirmationNumber, elementId, participantId }[]` for every other booking in the trip that links any of `elementIds` AND includes any of `travelerIds`. `confirmationNumber` is the booking's current confirmation (latest transaction confirmation, else original).

Applied in:

- `POST /trips/:tripId/bookings` (create)
- `PATCH /trips/:tripId/bookings/:id` when `elementIds` or `travelerIds` is present (checked against the resulting sets, excluding the booking itself)
- `POST /trips/:tripId/bookings/:id/elements` (link one flight)
- `POST /trips/:tripId/bookings/:id/travelers` (add one traveler)

On conflict the route responds **409** with `{ error }` built from the first conflict:
`"<Traveler name> is already on booking <CONF or 'without confirmation'> for <flight name>"`.

Existing data that already violates the rule is left untouched; the rule applies on write only.

### 1.2 Booking edit (single request)

`PATCH /trips/:tripId/bookings/:id` accepts, all optional:
`confirmationNumber, advertisedPriceCash, advertisedPricePoints, loyaltyProgram, notes` (`null` clears) and
`elementIds: string[]`, `travelerIds: string[]` (full replacement; when present must be non-empty; every id must belong to the trip → 404 otherwise; empty → 400).

`BookingRepository.updateBooking` performs scalar updates and link/traveler replacement in one SQLite transaction (`BEGIN`/`COMMIT`/`ROLLBACK`).

Client `tripApi.updateBooking(tripId, bookingId, updates)` type widened to include `elementIds`/`travelerIds` and nullable scalars.

### 1.3 Booking delete

Existing `DELETE /trips/:tripId/bookings/:id` — cascades transactions, links and travelers. No server change.

### 1.4 Automatic flight title

- `flightTitle(legs)` = `"<FIRST.departureAirport> → <LAST.arrivalAirport>"` (uppercase, trimmed). Intermediate stops are not included. If either end is missing/`TBD`, the title is `"Flight"`.
- `TripElementRepository.syncLegs` sets `trip_elements.name` to `flightTitle(savedLegs)` after saving.
- Creating a flight with legs (`POST /elements`, `elementType: 'flight'`): `name` becomes optional; the server sets the title from the created legs. Non-flight elements still require `name`.
- Migration `server/migrations/migrations/20261108_01_backfill_flight_titles.cjs` renames every existing flight element with ≥1 leg using the same rule. `down` is a no-op (old names are not recoverable and not needed).

### 1.5 Legs

Add / edit / remove all go through the existing `PUT /trips/:tripId/elements/:elementId/legs` (`syncLegs`), which already validates airports, times, ordering and refuses zero legs. Deleting a leg cascades its seat assignments. Storage is unchanged (`departure_datetime`, `arrival_datetime` as local `YYYY-MM-DDTHH:mm`; `airline`, `flight_number` columns).

## 2. Flight-leg form (shared)

```
Flight #  [WN1234      ]   Date [08/29/2026]   [🔍 Look up]
From      [DEN]            Departs [08:00 AM]
To        [DAL]            Arrives [10:00 AM]  (Same day | +1 | +2)
Price check link [optional                           ]
                                       [Cancel] [Save]
```

- **Flight #**: one field. Parsed on save by `parseFlightCode`: strip spaces/dashes, uppercase; if it starts with 3 letters followed by a digit → 3-char ICAO airline code (`SWA1234`); otherwise the first 2 characters are the airline code (`WN1234`, `B61234`, `9K123`); the remainder is the flight number. Unparseable input (e.g. only letters) is stored entirely as `flightNumber` with no airline. Displayed via `formatFlightCode(airline, number)` = concatenation (`WN1234`).
- **Date**: single native `type="date"` input = departure date.
- **Departs / Arrives**: native `type="time"` inputs (native pickers on mobile).
- **Arrival day**: Mantine `SegmentedControl` with `Same day | +1 | +2` (offset 0/1/2). Defaults to 0; when the user changes a time and the arrival time is earlier than the departure time, it auto-sets to +1 (`autoArrivalOffset`). Manual selection is respected until the times change again.
- **Look up**: uses the parsed flight code + date via the existing `lookupFlightAutofill`; results are split back into date/times/offset.
- **Validation (client)**: date, both airports and both times required; inline `Alert` on failure. Server validation remains authoritative.
- **Layout**: one column below `48em`, two columns above; inputs use Mantine default sizes (touch-friendly).
- **New-leg defaults**: date = previous leg's arrival date; From = previous leg's To.

Draft model (`utils/flightLegs.ts`):

```ts
interface FlightLegDraft {
  id?: string;
  flightCode: string;      // "WN1234"
  date: string;            // YYYY-MM-DD (departure date)
  departureTime: string;   // HH:mm
  arrivalTime: string;     // HH:mm
  arrivalDayOffset: 0 | 1 | 2;
  departureAirport: string;
  arrivalAirport: string;
  checkPriceUrl: string;
}
```

`legToDraft` splits stored datetimes (offset = whole-day difference, clamped 0–2); `draftToPayload` recombines (`arrival = date + offset days + arrivalTime`) and splits `flightCode` into `airline`/`flightNumber`.

## 3. Details tab

- Read rows: `WN1234 · DEN 8:00a → DAL 10:00a` (`+1` suffix on next-day arrival), layover line between legs, ✏️ and 🗑 icon buttons (`aria-label="Edit leg N"`, `"Delete leg N"`).
- ✏️ swaps that row for the leg form; only one row editable at a time.
- 🗑 → inline "Delete this leg? Confirm / Cancel". Hidden when only one leg remains.
- **+ Leg** opens a blank form (with defaults) at the bottom.
- Save sends the full leg list via `syncLegs`, then calls `onChanged()` (silent reload). Errors show inline and keep the form open.
- **Notes**: click-to-edit `Textarea` with Save/Cancel; saving empty clears notes (sends `notes: null`).
- **Delete flight** stays at the bottom with the inline confirm.
- The whole-flight edit panel and the Name field are removed.
- Tab swipe is disabled while any leg form or the notes editor is open (`onEditingChange`).

## 4. Add-flight dialog

Uses the same leg form (stacked, with + Leg / remove), plus Notes. No Name field — the server derives the title.

## 5. Bookings tab

Read-mode block:

```
ABC123  orig XYZ  [Jeremy] [Spouse]                  ✏️ 🗑
Adv $412/pp · 2 travelers · Paid $824
Covers: DEN → MCO (Aug 29) · MCO → DEN (Sep 5)
  WN1234 DEN 8:00a → DAL 10:00a
  WN567  DAL 11:30a → MCO 3:05p
  WN890  MCO 6:00p → DEN 8:10p
[transactions table + "+ Transaction"]
```

- **Covers / legs**: every linked flight (title + first-leg date) and every leg of those flights, in flight-date order. Read-only.
- **✏️ Edit**: block switches to `BookingForm` pre-filled (confirmation, loyalty, prices, notes, flights, travelers). Save → one `updateBooking` call. 409/other errors show inline; form stays open.
- **🗑 Delete**: inline "Delete booking ABC123 and its N transactions? Confirm / Cancel" (`N` from the booking's transactions; "and its transactions" omitted when 0).
- **BookingForm** (create + edit):
  - Fields: Confirmation, Loyalty program, Advertised price/pp cash, points, Notes.
  - **Flights** checkboxes: all trip flights, label `"DEN → MCO · Aug 29 · 2 legs"`.
  - **Travelers** checkboxes + "+ New traveler".
  - On create from a flight's dialog: that flight is pre-checked; travelers not already booked on it are pre-checked.
  - A traveler already on another booking for any checked flight is disabled with `(on ABC123)`.
  - At least one flight and one traveler required.
- **Coverage hint**: when trip travelers exist who are on no booking for this flight, a muted line `Not booked: Grandma 217` appears under the + Booking button.
- Tab swipe disabled while any booking form is open.
- `BookingCard` receives the trip-wide `bookings` list (already loaded by `TripDetailPage`) for coverage/conflict computation.

## 6. Components & files

Client:

- `utils/flightLegs.ts` — new draft model; `parseFlightCode`, `formatFlightCode`, `autoArrivalOffset`, `legToDraft`, `draftToPayload`, `flightTitle`, `formatLegLine`.
- `components/FlightLegForm.tsx` — single-leg form (new).
- `components/FlightLegList.tsx` — Details-tab rows with inline edit/add/delete (new).
- `components/FlightLegsEditor.tsx` — rewritten as a stack of `FlightLegForm` for the Add dialog.
- `components/FlightDetailsTab.tsx` — rewritten: `FlightLegList` + notes editor + delete flight.
- `components/AddElementDialog.tsx` — Name field removed.
- `utils/bookingCoverage.ts` — `bookedTravelerMap(bookings, elementIds, excludeBookingId?)`, `unbookedTravelers(bookings, elementId, participants)` (new).
- `components/BookingForm.tsx` — shared create/edit form (new).
- `components/BookingBlock.tsx` — read-mode block with legs, edit, delete (new).
- `components/BookingCard.tsx` — thin container.
- `api/tripApi.ts`, `types/trip.ts` — widened booking update payload; flight `name` optional on create.

Server:

- `repositories/bookingRepository.ts` — `findTravelerConflicts`, transactional `updateBooking` with `elementIds`/`travelerIds`.
- `repositories/tripElementRepository.ts` — `syncLegs` and flight create set the title.
- `utils/flightTitle.ts` (server) — pure `flightTitle` used by the repository. The `.cjs` migration inlines the same rule (it cannot import TypeScript).
- `routes/tripRoutes.ts` — 409 conflicts, PATCH replacement fields, optional flight name.
- `migrations/migrations/20261108_01_backfill_flight_titles.cjs`.

Docs: `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`.

## 7. Error handling

- All errors inline (`Alert color="red"`), no notifications; forms stay open on error.
- 409 messages are shown verbatim.
- Delete actions use inline two-step confirm.

## 8. Testing

- Unit: `parseFlightCode` (WN1234, `wn 1234`, `WN-1234`, B61234, 9K123, SWA1234, `1234`, empty), `autoArrivalOffset`, `legToDraft`/`draftToPayload` round-trip incl. +1 day and month rollover, `flightTitle`, `bookingCoverage` helpers.
- Server repository: conflict detection (same flight + traveler conflicts; different flight OK; same flight different traveler OK; excluded booking ignored), transactional replace in `updateBooking`, `syncLegs` sets title.
- Components: `FlightLegList` (edit/save payload, add with defaults, delete confirm, last leg not deletable), `FlightLegForm` (offset auto +1), `BookingForm` (defaults, disabled conflicting travelers), `BookingBlock` (legs list, delete confirm, edit save).
- Playwright smoke at 1440×900 and 390px: no horizontal overflow; edit a leg and a booking on the Cabo trip.
- New test files must be added to the `vitest.config.ts` include whitelist.

## Out of scope

- Non-flight element types, expenses, schedule, research planner.
- Time zones (times remain local airport times as entered).
- Resolving pre-existing conflicting bookings automatically.
