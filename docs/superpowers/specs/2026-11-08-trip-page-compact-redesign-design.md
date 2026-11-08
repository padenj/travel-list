# Trip Page Compact Redesign

Date: 2026-11-08

## Goal

Make the trip detail page compact enough to see the important details of the whole trip at a glance on desktop, and easy to use on mobile. Match the rest of the site's look by using Mantine components and theme tokens instead of the hand-rolled dark `trips.css`. The model is the user's San Diego planning spreadsheet: dense sectioned tables with details opened on demand.

## Scope

In scope:
- Redesign of `TripDetailPage` and `TripsPage` styling (Mantine, theme-aware, light and dark).
- Flights as the only element type with a section. Layout is built so hotel, car, parking and activity sections slot in later.
- Mobile layout (390px and up) with no horizontal overflow.

Out of scope: hotel, car, parking and activity sections or dialogs, expenses, schedule, research planner, photo upload, backend or schema changes.

## Page structure

1. **Header**: trip name, type badge, dates and night count, and a single "Add flight" action (no trip-edit UI exists today, so none is added).
2. **Travelers strip**: name chips on one line (e.g. "Jeremy, Spouse, Grandma +1") and a "Manage" button that opens a modal wrapping the existing `TripParticipantsPanel` unchanged.
3. **Flights section**: a section band with a count and totals, then one banded row per flight element:
   - Flight row: generated or overridden name (e.g. "DEN → SJD"), date, price (cash or points, e.g. "9000 pts + $5.60"), confirmation number, and a booking-count badge.
   - Legs as indented sub-rows: flight number, route, depart → arrive times.
   - Layovers as an inline muted row between legs ("1h 10m layover").
   - A flight with no legs shows a muted "No legs yet"; the row still opens.
4. **Empty trip**: empty state with an "Add flight" call to action.
5. **Mobile (below the `sm` breakpoint)**: each flight renders as a stacked card (same row data, same sub-rows, no horizontal scroll). "+ Add" becomes a floating action button.
6. **Non-flight elements:** if the trip has hotel, car or activity elements (created before their sections exist), a muted line under the flights section says how many are hidden until those sections are built.

Row banding uses Mantine color tokens so contrast is correct in both color schemes.

## Element dialog

Clicking a flight row opens `ElementDialog` (Mantine `Modal`, full-screen on mobile) with tabs:

- **Details**: read-only summary (legs, times, layovers, price, notes, flight-search link) with Edit and Delete. Edit swaps in the existing form built on `FlightLegsEditor` and the existing create/edit logic.
- **Bookings**: mounts the existing `BookingCard`.
- **Seats**: mounts the existing `FlightSeatGrid`; the Bookings tab label shows the booking count, the Seats tab has no count (no cheap endpoint).

The dialog is generic (title, tabs, body) so other element types reuse it later. Saves keep the dialog open and refresh the row behind it through the existing version counters (`refreshKey`, `onBookingsChanged`).

**Swipe**: on touch devices, a horizontal swipe on the tab content (at least 50px, mostly horizontal) moves to the adjacent tab. Ignored when the touch starts in an input, textarea, seat grid or any horizontally scrollable element, and disabled while the Details tab is in edit mode. The tab bar remains tappable.

An "Add flight" modal (`AddElementDialog`) hosts the create form. It creates flights only (no type selector).

## Components

| Unit | Responsibility |
|---|---|
| `TripDetailPage` | Loads trip, elements, participants, trip bookings; owns open-dialog state. Thin container. |
| `TripHeader` | Title, badge, dates, actions. |
| `TripTravelersStrip` | Chips plus Manage modal. |
| `FlightsSection` | Section band, totals, one CSS-grid row model that reflows to stacked cards below 48em (no duplicate DOM). |
| `utils/flightRows.ts` | Pure row-model builder: totals, layover rows, price label, confirmation lookup. |
| `ElementDialog` | Modal shell, tabs, swipe handler. |
| `FlightDetailsTab` | Read-only view and edit mode. |
| `FlightSeatsTab` | Per-leg `FlightSeatGrid`. |
| `AddElementDialog` | Create form in a modal. |

Existing trip components keep their markup. `trips.css` is re-tokenized so its `--ctp-mocha-*` variables map to Mantine theme tokens (light/dark aware), and page-level rules that nothing references any more are removed. A small CSS module per new component handles row banding and mobile reflow. `TripsPage` is restyled the same way.

## Data flow

- Existing loads stay. One added call, `GET /trips/:id/bookings`, supplies the Confirm # column (the booking's current confirmation number; the deprecated element-level `bookingReference` is not shown) and the booking count. No backend changes. Row price is the linked bookings' advertised price; a booking linked to several flights shows "(shared)" on each row and is counted once in the section total.
- No seat-count on rows: no cheap endpoint exists, so seat counts appear only in the dialog.
- Layover, name and time formatting reuse `utils/flightLegs.ts`; money uses `formatMoney`.

## Errors and edge cases

- Form and save errors show inline (Mantine `Alert`) next to the action; a failed page load shows an inline error with Retry; a failed background reload shows a dismissible alert above the page.
- Delete uses an inline two-step confirm ("Delete this flight?" Confirm/Cancel) inside the Details tab, not a nested modal.
- Empty trip shows the empty state; flight with no legs shows "No legs yet".

## Testing

- Tests use `MantineProvider env="test"`.
- Unit tests for `flightRows.ts` (totals, layover rows, cash-or-points label, confirmation fallback).
- Component tests for `FlightsSection` (rows, sub-rows, row click opens dialog), `ElementDialog` (tabs, swipe both directions, swipe ignored in inputs and in edit mode), `TripTravelersStrip`.
- Existing `BookingCard`, `FlightSeatGrid`, `FlightLegsEditor`, `TripDetailPage`, `TripsPage` tests stay green (updated where markup changed). New test files are added to the `vitest.config.ts` whitelist.
- `npx tsc -p tsconfig.json --noEmit` clean.
- Playwright pass against the Cabo test data at 1440px and 390px: the whole trip is visible without scrolling on desktop, and there is no horizontal overflow on mobile.
- Docs: update `client/src/APIUsage.md` and `client/src/components/ComponentUsage.md`.
