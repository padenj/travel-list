# Bookings Tab Compact Redesign

Follow-up to `2026-11-08-trip-page-compact-redesign-design.md`. Tightens the Bookings tab of the flight dialog (`BookingCard`, `BookingTransactionList`). No API, prop or field-label changes.

## Problems
- Redundant "Bookings" heading and a large standalone "+ Add Booking" button.
- Each booking is a tall grey card with six paragraphs of label/value data.
- Transactions take three lines each, with a full-size Remove button and no confirmation.
- The Add Transaction form is always open under every booking.

## Design

### Booking list (`BookingCard`)
- No "Bookings" heading. A right-aligned "+ Booking" button toggles an inline form (collapses after save; button reads "Cancel" while open).
- Form fields and labels are unchanged, laid out in two columns on desktop and one on mobile. Travelers and "Also applies to" are checkbox chips. Save button: "Save booking".
- Each booking is a bordered block using Mantine tokens (no grey card):
  - Header: confirmation number (bold), traveler chips, muted "orig XXX" when the original confirmation differs from the current one.
  - Money line: `Advertised $X/person · Actual $Y ($Z/person) · Paid $T`, with ` + N pts` appended to Paid when points were paid. Wraps on mobile. Advertised is omitted when null.
  - "Also covers: ..." muted line only when the booking links other flights.
- Empty state: "No bookings yet for this flight".

### Transactions (`BookingTransactionList`)
- Compact table: date, amount (cash and/or points), confirmation. Stacks to two lines on mobile. A note renders as a muted second line only when present.
- Remove is a small icon button with an inline "Remove? Confirm / Cancel" step.
- "Total paid" moves into the booking money line; the list itself no longer repeats it.
- Add form (cash, points, date, new confirmation, notes; same labels) is collapsed behind a "+ Transaction" button and is a compact grid when open.

### Styling
- Mantine components and tokens only. Legacy booking/transaction classes in `trips.css` are removed once unreferenced (verify by grep).

### Testing
- Update existing BookingCard and BookingTransactionList tests for the collapsed forms and the Remove confirmation, using real Mantine via `renderWithMantine`.
- Add tests: money-line formatting (points, null advertised), orig-confirmation display, also-covers line, Remove confirm/cancel, add transaction after expanding.
- Playwright check on the Cabo trip (booking ABC123/XYZ789) at 1440px and 390px: no overflow, tab visibly shorter.
