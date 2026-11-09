# Flight UX Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps found when clicking through the Cabo trip: manual multi-leg flight entry/editing, visible lookup feedback, stale/duplicated booking UI, money/notes formatting, original confirmation visibility, trip header data, and page title.

**Architecture:** Add a `PUT /trips/:tripId/elements/:elementId/legs` "sync" endpoint (update-by-id, insert new, delete missing, recompute layovers) backed by `TripElementRepository.syncLegs`. On the client, a controlled `FlightLegsEditor` (array of leg drafts) is used by both the create and edit forms of `TripDetailPage`. Cross-card freshness is handled with refresh-key counters owned by the page. Small shared formatters live in `client/src/utils/`.

**Tech Stack:** Express + sqlite (`server/`), React 18 + Vitest + Testing Library (`client/`), Playwright (already installed) for the final click-through.

**Conventions (read before starting):**
- Run tests from the repo root: `cd /config/workspace/travel-list && npx vitest run <path-relative-to-root>`. Never `cd client`.
- Type-check: `npx tsc -p tsconfig.json --noEmit` (there is no client/server tsconfig).
- `vitest.config.ts` whitelists client test files by exact path. Every new `client/src/__tests__/*.test.ts(x)` MUST be added to its `include` list (Task 0 does this up front).
- The full suite has 12 known pre-existing failures (families/templates/packing-lists/login, `no such table: families`). They are unrelated; do not "fix" them.
- Branch: work on `fix/flight-ux-review` (created in Task 0 from `feat/flight-bookings-redesign`).
- Dev server: `npm run dev` serves the client on **port 3000** and API on 3001. Test login for manual/Playwright checks: `uitester` / `UiTest123!`. Cabo trip id: `b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6`. Keep the dev test data.

## Findings → Task map

| # | Finding | Task |
|---|---------|------|
| 10 | Trip header shows "to"; title says "Dashboard" | 1 |
| 7,8 | `$137 (96¢)`, `$-20.00`, notes lose newlines | 2 |
| 9 | Original confirmation number not shown | 2, 3 |
| 6 | Duplicate DOM ids; stale duplicate booking cards | 2, 3 |
| 5 | Travelers panel stale after booking adds traveler | 3 |
| 1,3,4 | No manual airports/times, no multi-leg, can't edit legs | 4,5,6,7,8 |
| 2 | Autofill silently returns nothing | 4, 6 |
| (extra) | Autofill returns actual-UTC times; should be scheduled local | 4 |
| polish | Unstyled buttons, seat save feedback | 9 |

## File Structure

| File | Responsibility |
|------|----------------|
| `server/routes/tripRoutes.ts` | GET trip returns camelCase; new `PUT .../legs` |
| `server/services/flightStatsLookupService.ts` | Prefer scheduled **local** times |
| `server/repositories/tripElementRepository.ts` | `syncLegs`, `recomputeLayovers` |
| `client/src/components/SplitRailLayout.tsx` | Rail/title highlight for `/trips` |
| `client/src/utils/money.ts` (new) | `formatMoney` |
| `client/src/utils/flightLegs.ts` (new) | Leg draft type + conversions, name builder, time/layover formatting |
| `client/src/components/FlightLegsEditor.tsx` (new) | Multi-leg editor with lookup feedback |
| `client/src/components/BookingTransactionList.tsx` | useId ids, textarea notes, money, confirmation carry |
| `client/src/components/BookingCard.tsx` | refreshKey, original confirmation, money |
| `client/src/components/TripParticipantsPanel.tsx` | refreshKey |
| `client/src/components/FlightSeatGrid.tsx` | save feedback |
| `client/src/pages/TripDetailPage.tsx` | Wire everything, leg display, header guard |
| `client/src/api/tripApi.ts`, `client/src/types/trip.ts` | `syncLegs`, `FlightLegPayload` |
| `client/src/styles/trips.css` | Leg rows, notes wrapping |

---

### Task 0: Branch and test whitelist

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Create the branch**

```bash
cd /config/workspace/travel-list && git status --short && git checkout -b fix/flight-ux-review
```
Expected: clean tree (ignore untracked `docs/` plan files), new branch.

- [ ] **Step 2: Whitelist the new client test files**

In `vitest.config.ts`, after the `BookingCard.test.tsx` line add:

```ts
      'client/src/__tests__/tripFormat.test.ts', // Money/leg formatting helpers
      'client/src/__tests__/FlightLegsEditor.test.tsx', // Multi-leg editor coverage
```

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts && git commit -m "test: whitelist flight UX test files

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 1: Trip header data and page title

Root causes: `GET /api/trips/:tripId` returns the raw middleware row (`start_date`, `end_date`, …) instead of the camelCase `Trip`; `SplitRailLayout.getActiveRailItem` has no `/trips` case so the top bar falls back to "Dashboard".

**Files:**
- Modify: `server/routes/tripRoutes.ts:55-57`
- Modify: `client/src/components/SplitRailLayout.tsx` (`getActiveRailItem`)
- Modify: `client/src/pages/TripDetailPage.tsx` (header, ~line 281-297)

- [ ] **Step 1: Fix the route**

Replace
```ts
tripRouter.get('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  res.json(req.trip);
});
```
with
```ts
tripRouter.get('/:tripId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const trip = await tripRepository.getTripById(req.trip!.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});
```

- [ ] **Step 2: Fix the title**

In `SplitRailLayout.tsx`, inside `getActiveRailItem`, add before `return 'dashboard';`:
```ts
    if (path.startsWith('/trips')) return 'trips';
```

- [ ] **Step 3: Guard the header dates**

In `TripDetailPage.tsx` replace the `trip-dates` span:
```tsx
          {trip.startDate && trip.endDate && (
            <span className="trip-dates">
              {trip.startDate} to {trip.endDate}
            </span>
          )}
```

- [ ] **Step 4: Verify against the live dev server**

The `tsx watch` server reloads automatically. Run:
```bash
T=$(curl -s -X POST localhost:3001/api/login -H 'content-type: application/json' -d '{"username":"uitester","password":"UiTest123!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s localhost:3001/api/trips/b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6 -H "authorization: Bearer $T"
```
Expected: JSON contains `"startDate":"2026-08-29"` and `"endDate":"2026-09-05"` (no `start_date`).

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add server/routes/tripRoutes.ts client/src/components/SplitRailLayout.tsx client/src/pages/TripDetailPage.tsx
git commit -m "fix: trip detail returns camelCase dates; highlight Trips in rail title

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Formatting helpers and the transaction ledger

**Files:**
- Create: `client/src/utils/money.ts`
- Create: `client/src/__tests__/tripFormat.test.ts`
- Modify: `client/src/components/BookingTransactionList.tsx`
- Modify: `client/src/__tests__/BookingTransactionList.test.tsx`
- Modify: `client/src/styles/trips.css`

- [ ] **Step 1: Write the failing test** — `client/src/__tests__/tripFormat.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { formatMoney } from '../utils/money';

describe('formatMoney', () => {
  it('formats cents and whole dollars', () => {
    expect(formatMoney(137.96)).toBe('$137.96');
    expect(formatMoney(79)).toBe('$79.00');
  });

  it('puts the minus sign before the dollar sign', () => {
    expect(formatMoney(-20)).toBe('-$20.00');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

Run: `npx vitest run client/src/__tests__/tripFormat.test.ts`

- [ ] **Step 3: Create `client/src/utils/money.ts`**

```ts
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatMoney(amount: number): string {
  return usd.format(amount);
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run client/src/__tests__/tripFormat.test.ts`

- [ ] **Step 5: Update `BookingTransactionList.test.tsx` (failing first)**

Replace the three `findByText(/78.98/)` usages. After the change the row renders `$78.98` and the total renders `Total paid: $78.98`; the exact string `'$78.98'` only matches the row. Final file body:

```tsx
  it('lists transactions with running total', async () => {
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} />);
    expect(await screen.findByText('$78.98')).toBeTruthy();
    expect(await screen.findByText('Total paid: $78.98')).toBeTruthy();
    expect(await screen.findByText(/Fee breakdown/)).toBeTruthy();
  });

  it('shows negative amounts with the sign before the dollar sign and carries the original confirmation', async () => {
    (tripApi.listBookingTransactions as any).mockResolvedValue([
      { id: 't1', bookingId: 'b1', amountCash: 157.96, amountPoints: 0, transactionDate: '2026-10-24', confirmationNumber: null, notes: null, createdAt: '' },
      { id: 't2', bookingId: 'b1', amountCash: -20, amountPoints: 0, transactionDate: '2026-10-26', confirmationNumber: 'XYZ789', notes: null, createdAt: '' },
    ]);
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" originalConfirmationNumber="ABC123" onChanged={() => {}} />);
    expect(await screen.findByText('-$20.00')).toBeTruthy();
    expect(screen.getByText('Total paid: $137.96')).toBeTruthy();
    expect(screen.getByText('Conf: ABC123')).toBeTruthy();
    expect(screen.getByText('Conf: XYZ789')).toBeTruthy();
  });

  it('keeps line breaks when entering notes (multi-line textarea)', async () => {
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} />);
    await screen.findByText('$78.98');
    const notes = screen.getByLabelText(/^notes$/i) as HTMLTextAreaElement;
    expect(notes.tagName).toBe('TEXTAREA');
  });
```
Keep the existing "adds a negative transaction…" and "shows a validation error…" tests but replace their `await screen.findByText(/78.98/);` lines with `await screen.findByText('$78.98');`.

- [ ] **Step 6: Run — expect FAIL**

Run: `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx`

- [ ] **Step 7: Implement in `BookingTransactionList.tsx`**

1. Imports: `import { useState, useEffect, useCallback, useId } from 'react';` and `import { formatMoney } from '../utils/money';`. Delete the `formatCashTotal` helper entirely.
2. Props: add `originalConfirmationNumber?: string | null;` and `refreshKey?: number;`. Destructure with defaults `originalConfirmationNumber = null`, `refreshKey = 0`.
3. After the state declarations add `const uid = useId();`. Replace every `` `txn-cash-${bookingId}` `` style id/htmlFor with `` `${uid}-cash` ``, `-points`, `-date`, `-conf`, `-notes` respectively (ids must be unique even when the same booking is rendered under two elements).
4. Re-fetch when `refreshKey` changes: change the effect to
```tsx
  useEffect(() => {
    load();
  }, [load, refreshKey]);
```
5. Compute the confirmation shown on each row (a transaction without its own number inherits the most recent one, starting from the original):
```tsx
  let carriedConfirmation = originalConfirmationNumber;
  const rows = transactions.map(t => {
    if (t.confirmationNumber) carriedConfirmation = t.confirmationNumber;
    return { transaction: t, confirmation: carriedConfirmation };
  });
```
6. Render rows:
```tsx
      <ul>
        {rows.map(({ transaction: t, confirmation }) => (
          <li key={t.id}>
            <span>{t.transactionDate}</span>{' '}
            {t.amountCash !== 0 && <span>{formatMoney(t.amountCash)}</span>}{' '}
            {t.amountPoints !== 0 && <span>{`${t.amountPoints} pts`}</span>}{' '}
            {confirmation && <span>{`Conf: ${confirmation}`}</span>}{' '}
            <button type="button" className="view-toggle-btn" onClick={() => removeTransaction(t.id)}>Remove</button>
            {t.notes && <div className="txn-notes">{t.notes}</div>}
          </li>
        ))}
      </ul>
      <p className="booking-transaction-total">
        Total paid: {formatMoney(runningTotalCash)}{runningTotalPoints !== 0 ? ` + ${runningTotalPoints} pts` : ''}
      </p>
```
7. Notes field becomes a textarea:
```tsx
        <label htmlFor={`${uid}-notes`}>Notes</label>
        <textarea id={`${uid}-notes`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. paste the fee/tax breakdown" />
```
8. Add className `view-toggle-btn` to the "Add Transaction" button too.

- [ ] **Step 8: CSS** — append to `client/src/styles/trips.css`

```css
.txn-notes {
  white-space: pre-wrap;
  margin: 0.25rem 0 0.75rem;
  color: var(--ctp-mocha-subtext);
  font-size: 0.9rem;
}

.booking-transaction-list textarea {
  width: 100%;
  background-color: var(--ctp-mocha-base);
  color: inherit;
  border: 1px solid var(--ctp-mocha-surface1);
  border-radius: 6px;
  padding: 0.5rem;
  font: inherit;
}
```

- [ ] **Step 9: Run — expect PASS**

Run: `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx client/src/__tests__/tripFormat.test.ts`

- [ ] **Step 10: Commit**

```bash
git add client/src/utils/money.ts client/src/__tests__/tripFormat.test.ts client/src/components/BookingTransactionList.tsx client/src/__tests__/BookingTransactionList.test.tsx client/src/styles/trips.css
git commit -m "fix: ledger money format, multi-line notes, unique ids, confirmation history

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Cross-card freshness and original confirmation

A booking linked to two elements is rendered by two `BookingCard`s, each with its own fetched copy. Fix with page-owned counters: `bookingsVersion` (re-fetch all booking cards + ledgers) and `participantsVersion` (re-fetch the Travelers panel).

**Files:**
- Modify: `client/src/components/BookingCard.tsx`
- Modify: `client/src/components/TripParticipantsPanel.tsx`
- Modify: `client/src/pages/TripDetailPage.tsx` (state + props)
- Modify: `client/src/__tests__/BookingCard.test.tsx`, `client/src/__tests__/TripParticipantsPanel.test.tsx`

- [ ] **Step 1: Failing tests**

Append to the `describe` in `BookingCard.test.tsx`:

```tsx
  it('shows the original confirmation number after a rebook changed the current one', async () => {
    (tripApi.listBookings as any).mockResolvedValue([
      {
        id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
        loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
        elementIds: ['el-1'], travelerIds: ['p1'], currentConfirmationNumber: 'XYZ789', actualTotalCash: 137.96, actualTotalPoints: 0,
      },
    ]);
    render(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} />);
    expect(await screen.findByText('XYZ789')).toBeTruthy();
    expect(screen.getByText(/originally booked as ABC123/i)).toBeTruthy();
    expect(screen.getByText(/\$137\.96 \(\$137\.96 \/ person\)/)).toBeTruthy();
  });

  it('refetches bookings when refreshKey changes and notifies the page after a transaction', async () => {
    const { rerender } = render(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} refreshKey={0} />);
    await waitFor(() => expect(tripApi.listBookings).toHaveBeenCalledTimes(1));
    rerender(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} refreshKey={1} />);
    await waitFor(() => expect(tripApi.listBookings).toHaveBeenCalledTimes(2));
  });
```
Append to `TripParticipantsPanel.test.tsx` (follow that file's existing mock/render pattern; it mocks `tripApi.listParticipants`):

```tsx
  it('reloads travelers when refreshKey changes', async () => {
    const { rerender } = render(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} refreshKey={0} />);
    await waitFor(() => expect(tripApi.listParticipants).toHaveBeenCalledTimes(1));
    rerender(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} refreshKey={1} />);
    await waitFor(() => expect(tripApi.listParticipants).toHaveBeenCalledTimes(2));
  });
```
Run: `npx vitest run client/src/__tests__/BookingCard.test.tsx client/src/__tests__/TripParticipantsPanel.test.tsx` — expect the three new tests to FAIL. (If `TripParticipantsPanel.test.tsx` already imports `waitFor`/`rerender` helpers differently, adapt the import line only.)

- [ ] **Step 2: Implement `TripParticipantsPanel`**

Add `refreshKey?: number;` to the props interface, destructure `refreshKey = 0`, and change the load effect to:
```tsx
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, refreshKey]);
```
Also add `className="view-toggle-btn"` to the two buttons (Remove, Add Traveler).

- [ ] **Step 3: Implement `BookingCard`**

1. Imports: add `import { formatMoney } from '../utils/money';`.
2. Props interface add:
```ts
  refreshKey?: number;
  onBookingsChanged?: () => void;
```
Destructure with `refreshKey = 0`.
3. Effect: `useEffect(() => { load(); }, [load, refreshKey]);`
4. Add a shared handler after `load`:
```tsx
  const handleBookingsChanged = useCallback(async () => {
    await load();
    onBookingsChanged?.();
  }, [load, onBookingsChanged]);
```
5. In `saveBooking` replace `await load();` with `await handleBookingsChanged();`.
6. `BookingTransactionList` usage becomes:
```tsx
            <BookingTransactionList
              tripId={tripId}
              bookingId={booking.id}
              originalConfirmationNumber={booking.confirmationNumber}
              refreshKey={refreshKey}
              onChanged={handleBookingsChanged}
            />
```
7. Money display:
```tsx
            {booking.advertisedPriceCash !== null && (
              <p>Advertised: {formatMoney(booking.advertisedPriceCash)} / person</p>
            )}
            <p>Actual total: {formatMoney(booking.actualTotalCash)} ({formatMoney(actualPerPerson)} / person)</p>
            {booking.confirmationNumber && booking.confirmationNumber !== booking.currentConfirmationNumber && (
              <p>Originally booked as {booking.confirmationNumber}</p>
            )}
```
8. Add `className="view-toggle-btn"` to the "+ Add Booking"/"Cancel" and "Save Booking" buttons.

- [ ] **Step 4: Wire the page** — `TripDetailPage.tsx`

Add state next to `participants`:
```tsx
  const [bookingsVersion, setBookingsVersion] = useState(0);
  const [participantsVersion, setParticipantsVersion] = useState(0);
```
Add handlers above `loadTripData`:
```tsx
  const handleBookingsChanged = () => setBookingsVersion(v => v + 1);
  const handleParticipantsFromBooking = (next: TripParticipant[]) => {
    setParticipants(next);
    setParticipantsVersion(v => v + 1);
  };
```
Panel usage: `<TripParticipantsPanel tripId={tripId} refreshKey={participantsVersion} onParticipantsChanged={setParticipants} />`.
`BookingCard` usage: replace `onParticipantsChanged={setParticipants}` with `onParticipantsChanged={handleParticipantsFromBooking}` and add `refreshKey={bookingsVersion} onBookingsChanged={handleBookingsChanged}`.

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run client/src/__tests__/BookingCard.test.tsx client/src/__tests__/TripParticipantsPanel.test.tsx client/src/__tests__/TripDetailPage.test.tsx client/src/__tests__/BookingTransactionList.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "fix: keep booking cards and travelers panel fresh; show original confirmation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: FlightStats lookup prefers scheduled local times

Verified live: the FlightStats page exposes `schedule.scheduledDeparture` / `scheduledArrival` (airport-local wall clock, no zone, e.g. `2026-10-24T09:00:00.000`) as well as `...UTC` variants. The current code returns *estimated/actual UTC*, which is wrong for a trip planner and cannot compute layovers correctly. Consecutive legs' arrival/departure share the connecting airport's local clock, so local times give correct layovers.

**Files:**
- Modify: `server/services/flightStatsLookupService.ts` (`parseFlightStatsAutofillFromHtml`)
- Modify: `server/services/flightStatsLookupService.test.ts`

- [ ] **Step 1: Failing test** — append inside the existing `describe` in `flightStatsLookupService.test.ts` (reuse that file's `parseFlightStatsAutofillFromHtml` import):

```ts
  it('prefers scheduled local times over UTC and actual times', () => {
    const html = `<script>__NEXT_DATA__ = {"props":{"initialState":{"flightTracker":{"flight":{"schedule":{"scheduledDeparture":"2026-10-24T09:00:00.000","scheduledDepartureUTC":"2026-10-24T15:00:00.000Z","estimatedActualDeparture":"2026-10-24T08:53:00.000","estimatedActualDepartureUTC":"2026-10-24T14:53:00.000Z","scheduledArrival":"2026-10-24T11:00:00.000","scheduledArrivalUTC":"2026-10-24T18:00:00.000Z"},"departureAirport":{"iata":"DEN"},"arrivalAirport":{"iata":"SJD"},"status":{"status":"S"}}}}}}</script>`;
    const details = parseFlightStatsAutofillFromHtml(html, {
      airlineCode: 'WN', flightNumber: '722', flightDate: '2026-10-24', sourceUrl: 'https://example.com',
    });
    expect(details.departureDatetime).toBe('2026-10-24T09:00');
    expect(details.arrivalDatetime).toBe('2026-10-24T11:00');
  });
```
Run: `npx vitest run server/services/flightStatsLookupService.test.ts` — expect the new test FAIL; the existing UTC-fixture test must keep passing afterwards (fallback).

- [ ] **Step 2: Implement** — in `parseFlightStatsAutofillFromHtml` replace the two datetime constants:

```ts
  const schedule = flight?.schedule;
  const departureDatetime =
    toLocalMinute(schedule?.scheduledDeparture) ||
    schedule?.scheduledDepartureUTC ||
    schedule?.estimatedActualDepartureUTC;
  const arrivalDatetime =
    toLocalMinute(schedule?.scheduledArrival) ||
    schedule?.scheduledArrivalUTC ||
    schedule?.estimatedActualArrivalUTC;
```
and add above the function:
```ts
function toLocalMinute(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value.slice(0, 16) : undefined;
}
```
(The old fixture only has `...UTC` scheduled fields; it falls through to `scheduledDepartureUTC`, exactly as before, so that test is unchanged. Note the previous code preferred `estimatedActual...UTC` first; the existing fixture has no estimated fields, so it still passes.)

- [ ] **Step 3: Run — expect PASS; commit**

```bash
npx vitest run server/services/flightStatsLookupService.test.ts
git add server/services && git commit -m "fix: flight lookup returns scheduled local times

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: `syncLegs` repository method

**Files:**
- Modify: `server/repositories/tripElementRepository.ts`
- Modify: `server/repositories/tripElementRepository.test.ts`

- [ ] **Step 1: Failing tests** — append a new `describe` inside the top-level `describe('TripElementRepository', …)` in `tripElementRepository.test.ts` (it already has `repo`, `tripId`):

```ts
  describe('syncLegs', () => {
    const baseLeg = {
      departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00',
      arrivalAirport: 'DAL', arrivalDatetime: '2026-11-10T10:00',
      airline: 'WN', flightNumber: '100',
    };

    async function createFlight() {
      return repo.createElement(tripId, {
        elementType: 'flight',
        name: 'DEN → DAL',
        typeSpecificData: { legs: [{ legOrder: 1, ...baseLeg }] },
      });
    }

    it('updates existing legs, adds new ones, and computes layover minutes', async () => {
      const element = await createFlight();
      const existingId = (element as any).legs[0].id;

      const legs = await repo.syncLegs(element.id, [
        { id: existingId, ...baseLeg, flightNumber: '101' },
        { departureAirport: 'dal', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'sjd', arrivalDatetime: '2026-11-10T14:00', airline: 'WN', flightNumber: '200' },
      ]);

      expect(legs).toHaveLength(2);
      expect(legs[0].id).toBe(existingId);
      expect(legs[0].flightNumber).toBe('101');
      expect(legs[0].layoverMinutesAfter).toBe(135);
      expect(legs[1].departureAirport).toBe('DAL');
      expect(legs[1].arrivalAirport).toBe('SJD');
      expect(legs[1].legOrder).toBe(2);
      expect(legs[1].layoverMinutesAfter).toBeNull();
    });

    it('deletes legs that are not in the payload', async () => {
      const element = await createFlight();
      const legs = await repo.syncLegs(element.id, [
        { ...baseLeg },
      ]);
      expect(legs).toHaveLength(1);
      expect(legs[0].id).not.toBe((element as any).legs[0].id);
    });

    it('rejects a leg id that belongs to another element', async () => {
      const a = await createFlight();
      const b = await createFlight();
      await expect(
        repo.syncLegs(b.id, [{ id: (a as any).legs[0].id, ...baseLeg }])
      ).rejects.toThrow(/does not belong/i);
    });

    it('rejects blank airports, empty leg lists, and non-flight elements', async () => {
      const element = await createFlight();
      await expect(repo.syncLegs(element.id, [{ ...baseLeg, departureAirport: '  ' }])).rejects.toThrow(/airports/i);
      await expect(repo.syncLegs(element.id, [])).rejects.toThrow(/at least one leg/i);
      const hotel = await repo.createElement(tripId, { elementType: 'hotel', name: 'Hotel' });
      await expect(repo.syncLegs(hotel.id, [{ ...baseLeg }])).rejects.toThrow(/flight element/i);
    });
  });
```
Run: `npx vitest run server/repositories/tripElementRepository.test.ts` — expect the 4 new tests to FAIL (`syncLegs is not a function`).

- [ ] **Step 2: Implement** — in `tripElementRepository.ts`

Add above the class:
```ts
export interface FlightLegInput {
  id?: string;
  departureAirport: string;
  departureDatetime: string;
  arrivalAirport: string;
  arrivalDatetime: string;
  airline?: string;
  flightNumber?: string;
  checkPriceUrl?: string;
}

function toEpochMinutes(value: string): number {
  const normalized = /(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return Date.parse(normalized) / 60000;
}
```
Add these methods to the class (before `getLegOwnership`):
```ts
  async syncLegs(elementId: string, legs: FlightLegInput[]): Promise<FlightLeg[]> {
    const db = await this.db;
    const element = await this.getElementById(elementId);
    if (!element || element.elementType !== 'flight') {
      throw new Error('Flight element not found');
    }
    if (legs.length === 0) {
      throw new Error('A flight needs at least one leg');
    }

    const existingIds = new Set<string>(((element as any).legs ?? []).map((l: FlightLeg) => l.id));
    for (const leg of legs) {
      if (!leg.departureAirport?.trim() || !leg.arrivalAirport?.trim()) {
        throw new Error('Each leg needs departure and arrival airports');
      }
      if (!leg.departureDatetime || !leg.arrivalDatetime) {
        throw new Error('Each leg needs departure and arrival times');
      }
      if (leg.id && !existingIds.has(leg.id)) {
        throw new Error('Leg does not belong to this element');
      }
    }

    const keepIds = new Set(legs.filter(l => l.id).map(l => l.id as string));
    for (const id of existingIds) {
      if (!keepIds.has(id)) {
        await db.run('DELETE FROM flight_legs WHERE id = ?', [id]);
      }
    }

    for (const [index, leg] of legs.entries()) {
      const values = [
        leg.departureAirport.trim().toUpperCase(),
        leg.departureDatetime,
        leg.arrivalAirport.trim().toUpperCase(),
        leg.arrivalDatetime,
        leg.airline?.trim() || null,
        leg.flightNumber?.trim() || null,
        leg.checkPriceUrl?.trim() || null,
      ];
      if (leg.id) {
        await db.run(
          `UPDATE flight_legs SET leg_order = ?, departure_airport = ?, departure_datetime = ?, arrival_airport = ?, arrival_datetime = ?,
                  airline = ?, flight_number = ?, check_price_url = ?, updated_at = datetime('now') WHERE id = ?`,
          [index + 1, ...values, leg.id]
        );
      } else {
        await db.run(
          `INSERT INTO flight_legs (id, element_id, leg_order, departure_airport, departure_datetime, arrival_airport, arrival_datetime,
                                    airline, flight_number, check_price_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [uuidv4(), elementId, index + 1, ...values]
        );
      }
    }

    await this.recomputeLayovers(elementId);
    return (((await this.getElementById(elementId)) as any)?.legs ?? []) as FlightLeg[];
  }

  private async recomputeLayovers(elementId: string, onlyMissing = false): Promise<void> {
    const db = await this.db;
    const legs = await db.all(
      `SELECT id, departure_datetime as dep, arrival_datetime as arr, layover_minutes_after as layover
       FROM flight_legs WHERE element_id = ? ORDER BY leg_order ASC`,
      [elementId]
    );
    for (let i = 0; i < legs.length; i++) {
      if (onlyMissing && legs[i].layover !== null) continue;
      let minutes: number | null = null;
      if (i < legs.length - 1) {
        const diff = toEpochMinutes(legs[i + 1].dep) - toEpochMinutes(legs[i].arr);
        minutes = Number.isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
      }
      await db.run('UPDATE flight_legs SET layover_minutes_after = ? WHERE id = ?', [minutes, legs[i].id]);
    }
  }
```
In `createElement`, immediately after the `for … of element.typeSpecificData.legs.entries()` loop closes (still inside the `if (element.elementType === 'flight' …)` branch), add:
```ts
      await this.recomputeLayovers(id, true);
```
(`onlyMissing = true` so any explicit `layoverMinutesAfter` supplied by callers/tests is preserved.)

- [ ] **Step 3: Run — expect PASS**

Run: `npx vitest run server/repositories/tripElementRepository.test.ts`

- [ ] **Step 4: Commit**

```bash
git add server/repositories/tripElementRepository.ts server/repositories/tripElementRepository.test.ts
git commit -m "feat(server): syncLegs for editing multi-leg flights with layover calculation

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Legs route, API client, types

**Files:**
- Modify: `server/routes/tripRoutes.ts`
- Modify: `client/src/types/trip.ts`
- Modify: `client/src/api/tripApi.ts`
- Modify: `client/src/APIUsage.md`

- [ ] **Step 1: Route** — add after the `PUT /:tripId/elements/:elementId` handler in `tripRoutes.ts`:

```ts
// Replace/update the legs of a flight element (update by id, insert new, delete missing)
tripRouter.put('/:tripId/elements/:elementId/legs', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id || element.elementType !== 'flight') {
      return res.status(404).json({ error: 'Flight element not found' });
    }
    const legs = req.body?.legs;
    if (!Array.isArray(legs)) {
      return res.status(400).json({ error: 'legs array is required' });
    }
    const saved = await tripElementRepository.syncLegs(req.params.elementId, legs);
    res.json(saved);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to save legs' });
  }
});
```

- [ ] **Step 2: Types** — append to `client/src/types/trip.ts`:

```ts
export interface FlightLegPayload {
  id?: string;
  legOrder?: number;
  departureAirport: string;
  departureDatetime: string;
  arrivalAirport: string;
  arrivalDatetime: string;
  airline?: string;
  flightNumber?: string;
  checkPriceUrl?: string;
}
```

- [ ] **Step 3: API method** — in `tripApi.ts` add `FlightLegPayload`/`FlightLeg` to the type import from `../types/trip`, then add after `updateElement`:

```ts
  syncLegs: async (tripId: string, elementId: string, legs: FlightLegPayload[]): Promise<FlightLeg[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/legs`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ legs }),
    });
    return handleResponse(response);
  },
```

- [ ] **Step 4: Docs** — add a `syncLegs` line to `client/src/APIUsage.md` mapping it to `client/src/pages/TripDetailPage.tsx` (follow that file's existing format).

- [ ] **Step 5: Verify live**

```bash
npx tsc -p tsconfig.json --noEmit
T=$(curl -s -X POST localhost:3001/api/login -H 'content-type: application/json' -d '{"username":"uitester","password":"UiTest123!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -X PUT localhost:3001/api/trips/b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6/elements/59c6856b-e77f-438f-8c97-5f9366fb65db/legs -H "authorization: Bearer $T" -H 'content-type: application/json' -d '{"legs":[{"departureAirport":"den","departureDatetime":"2026-08-29T08:00","arrivalAirport":"dal","arrivalDatetime":"2026-08-29T10:00","airline":"WN","flightNumber":"100"},{"departureAirport":"dal","departureDatetime":"2026-08-29T12:15","arrivalAirport":"sjd","arrivalDatetime":"2026-08-29T14:00","airline":"WN","flightNumber":"200"}]}'
```
Expected: two legs, uppercase airports, first `"layoverMinutesAfter":135`. (Element `59c6856b…` is the existing "Wn0722" test element with no legs; this also fixes finding 4 in the dev data.)

- [ ] **Step 6: Commit**

```bash
git add server/routes/tripRoutes.ts client/src/types/trip.ts client/src/api/tripApi.ts client/src/APIUsage.md
git commit -m "feat: PUT element legs endpoint and client API

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Leg helpers and `FlightLegsEditor`

**Files:**
- Create: `client/src/utils/flightLegs.ts`
- Create: `client/src/components/FlightLegsEditor.tsx`
- Create: `client/src/__tests__/FlightLegsEditor.test.tsx`
- Modify: `client/src/__tests__/tripFormat.test.ts`
- Modify: `client/src/styles/trips.css`

- [ ] **Step 1: Failing helper tests** — append to `client/src/__tests__/tripFormat.test.ts` (and add the import line):

```ts
import { buildFlightName, draftToPayload, emptyLegDraft, formatLayover, formatLegTime, layoverMinutes, legToDraft } from '../utils/flightLegs';

describe('flight leg helpers', () => {
  it('builds a name from the airport chain and returns empty when airports are missing', () => {
    const base = emptyLegDraft();
    expect(buildFlightName([{ ...base, departureAirport: 'den', arrivalAirport: 'sjd' }])).toBe('DEN → SJD');
    expect(buildFlightName([
      { ...base, departureAirport: 'DEN', arrivalAirport: 'DAL' },
      { ...base, departureAirport: 'DAL', arrivalAirport: 'SJD' },
    ])).toBe('DEN → DAL → SJD');
    expect(buildFlightName([{ ...base, departureAirport: 'DEN' }])).toBe('');
  });

  it('converts drafts to payloads with TBD airports and midnight fallback', () => {
    const draft = { ...emptyLegDraft('2026-09-12'), flightNumber: ' WN123 ', airline: 'wn' };
    expect(draftToPayload(draft)).toEqual({
      id: undefined,
      departureAirport: 'TBD',
      departureDatetime: '2026-09-12T00:00',
      arrivalAirport: 'TBD',
      arrivalDatetime: '2026-09-12T00:00',
      airline: 'WN',
      flightNumber: 'WN123',
      checkPriceUrl: undefined,
    });
  });

  it('round-trips a saved leg into a draft, hiding TBD airports', () => {
    const draft = legToDraft({
      id: 'l1', elementId: 'e1', legOrder: 1, departureAirport: 'TBD', departureDatetime: '2026-09-12T08:30:00Z',
      arrivalAirport: 'SJD', arrivalDatetime: '2026-09-12T11:00:00Z', airline: 'WN', flightNumber: '722', createdAt: '', updatedAt: '',
    });
    expect(draft).toMatchObject({ id: 'l1', flightDate: '2026-09-12', departureAirport: '', arrivalAirport: 'SJD', departureDatetime: '2026-09-12T08:30' });
  });

  it('formats layovers and wall-clock times without timezone shifts', () => {
    expect(formatLayover(135)).toBe('2h 15m');
    expect(formatLayover(60)).toBe('1h');
    expect(formatLayover(45)).toBe('45m');
    expect(layoverMinutes('2026-11-10T10:00', '2026-11-10T12:15')).toBe(135);
    expect(layoverMinutes('2026-11-10T12:00', '2026-11-10T10:00')).toBeNull();
    expect(formatLegTime('2026-11-10T08:00')).toMatch(/Nov 10.*8:00\s?AM/);
  });
});
```
Run `npx vitest run client/src/__tests__/tripFormat.test.ts` — expect FAIL (module missing).

- [ ] **Step 2: Create `client/src/utils/flightLegs.ts`**

```ts
import { FlightLeg, FlightLegPayload } from '../types/trip';

export interface FlightLegDraft {
  id?: string;
  flightDate: string;
  airline: string;
  flightNumber: string;
  departureAirport: string;
  departureDatetime: string;
  arrivalAirport: string;
  arrivalDatetime: string;
  checkPriceUrl: string;
}

export function emptyLegDraft(flightDate = ''): FlightLegDraft {
  return {
    flightDate,
    airline: '',
    flightNumber: '',
    departureAirport: '',
    departureDatetime: '',
    arrivalAirport: '',
    arrivalDatetime: '',
    checkPriceUrl: '',
  };
}

// <input type="datetime-local"> values are "YYYY-MM-DDTHH:mm"
export function toDatetimeLocalValue(value?: string | null): string {
  return value ? value.slice(0, 16) : '';
}

export function legToDraft(leg: FlightLeg): FlightLegDraft {
  const departure = toDatetimeLocalValue(leg.departureDatetime);
  return {
    id: leg.id,
    flightDate: departure.slice(0, 10),
    airline: leg.airline ?? '',
    flightNumber: leg.flightNumber ?? '',
    departureAirport: leg.departureAirport && leg.departureAirport !== 'TBD' ? leg.departureAirport : '',
    departureDatetime: departure,
    arrivalAirport: leg.arrivalAirport && leg.arrivalAirport !== 'TBD' ? leg.arrivalAirport : '',
    arrivalDatetime: toDatetimeLocalValue(leg.arrivalDatetime),
    checkPriceUrl: leg.checkPriceUrl ?? '',
  };
}

export function draftToPayload(draft: FlightLegDraft): FlightLegPayload {
  const fallback = draft.flightDate ? `${draft.flightDate}T00:00` : '';
  const departure = draft.departureDatetime || fallback;
  return {
    id: draft.id,
    departureAirport: draft.departureAirport.trim().toUpperCase() || 'TBD',
    departureDatetime: departure,
    arrivalAirport: draft.arrivalAirport.trim().toUpperCase() || 'TBD',
    arrivalDatetime: draft.arrivalDatetime || departure,
    airline: draft.airline.trim().toUpperCase() || undefined,
    flightNumber: draft.flightNumber.trim() || undefined,
    checkPriceUrl: draft.checkPriceUrl.trim() || undefined,
  };
}

export function draftHasDate(draft: FlightLegDraft): boolean {
  return Boolean(draft.departureDatetime || draft.flightDate);
}

export function buildFlightName(
  drafts: Pick<FlightLegDraft, 'departureAirport' | 'arrivalAirport'>[]
): string {
  const first = drafts[0]?.departureAirport.trim().toUpperCase();
  const stops = drafts.map(d => d.arrivalAirport.trim().toUpperCase());
  if (!first || stops.length === 0 || stops.some(s => !s)) return '';
  return [first, ...stops].join(' → ');
}

export function formatLayover(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  return hours ? `${hours}h` : `${mins}m`;
}

function toEpochMinutes(value: string): number {
  const normalized = /(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`;
  return Date.parse(normalized) / 60000;
}

export function layoverMinutes(arrival: string, nextDeparture: string): number | null {
  if (!arrival || !nextDeparture) return null;
  const diff = toEpochMinutes(nextDeparture) - toEpochMinutes(arrival);
  return Number.isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
}

// Shows the stored wall-clock time as-is (no timezone conversion).
export function formatLegTime(value?: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return value ?? '';
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return new Date(year, month - 1, day, hour, minute).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
```
Run `npx vitest run client/src/__tests__/tripFormat.test.ts` — expect PASS.

- [ ] **Step 3: Failing component tests** — `client/src/__tests__/FlightLegsEditor.test.tsx`

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: { lookupFlightAutofill: vi.fn() },
}));

import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from '../components/FlightLegsEditor';
import { FlightLegDraft, emptyLegDraft } from '../utils/flightLegs';

function Harness({ initial, spy }: { initial?: FlightLegDraft[]; spy?: (legs: FlightLegDraft[]) => void }) {
  const [legs, setLegs] = useState<FlightLegDraft[]>(initial ?? [emptyLegDraft()]);
  return (
    <FlightLegsEditor
      tripId="trip-1"
      legs={legs}
      onChange={(next) => {
        setLegs(next);
        spy?.(next);
      }}
    />
  );
}

describe('FlightLegsEditor', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it('lets the user type airports and times manually', () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.change(screen.getByLabelText(/from \(airport/i), { target: { value: 'DEN' } });
    fireEvent.change(screen.getByLabelText(/^departs$/i), { target: { value: '2026-11-10T08:00' } });
    const last = spy.mock.calls[spy.mock.calls.length - 1][0] as FlightLegDraft[];
    expect(last[0]).toMatchObject({ departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00' });
  });

  it('adds a connecting flight, shows the layover, and removes legs', () => {
    render(
      <Harness
        initial={[
          { ...emptyLegDraft('2026-11-10'), departureAirport: 'DEN', arrivalAirport: 'DAL', departureDatetime: '2026-11-10T08:00', arrivalDatetime: '2026-11-10T10:00' },
          { ...emptyLegDraft('2026-11-10'), departureAirport: 'DAL', arrivalAirport: 'SJD', departureDatetime: '2026-11-10T12:15', arrivalDatetime: '2026-11-10T14:00' },
        ]}
      />
    );
    expect(screen.getByText(/layover.*2h 15m/i)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /remove flight/i })[1]);
    expect(screen.queryByText(/layover/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /add connecting flight/i }));
    expect(screen.getAllByLabelText(/airline code/i)).toHaveLength(2);
  });

  it('fills the leg from a lookup result', async () => {
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN', flightNumber: '722', flightDate: '2026-10-24',
      departureAirport: 'DEN', arrivalAirport: 'SJD',
      departureDatetime: '2026-10-24T09:00', arrivalDatetime: '2026-10-24T11:00',
      statusText: 'On time', sourceUrl: 'https://example.com',
    });
    render(<Harness initial={[{ ...emptyLegDraft('2026-10-24'), airline: 'WN', flightNumber: '722' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));
    await waitFor(() => expect((screen.getByLabelText(/from \(airport/i) as HTMLInputElement).value).toBe('DEN'));
    expect((screen.getByLabelText(/^arrives$/i) as HTMLInputElement).value).toBe('2026-10-24T11:00');
    expect(screen.getByRole('status').textContent).toMatch(/on time/i);
  });

  it('tells the user when the lookup finds no schedule', async () => {
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-11-10', sourceUrl: 'https://example.com/fs',
    });
    render(<Harness initial={[{ ...emptyLegDraft('2026-11-10'), airline: 'WN', flightNumber: '1234' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));
    expect(await screen.findByText(/no schedule found/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /flightstats/i }).getAttribute('href')).toBe('https://example.com/fs');
  });

  it('shows an error when the lookup request fails', async () => {
    (tripApi.lookupFlightAutofill as any).mockRejectedValue(new Error('boom'));
    render(<Harness initial={[{ ...emptyLegDraft('2026-11-10'), airline: 'WN', flightNumber: '1' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /look up flight details/i }));
    expect(await screen.findByText(/boom/)).toBeTruthy();
  });
});
```
Run `npx vitest run client/src/__tests__/FlightLegsEditor.test.tsx` — expect FAIL (component missing).

- [ ] **Step 4: Create `client/src/components/FlightLegsEditor.tsx`**

```tsx
import { useState } from 'react';
import { tripApi } from '../api/tripApi';
import {
  FlightLegDraft,
  emptyLegDraft,
  formatLayover,
  layoverMinutes,
  toDatetimeLocalValue,
} from '../utils/flightLegs';

interface FlightLegsEditorProps {
  tripId: string;
  legs: FlightLegDraft[];
  onChange: (legs: FlightLegDraft[]) => void;
  idPrefix?: string;
}

type LookupStatus = { kind: 'ok' | 'empty' | 'error'; text: string; url?: string };

export function FlightLegsEditor({ tripId, legs, onChange, idPrefix = 'leg' }: FlightLegsEditorProps) {
  const [status, setStatus] = useState<Record<number, LookupStatus>>({});
  const [lookingUp, setLookingUp] = useState<number | null>(null);

  const setLegStatus = (index: number, value: LookupStatus) =>
    setStatus(prev => ({ ...prev, [index]: value }));

  const update = (index: number, patch: Partial<FlightLegDraft>) =>
    onChange(legs.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)));

  const addLeg = () => onChange([...legs, emptyLegDraft(legs[legs.length - 1]?.flightDate ?? '')]);

  const removeLeg = (index: number) => {
    onChange(legs.filter((_, i) => i !== index));
    setStatus({});
  };

  const lookup = async (index: number) => {
    const leg = legs[index];
    const date = leg.flightDate || leg.departureDatetime.slice(0, 10);
    if (!leg.airline.trim() || !leg.flightNumber.trim() || !date) {
      setLegStatus(index, { kind: 'error', text: 'Enter the airline code, flight number and flight date to look up.' });
      return;
    }
    try {
      setLookingUp(index);
      const details = await tripApi.lookupFlightAutofill(tripId, {
        airlineCode: leg.airline.trim().toUpperCase(),
        flightNumber: leg.flightNumber.trim(),
        flightDate: date,
      });
      const found = details.departureAirport || details.arrivalAirport || details.departureDatetime || details.arrivalDatetime;
      if (!found) {
        setLegStatus(index, {
          kind: 'empty',
          text: 'No schedule found for this flight yet. Enter the airports and times manually.',
          url: details.sourceUrl,
        });
        return;
      }
      update(index, {
        flightDate: details.flightDate || date,
        airline: details.airlineCode || leg.airline,
        flightNumber: details.flightNumber || leg.flightNumber,
        departureAirport: details.departureAirport || leg.departureAirport,
        arrivalAirport: details.arrivalAirport || leg.arrivalAirport,
        departureDatetime: toDatetimeLocalValue(details.departureDatetime) || leg.departureDatetime,
        arrivalDatetime: toDatetimeLocalValue(details.arrivalDatetime) || leg.arrivalDatetime,
      });
      setLegStatus(index, {
        kind: 'ok',
        text: `Filled from FlightStats${details.statusText ? ` (${details.statusText})` : ''}. Check the times before saving.`,
      });
    } catch (err) {
      setLegStatus(index, { kind: 'error', text: err instanceof Error ? err.message : 'Flight lookup failed' });
    } finally {
      setLookingUp(null);
    }
  };

  return (
    <div className="flight-legs-editor">
      {legs.map((leg, index) => {
        const id = (field: string) => `${idPrefix}-${index}-${field}`;
        const layover = index > 0 ? layoverMinutes(legs[index - 1].arrivalDatetime, leg.departureDatetime) : null;
        const legStatus = status[index];
        return (
          <div key={leg.id ?? `new-${index}`}>
            {index > 0 && layover !== null && (
              <p className="flight-layover">
                Layover{leg.departureAirport ? ` in ${leg.departureAirport.toUpperCase()}` : ''}: {formatLayover(layover)}
              </p>
            )}
            <div className="flight-leg-row">
              <h5>Flight {index + 1}</h5>
              <div className="create-element-field">
                <label htmlFor={id('date')}>Flight date</label>
                <input id={id('date')} type="date" value={leg.flightDate} onChange={(e) => update(index, { flightDate: e.target.value })} />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('airline')}>Airline code</label>
                <input id={id('airline')} type="text" value={leg.airline} onChange={(e) => update(index, { airline: e.target.value.toUpperCase() })} placeholder="e.g. WN" />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('number')}>Flight number</label>
                <input id={id('number')} type="text" value={leg.flightNumber} onChange={(e) => update(index, { flightNumber: e.target.value })} placeholder="e.g. 722" />
              </div>
              <div className="create-element-field">
                <button type="button" className="view-toggle-btn" onClick={() => lookup(index)} disabled={lookingUp === index}>
                  {lookingUp === index ? 'Looking up...' : 'Look up flight details'}
                </button>
              </div>
              {legStatus && (
                <p role="status" className={`flight-lookup-status ${legStatus.kind}`}>
                  {legStatus.text}
                  {legStatus.url && (
                    <>
                      {' '}
                      <a href={legStatus.url} target="_blank" rel="noreferrer">Open FlightStats</a>
                    </>
                  )}
                </p>
              )}
              <div className="create-element-field">
                <label htmlFor={id('from')}>From (airport code)</label>
                <input id={id('from')} type="text" maxLength={4} value={leg.departureAirport} onChange={(e) => update(index, { departureAirport: e.target.value.toUpperCase() })} placeholder="e.g. DEN" />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('departs')}>Departs</label>
                <input id={id('departs')} type="datetime-local" value={leg.departureDatetime} onChange={(e) => update(index, { departureDatetime: e.target.value })} />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('to')}>To (airport code)</label>
                <input id={id('to')} type="text" maxLength={4} value={leg.arrivalAirport} onChange={(e) => update(index, { arrivalAirport: e.target.value.toUpperCase() })} placeholder="e.g. SJD" />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('arrives')}>Arrives</label>
                <input id={id('arrives')} type="datetime-local" value={leg.arrivalDatetime} onChange={(e) => update(index, { arrivalDatetime: e.target.value })} />
              </div>
              <div className="create-element-field">
                <label htmlFor={id('price-url')}>Price check link</label>
                <input id={id('price-url')} type="url" value={leg.checkPriceUrl} onChange={(e) => update(index, { checkPriceUrl: e.target.value })} placeholder="Airline search page (optional)" />
              </div>
              {legs.length > 1 && (
                <button type="button" className="view-toggle-btn" onClick={() => removeLeg(index)}>
                  Remove flight {index + 1}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" className="view-toggle-btn" onClick={addLeg}>
        Add connecting flight
      </button>
    </div>
  );
}
```
Note: the label text `From (airport code)` is matched by `/from \(airport/i`; `Departs`/`Arrives` are exact (`/^departs$/i`).

- [ ] **Step 5: CSS** — append to `trips.css`:

```css
.flight-leg-row {
  background-color: var(--ctp-mocha-surface0);
  border: 1px solid var(--ctp-mocha-surface1);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.flight-leg-row h5,
.flight-lookup-status {
  grid-column: 1 / -1;
  margin: 0;
}

.flight-lookup-status.empty,
.flight-lookup-status.error {
  color: var(--ctp-mocha-peach);
}

.flight-layover {
  margin: 0.25rem 0;
  color: var(--ctp-mocha-subtext);
  font-size: 0.9rem;
}
```
(If `--ctp-mocha-peach` is not defined in the theme file, use `--ctp-mocha-yellow`; check with `grep -n "ctp-mocha-peach\|ctp-mocha-yellow" client/src/styles/*.css`.)

- [ ] **Step 6: Run — expect PASS; commit**

```bash
npx vitest run client/src/__tests__/FlightLegsEditor.test.tsx client/src/__tests__/tripFormat.test.ts
npx tsc -p tsconfig.json --noEmit
git add client/src
git commit -m "feat(client): FlightLegsEditor with manual airports/times, layovers, lookup feedback

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Wire the editor and leg display into `TripDetailPage`

**Files:**
- Modify: `client/src/pages/TripDetailPage.tsx`
- Modify: `client/src/__tests__/TripDetailPage.test.tsx`

- [ ] **Step 1: Update the page tests first (they should fail against the old page)**

In `TripDetailPage.test.tsx`:
1. Add `syncLegs: vi.fn(),` to the `tripApi` mock object.
2. Test "hides deprecated flat flight booking fields…": expected leg becomes
```ts
              expect.objectContaining({
                flightNumber: 'WN123',
                departureDatetime: '2026-09-12T00:00',
                arrivalDatetime: '2026-09-12T00:00',
              }),
```
3. Tests using the lookup button: replace `/auto-fill flight details/i` with `/look up flight details/i` (3 occurrences). In "auto-generates flight names…" the mocked lookup returns `…Z` times; no other assertion there depends on times.
4. In "autofills flight details from the lookup endpoint" the expected leg becomes
```ts
                departureAirport: 'DEN',
                arrivalAirport: 'SJD',
                departureDatetime: '2026-08-29T15:10',
                arrivalDatetime: '2026-08-29T18:05',
```
5. Append new tests:

```tsx
  it('creates a two-leg flight with a connection', async () => {
    (tripApi.createElement as any).mockResolvedValue({ id: 'el-5', tripId: 'trip-1', elementType: 'flight', name: 'DEN → DAL → SJD', sortPosition: 0, createdAt: '', updatedAt: '' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /add element/i }));
    fireEvent.change(screen.getByLabelText(/from \(airport/i), { target: { value: 'DEN' } });
    fireEvent.change(screen.getByLabelText(/to \(airport/i), { target: { value: 'DAL' } });
    fireEvent.change(screen.getByLabelText(/flight date/i), { target: { value: '2026-11-10' } });
    fireEvent.click(screen.getByRole('button', { name: /add connecting flight/i }));
    const froms = screen.getAllByLabelText(/from \(airport/i);
    const tos = screen.getAllByLabelText(/to \(airport/i);
    fireEvent.change(froms[1], { target: { value: 'DAL' } });
    fireEvent.change(tos[1], { target: { value: 'SJD' } });

    await waitFor(() => expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('DEN → DAL → SJD'));
    fireEvent.click(screen.getByRole('button', { name: /save element/i }));

    await waitFor(() => {
      expect(tripApi.createElement).toHaveBeenCalledWith('trip-1', expect.objectContaining({
        typeSpecificData: expect.objectContaining({
          legs: [
            expect.objectContaining({ legOrder: 1, departureAirport: 'DEN', arrivalAirport: 'DAL' }),
            expect.objectContaining({ legOrder: 2, departureAirport: 'DAL', arrivalAirport: 'SJD' }),
          ],
        }),
      }));
    });
  });

  it('lists every leg of a flight with its layover and edits legs through syncLegs', async () => {
    (tripApi.listElements as any).mockResolvedValue([
      {
        id: 'el-7', tripId: 'trip-1', elementType: 'flight', name: 'DEN → DAL → SJD', sortPosition: 0, createdAt: '', updatedAt: '',
        legs: [
          { id: 'leg-1', elementId: 'el-7', legOrder: 1, departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00', arrivalAirport: 'DAL', arrivalDatetime: '2026-11-10T10:00', airline: 'WN', flightNumber: '100', layoverMinutesAfter: 135, createdAt: '', updatedAt: '' },
          { id: 'leg-2', elementId: 'el-7', legOrder: 2, departureAirport: 'DAL', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'SJD', arrivalDatetime: '2026-11-10T14:00', airline: 'WN', flightNumber: '200', createdAt: '', updatedAt: '' },
        ],
      },
    ]);
    (tripApi.updateElement as any).mockResolvedValue({});
    (tripApi.syncLegs as any).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText(/DEN → DAL/, { selector: '.flight-leg-summary strong' })).toBeTruthy();
    expect(screen.getByText(/layover.*2h 15m/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /view\/edit/i }));
    fireEvent.change(screen.getAllByLabelText(/flight number/i)[1], { target: { value: '201' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(tripApi.syncLegs).toHaveBeenCalledWith('trip-1', 'el-7', [
        expect.objectContaining({ id: 'leg-1', flightNumber: '100' }),
        expect.objectContaining({ id: 'leg-2', flightNumber: '201', departureAirport: 'DAL', arrivalAirport: 'SJD' }),
      ]);
    });
  });

  it('hides the date range when a trip has no dates', async () => {
    (tripApi.getTrip as any).mockResolvedValue({ id: 'trip-1', familyId: 'fam-1', name: 'Cabo', createdAt: '', updatedAt: '' });
    renderPage();
    await screen.findByRole('button', { name: /add element/i });
    expect(screen.queryByText(/ to /)).toBeNull();
  });
```
Run `npx vitest run client/src/__tests__/TripDetailPage.test.tsx` — expect FAILs.

- [ ] **Step 2: Imports and types** — at the top of `TripDetailPage.tsx`:

```tsx
import { Trip, TripElement, TripParticipant, FlightLegPayload } from '../types/trip';
import { FlightLegsEditor } from '../components/FlightLegsEditor';
import { FlightLegDraft, buildFlightName, draftHasDate, draftToPayload, emptyLegDraft, formatLayover, formatLegTime, legToDraft } from '../utils/flightLegs';
```
Replace the `TripElementPayload` type with
```tsx
type TripElementPayload = Partial<TripElement> & {
  typeSpecificData?: {
    legs?: FlightLegPayload[];
  };
};
```
Delete the now-unused `isoDateAtMidnight` helper. Keep `displayDateOnly` only if still used (it is not after Step 6 — delete it too to satisfy the linter).

- [ ] **Step 3: State** — delete these states: `newFlightDate`, `newFlightAirlineCode`, `newFlightNumber`, `newFlightDepartureAirport`, `newFlightArrivalAirport`, `newFlightDepartureDatetime`, `newFlightArrivalDatetime`, `flightAutofillStatus`, `flightAutofillLoading`. Add:

```tsx
  const [newLegs, setNewLegs] = useState<FlightLegDraft[]>([emptyLegDraft()]);
  const [editingLegs, setEditingLegs] = useState<FlightLegDraft[]>([]);
```

- [ ] **Step 4: Name auto-generation effect** — replace the existing effect with:

```tsx
  useEffect(() => {
    if (newElementType !== 'flight' || nameManuallyEdited) return;
    const generated = buildFlightName(newLegs);
    if (generated) setNewElementName(generated);
  }, [newElementType, newLegs, nameManuallyEdited]);
```

- [ ] **Step 5: createElement** — replace the `newFlightDate` validation and the flight payload:

```tsx
    if (newElementType === 'flight' && !newLegs.every(draftHasDate)) {
      setError('Each flight needs a flight date or departure time');
      return;
    }
```
```tsx
      if (newElementType === 'flight') {
        payload.typeSpecificData = {
          legs: newLegs.map((draft, index) => ({ ...draftToPayload(draft), legOrder: index + 1 })),
        };
      }
```
and in the reset block replace the seven `setNewFlight*` / `setFlightAutofillStatus('')` lines with `setNewLegs([emptyLegDraft()]);`. Delete the whole `autoFillFlightDetails` function.

- [ ] **Step 6: Editing** — `startEditingElement` add:
```tsx
    setEditingLegs(element.elementType === 'flight' && element.legs?.length ? element.legs.map(legToDraft) : [emptyLegDraft()]);
```
`cancelEditingElement` add `setEditingLegs([]);`. In `saveElementEdits`, after `await tripApi.updateElement(tripId, elementId, payload);` add:
```tsx
      if (editingElement?.elementType === 'flight') {
        if (!editingLegs.every(draftHasDate)) {
          setError('Each flight needs a flight date or departure time');
          return;
        }
        await tripApi.syncLegs(tripId, elementId, editingLegs.map(draftToPayload));
      }
```
(Place the leg date validation *before* `updateElement` so a validation failure does not leave a half-saved element: move that `if (!editingLegs.every(draftHasDate))` check up next to the name check at the top of `saveElementEdits`, guarded by `elements.find(e => e.id === elementId)?.elementType === 'flight'`, and keep only the `syncLegs` call after `updateElement`.)

- [ ] **Step 7: Create-form JSX** — replace the whole `{newElementType === 'flight' && ( <> … </> )}` block (flight date, airline code, flight number, auto-fill button, note, autofill preview) with:

```tsx
          {newElementType === 'flight' && (
            <>
              {tripId && <FlightLegsEditor tripId={tripId} legs={newLegs} onChange={setNewLegs} idPrefix="new-leg" />}
              <p className="element-notes">
                Confirmation number, pricing, and travelers are entered per-booking below after saving this element.
              </p>
            </>
          )}
```

- [ ] **Step 8: Edit-form JSX** — inside the edit form, after the Name field and before the `{item.elementType !== 'flight' && (` block, add:

```tsx
                        {item.elementType === 'flight' && tripId && (
                          <FlightLegsEditor tripId={tripId} legs={editingLegs} onChange={setEditingLegs} idPrefix={`edit-leg-${item.id}`} />
                        )}
```
Also fix the stray indentation: change `)}                        <div className="create-element-field edit-notes-field">` into two lines (`)}` then the `<div …>` on its own line).

- [ ] **Step 9: Display** — replace the `element-flight-meta` block (the `item.legs?.[0]` section) with a per-leg list, and show seat grids under their leg:

```tsx
                    {item.elementType === 'flight' && item.legs && item.legs.length > 0 && (
                      <div className="element-flight-legs">
                        {item.legs.map((leg, index) => (
                          <div key={leg.id}>
                            <div className="flight-leg-summary">
                              <strong>{leg.departureAirport || '—'} → {leg.arrivalAirport || '—'}</strong>{' '}
                              <span>
                                {[leg.airline, leg.flightNumber].filter(Boolean).join(' ')}
                                {leg.departureDatetime ? ` · ${formatLegTime(leg.departureDatetime)}` : ''}
                                {leg.arrivalDatetime ? ` → ${formatLegTime(leg.arrivalDatetime)}` : ''}
                              </span>
                              {leg.checkPriceUrl && (
                                <>
                                  {' '}
                                  <a href={leg.checkPriceUrl} target="_blank" rel="noreferrer">Check price</a>
                                </>
                              )}
                            </div>
                            {tripId && <FlightSeatGrid tripId={tripId} legId={leg.id} travelers={participants} />}
                            {index < item.legs!.length - 1 && leg.layoverMinutesAfter != null && (
                              <p className="flight-layover">Layover: {formatLayover(leg.layoverMinutesAfter)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
```
Then in the later `item.elementType === 'flight' && tripId` fragment delete the `{item.legs?.map(leg => (<FlightSeatGrid …/>))}` lines (seat grids now render inside the leg list), leaving only `<BookingCard …/>`.

Existing test "renders participants, seat grid…" has a leg without airports and expects `Taylor seat` — satisfied since the leg list renders the grid for every leg.

- [ ] **Step 10: Sort flights chronologically** — replace the `groupedByType` reduce with one that sorts each group:

```tsx
  const firstDeparture = (el: TripElement) => el.legs?.[0]?.departureDatetime ?? '';
  const groupedByType = elements.reduce((acc, el) => {
    if (!acc[el.elementType]) acc[el.elementType] = [];
    acc[el.elementType].push(el);
    return acc;
  }, {} as Record<string, TripElement[]>);
  if (groupedByType.flight) {
    groupedByType.flight.sort((a, b) => firstDeparture(a).localeCompare(firstDeparture(b)));
  }
```

- [ ] **Step 11: CSS** — append:

```css
.element-flight-legs {
  margin: 0.5rem 0;
}

.flight-leg-summary {
  margin: 0.25rem 0;
}
```

- [ ] **Step 12: Run — expect PASS; type-check; commit**

```bash
npx vitest run client/src/__tests__/TripDetailPage.test.tsx client/src/__tests__/FlightLegsEditor.test.tsx client/src/__tests__/BookingCard.test.tsx
npx tsc -p tsconfig.json --noEmit
git add client/src
git commit -m "feat(client): multi-leg flight entry, editing, and per-leg display on trip page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Seat save feedback and button polish

**Files:**
- Modify: `client/src/components/FlightSeatGrid.tsx`
- Modify: `client/src/__tests__/FlightSeatGrid.test.tsx`

- [ ] **Step 1: Failing test** — append in the `describe`:

```tsx
  it('confirms a saved seat and surfaces save errors', async () => {
    (tripApi.assignSeat as any).mockResolvedValue({});
    render(<FlightSeatGrid tripId="trip-1" legId="leg-1" travelers={travelers} />);
    const input = await screen.findByLabelText(/alice seat/i);
    fireEvent.change(input, { target: { value: '14C' } });
    fireEvent.blur(input);
    expect(await screen.findByText(/saved/i)).toBeTruthy();

    (tripApi.assignSeat as any).mockRejectedValue(new Error('nope'));
    fireEvent.change(input, { target: { value: '15A' } });
    fireEvent.blur(input);
    expect(await screen.findByText(/nope/)).toBeTruthy();
  });
```
Run: `npx vitest run client/src/__tests__/FlightSeatGrid.test.tsx` — expect FAIL.

- [ ] **Step 2: Implement** — add state and update `handleBlur`:

```tsx
  const [feedback, setFeedback] = useState<Record<string, string>>({});
```
```tsx
  const handleBlur = async (participantId: string) => {
    const seatNumber = (seatByParticipant[participantId] || '').trim();
    try {
      if (!seatNumber) {
        await tripApi.removeSeat(tripId, legId, participantId);
      } else {
        await tripApi.assignSeat(tripId, legId, participantId, seatNumber);
      }
      setFeedback(prev => ({ ...prev, [participantId]: 'Saved' }));
    } catch (err) {
      setFeedback(prev => ({ ...prev, [participantId]: err instanceof Error ? err.message : 'Failed to save seat' }));
    }
  };
```
Render after each seat `<input>`: `{feedback[traveler.id] && <span className="seat-feedback">{feedback[traveler.id]}</span>}`. In `onChange` also clear that traveler's feedback: extend `handleChange` with `setFeedback(prev => ({ ...prev, [participantId]: '' }));`.

- [ ] **Step 3: Run — expect PASS; commit**

```bash
npx vitest run client/src/__tests__/FlightSeatGrid.test.tsx
git add client/src && git commit -m "feat(client): seat save feedback

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Docs, full verification, live click-through

**Files:**
- Modify: `client/src/components/ComponentUsage.md`

- [ ] **Step 1: Docs** — add a `### FlightLegsEditor` entry (same `**Used in:**` format as its neighbours) listing `client/src/pages/TripDetailPage.tsx`. Update the `BookingTransactionList`, `BookingCard`, and `TripParticipantsPanel` entries only if their "Used in" lines changed (they did not).

- [ ] **Step 2: Full verification**

```bash
cd /config/workspace/travel-list
npx tsc -p tsconfig.json --noEmit
npx vitest run 2>&1 | tail -15
```
Expected: tsc clean; only the 12 known pre-existing failures (families/templates/packing-lists/login), everything else passing.

- [ ] **Step 3: Live Playwright click-through** (dev server is running on port 3000; log in as `uitester` / `UiTest123!`; reuse `/tmp/lib.cjs` `open()` helper if it still exists, otherwise inline the login). Walk through and screenshot each step to `/tmp/shots/verify-*.png`:
  1. `/trips/b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6`: header shows `2026-08-29 to 2026-09-05`; top bar title says **Trips**.
  2. Add Element → flight: type airline `WN`, number `722`, date = today → **Look up flight details** fills DEN/SJD and times; name auto-fills `DEN → SJD`; Save.
  3. Add Element → flight with number `1234` on 2026-11-10 → lookup shows "No schedule found…" with a FlightStats link; type airports/times by hand; **Add connecting flight**, fill leg 2; layover line shows; Save; element lists both legs and layover.
  4. View/Edit that element → change a leg's flight number → Save Changes → list updates.
  5. On the Home/Wn0722 elements: add a transaction with a pasted multi-line note; the note keeps its line breaks and the totals show `$142.96` style (no `¢`); after adding, **both** copies of a shared booking update without reload; the header shows `Originally booked as ABC123` after the rebook.
  6. Add a booking with a brand-new traveler name → the Travelers panel lists them immediately (no reload).
  7. `document.querySelectorAll('[id]')` has no duplicate ids on the page.
  8. Mobile viewport 390×844: no horizontal overflow while the leg editor is open.

- [ ] **Step 4: Commit and finish**

```bash
git add client/src/components/ComponentUsage.md
git commit -m "docs: document FlightLegsEditor

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
Then follow `superpowers:finishing-a-development-branch` for `fix/flight-ux-review`.

---

## Self-Review

**Spec/finding coverage**
1 manual airports/times → Tasks 7–8 (editor in create + edit). 2 silent autofill → Task 7 (`empty`/`error` statuses with link). 3 multi-leg → Tasks 5–8 (`syncLegs`, editor add/remove, per-leg display + layover). 4 legless element → Tasks 6/8 (edit path; dev data fixed via live PUT in Task 6 Step 5). 5 stale Travelers → Task 3. 6 stale duplicate cards + duplicate ids → Tasks 2–3 (`useId`, `refreshKey`). 7 money format → Task 2. 8 notes newlines → Task 2 (textarea + `white-space: pre-wrap`). 9 original confirmation → Tasks 2–3. 10 header/title → Task 1. Polish (buttons, seat feedback) → Tasks 2, 3, 7, 9. Extra: scheduled-local autofill (Task 4) needed for correct layovers.

**Placeholder scan:** no TBD/"similar to"; every code step includes code. Task 3 Step 1 explicitly says to adapt the participants-panel test's import line to that file's existing pattern, since that file's header was not reproduced here.

**Type consistency:** `FlightLegDraft`, `FlightLegPayload`, `FlightLegInput` (server), `draftToPayload`, `legToDraft`, `buildFlightName`, `layoverMinutes`, `formatLayover`, `formatLegTime`, `formatMoney`, `syncLegs`, `refreshKey`, `onBookingsChanged`, `originalConfirmationNumber` are named identically across tasks. `FlightLegPayload` carries optional `legOrder` (used on create) and `id` (used by `syncLegs`).

**Known limits (intentional):**
- `syncLegs` deletes legs removed in the editor, which cascades to their seat assignments (the Remove button is explicit).
- Legacy legs stored as UTC `…Z` strings are shown by slicing to `YYYY-MM-DDTHH:mm`; re-saving converts them to wall-clock strings.
- Hotel/car/activity bookings, expense tracking, uploads, schedule and research planner remain future sessions.
