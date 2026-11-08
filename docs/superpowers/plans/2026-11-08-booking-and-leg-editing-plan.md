# Booking & Flight-Leg Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bookings editable/deletable with a per-traveler-per-flight uniqueness rule, show covered legs on each booking, replace the whole-flight edit panel with inline per-leg editing (add/edit/remove), streamline leg fields (one flight code, one date, time-only inputs with an arrival-day chip), and auto-title flights `FIRST → LAST`.

**Architecture:** Server owns the rules: `BookingRepository` enforces the traveler conflict rule (throws `BookingConflictError` → HTTP 409) and replaces a booking's flights/travelers transactionally; `TripElementRepository` sets the flight title whenever legs are written; a `.cjs` migration backfills titles. The client gets a new leg draft model in `utils/flightLegs.ts`, a shared `FlightLegForm`, a Details-tab `FlightLegList`, and the Bookings tab is split into `BookingForm` (create/edit) + `BookingBlock` (read/edit/delete) under a thin `BookingCard` that receives trip-wide bookings from `TripDetailPage`.

**Tech Stack:** React 18, Mantine 8.3 (`@mantine/core`), `@tabler/icons-react`, TypeScript, Express, SQLite (`sqlite`/`sqlite3`), vitest 2 + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-08-booking-and-leg-editing-design.md`

---

## Conventions (read before every task)

- **Branch:** `feat/booking-leg-editing` (already checked out; stacked on `feat/bookings-tab-compact`). Do not create other branches.
- **Every commit message ends with** a blank line and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Run tests:** `npx vitest run <file> [<file> ...]` from the repo root. Server tests under `server/**/*.test.ts` are auto-included. **Client tests in `client/src/__tests__/` must be added to the `include` whitelist in `vitest.config.ts`** or they will silently not run.
- **Client tests** render with `renderWithMantine` from `client/src/test-utils/renderWithMantine.tsx` (wraps `MantineProvider env="test"` and installs `matchMedia`/`ResizeObserver`/`scrollIntoView` polyfills). If you call `rerender`, wrap the element in `<MantineProvider env="test">` yourself.
- **Type-check client (trip code):**
  ```bash
  npx tsc -p client/tsconfig.json 2>&1 | grep -E "^client/src/(api/tripApi|types/trip|utils/(flightLegs|bookingCoverage|bookingSummary|flightRows)|components/(Flight|Booking|AddElement|ElementDialog|Trip)|pages/Trip|__tests__/(Flight|Booking|Trip|flight|booking|trip))"
  ```
  Expected: **no output**. (~100 pre-existing errors exist in unrelated files; ignore them.)
- **Type-check server:**
  ```bash
  npx tsc -p tsconfig.build.json --noEmit 2>&1 | grep "error TS" | grep -v "server/routes/tripFileRoutes.ts"
  ```
  Expected: **no output**. (15 pre-existing multer typing errors in `tripFileRoutes.ts` are ignored.)
- **Known pre-existing failures:** a full `npx vitest run` has 12 failing server/integration tests with `no such table: families`. Do not try to fix them.
- **Dev server:** already running (Vite on :3000, API on :3001, `tsx watch`). Never start another one, never kill it. `pkill`/`killall` are forbidden.
- **Do NOT run `node server/migrations/run-migrations.cjs`** — it tracks a different storage file than the server and would re-run old migrations. The dev server applies new migrations itself when it restarts (tsx watch restarts on server file changes).
- **Dev data to preserve:** login `uitester` / `UiTest123!`; Cabo trip `b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6`.
- **UI rules:** errors are inline Mantine `Alert color="red"` (no notifications); destructive actions use an inline two-step "Confirm / Cancel".

## File map

| File | Status | Responsibility |
|---|---|---|
| `client/tsconfig.json` | create | Makes client type-checking possible |
| `server/utils/flightTitle.ts` (+ `.test.ts`) | create | Pure `flightTitle(legs)` |
| `server/repositories/tripElementRepository.ts` | modify | Set flight title on create / `syncLegs`; `name` optional for flights |
| `server/migrations/migrations/20261108_01_backfill_flight_titles.cjs` | create | Backfill existing flight titles |
| `server/repositories/bookingRepository.ts` | modify | `BookingConflictError`, `findTravelerConflicts`, `assertNoTravelerConflicts`, transactional `updateBooking` with `elementIds`/`travelerIds` |
| `server/routes/tripRoutes.ts` | modify | 409 mapping, PATCH validation, optional flight name |
| `client/src/api/tripApi.ts` | modify | Surface server `{ error }` messages; nullable notes |
| `client/src/types/trip.ts` | modify | Nullable booking payload fields |
| `client/src/utils/flightLegs.ts` | rewrite | New leg draft model + helpers |
| `client/src/components/FlightLegForm.tsx` | create | One leg's form (shared) |
| `client/src/components/FlightLegsEditor.tsx` | rewrite | Stack of leg forms for the Add dialog |
| `client/src/components/AddElementDialog.tsx` | modify | No Name field; new validation |
| `client/src/components/FlightLegList.tsx` | create | Details-tab leg rows with inline edit/add/delete |
| `client/src/components/FlightDetailsTab.tsx` | rewrite | `FlightLegList` + notes editor + delete flight |
| `client/src/utils/bookingCoverage.ts` | create | Coverage/conflict helpers, labels, flight sort |
| `client/src/components/BookingTransactionList.tsx` | modify | `onCountChange` prop |
| `client/src/components/BookingForm.tsx` | create | Create/edit booking form |
| `client/src/components/BookingBlock.tsx` | create | Read-mode booking with legs, edit, delete |
| `client/src/components/BookingCard.tsx` | rewrite | Thin container |
| `client/src/pages/TripDetailPage.tsx` | modify | Pass bookings, reload bookings, swipe lock for bookings |
| `client/src/styles/trips.css` | modify | Remove dead leg-editor rules |
| `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md` | modify | Usage maps |
| Tests: `client/src/__tests__/{flightLegs.test.ts, FlightLegForm.test.tsx, FlightLegList.test.tsx, bookingCoverage.test.ts}` | create | |
| Tests: `client/src/__tests__/{tripFormat.test.ts, FlightLegsEditor.test.tsx, TripDetailPage.test.tsx, BookingCard.test.tsx, BookingTransactionList.test.tsx}` | modify | |

---

### Task 0: Client type-check config and baseline

**Files:**
- Create: `client/tsconfig.json`
- Modify: `docs/superpowers/specs/2026-11-08-booking-and-leg-editing-design.md` (§2 Layout line)
- Modify: `client/src/api/tripApi.ts:1-5` (remove unused `TripAttachment` import)

- [ ] **Step 1: Create `client/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "typeRoots": ["../node_modules/@types", "../node_modules"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Remove the unused import** in `client/src/api/tripApi.ts`. Change line 2 from

```ts
  Trip, TripElement, TripElementConfirmation, TripAttachment, FlightAutofillLookupInput, FlightAutofillDetails,
```
to
```ts
  Trip, TripElement, TripElementConfirmation, FlightAutofillLookupInput, FlightAutofillDetails,
```

- [ ] **Step 3: Run both type-check commands from Conventions.** Expected: no output from either.

- [ ] **Step 4: Amend the spec's layout line.** In `docs/superpowers/specs/2026-11-08-booking-and-leg-editing-design.md` §2, replace

```
- **Layout**: one column below `48em`, two columns above; inputs use Mantine default sizes (touch-friendly).
```
with
```
- **Layout**: two columns at all widths (every field is short); inputs use Mantine default sizes (touch-friendly).
```

- [ ] **Step 5: Commit**

```bash
git add client/tsconfig.json client/src/api/tripApi.ts docs/superpowers/specs/2026-11-08-booking-and-leg-editing-design.md
git commit -m "chore: add client tsconfig for type-checking

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 1: Server `flightTitle` helper

**Files:**
- Create: `server/utils/flightTitle.ts`
- Test: `server/utils/flightTitle.test.ts`

- [ ] **Step 1: Write the failing test** `server/utils/flightTitle.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { flightTitle } from './flightTitle';

describe('flightTitle', () => {
  it('uses the first origin and last destination, uppercased', () => {
    expect(flightTitle([{ departureAirport: 'den', arrivalAirport: 'mco' }])).toBe('DEN → MCO');
    expect(flightTitle([
      { departureAirport: 'DEN', arrivalAirport: 'DAL' },
      { departureAirport: 'DAL', arrivalAirport: ' SJD ' },
    ])).toBe('DEN → SJD');
  });

  it('returns null when an end is unknown or there are no legs', () => {
    expect(flightTitle([])).toBeNull();
    expect(flightTitle([{ departureAirport: 'TBD', arrivalAirport: 'SJD' }])).toBeNull();
    expect(flightTitle([{ departureAirport: 'DEN', arrivalAirport: '' }])).toBeNull();
    expect(flightTitle([{ departureAirport: 'DEN', arrivalAirport: null }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run server/utils/flightTitle.test.ts` — Expected: FAIL (cannot resolve `./flightTitle`).

- [ ] **Step 3: Implement** `server/utils/flightTitle.ts`

```ts
export interface TitleLeg {
  departureAirport?: string | null;
  arrivalAirport?: string | null;
}

function cleanAirport(value?: string | null): string {
  const code = (value ?? '').trim().toUpperCase();
  return code && code !== 'TBD' ? code : '';
}

// "FIRST → LAST" for a one-way journey; null when either end is unknown.
export function flightTitle(legs: TitleLeg[]): string | null {
  if (legs.length === 0) return null;
  const from = cleanAirport(legs[0].departureAirport);
  const to = cleanAirport(legs[legs.length - 1].arrivalAirport);
  return from && to ? `${from} → ${to}` : null;
}
```

- [ ] **Step 4: Run** `npx vitest run server/utils/flightTitle.test.ts` — Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/flightTitle.ts server/utils/flightTitle.test.ts
git commit -m "feat(server): flightTitle helper

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Auto-title flights in the repository and route

**Files:**
- Modify: `server/repositories/tripElementRepository.ts` (`createElement` ~line 104-151, `syncLegs` ~line 317-395, new private method)
- Modify: `server/routes/tripRoutes.ts:118-122` (POST `/:tripId/elements` validation)
- Test: `server/repositories/tripElementRepository.test.ts`

- [ ] **Step 1: Write failing tests.** In `server/repositories/tripElementRepository.test.ts`:

(a) Line 73 currently reads `expect(element.name).toBe('Flight to LA');`. The flight has legs JFK→LAX, so change it to:

```ts
      expect(element.name).toBe('JFK → LAX');
```

(b) Inside `describe('syncLegs', ...)`, after the `createFlight` helper, add:

```ts
    it('renames the flight from the first origin and last destination', async () => {
      const element = await createFlight();
      await repo.syncLegs(element.id, [
        { id: (element as any).legs[0].id, ...baseLeg },
        { departureAirport: 'DAL', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'SJD', arrivalDatetime: '2026-11-10T14:00' },
      ]);
      const reloaded = await repo.getElementById(element.id);
      expect(reloaded!.name).toBe('DEN → SJD');
    });

    it('keeps the existing name when an end airport is TBD', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Home',
        typeSpecificData: { legs: [{ legOrder: 1, flightDate: '2026-09-05', airline: 'WN', flightNumber: '721' }] },
      });
      expect(element.name).toBe('Home');
    });

    it('names a new flight from its legs when no name is given', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'flight',
        typeSpecificData: { legs: [{ legOrder: 1, ...baseLeg }] },
      });
      expect(element.name).toBe('DEN → DAL');
    });

    it('falls back to "Flight" for a new flight with no name and no derivable title', async () => {
      const element = await repo.createElement(tripId, { elementType: 'flight' });
      expect(element.name).toBe('Flight');
    });
```

- [ ] **Step 2: Run** `npx vitest run server/repositories/tripElementRepository.test.ts` — Expected: FAIL on the four name assertions (vitest does not type-check, so the missing-`name` calls still run).

- [ ] **Step 3: Implement.** In `server/repositories/tripElementRepository.ts`:

(a) Add the import below the existing imports at the top:

```ts
import { flightTitle } from '../utils/flightTitle';
```

(b) In `createElement`'s parameter type, change `name: string;` to `name?: string;`.

(c) In the `INSERT INTO trip_elements` values array, replace `element.name` with `element.name?.trim() || (element.elementType === 'flight' ? 'Flight' : '')`. The line becomes:

```ts
      [id, tripId, element.elementType, element.name?.trim() || (element.elementType === 'flight' ? 'Flight' : ''), element.bookingReference || null, element.bookingUrl || null,
```

(d) In the flight branch of `createElement`, right after `await this.recomputeLayovers(id, true);` add:

```ts
      await this.refreshFlightTitle(id);
```

(e) In `syncLegs`, inside the `try`, right after `await this.recomputeLayovers(elementId);` and before `await db.run('COMMIT');` add:

```ts
      await this.refreshFlightTitle(elementId);
```

(f) Add this private method directly above `private async recomputeLayovers(`:

```ts
  // Keeps a flight's name in sync with its legs; leaves the name alone when the title can't be derived.
  private async refreshFlightTitle(elementId: string): Promise<void> {
    const db = await this.db;
    const legs = await db.all(
      `SELECT departure_airport as departureAirport, arrival_airport as arrivalAirport
       FROM flight_legs WHERE element_id = ? ORDER BY leg_order ASC`,
      [elementId]
    );
    const title = flightTitle(legs);
    if (title) {
      await db.run(`UPDATE trip_elements SET name = ? WHERE id = ?`, [title, elementId]);
    }
  }
```

(g) In `server/routes/tripRoutes.ts`, POST `/:tripId/elements`, change

```ts
    if (!elementType || !name) {
```
to
```ts
    if (!elementType || (!name && elementType !== 'flight')) {
```

- [ ] **Step 4: Run** `npx vitest run server/repositories/tripElementRepository.test.ts` — Expected: PASS (all, including the existing rollback test).

- [ ] **Step 5: Server type-check** (Conventions command) — Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add server/repositories/tripElementRepository.ts server/repositories/tripElementRepository.test.ts server/routes/tripRoutes.ts
git commit -m "feat(server): derive flight title from legs on create and sync

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Backfill migration for flight titles

**Files:**
- Create: `server/migrations/migrations/20261108_01_backfill_flight_titles.cjs`

The repo is ESM (`"type": "module"`), so migrations must be `.cjs`. A `.cjs` file cannot import the TypeScript helper, so it inlines the same rule.

- [ ] **Step 1: Create the migration**

```js
/*
  Migration: backfill flight element names as "FIRST → LAST" airport codes.
  Flights whose first origin or last destination is missing/TBD keep their name.
  See docs/superpowers/specs/2026-11-08-booking-and-leg-editing-design.md §1.4.
*/

function cleanAirport(value) {
  const code = (value || '').trim().toUpperCase();
  return code && code !== 'TBD' ? code : '';
}

module.exports.up = async function up({ db }) {
  const flights = await db.all(`SELECT id FROM trip_elements WHERE element_type = 'flight'`);
  for (const flight of flights) {
    const legs = await db.all(
      `SELECT departure_airport AS dep, arrival_airport AS arr FROM flight_legs WHERE element_id = ? ORDER BY leg_order ASC`,
      [flight.id]
    );
    if (legs.length === 0) continue;
    const from = cleanAirport(legs[0].dep);
    const to = cleanAirport(legs[legs.length - 1].arr);
    if (!from || !to) continue;
    await db.run(`UPDATE trip_elements SET name = ? WHERE id = ?`, [`${from} → ${to}`, flight.id]);
  }
};

// Previous names are not recoverable and not needed.
module.exports.down = async function down() {};
```

- [ ] **Step 2: Sanity-check it against a throwaway copy of the dev DB** (never the real file):

```bash
mkdir -p /config/workspace/scratch && cp data/travel-list.sqlite /config/workspace/scratch/mig-test.sqlite
node -e "
const sqlite=require('sqlite'),sqlite3=require('sqlite3');
(async()=>{const db=await sqlite.open({filename:'/config/workspace/scratch/mig-test.sqlite',driver:sqlite3.Database});
await require('./server/migrations/migrations/20261108_01_backfill_flight_titles.cjs').up({db});
console.log(await db.all(\"select name from trip_elements where trip_id='b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6' and element_type='flight' order by name\"));})()"
rm /config/workspace/scratch/mig-test.sqlite
```

Expected output contains `DEN → SJD` (from `Wn0722` and from `DEN → PHX → SJD`) and still contains `Home` (its leg is TBD).

- [ ] **Step 3: Commit**

```bash
git add server/migrations/migrations/20261108_01_backfill_flight_titles.cjs
git commit -m "feat(server): migration to backfill flight titles

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Traveler conflict rule in `BookingRepository`

**Files:**
- Modify: `server/repositories/bookingRepository.ts`
- Test: `server/repositories/bookingRepository.test.ts`

Rule: for each (flight element, traveler) pair there is at most one booking.

- [ ] **Step 1: Write failing tests.** In `server/repositories/bookingRepository.test.ts`, change the import line to

```ts
import { BookingRepository, BookingConflictError } from './bookingRepository';
```

and add this block before `describe('computed totals', ...)`:

```ts
  describe('traveler conflicts', () => {
    it('rejects a second booking for the same flight and traveler with a readable message', async () => {
      await repo.createBooking(tripId, { confirmationNumber: 'ABC123', elementIds: [elementId], travelerIds: [participantAId] });
      await expect(
        repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] })
      ).rejects.toThrow(new BookingConflictError('A is already on booking ABC123 for Departure Flights'));
    });

    it('allows the same traveler on a different flight', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.createBooking(tripId, { elementIds: [elementId2], travelerIds: [participantAId] })).resolves.toBeTruthy();
    });

    it('allows a different traveler on the same flight (separate per-traveler bookings)', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantBId] })).resolves.toBeTruthy();
    });

    it('describes a conflicting booking without a confirmation number', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(
        repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] })
      ).rejects.toThrow('A is already on another booking without a confirmation number for Departure Flights');
    });

    it('findTravelerConflicts ignores the excluded booking', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      expect(await repo.findTravelerConflicts(tripId, [elementId], [participantAId], booking.id)).toEqual([]);
      const conflicts = await repo.findTravelerConflicts(tripId, [elementId], [participantAId]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({ bookingId: booking.id, elementId, participantId: participantAId, travelerName: 'A', elementName: 'Departure Flights' });
    });

    it('linkElement rejects linking a flight where a traveler is already booked', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId2], travelerIds: [participantAId] });
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.linkElement(booking.id, elementId2)).rejects.toBeInstanceOf(BookingConflictError);
    });

    it('addTraveler rejects adding a traveler already booked on one of the flights', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantBId] });
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.addTraveler(booking.id, participantBId)).rejects.toBeInstanceOf(BookingConflictError);
    });
  });
```

- [ ] **Step 2: Run** `npx vitest run server/repositories/bookingRepository.test.ts` — Expected: FAIL (`BookingConflictError` undefined / no rejection).

- [ ] **Step 3: Implement.** In `server/repositories/bookingRepository.ts`:

(a) Below the `CreateBookingInput` interface add:

```ts
export class BookingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingConflictError';
  }
}

export interface TravelerConflict {
  bookingId: string;
  confirmationNumber: string | null;
  elementId: string;
  elementName: string;
  participantId: string;
  travelerName: string;
}
```

(b) Inside the class, add these two methods directly after `createBooking`:

```ts
  // Other bookings in the trip that already cover any (element, traveler) pair from the given sets.
  async findTravelerConflicts(
    tripId: string,
    elementIds: string[],
    travelerIds: string[],
    excludeBookingId?: string
  ): Promise<TravelerConflict[]> {
    if (elementIds.length === 0 || travelerIds.length === 0) return [];
    const db = await this.db;
    const elementMarks = elementIds.map(() => '?').join(', ');
    const travelerMarks = travelerIds.map(() => '?').join(', ');
    return db.all(
      `SELECT b.id AS bookingId,
              COALESCE(
                (SELECT t.confirmation_number FROM booking_transactions t
                 WHERE t.booking_id = b.id AND t.confirmation_number IS NOT NULL AND t.confirmation_number != ''
                 ORDER BY t.created_at DESC LIMIT 1),
                NULLIF(b.confirmation_number, '')
              ) AS confirmationNumber,
              bl.element_id AS elementId, e.name AS elementName,
              bt.participant_id AS participantId, p.display_name AS travelerName
       FROM bookings b
       JOIN booking_links bl ON bl.booking_id = b.id
       JOIN booking_travelers bt ON bt.booking_id = b.id
       JOIN trip_elements e ON e.id = bl.element_id
       JOIN trip_participants p ON p.id = bt.participant_id
       WHERE b.trip_id = ?
         AND b.id != ?
         AND bl.element_id IN (${elementMarks})
         AND bt.participant_id IN (${travelerMarks})
       ORDER BY b.created_at ASC, e.name ASC, p.display_name ASC`,
      [tripId, excludeBookingId ?? '', ...elementIds, ...travelerIds]
    );
  }

  async assertNoTravelerConflicts(
    tripId: string,
    elementIds: string[],
    travelerIds: string[],
    excludeBookingId?: string
  ): Promise<void> {
    const [first] = await this.findTravelerConflicts(tripId, elementIds, travelerIds, excludeBookingId);
    if (!first) return;
    const other = first.confirmationNumber
      ? `booking ${first.confirmationNumber}`
      : 'another booking without a confirmation number';
    throw new BookingConflictError(`${first.travelerName} is already on ${other} for ${first.elementName}`);
  }
```

(c) At the very top of `createBooking`'s body (before `const id = uuidv4();`) add:

```ts
    await this.assertNoTravelerConflicts(tripId, input.elementIds, input.travelerIds);
```

(d) Replace `linkElement` and `addTraveler` with:

```ts
  async linkElement(bookingId: string, elementId: string): Promise<void> {
    const booking = await this.getBookingById(bookingId);
    if (booking) {
      await this.assertNoTravelerConflicts(booking.tripId, [elementId], booking.travelerIds, bookingId);
    }
    const db = await this.db;
    await db.run(
      `INSERT OR IGNORE INTO booking_links (booking_id, element_id) VALUES (?, ?)`,
      [bookingId, elementId]
    );
  }
```

```ts
  async addTraveler(bookingId: string, participantId: string): Promise<void> {
    const booking = await this.getBookingById(bookingId);
    if (booking) {
      await this.assertNoTravelerConflicts(booking.tripId, booking.elementIds, [participantId], bookingId);
    }
    const db = await this.db;
    await db.run(
      `INSERT OR IGNORE INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`,
      [bookingId, participantId]
    );
  }
```

- [ ] **Step 4: Run** `npx vitest run server/repositories/bookingRepository.test.ts` — Expected: PASS (all existing + 7 new).

- [ ] **Step 5: Commit**

```bash
git add server/repositories/bookingRepository.ts server/repositories/bookingRepository.test.ts
git commit -m "feat(server): one booking per traveler per flight

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Transactional booking edit + routes (409, PATCH replacement)

**Files:**
- Modify: `server/repositories/bookingRepository.ts` (`updateBooking`)
- Modify: `server/routes/tripRoutes.ts` (bookings routes ~lines 331-480)
- Test: `server/repositories/bookingRepository.test.ts`

- [ ] **Step 1: Write failing tests.** Replace the existing `describe('updateBooking', ...)` block in `bookingRepository.test.ts` with:

```ts
  describe('updateBooking', () => {
    it('updates confirmation number and advertised price', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const updated = await repo.updateBooking(booking.id, { confirmationNumber: 'NEW123', advertisedPriceCash: 69 });
      expect(updated.confirmationNumber).toBe('NEW123');
      expect(updated.advertisedPriceCash).toBe(69);
    });

    it('clears fields set to null', async () => {
      const booking = await repo.createBooking(tripId, { confirmationNumber: 'ABC', notes: 'n', elementIds: [elementId], travelerIds: [participantAId] });
      const updated = await repo.updateBooking(booking.id, { confirmationNumber: null, notes: null });
      expect(updated.confirmationNumber).toBeNull();
      expect(updated.notes).toBeNull();
    });

    it('replaces linked flights and travelers', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const updated = await repo.updateBooking(booking.id, { elementIds: [elementId2], travelerIds: [participantAId, participantBId] });
      expect(updated.elementIds).toEqual([elementId2]);
      expect(updated.travelerIds.sort()).toEqual([participantAId, participantBId].sort());
    });

    it('rejects a replacement that conflicts with another booking and changes nothing', async () => {
      await repo.createBooking(tripId, { confirmationNumber: 'OTHER', elementIds: [elementId2], travelerIds: [participantAId] });
      const booking = await repo.createBooking(tripId, { confirmationNumber: 'MINE', elementIds: [elementId], travelerIds: [participantAId] });
      await expect(
        repo.updateBooking(booking.id, { confirmationNumber: 'CHANGED', elementIds: [elementId, elementId2] })
      ).rejects.toBeInstanceOf(BookingConflictError);
      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.confirmationNumber).toBe('MINE');
      expect(reloaded!.elementIds).toEqual([elementId]);
    });

    it('does not count the booking itself as a conflict', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.updateBooking(booking.id, { elementIds: [elementId], travelerIds: [participantAId] })).resolves.toBeTruthy();
    });

    it('rejects empty replacement lists', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.updateBooking(booking.id, { elementIds: [] })).rejects.toThrow('At least one flight is required');
      await expect(repo.updateBooking(booking.id, { travelerIds: [] })).rejects.toThrow('At least one traveler is required');
    });

    it('rolls back link replacement when a write fails midway', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const db: any = await (repo as any).db;
      const realRun = db.run.bind(db);
      const spy = vi.spyOn(db, 'run').mockImplementation(async (sql: string, ...args: any[]) => {
        if (/^\s*INSERT INTO booking_travelers/i.test(sql)) throw new Error('boom');
        return realRun(sql, ...args);
      });
      await expect(repo.updateBooking(booking.id, { elementIds: [elementId2], travelerIds: [participantBId] })).rejects.toThrow('boom');
      spy.mockRestore();
      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.elementIds).toEqual([elementId]);
      expect(reloaded!.travelerIds).toEqual([participantAId]);
    });
  });
```

Also change the first import line of the test file to include `vi`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

- [ ] **Step 2: Run** `npx vitest run server/repositories/bookingRepository.test.ts` — Expected: FAIL (new updateBooking tests).

- [ ] **Step 3: Implement `updateBooking`.** In `bookingRepository.ts`, add after the `TravelerConflict` interface:

```ts
export interface UpdateBookingInput {
  confirmationNumber?: string | null;
  advertisedPriceCash?: number | null;
  advertisedPricePoints?: number | null;
  loyaltyProgram?: string | null;
  notes?: string | null;
  elementIds?: string[];
  travelerIds?: string[];
}
```

Replace the whole `updateBooking` method with:

```ts
  async updateBooking(id: string, updates: UpdateBookingInput): Promise<Booking> {
    const current = await this.getBookingById(id);
    if (!current) throw new Error('Booking not found');
    if (updates.elementIds !== undefined && updates.elementIds.length === 0) {
      throw new Error('At least one flight is required');
    }
    if (updates.travelerIds !== undefined && updates.travelerIds.length === 0) {
      throw new Error('At least one traveler is required');
    }
    const elementIds = updates.elementIds ? Array.from(new Set(updates.elementIds)) : undefined;
    const travelerIds = updates.travelerIds ? Array.from(new Set(updates.travelerIds)) : undefined;
    if (elementIds || travelerIds) {
      await this.assertNoTravelerConflicts(
        current.tripId,
        elementIds ?? current.elementIds,
        travelerIds ?? current.travelerIds,
        id
      );
    }

    const fieldMap: Record<string, string> = {
      confirmationNumber: 'confirmation_number',
      advertisedPriceCash: 'advertised_price_cash',
      advertisedPricePoints: 'advertised_price_points',
      loyaltyProgram: 'loyalty_program',
      notes: 'notes',
    };
    const dbUpdates: Record<string, any> = {};
    for (const [key, dbKey] of Object.entries(fieldMap)) {
      if (key in updates) dbUpdates[dbKey] = (updates as any)[key] ?? null;
    }

    const db = await this.db;
    await db.run('BEGIN TRANSACTION');
    try {
      if (Object.keys(dbUpdates).length > 0) {
        const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
        await db.run(`UPDATE bookings SET ${fields}, updated_at = datetime('now') WHERE id = ?`, [...Object.values(dbUpdates), id]);
      }
      if (elementIds) {
        await db.run(`DELETE FROM booking_links WHERE booking_id = ?`, [id]);
        for (const elementId of elementIds) {
          await db.run(`INSERT INTO booking_links (booking_id, element_id) VALUES (?, ?)`, [id, elementId]);
        }
      }
      if (travelerIds) {
        await db.run(`DELETE FROM booking_travelers WHERE booking_id = ?`, [id]);
        for (const participantId of travelerIds) {
          await db.run(`INSERT INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`, [id, participantId]);
        }
      }
      await db.run('COMMIT');
    } catch (error) {
      try { await db.run('ROLLBACK'); } catch (e) {}
      throw error;
    }
    return this.getBookingById(id) as Promise<Booking>;
  }
```

- [ ] **Step 4: Run** `npx vitest run server/repositories/bookingRepository.test.ts` — Expected: PASS.

- [ ] **Step 5: Update routes.** In `server/routes/tripRoutes.ts`:

(a) Change the bookings import to

```ts
import { BookingRepository, BookingConflictError } from '../repositories/bookingRepository';
```

(b) Add these helpers right above the `tripRouter.get('/:tripId/bookings', ...)` route:

```ts
// Returns an error message when any id does not belong to the trip.
async function findForeignBookingRef(tripId: string, elementIds: string[] = [], travelerIds: string[] = []): Promise<string | null> {
  for (const elementId of elementIds) {
    const element = await tripElementRepository.getElementById(elementId);
    if (!element || element.tripId !== tripId) return `Element not found: ${elementId}`;
  }
  for (const participantId of travelerIds) {
    const participant = await tripParticipantRepository.getParticipantById(participantId);
    if (!participant || participant.tripId !== tripId) return `Participant not found: ${participantId}`;
  }
  return null;
}

function sendBookingError(res: Response, error: unknown, fallback: string) {
  if (error instanceof BookingConflictError) {
    return res.status(409).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}
```

(c) In POST `/:tripId/bookings`, replace the two `for` loops that validate `elementIds` and `travelerIds` with:

```ts
    const foreign = await findForeignBookingRef(req.trip!.id, elementIds, travelerIds);
    if (foreign) {
      return res.status(404).json({ error: foreign });
    }
```

and replace its `catch` body with `sendBookingError(res, error, 'Failed to create booking');`.

(d) Replace the whole PATCH `/:tripId/bookings/:id` route with:

```ts
tripRouter.patch('/:tripId/bookings/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { confirmationNumber, advertisedPriceCash, advertisedPricePoints, loyaltyProgram, notes, elementIds, travelerIds } = req.body ?? {};
    if (elementIds !== undefined && (!Array.isArray(elementIds) || elementIds.length === 0)) {
      return res.status(400).json({ error: 'At least one elementId is required' });
    }
    if (travelerIds !== undefined && (!Array.isArray(travelerIds) || travelerIds.length === 0)) {
      return res.status(400).json({ error: 'At least one travelerId is required' });
    }
    const foreign = await findForeignBookingRef(req.trip!.id, elementIds, travelerIds);
    if (foreign) {
      return res.status(404).json({ error: foreign });
    }
    const updates: Record<string, unknown> = {};
    const fields = { confirmationNumber, advertisedPriceCash, advertisedPricePoints, loyaltyProgram, notes, elementIds, travelerIds };
    for (const [key, value] of Object.entries(fields)) {
      if (key in (req.body ?? {})) updates[key] = value;
    }
    const updated = await bookingRepository.updateBooking(req.params.id, updates);
    res.json(updated);
  } catch (error) {
    sendBookingError(res, error, 'Failed to update booking');
  }
});
```

(e) In POST `/:tripId/bookings/:id/elements`, replace its `catch` body with `sendBookingError(res, error, 'Failed to link element to booking');`.

(f) In POST `/:tripId/bookings/:id/travelers`, replace its `catch` body with `sendBookingError(res, error, 'Failed to add traveler to booking');`.

- [ ] **Step 6: Server type-check** (Conventions) — Expected: no output.

- [ ] **Step 7: Smoke the API against the running dev server** (tsx watch has restarted). Get a token and hit the PATCH with an empty list:

```bash
TOKEN=$(curl -s -X POST localhost:3001/api/login -H 'Content-Type: application/json' -d '{"username":"uitester","password":"UiTest123!"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
BID=$(curl -s -H "Authorization: Bearer $TOKEN" localhost:3001/api/trips/b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6/bookings | node -pe "JSON.parse(require('fs').readFileSync(0))[0].id")
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"elementIds":[]}' localhost:3001/api/trips/b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6/bookings/$BID
```

Expected: `400`. (If the login path differs, find it with `grep -rn "login" server/routes.ts | head` and adjust; do not modify data with this smoke test.)

- [ ] **Step 8: Commit**

```bash
git add server/repositories/bookingRepository.ts server/repositories/bookingRepository.test.ts server/routes/tripRoutes.ts
git commit -m "feat(server): edit booking flights/travelers in one transaction, 409 on conflicts

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Client API — surface server errors, nullable fields

**Files:**
- Modify: `client/src/api/tripApi.ts` (`TripElementWritePayload` ~line 10, `handleResponse` ~line 22, `deleteBooking` ~line 215)
- Modify: `client/src/types/trip.ts` (`CreateBookingPayload` ~line 166)
- Create test: `client/src/__tests__/tripApi.test.ts`
- Modify: `vitest.config.ts` (whitelist)

- [ ] **Step 1: Whitelist the new test.** In `vitest.config.ts`, add after the `ElementDialog.test.tsx` line:

```ts
      'client/src/__tests__/tripApi.test.ts', // API error surfacing
```

- [ ] **Step 2: Write the failing test** `client/src/__tests__/tripApi.test.ts`

```ts
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../api', () => ({ getAuthToken: () => 'token' }));

import { tripApi } from '../api/tripApi';

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }));
}

describe('tripApi error handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws the server error message', async () => {
    stubFetch(409, { error: 'Alice is already on booking ABC123 for DEN → MCO' });
    await expect(tripApi.updateBooking('t1', 'b1', { travelerIds: ['p1'] }))
      .rejects.toThrow('Alice is already on booking ABC123 for DEN → MCO');
  });

  it('falls back to the status code when the body has no error', async () => {
    stubFetch(500, {});
    await expect(tripApi.listBookings('t1')).rejects.toThrow('API Error: 500');
  });

  it('surfaces the server message when deleting a booking fails', async () => {
    stubFetch(404, { error: 'Booking not found' });
    await expect(tripApi.deleteBooking('t1', 'b1')).rejects.toThrow('Booking not found');
  });
});
```

- [ ] **Step 3: Run** `npx vitest run client/src/__tests__/tripApi.test.ts` — Expected: FAIL (messages are `API Error: 409` / `Failed to delete booking: 404`).

- [ ] **Step 4: Implement.** In `client/src/api/tripApi.ts`:

(a) Replace `TripElementWritePayload` with:

```ts
type TripElementWritePayload = Omit<Partial<TripElement>, 'notes'> & {
  notes?: string | null;
  typeSpecificData?: Record<string, unknown>;
};
```

(b) Replace `handleResponse` with:

```ts
async function handleResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `API Error: ${response.status}`);
  }
  return response.json();
}
```

(c) Replace the body of `deleteBooking` with:

```ts
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error || `Failed to delete booking: ${response.status}`);
    }
```

In `client/src/types/trip.ts`, replace `CreateBookingPayload` with:

```ts
export interface CreateBookingPayload {
  confirmationNumber?: string | null;
  advertisedPriceCash?: number | null;
  advertisedPricePoints?: number | null;
  loyaltyProgram?: string | null;
  notes?: string | null;
  elementIds: string[];
  travelerIds: string[];
}
```

- [ ] **Step 5: Run** `npx vitest run client/src/__tests__/tripApi.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 6: Client type-check** (Conventions) — Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add client/src/api/tripApi.ts client/src/types/trip.ts client/src/__tests__/tripApi.test.ts vitest.config.ts
git commit -m "feat(client): surface server error messages; nullable booking/notes fields

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: New flight-leg draft model (`utils/flightLegs.ts`)

**Files:**
- Rewrite: `client/src/utils/flightLegs.ts`
- Create test: `client/src/__tests__/flightLegs.test.ts`
- Modify: `client/src/__tests__/tripFormat.test.ts`
- Modify: `vitest.config.ts`

Callers of the old API (`AddElementDialog`, `FlightLegsEditor`, `FlightDetailsTab`) are rewritten in Tasks 9 and 11; until then the client type-check for those files will fail — that is expected and is **not** checked in this task. Existing exports `formatLayover`, `layoverMinutes`, `formatLegTime` stay (used by `flightRows.ts` and `FlightSeatsTab`).

- [ ] **Step 1: Whitelist** — add to `vitest.config.ts` after the `tripApi.test.ts` line:

```ts
      'client/src/__tests__/flightLegs.test.ts', // Leg draft model
```

- [ ] **Step 2: Write the failing test** `client/src/__tests__/flightLegs.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { FlightLeg } from '../types/trip';
import {
  FlightLegDraft, addDays, applyLookup, autoArrivalOffset, draftLayover, draftToPayload, emptyLegDraft,
  formatClock, formatFlightCode, formatLegLine, legToDraft, legToPayload, parseFlightCode, validateDraft,
} from '../utils/flightLegs';

const leg = (over: Partial<FlightLeg> = {}): FlightLeg => ({
  id: 'l1', elementId: 'e1', legOrder: 1,
  departureAirport: 'DEN', departureDatetime: '2026-08-29T08:00',
  arrivalAirport: 'DAL', arrivalDatetime: '2026-08-29T10:00',
  airline: 'WN', flightNumber: '1234', createdAt: '', updatedAt: '',
  ...over,
});

const draft = (over: Partial<FlightLegDraft> = {}): FlightLegDraft => ({
  flightCode: 'WN1234', date: '2026-08-29', departureTime: '08:00', arrivalTime: '10:00', arrivalDayOffset: 0,
  departureAirport: 'DEN', arrivalAirport: 'DAL', checkPriceUrl: '',
  ...over,
});

describe('parseFlightCode', () => {
  it.each([
    ['WN1234', { airline: 'WN', flightNumber: '1234' }],
    ['wn 1234', { airline: 'WN', flightNumber: '1234' }],
    ['WN-1234', { airline: 'WN', flightNumber: '1234' }],
    ['B61234', { airline: 'B6', flightNumber: '1234' }],
    ['9K123', { airline: '9K', flightNumber: '123' }],
    ['SWA1234', { airline: 'SWA', flightNumber: '1234' }],
    ['1234', { flightNumber: '1234' }],
    ['DELTA', { flightNumber: 'DELTA' }],
    ['', {}],
  ])('parses %s', (input, expected) => {
    expect(parseFlightCode(input)).toEqual(expected);
  });

  it('formats airline + number back into one code', () => {
    expect(formatFlightCode('WN', '1234')).toBe('WN1234');
    expect(formatFlightCode(undefined, '1234')).toBe('1234');
    expect(formatFlightCode()).toBe('');
  });
});

describe('dates and offsets', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-08-29', 0)).toBe('2026-08-29');
  });

  it('auto-sets +1 when arrival is earlier than departure and back to same day otherwise', () => {
    expect(autoArrivalOffset('23:00', '01:30', 0)).toBe(1);
    expect(autoArrivalOffset('08:00', '10:00', 1)).toBe(0);
    expect(autoArrivalOffset('08:00', '', 1)).toBe(1);
    expect(autoArrivalOffset('23:00', '01:30', 2)).toBe(2);
  });

  it('defaults a new leg from the previous one', () => {
    expect(emptyLegDraft()).toEqual(draft({ flightCode: '', date: '', departureTime: '', arrivalTime: '', departureAirport: '', arrivalAirport: '' }));
    const next = emptyLegDraft(draft({ date: '2026-08-31', arrivalAirport: 'DAL', arrivalDayOffset: 1 }));
    expect(next).toMatchObject({ date: '2026-09-01', departureAirport: 'DAL', arrivalAirport: '', flightCode: '' });
  });
});

describe('leg <-> draft <-> payload', () => {
  it('splits a stored leg into a draft', () => {
    expect(legToDraft(leg())).toEqual(draft({ id: 'l1' }));
  });

  it('computes the arrival-day offset and hides TBD airports', () => {
    const d = legToDraft(leg({ departureAirport: 'TBD', departureDatetime: '2026-08-31T23:00', arrivalDatetime: '2026-09-01T01:30' }));
    expect(d).toMatchObject({ date: '2026-08-31', departureTime: '23:00', arrivalTime: '01:30', arrivalDayOffset: 1, departureAirport: '' });
  });

  it('recombines a draft into a payload, splitting the flight code', () => {
    expect(draftToPayload(draft({ id: 'l1', date: '2026-08-31', departureTime: '23:00', arrivalTime: '01:30', arrivalDayOffset: 1, departureAirport: 'den', checkPriceUrl: ' https://x ' }))).toEqual({
      id: 'l1',
      departureAirport: 'DEN',
      departureDatetime: '2026-08-31T23:00',
      arrivalAirport: 'DAL',
      arrivalDatetime: '2026-09-01T01:30',
      airline: 'WN',
      flightNumber: '1234',
      checkPriceUrl: 'https://x',
    });
  });

  it('round-trips leg -> draft -> payload', () => {
    const stored = leg({ departureDatetime: '2026-08-31T23:00', arrivalDatetime: '2026-09-01T01:30' });
    expect(draftToPayload(legToDraft(stored))).toMatchObject({
      id: 'l1', departureDatetime: '2026-08-31T23:00', arrivalDatetime: '2026-09-01T01:30', airline: 'WN', flightNumber: '1234',
    });
  });

  it('passes untouched legs through unchanged, including TBD placeholders', () => {
    expect(legToPayload(leg({ departureAirport: 'TBD', departureDatetime: '2026-09-05T00:00:00Z', airline: undefined, flightNumber: '721' }))).toEqual({
      id: 'l1',
      departureAirport: 'TBD',
      departureDatetime: '2026-09-05T00:00:00Z',
      arrivalAirport: 'DAL',
      arrivalDatetime: '2026-08-29T10:00',
      airline: undefined,
      flightNumber: '721',
      checkPriceUrl: undefined,
    });
  });
});

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateDraft(draft())).toBeNull();
  });

  it('reports the first missing piece', () => {
    expect(validateDraft(draft({ date: '' }))).toBe('Enter the flight date');
    expect(validateDraft(draft({ arrivalAirport: ' ' }))).toBe('Enter both airport codes');
    expect(validateDraft(draft({ departureTime: '' }))).toBe('Enter the departure and arrival times');
  });

  it('rejects a same-day arrival before departure', () => {
    expect(validateDraft(draft({ departureTime: '23:00', arrivalTime: '01:30' }))).toBe('Arrival is before departure — choose +1 for a next-day arrival');
    expect(validateDraft(draft({ departureTime: '23:00', arrivalTime: '01:30', arrivalDayOffset: 1 }))).toBeNull();
  });
});

describe('applyLookup', () => {
  it('fills airports, date, times and offset from FlightStats details', () => {
    const result = applyLookup(draft({ flightCode: 'wn1234', departureAirport: '', arrivalAirport: '', departureTime: '', arrivalTime: '' }), {
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-31',
      departureAirport: 'DEN', arrivalAirport: 'MCO',
      departureDatetime: '2026-08-31T22:10:00.000', arrivalDatetime: '2026-09-01T03:05:00.000',
      sourceUrl: 'https://flightstats',
    });
    expect(result).toMatchObject({
      flightCode: 'WN1234', date: '2026-08-31', departureTime: '22:10', arrivalTime: '03:05', arrivalDayOffset: 1,
      departureAirport: 'DEN', arrivalAirport: 'MCO',
    });
  });

  it('keeps existing values when the lookup has none', () => {
    const before = draft();
    expect(applyLookup(before, { airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29', sourceUrl: '' })).toEqual(before);
  });
});

describe('display helpers', () => {
  it('formats clock times compactly', () => {
    expect(formatClock('2026-08-29T08:00')).toBe('8:00a');
    expect(formatClock('2026-08-29T12:05')).toBe('12:05p');
    expect(formatClock('00:30')).toBe('12:30a');
    expect(formatClock('')).toBe('');
  });

  it('formats a leg line with a next-day suffix', () => {
    expect(formatLegLine(leg())).toBe('WN1234 · DEN 8:00a → DAL 10:00a');
    expect(formatLegLine(leg({ airline: undefined, flightNumber: undefined, departureDatetime: '2026-08-31T23:00', arrivalDatetime: '2026-09-01T01:30' })))
      .toBe('DEN 11:00p → DAL 1:30a +1');
  });

  it('computes the layover between two drafts', () => {
    expect(draftLayover(draft(), draft({ departureTime: '12:15' }))).toBe(135);
    expect(draftLayover(draft(), draft({ departureTime: '' }))).toBeNull();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run client/src/__tests__/flightLegs.test.ts` — Expected: FAIL (missing exports).

- [ ] **Step 4: Rewrite** `client/src/utils/flightLegs.ts` with exactly:

```ts
import { FlightAutofillDetails, FlightLeg, FlightLegPayload } from '../types/trip';

export type ArrivalDayOffset = 0 | 1 | 2;

export interface FlightLegDraft {
  id?: string;
  flightCode: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  arrivalDayOffset: ArrivalDayOffset;
  departureAirport: string;
  arrivalAirport: string;
  checkPriceUrl: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function addDays(date: string, days: number): string {
  if (!DATE_RE.test(date)) return date;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function clampOffset(days: number): ArrivalDayOffset {
  return Math.min(2, Math.max(0, days)) as ArrivalDayOffset;
}

// Stored datetimes are wall-clock "YYYY-MM-DDTHH:mm[...]" values.
function splitDatetime(value?: string | null): { date: string; time: string } {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? { date: match[1], time: match[2] } : { date: '', time: '' };
}

function cleanAirport(value?: string | null): string {
  return value && value !== 'TBD' ? value : '';
}

// "WN1234" -> WN + 1234; "SWA1234" -> SWA + 1234; unparseable input is kept as the flight number.
export function parseFlightCode(code: string): { airline?: string; flightNumber?: string } {
  const clean = code.replace(/[\s-]/g, '').toUpperCase();
  if (!clean) return {};
  const icao = clean.match(/^([A-Z]{3})(\d.*)$/);
  if (icao) return { airline: icao[1], flightNumber: icao[2] };
  const iata = clean.match(/^([A-Z0-9]{2})(\d.*)$/);
  if (iata && /[A-Z]/.test(iata[1])) return { airline: iata[1], flightNumber: iata[2] };
  return { flightNumber: clean };
}

export function formatFlightCode(airline?: string | null, flightNumber?: string | null): string {
  return `${airline ?? ''}${flightNumber ?? ''}`;
}

export function emptyLegDraft(previous?: FlightLegDraft): FlightLegDraft {
  return {
    flightCode: '',
    date: previous?.date ? addDays(previous.date, previous.arrivalDayOffset) : '',
    departureTime: '',
    arrivalTime: '',
    arrivalDayOffset: 0,
    departureAirport: previous?.arrivalAirport ?? '',
    arrivalAirport: '',
    checkPriceUrl: '',
  };
}

// Toggles Same day <-> +1 when times change; a manual +2 is left alone.
export function autoArrivalOffset(departureTime: string, arrivalTime: string, current: ArrivalDayOffset): ArrivalDayOffset {
  if (!TIME_RE.test(departureTime) || !TIME_RE.test(arrivalTime) || current === 2) return current;
  return arrivalTime < departureTime ? 1 : 0;
}

export function legToDraft(leg: FlightLeg): FlightLegDraft {
  const departure = splitDatetime(leg.departureDatetime);
  const arrival = splitDatetime(leg.arrivalDatetime);
  return {
    id: leg.id,
    flightCode: formatFlightCode(leg.airline, leg.flightNumber),
    date: departure.date,
    departureTime: departure.time,
    arrivalTime: arrival.time,
    arrivalDayOffset: departure.date && arrival.date ? clampOffset(dayDiff(departure.date, arrival.date)) : 0,
    departureAirport: cleanAirport(leg.departureAirport),
    arrivalAirport: cleanAirport(leg.arrivalAirport),
    checkPriceUrl: leg.checkPriceUrl ?? '',
  };
}

// For legs that are not being edited: send back exactly what is stored.
export function legToPayload(leg: FlightLeg): FlightLegPayload {
  return {
    id: leg.id,
    departureAirport: leg.departureAirport,
    departureDatetime: leg.departureDatetime,
    arrivalAirport: leg.arrivalAirport,
    arrivalDatetime: leg.arrivalDatetime,
    airline: leg.airline || undefined,
    flightNumber: leg.flightNumber || undefined,
    checkPriceUrl: leg.checkPriceUrl || undefined,
  };
}

// Assumes validateDraft(draft) returned null.
export function draftToPayload(draft: FlightLegDraft): FlightLegPayload {
  const { airline, flightNumber } = parseFlightCode(draft.flightCode);
  return {
    id: draft.id,
    departureAirport: draft.departureAirport.trim().toUpperCase(),
    departureDatetime: `${draft.date}T${draft.departureTime}`,
    arrivalAirport: draft.arrivalAirport.trim().toUpperCase(),
    arrivalDatetime: `${addDays(draft.date, draft.arrivalDayOffset)}T${draft.arrivalTime}`,
    airline,
    flightNumber,
    checkPriceUrl: draft.checkPriceUrl.trim() || undefined,
  };
}

export function validateDraft(draft: FlightLegDraft): string | null {
  if (!DATE_RE.test(draft.date)) return 'Enter the flight date';
  if (!draft.departureAirport.trim() || !draft.arrivalAirport.trim()) return 'Enter both airport codes';
  if (!TIME_RE.test(draft.departureTime) || !TIME_RE.test(draft.arrivalTime)) return 'Enter the departure and arrival times';
  if (draft.arrivalDayOffset === 0 && draft.arrivalTime < draft.departureTime) {
    return 'Arrival is before departure — choose +1 for a next-day arrival';
  }
  return null;
}

export function applyLookup(draft: FlightLegDraft, details: FlightAutofillDetails): FlightLegDraft {
  const departure = splitDatetime(details.departureDatetime);
  const arrival = splitDatetime(details.arrivalDatetime);
  return {
    ...draft,
    flightCode: formatFlightCode(details.airlineCode, details.flightNumber) || draft.flightCode,
    date: departure.date || details.flightDate || draft.date,
    departureTime: departure.time || draft.departureTime,
    arrivalTime: arrival.time || draft.arrivalTime,
    arrivalDayOffset: departure.date && arrival.date ? clampOffset(dayDiff(departure.date, arrival.date)) : draft.arrivalDayOffset,
    departureAirport: details.departureAirport || draft.departureAirport,
    arrivalAirport: details.arrivalAirport || draft.arrivalAirport,
  };
}

export function draftLayover(previous: FlightLegDraft, next: FlightLegDraft): number | null {
  if (!previous.date || !previous.arrivalTime || !next.date || !next.departureTime) return null;
  return layoverMinutes(
    `${addDays(previous.date, previous.arrivalDayOffset)}T${previous.arrivalTime}`,
    `${next.date}T${next.departureTime}`
  );
}

// "2026-08-29T08:00" or "08:00" -> "8:00a"
export function formatClock(value?: string | null): string {
  const match = value?.match(/(\d{2}):(\d{2})/);
  if (!match) return '';
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]}${hour < 12 ? 'a' : 'p'}`;
}

// "WN1234 · DEN 8:00a → DAL 10:00a +1"
export function formatLegLine(leg: FlightLeg): string {
  const departure = splitDatetime(leg.departureDatetime);
  const arrival = splitDatetime(leg.arrivalDatetime);
  const offset = departure.date && arrival.date ? dayDiff(departure.date, arrival.date) : 0;
  const from = [leg.departureAirport, formatClock(leg.departureDatetime)].filter(Boolean).join(' ');
  const to = [leg.arrivalAirport, formatClock(leg.arrivalDatetime)].filter(Boolean).join(' ');
  const route = `${from} → ${to}${offset > 0 ? ` +${offset}` : ''}`;
  const code = formatFlightCode(leg.airline, leg.flightNumber);
  return code ? `${code} · ${route}` : route;
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

- [ ] **Step 5: Trim `client/src/__tests__/tripFormat.test.ts`.** Replace line 3 with

```ts
import { formatLayover, formatLegTime, layoverMinutes } from '../utils/flightLegs';
```

and delete the three tests `'builds a name from the airport chain…'`, `'converts drafts to payloads with TBD airports…'` and `'round-trips a saved leg into a draft…'` (keep the `formatMoney` describe and the `'formats layovers and wall-clock times…'` test).

- [ ] **Step 6: Run** `npx vitest run client/src/__tests__/flightLegs.test.ts client/src/__tests__/tripFormat.test.ts client/src/__tests__/flightRows.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/utils/flightLegs.ts client/src/__tests__/flightLegs.test.ts client/src/__tests__/tripFormat.test.ts vitest.config.ts
git commit -m "feat(client): flight-leg draft model with flight code, date and arrival-day offset

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: `FlightLegForm` (one leg, shared)

**Files:**
- Create: `client/src/components/FlightLegForm.tsx`
- Create test: `client/src/__tests__/FlightLegForm.test.tsx`
- Modify: `vitest.config.ts`

The form is controlled (`draft` + `onChange`) and has no buttons of its own except **Look up**; the parent supplies Save/Cancel. Two columns at every width.

- [ ] **Step 1: Whitelist** — add to `vitest.config.ts`:

```ts
      'client/src/__tests__/FlightLegForm.test.tsx', // Single-leg form
```

- [ ] **Step 2: Write the failing test** `client/src/__tests__/FlightLegForm.test.tsx`

```tsx
/* @vitest-environment jsdom */
import { useState } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({
  tripApi: { lookupFlightAutofill: vi.fn() },
}));

import { tripApi } from '../api/tripApi';
import { FlightLegForm } from '../components/FlightLegForm';
import { FlightLegDraft, emptyLegDraft } from '../utils/flightLegs';

let latest: FlightLegDraft;

function Harness({ initial = emptyLegDraft() }: { initial?: FlightLegDraft }) {
  const [draft, setDraft] = useState(initial);
  latest = draft;
  return <FlightLegForm tripId="trip-1" draft={draft} onChange={setDraft} idPrefix="t" />;
}

describe('FlightLegForm', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it('uppercases the flight code and airports', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    await user.type(screen.getByLabelText('Flight #'), 'wn1234');
    await user.type(screen.getByLabelText('From'), 'den');
    expect(latest.flightCode).toBe('WN1234');
    expect(latest.departureAirport).toBe('DEN');
  });

  it('switches the arrival day to +1 when arrival is earlier than departure', () => {
    renderWithMantine(<Harness />);
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '23:00' } });
    fireEvent.change(screen.getByLabelText('Arrives'), { target: { value: '01:30' } });
    expect(latest.arrivalDayOffset).toBe(1);
    expect((screen.getByRole('radio', { name: '+1' }) as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByLabelText('Arrives'), { target: { value: '23:55' } });
    expect(latest.arrivalDayOffset).toBe(0);
  });

  it('lets the user pick +2 manually', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    await user.click(screen.getByRole('radio', { name: '+2' }));
    expect(latest.arrivalDayOffset).toBe(2);
  });

  it('looks up the flight with the parsed code and date and fills the draft', async () => {
    const user = userEvent.setup();
    (tripApi.lookupFlightAutofill as any).mockResolvedValue({
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
      departureAirport: 'DEN', arrivalAirport: 'DAL',
      departureDatetime: '2026-08-29T08:00:00.000', arrivalDatetime: '2026-08-29T10:00:00.000',
      statusText: 'Scheduled', sourceUrl: 'https://fs',
    });
    renderWithMantine(<Harness />);
    await user.type(screen.getByLabelText('Flight #'), 'WN1234');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-08-29' } });
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(tripApi.lookupFlightAutofill).toHaveBeenCalledWith('trip-1', {
      airlineCode: 'WN', flightNumber: '1234', flightDate: '2026-08-29',
    }));
    await waitFor(() => expect(latest).toMatchObject({ departureAirport: 'DEN', arrivalAirport: 'DAL', departureTime: '08:00', arrivalTime: '10:00' }));
    expect(screen.getByRole('status').textContent).toMatch(/Filled from FlightStats \(Scheduled\)/);
  });

  it('explains what is missing before looking up', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(screen.getByRole('status').textContent).toMatch(/Enter the flight # \(e\.g\. WN1234\) and date/);
    expect(tripApi.lookupFlightAutofill).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run client/src/__tests__/FlightLegForm.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `client/src/components/FlightLegForm.tsx`

```tsx
import { useState } from 'react';
import { Anchor, Button, Group, Input, SegmentedControl, SimpleGrid, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { tripApi } from '../api/tripApi';
import { ArrivalDayOffset, FlightLegDraft, applyLookup, autoArrivalOffset, parseFlightCode } from '../utils/flightLegs';

interface FlightLegFormProps {
  tripId: string;
  draft: FlightLegDraft;
  onChange: (draft: FlightLegDraft) => void;
  idPrefix: string;
}

type LookupStatus = { kind: 'ok' | 'empty' | 'error'; text: string; url?: string };

const OFFSET_OPTIONS = [
  { label: 'Same day', value: '0' },
  { label: '+1', value: '1' },
  { label: '+2', value: '2' },
];

export function FlightLegForm({ tripId, draft, onChange, idPrefix }: FlightLegFormProps) {
  const [status, setStatus] = useState<LookupStatus | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const id = (field: string) => `${idPrefix}-${field}`;

  const set = (patch: Partial<FlightLegDraft>) => onChange({ ...draft, ...patch });

  const setTime = (field: 'departureTime' | 'arrivalTime', value: string) => {
    const next = { ...draft, [field]: value };
    onChange({ ...next, arrivalDayOffset: autoArrivalOffset(next.departureTime, next.arrivalTime, draft.arrivalDayOffset) });
  };

  const lookup = async () => {
    const { airline, flightNumber } = parseFlightCode(draft.flightCode);
    if (!airline || !flightNumber || !draft.date) {
      setStatus({ kind: 'error', text: 'Enter the flight # (e.g. WN1234) and date to look up.' });
      return;
    }
    try {
      setLookingUp(true);
      const details = await tripApi.lookupFlightAutofill(tripId, { airlineCode: airline, flightNumber, flightDate: draft.date });
      const found = details.departureAirport || details.arrivalAirport || details.departureDatetime || details.arrivalDatetime;
      if (!found) {
        setStatus({ kind: 'empty', text: 'No schedule found yet. Enter the airports and times manually.', url: details.sourceUrl });
        return;
      }
      onChange(applyLookup(draft, details));
      setStatus({ kind: 'ok', text: `Filled from FlightStats${details.statusText ? ` (${details.statusText})` : ''}. Check the times before saving.` });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Flight lookup failed' });
    } finally {
      setLookingUp(false);
    }
  };

  return (
    <div>
      <SimpleGrid cols={2} spacing="xs" verticalSpacing="xs">
        <TextInput
          id={id('code')}
          label="Flight #"
          placeholder="WN1234"
          value={draft.flightCode}
          onChange={e => set({ flightCode: e.currentTarget.value.toUpperCase() })}
        />
        <TextInput id={id('date')} label="Date" type="date" value={draft.date} onChange={e => set({ date: e.currentTarget.value })} />
      </SimpleGrid>

      <Group gap="xs" mt={6} wrap="nowrap" align="center">
        <Button size="compact-sm" variant="light" leftSection={<IconSearch size={14} />} onClick={lookup} loading={lookingUp}>
          Look up
        </Button>
        {status && (
          <Text role="status" size="xs" c={status.kind === 'ok' ? 'dimmed' : 'yellow.7'}>
            {status.text}
            {status.url && (
              <>
                {' '}
                <Anchor href={status.url} target="_blank" rel="noreferrer" size="xs">Open FlightStats</Anchor>
              </>
            )}
          </Text>
        )}
      </Group>

      <SimpleGrid cols={2} spacing="xs" verticalSpacing="xs" mt="xs">
        <TextInput
          id={id('from')}
          label="From"
          placeholder="DEN"
          maxLength={4}
          value={draft.departureAirport}
          onChange={e => set({ departureAirport: e.currentTarget.value.toUpperCase() })}
        />
        <TextInput id={id('departs')} label="Departs" type="time" value={draft.departureTime} onChange={e => setTime('departureTime', e.currentTarget.value)} />
        <TextInput
          id={id('to')}
          label="To"
          placeholder="MCO"
          maxLength={4}
          value={draft.arrivalAirport}
          onChange={e => set({ arrivalAirport: e.currentTarget.value.toUpperCase() })}
        />
        <TextInput id={id('arrives')} label="Arrives" type="time" value={draft.arrivalTime} onChange={e => setTime('arrivalTime', e.currentTarget.value)} />
      </SimpleGrid>

      <Input.Wrapper label="Arrival day" mt="xs">
        <SegmentedControl
          fullWidth
          size="xs"
          data={OFFSET_OPTIONS}
          value={String(draft.arrivalDayOffset)}
          onChange={value => set({ arrivalDayOffset: Number(value) as ArrivalDayOffset })}
        />
      </Input.Wrapper>

      <TextInput
        id={id('price-url')}
        mt="xs"
        label="Price check link"
        type="url"
        placeholder="Airline search page (optional)"
        value={draft.checkPriceUrl}
        onChange={e => set({ checkPriceUrl: e.currentTarget.value })}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run** `npx vitest run client/src/__tests__/FlightLegForm.test.tsx` — Expected: PASS (5 tests). If `getByRole('radio', { name: '+1' })` fails to find the SegmentedControl option, inspect with `screen.debug()`; Mantine 8 renders each option as `<input type="radio">` + `<label for>`, so the accessible name is the option label.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/FlightLegForm.tsx client/src/__tests__/FlightLegForm.test.tsx vitest.config.ts
git commit -m "feat(client): FlightLegForm with flight code, single date, time inputs and arrival-day chip

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Add-flight dialog — `FlightLegsEditor` rewrite and no Name field

**Files:**
- Rewrite: `client/src/components/FlightLegsEditor.tsx`
- Modify: `client/src/components/AddElementDialog.tsx`
- Rewrite test: `client/src/__tests__/FlightLegsEditor.test.tsx`
- Modify test: `client/src/__tests__/TripDetailPage.test.tsx` (FlightLegsEditor mock + Add-flight tests)

- [ ] **Step 1: Rewrite the test** `client/src/__tests__/FlightLegsEditor.test.tsx` with:

```tsx
/* @vitest-environment jsdom */
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/tripApi', () => ({ tripApi: { lookupFlightAutofill: vi.fn() } }));

import { FlightLegsEditor } from '../components/FlightLegsEditor';
import { FlightLegDraft, emptyLegDraft } from '../utils/flightLegs';

const filled: FlightLegDraft = {
  flightCode: 'WN100', date: '2026-11-10', departureTime: '08:00', arrivalTime: '10:00', arrivalDayOffset: 0,
  departureAirport: 'DEN', arrivalAirport: 'DAL', checkPriceUrl: '',
};

let latest: FlightLegDraft[];

function Harness({ initial }: { initial: FlightLegDraft[] }) {
  const [legs, setLegs] = useState(initial);
  latest = legs;
  return <FlightLegsEditor tripId="trip-1" legs={legs} onChange={setLegs} />;
}

describe('FlightLegsEditor', () => {
  afterEach(() => cleanup());

  it('renders one titled form per leg without a remove button for a single leg', () => {
    renderWithMantine(<Harness initial={[emptyLegDraft()]} />);
    expect(screen.getByText('Leg 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove leg 1' })).toBeNull();
  });

  it('adds a leg that starts where the previous one ended', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness initial={[filled]} />);
    await user.click(screen.getByRole('button', { name: '+ Leg' }));
    expect(latest).toHaveLength(2);
    expect(latest[1]).toMatchObject({ date: '2026-11-10', departureAirport: 'DAL', arrivalAirport: '' });
    expect(screen.getByText('Leg 2')).toBeTruthy();
  });

  it('shows the layover between legs', () => {
    renderWithMantine(<Harness initial={[filled, { ...filled, flightCode: 'WN200', departureTime: '12:15', arrivalTime: '14:00', departureAirport: 'DAL', arrivalAirport: 'SJD' }]} />);
    expect(screen.getByText('Layover in DAL: 2h 15m')).toBeTruthy();
  });

  it('removes a leg', async () => {
    const user = userEvent.setup();
    renderWithMantine(<Harness initial={[filled, { ...filled, departureAirport: 'DAL', arrivalAirport: 'SJD' }]} />);
    await user.click(screen.getByRole('button', { name: 'Remove leg 1' }));
    expect(latest).toHaveLength(1);
    expect(latest[0].arrivalAirport).toBe('SJD');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run client/src/__tests__/FlightLegsEditor.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Rewrite** `client/src/components/FlightLegsEditor.tsx`

```tsx
import { ActionIcon, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FlightLegForm } from './FlightLegForm';
import { FlightLegDraft, draftLayover, emptyLegDraft, formatLayover } from '../utils/flightLegs';

interface FlightLegsEditorProps {
  tripId: string;
  legs: FlightLegDraft[];
  onChange: (legs: FlightLegDraft[]) => void;
  idPrefix?: string;
}

// Stack of leg forms used when creating a flight.
export function FlightLegsEditor({ tripId, legs, onChange, idPrefix = 'leg' }: FlightLegsEditorProps) {
  const update = (index: number, draft: FlightLegDraft) =>
    onChange(legs.map((leg, i) => (i === index ? draft : leg)));

  return (
    <Stack gap="xs">
      {legs.map((leg, index) => {
        const layover = index > 0 ? draftLayover(legs[index - 1], leg) : null;
        return (
          <div key={`leg-${index}`}>
            {layover !== null && (
              <Text size="sm" c="dimmed" ta="center" mb="xs">
                {`Layover${leg.departureAirport ? ` in ${leg.departureAirport}` : ''}: ${formatLayover(layover)}`}
              </Text>
            )}
            <Paper withBorder p="sm">
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Leg {index + 1}</Text>
                {legs.length > 1 && (
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={`Remove leg ${index + 1}`}
                    onClick={() => onChange(legs.filter((_, i) => i !== index))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                )}
              </Group>
              <FlightLegForm tripId={tripId} draft={leg} onChange={draft => update(index, draft)} idPrefix={`${idPrefix}-${index}`} />
            </Paper>
          </div>
        );
      })}
      <Button
        variant="light"
        size="compact-sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...legs, emptyLegDraft(legs[legs.length - 1])])}
      >
        + Leg
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run client/src/__tests__/FlightLegsEditor.test.tsx` — Expected: PASS (4 tests).

- [ ] **Step 5: Rewrite** `client/src/components/AddElementDialog.tsx`

```tsx
import { useState } from 'react';
import { Alert, Button, Group, Modal, Text, Textarea } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import { FlightLegsEditor } from './FlightLegsEditor';
import { FlightLegDraft, draftToPayload, emptyLegDraft, validateDraft } from '../utils/flightLegs';

interface AddElementDialogProps {
  tripId: string;
  opened: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

export function AddElementDialog({ tripId, opened, onClose, onCreated }: AddElementDialogProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [notes, setNotes] = useState('');
  const [legs, setLegs] = useState<FlightLegDraft[]>([emptyLegDraft()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setNotes('');
    setLegs([emptyLegDraft()]);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const save = async () => {
    for (const [index, leg] of legs.entries()) {
      const problem = validateDraft(leg);
      if (problem) {
        setError(legs.length > 1 ? `Leg ${index + 1}: ${problem}` : problem);
        return;
      }
    }
    try {
      setSaving(true);
      setError(null);
      // The server names the flight from its legs ("DEN → MCO").
      await tripApi.createElement(tripId, {
        elementType: 'flight',
        notes: notes.trim() || undefined,
        typeSpecificData: {
          legs: legs.map((draft, index) => ({ ...draftToPayload(draft), legOrder: index + 1 })),
        },
      });
      reset();
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add flight');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add flight" size="lg" fullScreen={isMobile}>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <FlightLegsEditor tripId={tripId} legs={legs} onChange={setLegs} idPrefix="new-leg" />
      <Textarea mt="sm" label="Notes" autosize minRows={1} placeholder="Optional" value={notes} onChange={e => setNotes(e.currentTarget.value)} />
      <Text size="sm" c="dimmed" mt="xs">
        Confirmation number, pricing, and travelers are entered per booking after saving this flight.
      </Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={handleClose}>Cancel</Button>
        <Button onClick={save} loading={saving}>Save flight</Button>
      </Group>
    </Modal>
  );
}
```

- [ ] **Step 6: Update `client/src/__tests__/TripDetailPage.test.tsx` — the FlightLegsEditor mock.** Replace the whole `vi.mock('../components/FlightLegsEditor', …)` block (lines 30-80) with:

```tsx
const mockLeg = {
  flightCode: 'WN123', date: '2026-09-12', departureTime: '08:00', arrivalTime: '11:00', arrivalDayOffset: 0,
  departureAirport: 'DEN', arrivalAirport: 'SJD', checkPriceUrl: '',
};

vi.mock('../components/FlightLegsEditor', () => ({
  FlightLegsEditor: ({ legs, onChange }: { legs: any[]; onChange: (legs: any[]) => void }) => (
    <div>
      <span>legs in editor: {legs.length}</span>
      <button type="button" onClick={() => onChange([{ ...mockLeg }])}>mock fill leg</button>
      <button
        type="button"
        onClick={() =>
          onChange([
            { ...mockLeg, flightCode: 'WN100', date: '2026-11-10', departureTime: '08:00', arrivalTime: '10:00', arrivalAirport: 'DAL' },
            { ...mockLeg, flightCode: 'WN200', date: '2026-11-10', departureTime: '12:15', arrivalTime: '14:00', departureAirport: 'DAL' },
          ])
        }
      >
        mock two legs
      </button>
    </div>
  ),
}));
```

(`vi.mock` factories are hoisted; referencing `mockLeg` inside the component body is fine because it is only read when the button is clicked. If vitest complains about the hoisted reference, rename it to `vi.hoisted(() => ({ ... }))` form: `const { mockLeg } = vi.hoisted(() => ({ mockLeg: { …same object… } }));`.)

- [ ] **Step 7: Update the Add-flight tests in `TripDetailPage.test.tsx`.**

Replace the test `'creates a flight, closes the dialog and reloads elements'` with:

```tsx
  it('creates a flight without a name, closes the dialog and reloads elements', async () => {
    const user = userEvent.setup();
    api.createElement.mockResolvedValue({ id: 'el-2' });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Add flight' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add flight' });
    expect(within(dialog).queryByLabelText('Name')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'mock fill leg' }));
    const callsBefore = api.listElements.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Save flight' }));

    await waitFor(() =>
      expect(api.createElement).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({
          elementType: 'flight',
          typeSpecificData: {
            legs: [expect.objectContaining({
              legOrder: 1, airline: 'WN', flightNumber: '123', departureAirport: 'DEN', arrivalAirport: 'SJD',
              departureDatetime: '2026-09-12T08:00', arrivalDatetime: '2026-09-12T11:00',
            })],
          },
        })
      )
    );
    expect(api.createElement.mock.calls[0][1]).not.toHaveProperty('name');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add flight' })).toBeNull());
    expect(api.listElements.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('blocks saving an incomplete leg with an inline message', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Add flight' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add flight' });
    await user.click(within(dialog).getByRole('button', { name: 'Save flight' }));
    expect(await within(dialog).findByText('Enter the flight date')).toBeTruthy();
    expect(api.createElement).not.toHaveBeenCalled();
  });
```

Delete the tests `'auto-names from legs until the name is edited manually'` and `'sends autofilled lookup times in the create payload'`.

In `'creates a two-leg flight with legOrder 1 and 2'`, delete the line

```tsx
    await waitFor(() => expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('DEN → DAL → SJD'));
```

(The describe's `beforeEach` calls `vi.resetAllMocks()`, so `createElement` starts each test with zero calls — the `mock.calls[0]` assertion relies on that.)

- [ ] **Step 8: Run** `npx vitest run client/src/__tests__/FlightLegsEditor.test.tsx client/src/__tests__/TripDetailPage.test.tsx` — Expected: FlightLegsEditor PASS; TripDetailPage: Add-flight tests PASS; the edit test (`'edits legs through updateElement…'`) may FAIL until Task 11 because `FlightDetailsTab` still uses the old API. That one failure is expected here.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/FlightLegsEditor.tsx client/src/components/AddElementDialog.tsx client/src/__tests__/FlightLegsEditor.test.tsx client/src/__tests__/TripDetailPage.test.tsx
git commit -m "feat(client): streamlined add-flight dialog without a name field

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: `FlightLegList` — inline leg edit/add/delete on the Details tab

**Files:**
- Create: `client/src/components/FlightLegList.tsx`
- Create test: `client/src/__tests__/FlightLegList.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Whitelist** — add to `vitest.config.ts`:

```ts
      'client/src/__tests__/FlightLegList.test.tsx', // Inline leg editing
```

- [ ] **Step 2: Write the failing test** `client/src/__tests__/FlightLegList.test.tsx`

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { FlightLeg } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: { syncLegs: vi.fn(), lookupFlightAutofill: vi.fn() },
}));

import { tripApi } from '../api/tripApi';
import { FlightLegList } from '../components/FlightLegList';

const api = tripApi as any;

const legs: FlightLeg[] = [
  { id: 'leg-1', elementId: 'el-7', legOrder: 1, departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00', arrivalAirport: 'DAL', arrivalDatetime: '2026-11-10T10:00', airline: 'WN', flightNumber: '100', layoverMinutesAfter: 135, createdAt: '', updatedAt: '' },
  { id: 'leg-2', elementId: 'el-7', legOrder: 2, departureAirport: 'DAL', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'SJD', arrivalDatetime: '2026-11-10T14:00', airline: 'WN', flightNumber: '200', createdAt: '', updatedAt: '' },
];

const leg1Payload = {
  id: 'leg-1', departureAirport: 'DEN', departureDatetime: '2026-11-10T08:00', arrivalAirport: 'DAL',
  arrivalDatetime: '2026-11-10T10:00', airline: 'WN', flightNumber: '100', checkPriceUrl: undefined,
};

function renderList(props: Partial<React.ComponentProps<typeof FlightLegList>> = {}) {
  const onChanged = vi.fn();
  const onEditingChange = vi.fn();
  renderWithMantine(
    <FlightLegList tripId="trip-1" elementId="el-7" legs={legs} onChanged={onChanged} onEditingChange={onEditingChange} {...props} />
  );
  return { onChanged, onEditingChange };
}

describe('FlightLegList', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    api.syncLegs.mockResolvedValue([]);
  });

  it('shows compact leg lines with the layover', () => {
    renderList();
    expect(screen.getByText('WN100 · DEN 8:00a → DAL 10:00a')).toBeTruthy();
    expect(screen.getByText('WN200 · DAL 12:15p → SJD 2:00p')).toBeTruthy();
    expect(screen.getByText('Layover: 2h 15m')).toBeTruthy();
  });

  it('edits one leg inline and saves the full list', async () => {
    const user = userEvent.setup();
    const { onChanged, onEditingChange } = renderList();
    await user.click(screen.getByRole('button', { name: 'Edit leg 2' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);

    const code = screen.getByLabelText('Flight #');
    await user.clear(code);
    await user.type(code, 'WN201');
    await user.click(screen.getByRole('button', { name: 'Save leg' }));

    await waitFor(() => expect(api.syncLegs).toHaveBeenCalledWith('trip-1', 'el-7', [
      leg1Payload,
      { id: 'leg-2', departureAirport: 'DAL', departureDatetime: '2026-11-10T12:15', arrivalAirport: 'SJD', arrivalDatetime: '2026-11-10T14:00', airline: 'WN', flightNumber: '201', checkPriceUrl: undefined },
    ]));
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save leg' })).toBeNull());
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('adds a leg prefilled from the last leg', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: '+ Leg' }));
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('SJD');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-11-10');

    await user.type(screen.getByLabelText('Flight #'), 'WN300');
    await user.type(screen.getByLabelText('To'), 'LAX');
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText('Arrives'), { target: { value: '17:30' } });
    await user.click(screen.getByRole('button', { name: 'Save leg' }));

    await waitFor(() => expect(api.syncLegs).toHaveBeenCalled());
    const sent = api.syncLegs.mock.calls[0][2];
    expect(sent).toHaveLength(3);
    expect(sent[2]).toEqual({
      id: undefined, departureAirport: 'SJD', departureDatetime: '2026-11-10T16:00', arrivalAirport: 'LAX',
      arrivalDatetime: '2026-11-10T17:30', airline: 'WN', flightNumber: '300', checkPriceUrl: undefined,
    });
  });

  it('validates before saving and keeps the form open', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: '+ Leg' }));
    await user.click(screen.getByRole('button', { name: 'Save leg' }));
    expect(screen.getByText('Enter both airport codes')).toBeTruthy();
    expect(api.syncLegs).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save leg' })).toBeTruthy();
  });

  it('shows the server error inline and keeps the form open', async () => {
    const user = userEvent.setup();
    api.syncLegs.mockRejectedValue(new Error('Leg 2 departs before the previous leg arrives'));
    renderList();
    await user.click(screen.getByRole('button', { name: 'Edit leg 2' }));
    fireEvent.change(screen.getByLabelText('Departs'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Arrives'), { target: { value: '09:30' } });
    await user.click(screen.getByRole('button', { name: 'Save leg' }));
    expect(await screen.findByText('Leg 2 departs before the previous leg arrives')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save leg' })).toBeTruthy();
  });

  it('deletes a leg after confirming', async () => {
    const user = userEvent.setup();
    const { onChanged } = renderList();
    await user.click(screen.getByRole('button', { name: 'Delete leg 2' }));
    expect(screen.getByText('Delete this leg?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.syncLegs).toHaveBeenCalledWith('trip-1', 'el-7', [leg1Payload]));
    expect(onChanged).toHaveBeenCalled();
  });

  it('cannot delete the only leg', () => {
    renderList({ legs: [legs[0]] });
    expect(screen.queryByRole('button', { name: 'Delete leg 1' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit leg 1' })).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run client/src/__tests__/FlightLegList.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `client/src/components/FlightLegList.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Anchor, Button, Group, Paper, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { FlightLeg, FlightLegPayload } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { FlightLegForm } from './FlightLegForm';
import {
  FlightLegDraft, draftToPayload, emptyLegDraft, formatLayover, formatLegLine, legToDraft, legToPayload, validateDraft,
} from '../utils/flightLegs';

interface FlightLegListProps {
  tripId: string;
  elementId: string;
  legs: FlightLeg[];
  onChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

type Editing = { index: number | 'new'; draft: FlightLegDraft };

export function FlightLegList({ tripId, elementId, legs, onChanged, onEditingChange }: FlightLegListProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const isEditing = editing !== null;
  useEffect(() => {
    onEditingChangeRef.current(isEditing);
  }, [isEditing]);

  const startEdit = (index: number) => {
    setConfirmingIndex(null);
    setError(null);
    setEditing({ index, draft: legToDraft(legs[index]) });
  };

  const startAdd = () => {
    setConfirmingIndex(null);
    setError(null);
    const last = legs[legs.length - 1];
    setEditing({ index: 'new', draft: emptyLegDraft(last ? legToDraft(last) : undefined) });
  };

  const cancel = () => {
    setEditing(null);
    setError(null);
  };

  // Every change sends the whole list; the server diffs by leg id.
  const persist = async (payload: FlightLegPayload[]) => {
    try {
      setSaving(true);
      setError(null);
      await tripApi.syncLegs(tripId, elementId, payload);
      setEditing(null);
      setConfirmingIndex(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save legs');
    } finally {
      setSaving(false);
    }
  };

  const saveLeg = async () => {
    if (!editing) return;
    const problem = validateDraft(editing.draft);
    if (problem) {
      setError(problem);
      return;
    }
    const edited = draftToPayload(editing.draft);
    const payload = editing.index === 'new'
      ? [...legs.map(legToPayload), edited]
      : legs.map((leg, i) => (i === editing.index ? edited : legToPayload(leg)));
    await persist(payload);
  };

  const deleteLeg = (index: number) => persist(legs.filter((_, i) => i !== index).map(legToPayload));

  const form = editing && (
    <Paper withBorder p="sm" my="xs">
      <FlightLegForm
        tripId={tripId}
        draft={editing.draft}
        onChange={draft => setEditing({ ...editing, draft })}
        idPrefix={`leg-${elementId}-${editing.index}`}
      />
      <Group mt="sm" justify="flex-end">
        <Button variant="default" size="xs" onClick={cancel}>Cancel</Button>
        <Button size="xs" onClick={saveLeg} loading={saving}>Save leg</Button>
      </Group>
    </Paper>
  );

  return (
    <div>
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      {legs.length === 0 && editing?.index !== 'new' && <Text size="sm" c="dimmed">No legs yet</Text>}
      {legs.map((leg, index) => (
        <div key={leg.id}>
          {editing?.index === index ? form : (
            <Group justify="space-between" wrap="nowrap" gap="xs" py={2}>
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500}>{formatLegLine(leg)}</Text>
                {leg.checkPriceUrl && (
                  <Anchor href={leg.checkPriceUrl} target="_blank" rel="noreferrer" size="xs">Check price</Anchor>
                )}
              </div>
              {confirmingIndex === index ? (
                <Group gap={4} wrap="nowrap">
                  <Text size="xs">Delete this leg?</Text>
                  <Button size="compact-xs" color="red" onClick={() => deleteLeg(index)} loading={saving}>Confirm</Button>
                  <Button size="compact-xs" variant="default" onClick={() => setConfirmingIndex(null)}>Cancel</Button>
                </Group>
              ) : (
                <Group gap={2} wrap="nowrap">
                  <ActionIcon variant="subtle" size="lg" aria-label={`Edit leg ${index + 1}`} onClick={() => startEdit(index)} disabled={isEditing}>
                    <IconPencil size={16} />
                  </ActionIcon>
                  {legs.length > 1 && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="lg"
                      aria-label={`Delete leg ${index + 1}`}
                      onClick={() => {
                        setError(null);
                        setConfirmingIndex(index);
                      }}
                      disabled={isEditing}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              )}
            </Group>
          )}
          {index < legs.length - 1 && leg.layoverMinutesAfter != null && (
            <Text size="xs" c="dimmed" pl="md">{`Layover: ${formatLayover(leg.layoverMinutesAfter)}`}</Text>
          )}
        </div>
      ))}
      {editing?.index === 'new' ? form : (
        <Button variant="light" size="compact-sm" mt="xs" onClick={startAdd} disabled={isEditing}>+ Leg</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run** `npx vitest run client/src/__tests__/FlightLegList.test.tsx` — Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/FlightLegList.tsx client/src/__tests__/FlightLegList.test.tsx vitest.config.ts
git commit -m "feat(client): FlightLegList with inline leg edit, add and delete

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: `FlightDetailsTab` rewrite (legs list + notes + delete flight)

**Files:**
- Rewrite: `client/src/components/FlightDetailsTab.tsx`
- Modify test: `client/src/__tests__/TripDetailPage.test.tsx`

- [ ] **Step 1: Update the Details tests in `TripDetailPage.test.tsx`.**

Replace the test `'edits legs through updateElement and syncLegs and keeps the dialog open'` with:

```tsx
  it('edits a leg inline through syncLegs only and keeps the dialog open', async () => {
    const user = userEvent.setup();
    api.listElements.mockResolvedValue([twoLegFlight()]);
    api.syncLegs.mockResolvedValue([]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open DEN → DAL → SJD' }));
    const dialog = await screen.findByRole('dialog', { name: 'DEN → DAL → SJD' });
    await user.click(within(dialog).getByRole('button', { name: 'Edit leg 2' }));
    const code = within(dialog).getByLabelText('Flight #');
    await user.clear(code);
    await user.type(code, 'WN201');
    await user.click(within(dialog).getByRole('button', { name: 'Save leg' }));

    await waitFor(() =>
      expect(api.syncLegs).toHaveBeenCalledWith('trip-1', 'el-7', [
        expect.objectContaining({ id: 'leg-1', airline: 'WN', flightNumber: '100' }),
        expect.objectContaining({ id: 'leg-2', airline: 'WN', flightNumber: '201', departureAirport: 'DAL', arrivalAirport: 'SJD' }),
      ])
    );
    expect(api.updateElement).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog', { name: 'DEN → DAL → SJD' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save leg' })).toBeNull());
  });

  it('edits notes inline and clears them when emptied', async () => {
    const user = userEvent.setup();
    api.listElements.mockResolvedValue([flightEl({ notes: 'Window seats' })]);
    api.updateElement.mockResolvedValue({});
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open Delta 45' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delta 45' });
    await user.click(within(dialog).getByRole('button', { name: 'Edit notes' }));
    const notes = within(dialog).getByLabelText('Notes');
    await user.clear(notes);
    await user.click(within(dialog).getByRole('button', { name: 'Save notes' }));

    await waitFor(() => expect(api.updateElement).toHaveBeenCalledWith('trip-1', 'el-1', { notes: null }));
    await waitFor(() => expect(within(dialog).queryByRole('button', { name: 'Save notes' })).toBeNull());
  });
```

In `'deletes a flight after confirming and closes the dialog'`, change

```tsx
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
```
to
```tsx
    await user.click(within(dialog).getByRole('button', { name: 'Delete flight' }));
```

- [ ] **Step 2: Run** `npx vitest run client/src/__tests__/TripDetailPage.test.tsx` — Expected: FAIL on the three changed tests.

- [ ] **Step 3: Rewrite** `client/src/components/FlightDetailsTab.tsx`

```tsx
import { useEffect, useState } from 'react';
import { Alert, Button, Group, Text, Textarea, UnstyledButton } from '@mantine/core';
import { TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { FlightLegList } from './FlightLegList';

interface FlightDetailsTabProps {
  tripId: string;
  element: TripElement;
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

export function FlightDetailsTab({ tripId, element, onChanged, onDeleted, onEditingChange }: FlightDetailsTabProps) {
  const [legsEditing, setLegsEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Swipe between tabs must stay off while a form is open; also reset when this tab unmounts.
  const editing = legsEditing || notesDraft !== null;
  useEffect(() => {
    onEditingChange(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onEditingChange(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNotes = async () => {
    if (notesDraft === null) return;
    try {
      setSavingNotes(true);
      setError(null);
      await tripApi.updateElement(tripId, element.id, { notes: notesDraft.trim() || null });
      setNotesDraft(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const remove = async () => {
    try {
      setError(null);
      await tripApi.deleteElement(tripId, element.id);
      await onDeleted();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete flight');
    }
  };

  return (
    <div>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <FlightLegList
        tripId={tripId}
        elementId={element.id}
        legs={element.legs ?? []}
        onChanged={onChanged}
        onEditingChange={setLegsEditing}
      />

      <Text size="sm" fw={600} mt="md">Notes</Text>
      {notesDraft === null ? (
        <UnstyledButton aria-label="Edit notes" onClick={() => setNotesDraft(element.notes ?? '')} w="100%" py={4}>
          <Text size="sm" c={element.notes ? undefined : 'dimmed'} style={{ whiteSpace: 'pre-wrap' }}>
            {element.notes || 'Add notes'}
          </Text>
        </UnstyledButton>
      ) : (
        <div>
          <Textarea
            aria-label="Notes"
            autosize
            minRows={2}
            value={notesDraft}
            onChange={e => setNotesDraft(e.currentTarget.value)}
            data-autofocus
          />
          <Group mt="xs" justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setNotesDraft(null)}>Cancel</Button>
            <Button size="xs" onClick={saveNotes} loading={savingNotes}>Save notes</Button>
          </Group>
        </div>
      )}

      <Group mt="lg">
        {confirmingDelete ? (
          <>
            <Text size="sm">Delete this flight?</Text>
            <Button color="red" size="xs" onClick={remove}>Confirm</Button>
            <Button variant="default" size="xs" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
          </>
        ) : (
          <Button variant="subtle" color="red" size="xs" onClick={() => setConfirmingDelete(true)} disabled={editing}>
            Delete flight
          </Button>
        )}
      </Group>
    </div>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run client/src/__tests__/TripDetailPage.test.tsx client/src/__tests__/FlightLegList.test.tsx client/src/__tests__/FlightLegsEditor.test.tsx client/src/__tests__/FlightLegForm.test.tsx client/src/__tests__/flightLegs.test.ts` — Expected: all PASS.

- [ ] **Step 5: Client type-check** (Conventions) — Expected: no output (all old leg-API callers are gone now).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/FlightDetailsTab.tsx client/src/__tests__/TripDetailPage.test.tsx
git commit -m "feat(client): details tab with inline legs, click-to-edit notes and delete flight

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 12: Booking coverage helpers (`utils/bookingCoverage.ts`)

**Files:**
- Create: `client/src/utils/bookingCoverage.ts`
- Create test: `client/src/__tests__/bookingCoverage.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Whitelist** — add to `vitest.config.ts`:

```ts
      'client/src/__tests__/bookingCoverage.test.ts', // Booking coverage helpers
```

- [ ] **Step 2: Write the failing test** `client/src/__tests__/bookingCoverage.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import {
  bookedTravelers, bookingLabel, flightDateLabel, flightOptionLabel, sortFlightsByDate, unbookedTravelers,
} from '../utils/bookingCoverage';

const legAt = (id: string, departureDatetime: string) => ({
  id, elementId: '', legOrder: 1, departureAirport: 'A', departureDatetime, arrivalAirport: 'B', arrivalDatetime: departureDatetime, createdAt: '', updatedAt: '',
});

const flight = (id: string, name: string, dates: string[]): TripElement => ({
  id, tripId: 't', elementType: 'flight', name, sortPosition: 0, createdAt: '', updatedAt: '',
  legs: dates.map((d, i) => legAt(`${id}-l${i}`, d)),
});

const booking = (id: string, elementIds: string[], travelerIds: string[], conf: string | null = null): Booking => ({
  id, tripId: 't', confirmationNumber: conf, advertisedPriceCash: null, advertisedPricePoints: null, loyaltyProgram: null,
  notes: null, createdAt: '', updatedAt: '', elementIds, travelerIds, currentConfirmationNumber: conf, actualTotalCash: 0, actualTotalPoints: 0,
});

const people: TripParticipant[] = [
  { id: 'p1', tripId: 't', displayName: 'Alice', createdAt: '' },
  { id: 'p2', tripId: 't', displayName: 'Bob', createdAt: '' },
];

describe('bookingCoverage', () => {
  const out = flight('f1', 'DEN → MCO', ['2026-08-29T08:00', '2026-08-29T11:30']);
  const back = flight('f2', 'MCO → DEN', ['2026-09-05T18:00']);
  const tbd = flight('f3', 'Home', []);
  const hotel: TripElement = { id: 'h1', tripId: 't', elementType: 'hotel', name: 'Diamante', sortPosition: 0, createdAt: '', updatedAt: '' };

  it('sorts flights by first departure, undated last, and drops non-flights', () => {
    expect(sortFlightsByDate([tbd, back, hotel, out]).map(f => f.id)).toEqual(['f1', 'f2', 'f3']);
  });

  it('labels flights for checkboxes and the covers line', () => {
    expect(flightDateLabel(out)).toBe('Aug 29');
    expect(flightDateLabel(tbd)).toBe('');
    expect(flightOptionLabel(out)).toBe('DEN → MCO · Aug 29 · 2 legs');
    expect(flightOptionLabel(back)).toBe('MCO → DEN · Sep 5 · 1 leg');
    expect(flightOptionLabel(tbd)).toBe('Home');
  });

  it('labels bookings by current confirmation number', () => {
    expect(bookingLabel(booking('b1', [], [], 'ABC123'))).toBe('ABC123');
    expect(bookingLabel(booking('b1', [], []))).toBe('no confirmation #');
  });

  it('maps travelers to the booking that already covers any of the flights', () => {
    const b1 = booking('b1', ['f1', 'f2'], ['p1'], 'ABC');
    const b2 = booking('b2', ['f2'], ['p2'], 'XYZ');
    expect([...bookedTravelers([b1, b2], ['f1']).entries()]).toEqual([['p1', b1]]);
    expect([...bookedTravelers([b1, b2], ['f2']).keys()].sort()).toEqual(['p1', 'p2']);
    expect([...bookedTravelers([b1, b2], ['f2'], 'b1').keys()]).toEqual(['p2']);
  });

  it('lists trip travelers not booked on a flight', () => {
    const b1 = booking('b1', ['f1'], ['p1']);
    expect(unbookedTravelers([b1], 'f1', people).map(p => p.displayName)).toEqual(['Bob']);
    expect(unbookedTravelers([b1], 'f2', people).map(p => p.displayName)).toEqual(['Alice', 'Bob']);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run client/src/__tests__/bookingCoverage.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement** `client/src/utils/bookingCoverage.ts`

```ts
import { Booking, TripElement, TripParticipant } from '../types/trip';

function firstDeparture(element: TripElement): string {
  return element.legs?.[0]?.departureDatetime ?? '';
}

// Flights only, earliest first; flights without legs go last in their original order.
export function sortFlightsByDate(elements: TripElement[]): TripElement[] {
  return elements
    .filter(e => e.elementType === 'flight')
    .map((element, index) => ({ element, index, when: firstDeparture(element) }))
    .sort((a, b) => {
      if (a.when && b.when && a.when !== b.when) return a.when < b.when ? -1 : 1;
      if (a.when && !b.when) return -1;
      if (!a.when && b.when) return 1;
      return a.index - b.index;
    })
    .map(item => item.element);
}

// "Aug 29" from the first leg's departure date (no timezone shift).
export function flightDateLabel(element: TripElement): string {
  const match = firstDeparture(element).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  const [year, month, day] = match.slice(1).map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// "DEN → MCO · Aug 29 · 2 legs"
export function flightOptionLabel(element: TripElement): string {
  const count = element.legs?.length ?? 0;
  const legs = count > 0 ? `${count} leg${count === 1 ? '' : 's'}` : '';
  return [element.name, flightDateLabel(element), legs].filter(Boolean).join(' · ');
}

export function bookingLabel(booking: Booking): string {
  return booking.currentConfirmationNumber || 'no confirmation #';
}

// participantId -> the other booking that already has them on any of `elementIds`.
export function bookedTravelers(bookings: Booking[], elementIds: string[], excludeBookingId?: string): Map<string, Booking> {
  const result = new Map<string, Booking>();
  for (const booking of bookings) {
    if (booking.id === excludeBookingId) continue;
    if (!booking.elementIds.some(id => elementIds.includes(id))) continue;
    for (const participantId of booking.travelerIds) {
      if (!result.has(participantId)) result.set(participantId, booking);
    }
  }
  return result;
}

export function unbookedTravelers(bookings: Booking[], elementId: string, participants: TripParticipant[]): TripParticipant[] {
  const booked = bookedTravelers(bookings, [elementId]);
  return participants.filter(p => !booked.has(p.id));
}
```

- [ ] **Step 5: Run** `npx vitest run client/src/__tests__/bookingCoverage.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/bookingCoverage.ts client/src/__tests__/bookingCoverage.test.ts vitest.config.ts
git commit -m "feat(client): booking coverage helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 13: `BookingTransactionList.onCountChange`

**Files:**
- Modify: `client/src/components/BookingTransactionList.tsx`
- Modify test: `client/src/__tests__/BookingTransactionList.test.tsx`

The delete prompt in `BookingBlock` needs the transaction count without fetching twice. The callback is read through a ref so an inline lambda from the parent does not retrigger the effect.

- [ ] **Step 1: Add the failing test** at the end of the `describe` in `BookingTransactionList.test.tsx`:

```tsx
  it('reports the number of transactions after loading', async () => {
    const onCountChange = vi.fn();
    renderList({ onCountChange });
    await screen.findByText('$78.98');
    expect(onCountChange).toHaveBeenLastCalledWith(1);
  });
```

- [ ] **Step 2: Run** `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx` — Expected: FAIL (`onCountChange` never called; TS prop error is not checked by vitest).

- [ ] **Step 3: Implement.** In `BookingTransactionList.tsx`:

(a) Change the React import to

```ts
import { useState, useEffect, useCallback, useId, useRef } from 'react';
```

(b) Add to `BookingTransactionListProps`:

```ts
  onCountChange?: (count: number) => void;
```

(c) Change the destructuring to

```ts
export function BookingTransactionList({ tripId, bookingId, originalConfirmationNumber = null, refreshKey = 0, onChanged, onCountChange }: BookingTransactionListProps) {
```

(d) Directly after the existing `useEffect(() => { load(); }, [load, refreshKey]);` add:

```ts
  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  useEffect(() => {
    onCountChangeRef.current?.(transactions.length);
  }, [transactions.length]);
```

- [ ] **Step 4: Run** `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx` — Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BookingTransactionList.tsx client/src/__tests__/BookingTransactionList.test.tsx
git commit -m "feat(client): BookingTransactionList reports its transaction count

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 14: `BookingForm` (create + edit)

**Files:**
- Create: `client/src/components/BookingForm.tsx`

Tested through `BookingCard` in Task 16 (the card is the only consumer). This task only adds the component and type-checks it.

- [ ] **Step 1: Implement** `client/src/components/BookingForm.tsx`

```tsx
import { useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Group, Paper, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { bookedTravelers, bookingLabel, flightOptionLabel, sortFlightsByDate } from '../utils/bookingCoverage';

interface BookingFormProps {
  tripId: string;
  elements: TripElement[];
  participants: TripParticipant[];
  bookings: Booking[];
  booking?: Booking;
  defaultElementId?: string;
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}

function parseNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

// Edit mode when `booking` is given; otherwise creates a booking pre-checked for `defaultElementId`.
export function BookingForm({
  tripId, elements, participants, bookings, booking, defaultElementId, onParticipantsChanged, onSaved, onCancel,
}: BookingFormProps) {
  const flights = useMemo(() => sortFlightsByDate(elements), [elements]);
  const [confirmationNumber, setConfirmationNumber] = useState(booking?.confirmationNumber ?? '');
  const [loyaltyProgram, setLoyaltyProgram] = useState(booking?.loyaltyProgram ?? '');
  const [priceCash, setPriceCash] = useState(booking?.advertisedPriceCash != null ? String(booking.advertisedPriceCash) : '');
  const [pricePoints, setPricePoints] = useState(booking?.advertisedPricePoints != null ? String(booking.advertisedPricePoints) : '');
  const [notes, setNotes] = useState(booking?.notes ?? '');
  const [elementIds, setElementIds] = useState<string[]>(
    booking ? booking.elementIds : defaultElementId ? [defaultElementId] : []
  );
  const [travelerIds, setTravelerIds] = useState<string[]>(() => {
    if (booking) return booking.travelerIds;
    const taken = bookedTravelers(bookings, defaultElementId ? [defaultElementId] : []);
    return participants.filter(p => !taken.has(p.id)).map(p => p.id);
  });
  const [newTravelerName, setNewTravelerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taken = bookedTravelers(bookings, elementIds, booking?.id);

  const save = async () => {
    if (elementIds.length === 0) {
      setError('Select at least one flight');
      return;
    }
    if (travelerIds.length === 0 && !newTravelerName.trim()) {
      setError('Select or add at least one traveler');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const ids = [...travelerIds];
      if (newTravelerName.trim()) {
        const created = await tripApi.createParticipant(tripId, { displayName: newTravelerName.trim() });
        onParticipantsChanged([...participants, created]);
        // Keep the new traveler selected and clear the name so a retry doesn't create them twice.
        setTravelerIds(prev => [...prev, created.id]);
        setNewTravelerName('');
        ids.push(created.id);
      }
      const payload = {
        confirmationNumber: confirmationNumber.trim() || null,
        loyaltyProgram: loyaltyProgram.trim() || null,
        advertisedPriceCash: parseNumber(priceCash),
        advertisedPricePoints: parseNumber(pricePoints),
        notes: notes.trim() || null,
        elementIds,
        travelerIds: ids,
      };
      if (booking) {
        await tripApi.updateBooking(tripId, booking.id, payload);
      } else {
        await tripApi.createBooking(tripId, payload);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper withBorder p="sm" mt="xs">
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
        <TextInput label="Confirmation number" value={confirmationNumber} onChange={e => setConfirmationNumber(e.currentTarget.value)} />
        <TextInput label="Loyalty program" value={loyaltyProgram} onChange={e => setLoyaltyProgram(e.currentTarget.value)} />
        <TextInput label="Advertised price per person (cash)" type="number" step="0.01" value={priceCash} onChange={e => setPriceCash(e.currentTarget.value)} />
        <TextInput label="Advertised price per person (points)" type="number" step="1" value={pricePoints} onChange={e => setPricePoints(e.currentTarget.value)} />
      </SimpleGrid>
      <Textarea mt="xs" label="Notes" autosize minRows={1} value={notes} onChange={e => setNotes(e.currentTarget.value)} />

      <Text size="sm" fw={600} mt="sm">Flights</Text>
      <Stack gap={6} mt={4}>
        {flights.map(flight => (
          <Checkbox
            key={flight.id}
            label={flightOptionLabel(flight)}
            checked={elementIds.includes(flight.id)}
            onChange={() => setElementIds(prev => toggle(prev, flight.id))}
          />
        ))}
      </Stack>

      <Text size="sm" fw={600} mt="sm">Travelers</Text>
      <Group gap="sm" mt={4}>
        {participants.map(p => {
          const other = taken.get(p.id);
          const checked = travelerIds.includes(p.id);
          return (
            <Checkbox
              key={p.id}
              label={other ? `${p.displayName} (on ${bookingLabel(other)})` : p.displayName}
              checked={checked}
              disabled={Boolean(other) && !checked}
              onChange={() => setTravelerIds(prev => toggle(prev, p.id))}
            />
          );
        })}
      </Group>
      <TextInput
        mt="xs"
        label="+ New traveler"
        placeholder="Name of traveler not yet on the trip"
        value={newTravelerName}
        onChange={e => setNewTravelerName(e.currentTarget.value)}
      />

      <Group mt="sm" justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={save} loading={saving}>Save booking</Button>
      </Group>
    </Paper>
  );
}
```

- [ ] **Step 2: Client type-check** (Conventions) — Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BookingForm.tsx
git commit -m "feat(client): BookingForm for creating and editing bookings

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 15: `BookingBlock` (read mode, legs, edit, delete)

**Files:**
- Create: `client/src/components/BookingBlock.tsx`

Tested through `BookingCard` in Task 16.

- [ ] **Step 1: Implement** `client/src/components/BookingBlock.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BookingForm } from './BookingForm';
import { BookingTransactionList } from './BookingTransactionList';
import { bookingMoneyLine } from '../utils/bookingSummary';
import { flightDateLabel, sortFlightsByDate } from '../utils/bookingCoverage';
import { formatLegLine } from '../utils/flightLegs';

interface BookingBlockProps {
  tripId: string;
  booking: Booking;
  bookings: Booking[];
  elements: TripElement[];
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey: number;
  onChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

export function BookingBlock({
  tripId, booking, bookings, elements, participants, onParticipantsChanged, refreshKey, onChanged, onEditingChange,
}: BookingBlockProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  useEffect(() => {
    onEditingChangeRef.current(editing);
  }, [editing]);
  useEffect(() => () => onEditingChangeRef.current(false), []);

  const remove = async () => {
    try {
      setDeleting(true);
      setError(null);
      await tripApi.deleteBooking(tripId, booking.id);
      await onChanged();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete booking');
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <BookingForm
        tripId={tripId}
        elements={elements}
        participants={participants}
        bookings={bookings}
        booking={booking}
        onParticipantsChanged={onParticipantsChanged}
        onSaved={async () => {
          setEditing(false);
          await onChanged();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const conf = booking.currentConfirmationNumber;
  const covered = sortFlightsByDate(elements.filter(e => booking.elementIds.includes(e.id)));
  const travelerNames = booking.travelerIds.map(id => participants.find(p => p.id === id)?.displayName ?? 'Unknown traveler');
  const deletePrompt = `Delete ${conf ? `booking ${conf}` : 'this booking'}${
    transactionCount > 0 ? ` and its ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}` : ''
  }?`;

  return (
    <Paper withBorder p="xs" mt="xs">
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Group gap="xs">
          <Text fw={700}>{conf || 'No confirmation number'}</Text>
          {booking.confirmationNumber && booking.confirmationNumber !== conf && (
            <Text size="xs" c="dimmed">{`orig ${booking.confirmationNumber}`}</Text>
          )}
          {travelerNames.map((name, index) => (
            <Badge key={`${name}-${index}`} variant="outline" tt="none" size="sm">{name}</Badge>
          ))}
        </Group>
        <Group gap={2} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            size="lg"
            aria-label="Edit booking"
            onClick={() => {
              setConfirmingDelete(false);
              setError(null);
              setEditing(true);
            }}
          >
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" size="lg" aria-label="Delete booking" onClick={() => setConfirmingDelete(true)}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {confirmingDelete && (
        <Group gap="xs" mt={4}>
          <Text size="sm">{deletePrompt}</Text>
          <Button size="compact-xs" color="red" onClick={remove} loading={deleting}>Confirm</Button>
          <Button size="compact-xs" variant="default" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
        </Group>
      )}

      <Text size="sm" c="dimmed">{bookingMoneyLine(booking)}</Text>

      {covered.length > 0 && (
        <>
          <Text size="xs" c="dimmed" mt={2}>
            {`Covers: ${covered.map(f => (flightDateLabel(f) ? `${f.name} (${flightDateLabel(f)})` : f.name)).join(' · ')}`}
          </Text>
          <Stack gap={0} pl="sm" mt={2}>
            {covered.flatMap(f => f.legs ?? []).map(leg => (
              <Text key={leg.id} size="xs">{formatLegLine(leg)}</Text>
            ))}
          </Stack>
        </>
      )}

      <BookingTransactionList
        tripId={tripId}
        bookingId={booking.id}
        originalConfirmationNumber={booking.confirmationNumber}
        refreshKey={refreshKey}
        onChanged={onChanged}
        onCountChange={setTransactionCount}
      />
    </Paper>
  );
}
```

- [ ] **Step 2: Client type-check** (Conventions) — Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BookingBlock.tsx
git commit -m "feat(client): BookingBlock with covered legs, edit and delete

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 16: `BookingCard` container + `TripDetailPage` wiring

**Files:**
- Rewrite: `client/src/components/BookingCard.tsx`
- Modify: `client/src/pages/TripDetailPage.tsx`
- Rewrite test: `client/src/__tests__/BookingCard.test.tsx`
- Modify test: `client/src/__tests__/TripDetailPage.test.tsx` (BookingCard mock + wiring test)

- [ ] **Step 1: Rewrite the test** `client/src/__tests__/BookingCard.test.tsx` with:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { Booking, TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    createBooking: vi.fn(),
    updateBooking: vi.fn(),
    deleteBooking: vi.fn(),
    createParticipant: vi.fn(),
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { BookingCard } from '../components/BookingCard';

const api = tripApi as any;

const leg = (id: string, elementId: string, from: string, dep: string, to: string, arr: string, code: [string, string]) => ({
  id, elementId, legOrder: 1, departureAirport: from, departureDatetime: dep, arrivalAirport: to, arrivalDatetime: arr,
  airline: code[0], flightNumber: code[1], createdAt: '', updatedAt: '',
});

const elements: TripElement[] = [
  {
    id: 'el-1', tripId: 'trip-1', elementType: 'flight', name: 'DEN → MCO', sortPosition: 0, createdAt: '', updatedAt: '',
    legs: [
      leg('l1', 'el-1', 'DEN', '2026-08-29T08:00', 'DAL', '2026-08-29T10:00', ['WN', '1234']),
      leg('l2', 'el-1', 'DAL', '2026-08-29T11:30', 'MCO', '2026-08-29T15:05', ['WN', '567']),
    ],
  },
  {
    id: 'el-2', tripId: 'trip-1', elementType: 'flight', name: 'MCO → DEN', sortPosition: 1, createdAt: '', updatedAt: '',
    legs: [leg('l3', 'el-2', 'MCO', '2026-09-05T18:00', 'DEN', '2026-09-05T20:10', ['WN', '890'])],
  },
  { id: 'h-1', tripId: 'trip-1', elementType: 'hotel', name: 'Diamante', sortPosition: 2, createdAt: '', updatedAt: '' },
];

const participants: TripParticipant[] = [
  { id: 'p1', tripId: 'trip-1', displayName: 'Alice', createdAt: '' },
  { id: 'p2', tripId: 'trip-1', displayName: 'Bob', createdAt: '' },
  { id: 'p3', tripId: 'trip-1', displayName: 'Carol', createdAt: '' },
];

function makeBooking(extra: Partial<Booking> = {}): Booking {
  return {
    id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 412, advertisedPricePoints: null,
    loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
    elementIds: ['el-1', 'el-2'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
    ...extra,
  };
}

const b1 = makeBooking();
const b2 = makeBooking({ id: 'b2', confirmationNumber: 'XYZ999', currentConfirmationNumber: 'XYZ999', elementIds: ['el-2'], travelerIds: ['p2'] });

function renderCard(props: Partial<React.ComponentProps<typeof BookingCard>> = {}) {
  const handlers = {
    onBookingsChanged: vi.fn(),
    onParticipantsChanged: vi.fn(),
    onEditingChange: vi.fn(),
  };
  renderWithMantine(
    <BookingCard
      tripId="trip-1"
      elementId="el-1"
      elements={elements}
      participants={participants}
      bookings={[b1, b2]}
      refreshKey={0}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

const checkbox = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

describe('BookingCard', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.resetAllMocks();
    api.listBookingTransactions.mockResolvedValue([]);
    api.createBooking.mockResolvedValue({});
    api.updateBooking.mockResolvedValue({});
    api.deleteBooking.mockResolvedValue(undefined);
  });

  it('shows only this flight\'s bookings with what they cover and every leg', async () => {
    renderCard();
    expect(screen.getByText('ABC123')).toBeTruthy();
    expect(screen.queryByText('XYZ999')).toBeNull();
    expect(screen.getByText('Covers: DEN → MCO (Aug 29) · MCO → DEN (Sep 5)')).toBeTruthy();
    expect(screen.getByText('WN1234 · DEN 8:00a → DAL 10:00a')).toBeTruthy();
    expect(screen.getByText('WN567 · DAL 11:30a → MCO 3:05p')).toBeTruthy();
    expect(screen.getByText('WN890 · MCO 6:00p → DEN 8:10p')).toBeTruthy();
    await screen.findAllByText(/no transactions yet/i);
  });

  it('lists travelers not booked on this flight', async () => {
    renderCard();
    expect(screen.getByText('Not booked: Bob, Carol')).toBeTruthy();
    await screen.findAllByText(/no transactions yet/i);
  });

  it('creates a booking with smart defaults and blocks already-booked travelers', async () => {
    const user = userEvent.setup();
    const { onBookingsChanged, onEditingChange } = renderCard();
    await user.click(screen.getByRole('button', { name: '+ Booking' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);

    expect(checkbox('DEN → MCO · Aug 29 · 2 legs').checked).toBe(true);
    expect(checkbox('MCO → DEN · Sep 5 · 1 leg').checked).toBe(false);
    expect(screen.queryByLabelText(/Diamante/)).toBeNull();
    expect(checkbox('Alice (on ABC123)').disabled).toBe(true);
    expect(checkbox('Alice (on ABC123)').checked).toBe(false);
    expect(checkbox('Bob').checked).toBe(true);
    expect(checkbox('Carol').checked).toBe(true);

    await user.type(screen.getByLabelText('Confirmation number'), 'NEW1');
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    await waitFor(() => expect(api.createBooking).toHaveBeenCalledWith('trip-1', {
      confirmationNumber: 'NEW1', loyaltyProgram: null, advertisedPriceCash: null, advertisedPricePoints: null, notes: null,
      elementIds: ['el-1'], travelerIds: ['p2', 'p3'],
    }));
    expect(onBookingsChanged).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save booking' })).toBeNull());
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });

  it('marks a checked traveler who is booked on another selected flight', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: '+ Booking' }));
    await user.click(checkbox('MCO → DEN · Sep 5 · 1 leg'));
    const bob = checkbox('Bob (on XYZ999)');
    expect(bob.checked).toBe(true);
    expect(bob.disabled).toBe(false);
  });

  it('edits a booking in place and saves flights and travelers in one call', async () => {
    const user = userEvent.setup();
    const { onBookingsChanged } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Edit booking' }));

    expect((screen.getByLabelText('Confirmation number') as HTMLInputElement).value).toBe('ABC123');
    expect(checkbox('Alice').checked).toBe(true);
    expect(checkbox('Alice').disabled).toBe(false);
    expect(checkbox('Bob (on XYZ999)').disabled).toBe(true);

    await user.click(checkbox('MCO → DEN · Sep 5 · 1 leg'));
    expect(checkbox('Bob').disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Save booking' }));

    await waitFor(() => expect(api.updateBooking).toHaveBeenCalledWith('trip-1', 'b1', expect.objectContaining({
      confirmationNumber: 'ABC123', advertisedPriceCash: 412, elementIds: ['el-1'], travelerIds: ['p1'],
    })));
    expect(onBookingsChanged).toHaveBeenCalled();
  });

  it('shows a conflict from the server inline and keeps the form open', async () => {
    const user = userEvent.setup();
    api.updateBooking.mockRejectedValue(new Error('Alice is already on booking XYZ999 for MCO → DEN'));
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Edit booking' }));
    await user.click(screen.getByRole('button', { name: 'Save booking' }));
    expect(await screen.findByText('Alice is already on booking XYZ999 for MCO → DEN')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save booking' })).toBeTruthy();
  });

  it('deletes a booking after confirming, naming its transactions', async () => {
    const user = userEvent.setup();
    api.listBookingTransactions.mockResolvedValue([
      { id: 't1', bookingId: 'b1', amountCash: 400, amountPoints: 0, transactionDate: '2026-01-01', confirmationNumber: null, notes: null, createdAt: '' },
      { id: 't2', bookingId: 'b1', amountCash: 12, amountPoints: 0, transactionDate: '2026-01-02', confirmationNumber: null, notes: null, createdAt: '' },
    ]);
    const { onBookingsChanged } = renderCard();
    await screen.findByText('$400.00');
    await user.click(screen.getByRole('button', { name: 'Delete booking' }));
    expect(screen.getByText('Delete booking ABC123 and its 2 transactions?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.deleteBooking).toHaveBeenCalledWith('trip-1', 'b1'));
    expect(onBookingsChanged).toHaveBeenCalled();
  });

  it('creates a new traveler once even when saving is retried', async () => {
    const user = userEvent.setup();
    api.createParticipant.mockResolvedValue({ id: 'p4', tripId: 'trip-1', displayName: 'Dave', createdAt: '' });
    api.createBooking.mockRejectedValueOnce(new Error('Network down')).mockResolvedValueOnce({});
    const { onParticipantsChanged } = renderCard();
    await user.click(screen.getByRole('button', { name: '+ Booking' }));
    await user.type(screen.getByLabelText('+ New traveler'), 'Dave');
    await user.click(screen.getByRole('button', { name: 'Save booking' }));
    expect(await screen.findByText('Network down')).toBeTruthy();
    expect(onParticipantsChanged).toHaveBeenCalledWith([...participants, expect.objectContaining({ id: 'p4' })]);

    await user.click(screen.getByRole('button', { name: 'Save booking' }));
    await waitFor(() => expect(api.createBooking).toHaveBeenCalledTimes(2));
    expect(api.createParticipant).toHaveBeenCalledTimes(1);
    expect(api.createBooking.mock.calls[1][1].travelerIds).toEqual(['p2', 'p3', 'p4']);
  });

  it('shows an empty message when the flight has no bookings', () => {
    renderCard({ bookings: [b2] });
    expect(screen.getByText('No bookings yet for this flight')).toBeTruthy();
    expect(screen.getByText('Not booked: Alice, Bob, Carol')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run client/src/__tests__/BookingCard.test.tsx` — Expected: FAIL (old `BookingCard` fetches its own bookings and has no edit/delete).

- [ ] **Step 3: Rewrite** `client/src/components/BookingCard.tsx`

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { BookingBlock } from './BookingBlock';
import { BookingForm } from './BookingForm';
import { unbookedTravelers } from '../utils/bookingCoverage';

interface BookingCardProps {
  tripId: string;
  elementId: string;
  elements: TripElement[];
  participants: TripParticipant[];
  bookings: Booking[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey?: number;
  onBookingsChanged: () => Promise<void> | void;
  onEditingChange?: (editing: boolean) => void;
}

// Bookings tab for one flight. `bookings` is the whole trip's list (needed for conflict hints).
export function BookingCard({
  tripId, elementId, elements, participants, bookings, onParticipantsChanged, refreshKey = 0, onBookingsChanged, onEditingChange,
}: BookingCardProps) {
  const [creating, setCreating] = useState(false);
  const [editingIds, setEditingIds] = useState<string[]>([]);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const anyEditing = creating || editingIds.length > 0;
  useEffect(() => {
    onEditingChangeRef.current?.(anyEditing);
  }, [anyEditing]);
  useEffect(() => () => onEditingChangeRef.current?.(false), []);

  const setBlockEditing = useCallback((bookingId: string, editing: boolean) => {
    setEditingIds(prev => {
      if (editing) return prev.includes(bookingId) ? prev : [...prev, bookingId];
      return prev.filter(id => id !== bookingId);
    });
  }, []);

  const mine = bookings.filter(b => b.elementIds.includes(elementId));
  const unbooked = unbookedTravelers(bookings, elementId, participants);

  return (
    <div>
      <Group justify="flex-end">
        {!creating && (
          <Button size="compact-sm" variant="light" onClick={() => setCreating(true)}>+ Booking</Button>
        )}
      </Group>
      {unbooked.length > 0 && (
        <Text size="xs" c="dimmed" ta="right" mt={4}>
          {`Not booked: ${unbooked.map(p => p.displayName).join(', ')}`}
        </Text>
      )}

      {creating && (
        <BookingForm
          tripId={tripId}
          elements={elements}
          participants={participants}
          bookings={bookings}
          defaultElementId={elementId}
          onParticipantsChanged={onParticipantsChanged}
          onSaved={async () => {
            setCreating(false);
            await onBookingsChanged();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {mine.length === 0 && !creating && (
        <Text size="sm" c="dimmed" mt="xs">No bookings yet for this flight</Text>
      )}

      {mine.map(booking => (
        <BookingBlock
          key={booking.id}
          tripId={tripId}
          booking={booking}
          bookings={bookings}
          elements={elements}
          participants={participants}
          onParticipantsChanged={onParticipantsChanged}
          refreshKey={refreshKey}
          onChanged={onBookingsChanged}
          onEditingChange={editing => setBlockEditing(booking.id, editing)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run client/src/__tests__/BookingCard.test.tsx` — Expected: PASS (9 tests).

- [ ] **Step 5: Wire `TripDetailPage`.** In `client/src/pages/TripDetailPage.tsx`:

(a) After `const [editingDetails, setEditingDetails] = useState(false);` add:

```ts
  const [editingBookings, setEditingBookings] = useState(false);
```

(b) Delete the effect

```ts
  useEffect(() => {
    if (!tripId || bookingsVersion === 0) return;
    tripApi.listBookings(tripId).then(setBookings).catch(() => undefined);
  }, [tripId, bookingsVersion]);
```

and add after the `reload` callback:

```ts
  // Bumping bookingsVersion makes each booking's transaction list refetch too.
  const reloadBookings = useCallback(async () => {
    if (!tripId) return;
    try {
      setBookings(await tripApi.listBookings(tripId));
      setBookingsVersion(v => v + 1);
    } catch (err) {
      setReloadError(err instanceof Error ? err.message : 'Failed to reload bookings');
    }
  }, [tripId]);
```

(c) Change `swipeEnabled={!editingDetails}` to

```tsx
          swipeEnabled={!editingDetails && !editingBookings}
```

(d) Replace the `<BookingCard … />` element with:

```tsx
                <BookingCard
                  tripId={tripId}
                  elementId={selected.id}
                  elements={elements}
                  participants={participants}
                  bookings={bookings}
                  onParticipantsChanged={handleParticipantsFromBooking}
                  refreshKey={bookingsVersion}
                  onBookingsChanged={reloadBookings}
                  onEditingChange={setEditingBookings}
                />
```

- [ ] **Step 6: Update the BookingCard mock and add a wiring test in `TripDetailPage.test.tsx`.** Replace the BookingCard mock with:

```tsx
vi.mock('../components/BookingCard', () => ({
  BookingCard: ({ elementId, bookings, onBookingsChanged }: { elementId: string; bookings: any[]; onBookingsChanged: () => void }) => (
    <div>
      booking card {elementId}
      <span>{`${bookings.length} trip bookings`}</span>
      <button type="button" onClick={() => onBookingsChanged()}>mock bookings changed</button>
    </div>
  ),
}));
```

Add this test after `'opens a dialog with Details, Bookings and Seats tabs'`:

```tsx
  it('passes trip bookings to the Bookings tab and reloads them on change', async () => {
    const user = userEvent.setup();
    const booking = {
      id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC', advertisedPriceCash: null, advertisedPricePoints: null, loyaltyProgram: null,
      notes: null, createdAt: '', updatedAt: '', elementIds: ['el-7'], travelerIds: [], currentConfirmationNumber: 'ABC', actualTotalCash: 0, actualTotalPoints: 0,
    };
    api.listElements.mockResolvedValue([twoLegFlight()]);
    api.listBookings.mockResolvedValue([booking]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open DEN → DAL → SJD' }));
    const dialog = await screen.findByRole('dialog', { name: 'DEN → DAL → SJD' });
    await user.click(within(dialog).getByRole('tab', { name: /Bookings/ }));
    expect(await within(dialog).findByText('1 trip bookings')).toBeTruthy();

    api.listBookings.mockResolvedValue([booking, { ...booking, id: 'b2' }]);
    await user.click(within(dialog).getByRole('button', { name: 'mock bookings changed' }));
    expect(await within(dialog).findByText('2 trip bookings')).toBeTruthy();
  });
```

- [ ] **Step 7: Run** `npx vitest run client/src/__tests__/TripDetailPage.test.tsx client/src/__tests__/BookingCard.test.tsx client/src/__tests__/BookingTransactionList.test.tsx` — Expected: all PASS.

- [ ] **Step 8: Client type-check** (Conventions) — Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/BookingCard.tsx client/src/pages/TripDetailPage.tsx client/src/__tests__/BookingCard.test.tsx client/src/__tests__/TripDetailPage.test.tsx
git commit -m "feat(client): editable, deletable bookings with coverage hints; page owns bookings list

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 17: Dead CSS and usage docs

**Files:**
- Modify: `client/src/styles/trips.css` (~lines 67-97)
- Modify: `client/src/APIUsage.md` (~lines 103-116)
- Modify: `client/src/components/ComponentUsage.md` (FlightDetailsTab, AddElementDialog, BookingCard, BookingTransactionList, FlightLegsEditor sections)

- [ ] **Step 1: Confirm the leg-editor classes are unused**

```bash
grep -rn "flight-legs-editor\|flight-leg-row\|flight-lookup-status\|flight-layover" client/src --include=*.tsx --include=*.ts
```
Expected: no output.

- [ ] **Step 2: Delete these rules** from `client/src/styles/trips.css`: `.flight-legs-editor { … }`, `.flight-leg-row { … }`, `.flight-leg-row h5, .flight-lookup-status { … }`, `.flight-lookup-status.empty, .flight-lookup-status.error { … }`, `.flight-layover { … }`. Keep `.create-element-field` and `.view-toggle-btn` (still used by `TripParticipantsPanel` / `FlightSeatGrid`).

- [ ] **Step 3: Update `client/src/APIUsage.md`.** Replace the block from `` - `createElement`: `` through the `listBookingTransactions…` entry with:

```markdown
- `createElement`:
  - client/src/components/AddElementDialog.tsx (flight `name` omitted; the server titles flights from their legs)
- `updateElement` (notes only, `null` clears), `deleteElement`:
  - client/src/components/FlightDetailsTab.tsx
- `syncLegs`:
  - client/src/components/FlightLegList.tsx (inline add/edit/delete of a leg sends the full leg list)
- `lookupFlightAutofill`:
  - client/src/components/FlightLegForm.tsx
- `createParticipant`, `updateParticipant`, `deleteParticipant`:
  - client/src/components/TripParticipantsPanel.tsx (rendered in the `TripTravelersStrip` Manage modal)
  - client/src/components/BookingForm.tsx (inline "+ New traveler" creation)
- `listBookings`:
  - client/src/pages/TripDetailPage.tsx (trip-wide list passed to `BookingCard`)
- `createBooking`, `updateBooking` (scalars + full `elementIds`/`travelerIds` replacement; 409 on traveler conflicts):
  - client/src/components/BookingForm.tsx
- `deleteBooking`:
  - client/src/components/BookingBlock.tsx
- `getBooking`, `linkBookingElement`, `unlinkBookingElement`, `addBookingTraveler`, `removeBookingTraveler`:
  - not used by the UI (kept for API completeness)
- `listBookingTransactions`, `addBookingTransaction`, `updateBookingTransaction`, `deleteBookingTransaction`:
  - client/src/components/BookingTransactionList.tsx (rendered inside `BookingBlock.tsx`)
```

- [ ] **Step 4: Update `client/src/components/ComponentUsage.md`.**

Replace the FlightDetailsTab description line `Read-only flight details with edit mode and delete.` with:

```markdown
Flight legs via `FlightLegList` (inline per-leg edit/add/delete), click-to-edit notes, and delete flight. Reports editing state so tab swipe is disabled while a form is open.
```

Replace the AddElementDialog description `Create-flight form in a modal.` with:

```markdown
Create-flight modal: `FlightLegsEditor` + notes. No name field — the server titles flights `FIRST → LAST`.
```

Replace the whole `### BookingCard` and `### BookingTransactionList` sections with:

```markdown
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

Read-mode booking: confirmation (and original), traveler chips, money line, "Covers:" flights and every covered leg, edit (swaps to `BookingForm`) and delete with a confirm naming the transaction count. Renders `BookingTransactionList`.

### BookingTransactionList
**Used in:**
  - `BookingBlock` (only consumer)

Lists/add/removes transactions for a single booking; supports recording price-drop rebookings (negative amount + new confirmation number) and free-text fee/tax breakdown notes. Reports its transaction count via `onCountChange`.
```

Replace the whole `### FlightLegsEditor` section with:

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add client/src/styles/trips.css client/src/APIUsage.md client/src/components/ComponentUsage.md
git commit -m "docs: usage maps for booking and leg editing; drop dead leg-editor CSS

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 18: Final verification

No code changes unless a check fails (then fix, re-run, and commit the fix separately).

- [ ] **Step 1: Targeted tests**

```bash
npx vitest run server/utils/flightTitle.test.ts server/repositories/bookingRepository.test.ts server/repositories/tripElementRepository.test.ts \
  client/src/__tests__/tripApi.test.ts client/src/__tests__/flightLegs.test.ts client/src/__tests__/tripFormat.test.ts \
  client/src/__tests__/FlightLegForm.test.tsx client/src/__tests__/FlightLegsEditor.test.tsx client/src/__tests__/FlightLegList.test.tsx \
  client/src/__tests__/bookingCoverage.test.ts client/src/__tests__/BookingTransactionList.test.tsx client/src/__tests__/BookingCard.test.tsx \
  client/src/__tests__/TripDetailPage.test.tsx client/src/__tests__/flightRows.test.ts client/src/__tests__/FlightsSection.test.tsx \
  client/src/__tests__/ElementDialog.test.tsx client/src/__tests__/bookingSummary.test.ts client/src/__tests__/FlightSeatGrid.test.tsx
```
Expected: all PASS.

- [ ] **Step 2: Full suite** — `npx vitest run 2>&1 | tail -15`. Expected: the only failures are the 12 known `no such table: families` ones (compare the failing file list with the baseline; no new failing files).

- [ ] **Step 3: Both type-checks** (Conventions) — Expected: no output from either.

- [ ] **Step 4: Migration applied on the dev DB.** The running `tsx watch` server restarts on server-file changes and runs pending migrations. Confirm:

```bash
grep -c "20261108_01_backfill_flight_titles" data/migrations.json
node -e "
const sqlite=require('sqlite'),sqlite3=require('sqlite3');
(async()=>{const db=await sqlite.open({filename:'data/travel-list.sqlite',driver:sqlite3.Database,mode:sqlite3.OPEN_READONLY});
console.log(await db.all(\"select name from trip_elements where trip_id='b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6' and element_type='flight' and deleted_at is null order by name\"));})()"
```
Expected: `1`, and names include `DEN → SJD` and `Home` (no `Wn0722`, no `DEN → PHX → SJD`). If the count is `0`, check the API is up with `curl -s localhost:3001/api/health`; if it is up but the migration has not run, stop and ask the user before restarting the dev server (never kill it yourself).

- [ ] **Step 5: Playwright smoke** (dev server on :3000, login `uitester` / `UiTest123!`). Copy the helper and write a script in `/config/workspace/shots/` (not `/tmp`):

```bash
mkdir -p /config/workspace/shots && cp /tmp/lib.cjs /config/workspace/shots/lib.cjs 2>/dev/null || true
```

Script `/config/workspace/shots/booking-leg-smoke.cjs` must, for viewports 1440×900 and 390×844:
1. Log in, open `http://localhost:3000/trips/b2673ac5-3d9f-48cc-a5f4-ba7198dbbfa6`.
2. Open the first `DEN → SJD` flight; screenshot the Details tab (`details-<w>.png`).
3. Click `Edit leg 1`; screenshot (`leg-edit-<w>.png`); click `Cancel`.
4. Switch to the Bookings tab; screenshot (`bookings-<w>.png`); click the first `Edit booking`; screenshot (`booking-edit-<w>.png`); click `Cancel`.
5. On each screen assert `document.documentElement.scrollWidth <= window.innerWidth` and that no modal content overflows horizontally (`[role=dialog] .mantine-Modal-body` `scrollWidth <= clientWidth`).
Do **not** save any edits to the dev data. View the screenshots and check: two-column leg form at 390px, chip row fits, ✏️/🗑 icons aligned, "Covers:" and leg lines readable.

- [ ] **Step 6: Report** the results (tests, type-checks, migration, screenshots) and note: the pre-existing Cabo conflict (one traveler on both `Asdfsa` and `ABC123` for the same flights) will make editing those two bookings' flights/travelers return the 409 message until one booking drops that traveler.
