# Price Entry, Payment Methods and Transaction Editing — Design

Date: 2026-11-27
Branch: `add-hotel-lodging-tracking` (builds on `2026-11-26-lodging-booking-rework-design.md`)

## Goal

Make money entry match how bookings actually happen:

- Type the **total price** from the checkout page (cash, points, or points plus cash taxes) and choose whether it is mostly paid **at booking** or **at check-in**. The due-at-booking and due-at-check-in amounts are derived.
- Optionally record the **first payment** when creating a stay or flight booking.
- Pick a **payment method** (family-shared nickname such as "Southwest CC - 1234") on every transaction, so transactions can be reported on and sorted by method later.
- **Edit** existing transactions.

Applies to hotel stays and flight bookings. Coupons stay a record only (code, optional savings, note) and never feed calculations.

Architecture rule for this work: prefer the better long-term design; schema changes are acceptable.

## Phases

1. Payment methods (data, API, picker, Settings page).
2. Transaction editing and payment method on transactions.
3. Price entry (`payAt`, `PriceEntry`) for stays and flights; flight totals.
4. "Also record payment" on create (atomic first transaction).

Each phase is independently testable.

## 1. Data model

### 1.1 `bookings.pay_at`

- `pay_at TEXT NOT NULL DEFAULT 'booking' CHECK (pay_at IN ('booking','checkin'))`.
- Added to the existing, unmerged lodging migration `server/migrations/migrations/20261124_01_lodging.cjs` (the real DB has not applied it) and to the fresh schema in `server/db.ts`.
- Stored facts are unchanged: `due_at_booking_cash`, `due_at_booking_points`, `due_later_cash`, `due_later_notes`. Points are only ever due at booking.
- **Total price is never stored.** Total cash = `due_at_booking_cash + due_later_cash`; total points = `due_at_booking_points`. `pay_at` only records which time the user treats as primary so the form reopens as entered.

### 1.2 `payment_methods`

New migration `server/migrations/migrations/20261127_01_payment_methods.cjs` (and fresh schema in `server/db.ts`):

```sql
CREATE TABLE payment_methods (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payment_methods_family ON payment_methods(family_id);
ALTER TABLE booking_transactions ADD COLUMN payment_method_id TEXT REFERENCES payment_methods(id);
```

- Nickname: trimmed, 1–60 characters, unique per family among **non-archived** methods, case-insensitive (enforced in the repository; 409 on conflict).
- A method referenced by any transaction cannot be deleted (409, "Archive it instead"); it can be archived. Archived methods keep showing on existing transactions.
- The down migration drops the column (table rebuild) and the table.

## 2. Server

### 2.1 Booking `payAt`

- `payAt?: 'booking' | 'checkin'` is a generic booking money field: accepted by `POST /api/trips/:tripId/bookings`, `PATCH /api/trips/:tripId/bookings/:id`, and the `booking` body of hotel `POST/PUT /api/trips/:tripId/elements[/:elementId]`. Any other value → 400. Returned on every booking (default `'booking'`).

### 2.2 Payment methods API

Family comes from the authenticated user (`req.user.familyId`); any family member may manage methods.

| Method & path | Behaviour |
|---|---|
| `GET /api/payment-methods?includeArchived=1` | Family's methods sorted by nickname (active first), each with `transactionCount`. Archived omitted unless `includeArchived=1`. |
| `POST /api/payment-methods` `{nickname}` | 201 with the method. 400 invalid nickname, 409 duplicate active nickname. |
| `PATCH /api/payment-methods/:id` `{nickname?, archived?}` | Rename and/or archive (`archived: true` sets `archived_at`) / unarchive. Unarchiving or renaming into a duplicate → 409. 404 if not in the family. |
| `DELETE /api/payment-methods/:id` | 204 when unused; 409 `"Payment method is used by N transactions. Archive it instead."` otherwise. |

Shape: `{ id, nickname, archived: boolean, transactionCount, createdAt, updatedAt }`.

### 2.3 Transactions

- Create (`POST .../bookings/:bookingId/transactions`) and update (`PATCH .../transactions/:id`) accept `paymentMethodId: string | null`. It must belong to the trip's family (else 400 "Unknown payment method"). Archived methods are allowed only if unchanged from the stored value on update; choosing an archived method otherwise → 400.
- Transactions are returned with `paymentMethodId` and `paymentMethodNickname` (joined).

### 2.4 First transaction on create

- New optional body field `firstTransaction: { transactionDate: 'YYYY-MM-DD', paymentMethodId?: string | null }` on:
  - hotel `POST /api/trips/:tripId/elements` (with `booking`), and
  - `POST /api/trips/:tripId/bookings`.
- The server computes the amount: cash = `dueAtBookingCash ?? 0`, points = `dueAtBookingPoints ?? 0`. If both are 0 → 400 "Nothing is due at booking". Date must be valid; payment method validated as in 2.3.
- The element/booking and the transaction are written in **one DB transaction**; any failure rolls back everything.
- Not accepted on update routes.

## 3. Client

### 3.1 Types and API

- `Booking` / `BookingMoneyFields`: `payAt?: 'booking' | 'checkin'`.
- `BookingTransaction`: `paymentMethodId: string | null`, `paymentMethodNickname: string | null`. Create/update payloads accept `paymentMethodId`.
- `PaymentMethod { id, nickname, archived, transactionCount, createdAt, updatedAt }`.
- New `paymentMethodApi` (`client/src/api/paymentMethodApi.ts`): `list(includeArchived?)`, `create(nickname)`, `update(id, {nickname?, archived?})`, `remove(id)`.
- `tripApi.createElement` and `tripApi.createBooking` accept `firstTransaction`.

### 3.2 `utils/priceEntry.ts`

```ts
interface PriceEntryValue { totalCash: string; totalPoints: string; payAt: 'booking' | 'checkin'; otherCash: string; notes: string }
toDues(v): { dueAtBookingCash, dueAtBookingPoints, dueLaterCash, dueLaterNotes, payAt }
fromDues(booking): PriceEntryValue
validatePriceEntry(v): string | null
dueAtBookingLabel(v): string   // e.g. "9,000 pts + $1,250.00"
```

- `toDues`: total cash T, other O (blank = 0), points P.
  - `payAt = 'booking'`: at booking cash = T − O, at check-in = O.
  - `payAt = 'checkin'`: at booking cash = O, at check-in = T − O.
  - Points always at booking. Blank total cash and blank other → both cash dues null. Rounded to cents.
- `fromDues`: total cash = at booking + at check-in (null when both null); other = check-in amount when `payAt='booking'`, else at-booking amount; blank when 0.
- Validation: numbers ≥ 0; points whole; other ≤ total cash; other requires a total cash.

### 3.3 `PriceEntry` component

Group headed "What you'll pay":

- "Total price (cash)" and "Total price (points)".
- "Pay at" `SegmentedControl` `Booking | Check-in`.
- One cash field labelled **"Due at check-in"** when Pay at = Booking, **"Due at booking (deposit)"** when Pay at = Check-in. Switching keeps the typed total and other amount; only their meaning flips.
- "Check-in note" (placeholder "e.g. Resort fee, bags").
- Preview line: `At booking 9,000 pts + $1,250.00 · At check-in $39.60` (parts omitted when zero).
- Props `{ value: PriceEntryValue, onChange }`.

### 3.4 Stay form and details

- `StayDraft` replaces `dueAtBookingCash`, `dueAtBookingPoints`, `dueLaterCash`, `dueLaterNotes` with `price: PriceEntryValue`; `stayPayload` uses `toDues`, `stayDraftFromElement` uses `fromDues`.
- `LodgingStayForm` Price section order: advertised nightly (cash/points), advertised total (cash/points) + "Includes taxes & fees", Coupons, `PriceEntry`. The "Payment schedule" section is removed. Coupons move from the full-width area into the Price section.
- `LodgingDetailsTab` payment line becomes `Total $1,289.60 · At booking $1,250.00 · At check-in $39.60 (Resort fee)`; the section title is "What you'll pay".

### 3.5 Flight bookings

- `BookingForm` keeps "Advertised price per person (cash/points)" and adds `PriceEntry` (total for the whole booking). No coupons on flights.
- `BookingBlock` money line: `Advertised 30,000 pts + $5.60/person · Total 60,000 pts + $11.20 · Paid …`, followed by the bold `paymentSummary` label while remaining > 0.
- `flightTotals`: per booking, the total price (dues) when any due field is set, otherwise advertised per person × traveler count (minimum 1). The flight row Price column is unchanged.

### 3.6 Payment method picker (`PaymentMethodSelect`)

- Searchable `Select` of active methods (plus the currently selected archived one, labelled "(archived)"), clearable, last option "+ New payment method…".
- Choosing that option shows an inline nickname `TextInput` with **Add** / **Cancel**; Add calls `paymentMethodApi.create`, selects the result and refreshes the list. 409 shows inline.
- Loads the list once per mount.

### 3.7 Settings → Payment methods

- Route `/settings/payment-methods`; added to the Settings section nav (desktop rail and mobile drawer) as "Payment methods".
- Lists methods (active, then archived) with transaction count; actions: rename (inline), Archive / Unarchive, Delete (only when count is 0, inline confirm). Add field at top. Errors inline.

### 3.8 Transaction list

- Rows show date, amount, payment method nickname, new confirmation # and notes.
- Each row has ✏️ **Edit transaction** opening the same form, pre-filled, with **Save** / **Cancel**; uses `updateBookingTransaction`. Only one form (add or edit) open at a time.
- Form fields: Amount (cash), Amount (points), Date, Payment method (`PaymentMethodSelect`), New confirmation number, Notes.
- An open add/edit form reports editing via `onEditingChange` (already counted as dirty for the stay dialog).

### 3.9 "Also record payment" on create

- Shown in `AddLodgingDialog` and in `BookingForm` when creating (not editing), below `PriceEntry`, only when something is due at booking.
- Checkbox **Also record payment**, checked by default. When checked: **Payment date** (default today, local) and **Payment method** (`PaymentMethodSelect`); amount shown read-only as `dueAtBookingLabel`.
- Sent as `firstTransaction`; unchecked or nothing due → omitted.
- Counts toward the add dialog's dirty state.

## 4. Error handling

All errors inline (`Alert color="red"`), forms stay open; 400/404/409 messages shown verbatim. A failed create with `firstTransaction` leaves nothing behind (single DB transaction).

## 5. Testing

- **Server:** migrations (new column default; payment_methods up/down); payment method repository and routes (family scoping, case-insensitive unique among active, archive/unarchive, delete guard, counts); transaction create/update with `paymentMethodId` (other family → 400, archived rules); `payAt` validation on stays and flight bookings; `firstTransaction` on both create routes (amount derived, nothing due → 400, rollback on failure).
- **Client units:** `toDues` / `fromDues` round-trips for both modes, points-plus-cash, blanks; `validatePriceEntry`; `flightTotals` (dues vs advertised × travelers).
- **Components:** `PriceEntry` (label swap, preview, toggle keeps values); `PaymentMethodSelect` (inline create, 409); `BookingTransactionList` (edit, payment method); payment methods Settings page; `AddLodgingDialog` and `BookingForm` "Also record payment"; stay form/details and `BookingBlock` updates.
- **Browser smoke (1440×900, 390×844):** stay with total $1,289.60, pay at booking, $39.60 at check-in, record payment with a new method created inline → Payments shows `Remaining $39.60 at check-in`; flight booking 60,000 pts + $11.20 with payment recorded; edit a transaction's method; Settings page rename/archive; no overflow.

## 6. Out of scope

- Reports by payment method (data is ready).
- Coupon-driven calculations.
- Per-user ownership of payment methods.
