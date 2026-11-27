# Transaction Modal and Row Cleanup — Design

Follow-up to `2026-11-27-price-entry-and-payment-methods-design.md`.

## Problems

1. Each transaction row repeats the booking's current confirmation number with no label. Since the payment method column was added, it reads as part of the payment method (e.g. "Southwest CC 1234 / 12312131").
2. Add/edit opens an inline form under the list. When editing, the only hint is a greyed-out pencil, so it isn't clear which transaction is being edited.

## Design

### Transaction rows (`BookingTransactionList`)

- Columns: date (notes under it), amount, payment method, actions (✏️ Edit transaction, 🗑 Remove transaction).
- A row shows `New conf # ABC123` (dimmed, under the payment method) only when that transaction itself has a `confirmationNumber`. The booking's own number is no longer carried down the rows.
- The `originalConfirmationNumber` prop is removed from `BookingTransactionList` and its callers (`BookingBlock`, `LodgingPaymentsTab`).
- No inline form. The list never changes shape. "+ Transaction", edit and remove are enabled whenever the modal is closed.

### `TransactionFormModal` (new, `client/src/components/TransactionFormModal.tsx`)

- Props: `{ opened: boolean; tripId: string; bookingId: string; transaction: BookingTransaction | null; onClose: () => void; onSaved: () => void }`. `transaction === null` means add.
- Mantine `Modal` stacked above the stay/flight dialog (`zIndex` above the parent modal), `fullScreen` below the `sm` breakpoint. Closing (Cancel, ×, Escape) closes only this modal.
- Title: **Add transaction** or **Edit transaction**. In edit mode a dimmed summary line under the title: `Nov 27, 2026 · $5.00 + 2,000 pts · Southwest CC 1234` (method omitted when none; amounts omitted when zero).
- Fields (unchanged from today): Amount (cash), Amount (points), Date, Payment method (`PaymentMethodSelect`), New confirmation number, Notes.
- Buttons: primary **Add transaction** (add) / **Save** (edit), and **Cancel**.
- Validation: at least one non-zero amount ("Please enter a cash or points amount"). API errors shown inline (`Alert color="red"`); the modal stays open.
- Calls `tripApi.addBookingTransaction` / `tripApi.updateBookingTransaction` itself (same payloads as today), then `onSaved()`; the list reloads and calls its `onChanged`.
- The form resets from `transaction` each time the modal opens.

### Dirty state

`BookingTransactionList` reports `onEditingChange(true)` while the modal is open, as the inline form did, so the stay dialog's unsaved-changes guard is unchanged.

## Testing

- `TransactionFormModal.test.tsx`: add payload; edit pre-fills and sends `updateBookingTransaction`; summary line; validation error; API error keeps it open.
- `BookingTransactionList.test.tsx`: edit opens a dialog titled "Edit transaction"; save reloads the list and calls `onChanged`; add works the same; `New conf #` appears only on rows with their own confirmation number; booking confirmation is not shown on rows.
- Browser smoke at 1440×900 and 390×844: open edit from a stay's Payments tab; modal on top, full screen on mobile; Escape closes only the modal.
