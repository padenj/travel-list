# Lodging Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track hotel/lodging stays on a trip. Each stay has location and check-in/out details, and one or more rooms. Each room is a booking with advertised vs. actual price (cash/points), Expedia itinerary + hotel confirmation, room type/beds, amenities, cancellation policy/deadline, coupons and notes.

**Architecture:** A stay is a `trip_elements` row (`element_type='hotel'`) with a rebuilt `hotel_element_details` side table. A room is a `bookings` row linked to exactly one stay via `booking_links`, plus a `lodging_room_details` side table and a `booking_coupons` table. Prices and payments reuse the existing booking/transaction machinery. The client adds a Lodging section, an Add menu, an Add-lodging dialog, and stay dialog tabs (Details / Rooms).

**Tech Stack:** Node + Express + sqlite (`sqlite`/`sqlite3`), TypeScript, React 18 + Mantine v8, Vitest + Testing Library, supertest.

**Spec:** `docs/superpowers/specs/2026-11-24-lodging-tracking-design.md`. Read it first; it is the source of truth when this plan is ambiguous.

---

## Ground rules (read before Task 1)

- Work in `/config/.paseo/worktrees/0zd8zt0o/large-falcon` on branch `add-hotel-lodging-tracking`.
- Dependencies are not installed in this worktree. Install them first: `npm ci && npm --prefix client ci` (or `npm install` if `ci` fails).
- Don't mark required inputs with Mantine's `required`/`withAsterisk` props. They add " *" to the label text and break `getByLabelText('Hotel name')`; validation messages enforce required fields instead.
- Type checks: `npx tsc -p client/tsconfig.json --noEmit` and `npx tsc -p tsconfig.build.json --noEmit` (the server has no `server/tsconfig.json`).
- Tests: `npx vitest --run <file> [<file>...]`.
- **Every new test file must be added to the `include` whitelist in `vitest.config.ts`**, or vitest will silently not run it. Add each new test file in the same step that creates it.
- The repo is ESM (`"type": "module"`), so migrations are `.cjs` with `module.exports = { up, down }`.
- Every commit message ends with a blank line and then `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Before writing code in a file, read that file. Line numbers below are approximate.
- Client component tests use `renderWithMantine` from `client/src/test-utils/renderWithMantine.tsx` and `vi.mock('../api/tripApi')` (path relative to the test). Mirror the existing tests in `client/src/__tests__/` (for example `BookingForm.test.tsx` and `FlightsSection.test.tsx`, if present; `ls client/src/__tests__` first).
- Server route tests mirror `server/__tests__/trips.routes.test.ts`: express + supertest, `seedFamilyTrip()` from `server/test-utils/destinationFixtures.ts`, and an auth header from `generateToken(dadRow)`. Read that file before writing route tests.
- Patterns to mirror on the client are flights: `FlightsSection.tsx` (+ `.module.css`), `ElementDialog.tsx`, `BookingBlock.tsx`, `BookingForm.tsx`, `BookingCard.tsx`, `AddElementDialog.tsx`, `FlightDetailsTab.tsx`, `BookingTransactionList.tsx`, `utils/flightRows.ts`, `utils/bookingCoverage.ts`, `utils/tripDates.ts`, `utils/money.ts`. Read them before building the lodging equivalents, and reuse their helpers (`formatPrice`, `formatMoney`, `nightsBetween`, `bookedTravelers`, `bookingLabel`) instead of copying them.

## File map

**Server: create**
- `server/migrations/migrations/20261124_01_lodging.cjs`: the schema migration.
- `server/utils/lodgingValidation.ts`: enums and validation for stay, room and coupons.
- `server/utils/lodgingValidation.test.ts`
- `server/__tests__/lodging-migration.test.ts`
- `server/__tests__/lodging.routes.test.ts`

**Server: modify**
- `server/db.ts`: the trips schema block (bookings, hotel_element_details, new tables, indexes).
- `server/repositories/tripElementRepository.ts` (+ `.test.ts`): hotel create, hydrate and update.
- `server/repositories/bookingRepository.ts` (+ `.test.ts`): new columns, room and coupons.
- `server/services/tripListService.ts`: clear `destination_id` when a destination is deleted.
- `server/routes/tripRoutes.ts`: hotel validation, the booking-kind rule, and travelers optional for hotel bookings.

**Client: create**
- `client/src/utils/lodging.ts` (+ `client/src/__tests__/lodging.test.ts`)
- `client/src/utils/stayDraft.ts`, `client/src/utils/roomDraft.ts` (+ `client/src/__tests__/lodgingDrafts.test.ts`)
- `client/src/utils/lodgingRows.ts` (+ `client/src/__tests__/lodgingRows.test.ts`)
- `client/src/components/AddMenu.tsx`
- `client/src/components/LodgingStayForm.tsx`, `AddLodgingDialog.tsx`
- `client/src/components/LodgingDetailsTab.tsx`
- `client/src/components/BedsEditor.tsx`, `CouponsEditor.tsx`, `RoomForm.tsx`
- `client/src/components/RoomBlock.tsx`, `LodgingRoomsTab.tsx`
- `client/src/components/LodgingSection.tsx` + `LodgingSection.module.css`
- Tests: `client/src/__tests__/AddLodgingDialog.test.tsx`, `LodgingDetailsTab.test.tsx`, `RoomForm.test.tsx`, `LodgingRoomsTab.test.tsx`, `LodgingSection.test.tsx`

**Client: modify**
- `client/src/types/trip.ts`, `client/src/api/tripApi.ts`
- `client/src/components/TripHeader.tsx`, `ElementDialog.tsx`
- `client/src/pages/TripDetailPage.tsx` (+ `client/src/__tests__/TripDetailPage.test.tsx`)

**Docs:** `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`, `docs/ServerAPIUsage.md`.

---

### Task 1: Migration and schema

**Files:**
- Create: `server/migrations/migrations/20261124_01_lodging.cjs`
- Modify: `server/db.ts` (trips SCHEMA block: `bookings` ~355, `hotel_element_details` ~408, indexes ~450–469)
- Test: `server/__tests__/lodging-migration.test.ts` (add to the `vitest.config.ts` include)

- [ ] **Step 1: Write the failing test**

Read `server/__tests__/trips-schema-fix-migration.test.ts` first, and copy its way of opening a raw in-memory db and requiring a `.cjs` migration (`createRequire`). Then write:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const migration = require(path.resolve(__dirname, '../migrations/migrations/20261124_01_lodging.cjs'));

async function legacyDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE trip_destinations (id TEXT PRIMARY KEY);
    CREATE TABLE trip_elements (id TEXT PRIMARY KEY, trip_id TEXT, element_type TEXT, name TEXT, notes TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, trip_id TEXT, current_confirmation TEXT,
      advertised_price_cash REAL, advertised_price_points INTEGER);
    CREATE TABLE hotel_element_details (
      element_id TEXT PRIMARY KEY, address TEXT, check_in_date TEXT, check_out_date TEXT,
      room_type TEXT, booking_source TEXT, advertised_price_cash REAL, advertised_price_points INTEGER,
      advertised_loyalty_program TEXT, created_at TEXT, updated_at TEXT);
    INSERT INTO trip_elements VALUES ('h1','t1','hotel','Hotel A',NULL);
    INSERT INTO hotel_element_details VALUES ('h1','1 Main St','2027-01-01','2027-01-03','king','expedia',500,NULL,NULL,'2026-01-01','2026-01-02');
  `);
  return db;
}

async function columns(db: Database, table: string): Promise<string[]> {
  return (await db.all(`PRAGMA table_info(${table})`)).map((c: any) => c.name);
}

describe('20261124_01_lodging migration', () => {
  let db: Database;
  beforeEach(async () => { db = await legacyDb(); });

  it('adds booking columns, rebuilds hotel details and creates room/coupon tables', async () => {
    await migration.up({ db });
    expect(await columns(db, 'bookings')).toEqual(
      expect.arrayContaining(['booking_site', 'site_itinerary_number', 'advertised_includes_taxes']));
    const hotelCols = await columns(db, 'hotel_element_details');
    expect(hotelCols).toEqual(expect.arrayContaining(
      ['element_id', 'address', 'phone', 'website', 'check_in_date', 'check_in_time',
       'check_out_date', 'check_out_time', 'destination_id', 'created_at', 'updated_at']));
    expect(hotelCols).not.toContain('room_type');
    expect(hotelCols).not.toContain('advertised_price_cash');
    const row = await db.get('SELECT * FROM hotel_element_details WHERE element_id = ?', ['h1']);
    expect(row).toMatchObject({ address: '1 Main St', check_in_date: '2027-01-01', check_out_date: '2027-01-03', created_at: '2026-01-01' });
    expect(await columns(db, 'lodging_room_details')).toEqual(expect.arrayContaining(
      ['booking_id', 'room_type', 'beds', 'room_description', 'amenities', 'other_amenities',
       'refundability', 'cancel_by', 'cancellation_policy']));
    expect(await columns(db, 'booking_coupons')).toEqual(expect.arrayContaining(
      ['id', 'booking_id', 'code', 'savings_cash', 'savings_points', 'notes', 'position']));
  });

  it('is idempotent', async () => {
    await migration.up({ db });
    await expect(migration.up({ db })).resolves.not.toThrow();
    expect(await db.get('SELECT COUNT(*) AS n FROM hotel_element_details')).toEqual({ n: 1 });
  });

  it('down reverses the booking columns and new tables', async () => {
    await migration.up({ db });
    await migration.down({ db });
    expect(await columns(db, 'bookings')).not.toContain('booking_site');
    const tables = (await db.all(`SELECT name FROM sqlite_master WHERE type='table'`)).map((t: any) => t.name);
    expect(tables).not.toContain('lodging_room_details');
    expect(tables).not.toContain('booking_coupons');
  });
});
```

If the existing migration test uses a different import style (for example `fileURLToPath` instead of `__dirname`), use that style.

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest --run server/__tests__/lodging-migration.test.ts`
Expected: FAIL (the migration module is not found).

- [ ] **Step 3: Write the migration**

```js
// server/migrations/migrations/20261124_01_lodging.cjs
async function columnNames(db, table) {
  const rows = await db.all(`PRAGMA table_info(${table})`);
  return rows.map(r => r.name);
}

async function up({ db }) {
  await db.exec('BEGIN');
  try {
    const bookingCols = await columnNames(db, 'bookings');
    if (!bookingCols.includes('booking_site')) await db.exec('ALTER TABLE bookings ADD COLUMN booking_site TEXT');
    if (!bookingCols.includes('site_itinerary_number')) await db.exec('ALTER TABLE bookings ADD COLUMN site_itinerary_number TEXT');
    if (!bookingCols.includes('advertised_includes_taxes')) {
      await db.exec('ALTER TABLE bookings ADD COLUMN advertised_includes_taxes INTEGER NOT NULL DEFAULT 0');
    }

    const hotelCols = await columnNames(db, 'hotel_element_details');
    if (!hotelCols.includes('destination_id')) {
      await db.exec(`
        CREATE TABLE hotel_element_details_new (
          element_id TEXT PRIMARY KEY REFERENCES trip_elements(id) ON DELETE CASCADE,
          address TEXT,
          phone TEXT,
          website TEXT,
          check_in_date TEXT,
          check_in_time TEXT,
          check_out_date TEXT,
          check_out_time TEXT,
          destination_id TEXT REFERENCES trip_destinations(id),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
      if (hotelCols.length > 0) {
        await db.exec(`
          INSERT INTO hotel_element_details_new (element_id, address, check_in_date, check_out_date, created_at, updated_at)
          SELECT element_id, address, check_in_date, check_out_date, created_at, updated_at FROM hotel_element_details`);
        await db.exec('DROP TABLE hotel_element_details');
      }
      await db.exec('ALTER TABLE hotel_element_details_new RENAME TO hotel_element_details');
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS lodging_room_details (
        booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
        room_type TEXT,
        beds TEXT,
        room_description TEXT,
        amenities TEXT,
        other_amenities TEXT,
        refundability TEXT,
        cancel_by TEXT,
        cancellation_policy TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS booking_coupons (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        savings_cash REAL,
        savings_points INTEGER,
        notes TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_booking_coupons_booking ON booking_coupons(booking_id);
    `);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

async function down({ db }) {
  await db.exec('BEGIN');
  try {
    await db.exec('DROP INDEX IF EXISTS idx_booking_coupons_booking');
    await db.exec('DROP TABLE IF EXISTS booking_coupons');
    await db.exec('DROP TABLE IF EXISTS lodging_room_details');
    const bookingCols = await columnNames(db, 'bookings');
    for (const col of ['booking_site', 'site_itinerary_number', 'advertised_includes_taxes']) {
      if (bookingCols.includes(col)) await db.exec(`ALTER TABLE bookings DROP COLUMN ${col}`);
    }
    const hotelCols = await columnNames(db, 'hotel_element_details');
    if (hotelCols.includes('destination_id')) {
      await db.exec(`
        CREATE TABLE hotel_element_details_old (
          element_id TEXT PRIMARY KEY REFERENCES trip_elements(id) ON DELETE CASCADE,
          address TEXT,
          check_in_date TEXT,
          check_out_date TEXT,
          room_type TEXT,
          booking_source TEXT,
          advertised_price_cash REAL,
          advertised_price_points INTEGER,
          advertised_loyalty_program TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO hotel_element_details_old (element_id, address, check_in_date, check_out_date, created_at, updated_at)
          SELECT element_id, address, check_in_date, check_out_date, created_at, updated_at FROM hotel_element_details;
        DROP TABLE hotel_element_details;
        ALTER TABLE hotel_element_details_old RENAME TO hotel_element_details;
      `);
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { up, down };
```

Before finalising, read `server/migrations/migrations/20261109_01_trip_shells_for_lists.cjs` and the current `hotel_element_details` definition in `server/db.ts`. Match their FK/default style (for example `TEXT DEFAULT CURRENT_TIMESTAMP` vs `DATETIME`) and the down-table definition to what db.ts currently has. Also check how `server/index.ts` calls migrations (`up({ db })` or something else) and match that signature.

- [ ] **Step 4: Update `server/db.ts`**

In the trips SCHEMA block:
1. Add to the `bookings` CREATE TABLE: `booking_site TEXT, site_itinerary_number TEXT, advertised_includes_taxes INTEGER NOT NULL DEFAULT 0,`.
2. Replace the `hotel_element_details` CREATE TABLE with the new column set (same as `hotel_element_details_new` above, named `hotel_element_details`).
3. Add the `lodging_room_details` and `booking_coupons` CREATE TABLE statements and the `idx_booking_coupons_booking` index next to the other booking indexes.

Fresh databases and `:memory:` test databases are created from this schema, so the migration must be a no-op on them (that is why it is idempotent).

- [ ] **Step 5: Run the tests and check that they pass**

Run: `npx vitest --run server/__tests__/lodging-migration.test.ts server/repositories/bookingRepository.test.ts`
Expected: the migration tests PASS. bookingRepository still passes.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/migrations/20261124_01_lodging.cjs server/db.ts server/__tests__/lodging-migration.test.ts vitest.config.ts
git commit -m "feat(lodging): schema migration for stays, rooms and coupons" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Lodging validation helpers

**Files:**
- Create: `server/utils/lodgingValidation.ts`
- Test: `server/utils/lodgingValidation.test.ts` (add to the include)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { validateStay, validateRoom, validateCoupons } from './lodgingValidation';

describe('validateStay', () => {
  const ok = { name: 'Hotel', checkInDate: '2027-01-01', checkOutDate: '2027-01-03' };
  it('accepts a minimal stay', () => expect(validateStay(ok, { partial: false })).toBeNull());
  it('requires a name', () => expect(validateStay({ ...ok, name: '  ' }, { partial: false })).toMatch(/name/i));
  it('requires both dates on create', () => expect(validateStay({ name: 'H', checkInDate: '2027-01-01' }, { partial: false })).toMatch(/check-out/i));
  it('rejects a bad date format', () => expect(validateStay({ ...ok, checkInDate: '01/01/2027' }, { partial: false })).toMatch(/YYYY-MM-DD/));
  it('requires check-out after check-in', () => expect(validateStay({ ...ok, checkOutDate: '2027-01-01' }, { partial: false })).toMatch(/after/i));
  it('rejects a bad time', () => expect(validateStay({ ...ok, checkInTime: '3pm' }, { partial: false })).toMatch(/HH:mm/));
  it('partial: merges with existing dates', () => {
    expect(validateStay({ checkOutDate: '2027-01-01' }, { partial: true, existing: { checkInDate: '2027-01-02', checkOutDate: '2027-01-05' } })).toMatch(/after/i);
    expect(validateStay({ checkInTime: '15:00' }, { partial: true, existing: { checkInDate: '2027-01-02', checkOutDate: '2027-01-05' } })).toBeNull();
  });
  it('partial: rejects clearing a date', () => {
    expect(validateStay({ checkInDate: null }, { partial: true, existing: { checkInDate: '2027-01-02', checkOutDate: '2027-01-05' } })).toMatch(/check-in/i);
  });
});

describe('validateRoom', () => {
  it('accepts an empty room', () => expect(validateRoom({})).toBeNull());
  it('accepts a full room', () => expect(validateRoom({
    roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }],
    amenities: ['breakfast', 'pool'], refundability: 'free', cancelBy: '2027-01-01T18:00',
  })).toBeNull());
  it('rejects an unknown room type', () => expect(validateRoom({ roomType: 'penthouse' })).toMatch(/room type/i));
  it('rejects bad beds', () => {
    expect(validateRoom({ beds: [{ type: 'hammock', count: 1 }] })).toMatch(/bed/i);
    expect(validateRoom({ beds: [{ type: 'king', count: 0 }] })).toMatch(/1.*9/);
    expect(validateRoom({ beds: [{ type: 'king', count: 1 }, { type: 'king', count: 2 }] })).toMatch(/once/i);
  });
  it('rejects unknown amenities', () => expect(validateRoom({ amenities: ['spa'] })).toMatch(/amenit/i));
  it('rejects bad refundability', () => expect(validateRoom({ refundability: 'maybe' })).toMatch(/refundab/i));
  it('rejects bad cancelBy', () => expect(validateRoom({ cancelBy: 'tomorrow' })).toMatch(/cancel/i));
});

describe('validateCoupons', () => {
  it('accepts an empty list', () => expect(validateCoupons([])).toBeNull());
  it('requires an array', () => expect(validateCoupons('x')).toMatch(/array/i));
  it('requires a code', () => expect(validateCoupons([{ code: ' ' }])).toMatch(/code/i));
  it('rejects negative savings', () => expect(validateCoupons([{ code: 'A', savingsCash: -1 }])).toMatch(/savings/i));
  it('rejects fractional points', () => expect(validateCoupons([{ code: 'A', savingsPoints: 1.5 }])).toMatch(/points/i));
});
```

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest --run server/utils/lodgingValidation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// server/utils/lodgingValidation.ts
export const ROOM_TYPES = ['standard', 'suite', 'studio', '1br', '2br', '3br', 'other'] as const;
export const BED_TYPES = ['king', 'queen', 'full', 'twin', 'sofa_bed', 'bunk', 'crib'] as const;
export const AMENITIES = ['breakfast', 'fridge', 'microwave', 'kitchen', 'pool', 'hot_tub', 'parking', 'wifi', 'laundry', 'airport_shuttle', 'gym'] as const;
export const REFUNDABILITY = ['free', 'partial', 'nonrefundable'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/;

export interface StayDates { checkInDate?: string | null; checkOutDate?: string | null }

function has(obj: any, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function validateStay(
  data: any,
  opts: { partial: boolean; existing?: StayDates },
): string | null {
  const d = data ?? {};
  if (!opts.partial || has(d, 'name')) {
    if (typeof d.name !== 'string' || !d.name.trim()) return 'Stay name is required';
  }
  const checkIn = has(d, 'checkInDate') ? d.checkInDate : opts.partial ? opts.existing?.checkInDate : undefined;
  const checkOut = has(d, 'checkOutDate') ? d.checkOutDate : opts.partial ? opts.existing?.checkOutDate : undefined;
  if (!checkIn) return 'Check-in date is required';
  if (!checkOut) return 'Check-out date is required';
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) return 'Dates must be YYYY-MM-DD';
  if (checkOut <= checkIn) return 'Check-out must be after check-in';
  for (const key of ['checkInTime', 'checkOutTime']) {
    const v = d[key];
    if (v !== undefined && v !== null && v !== '' && (typeof v !== 'string' || !TIME_RE.test(v))) {
      return 'Times must be HH:mm';
    }
  }
  return null;
}

export function validateRoom(room: any): string | null {
  if (room === null || typeof room !== 'object' || Array.isArray(room)) return 'Room must be an object';
  if (room.roomType != null && !(ROOM_TYPES as readonly string[]).includes(room.roomType)) return 'Unknown room type';
  if (room.beds != null) {
    if (!Array.isArray(room.beds)) return 'Beds must be an array';
    const seen = new Set<string>();
    for (const bed of room.beds) {
      if (!bed || !(BED_TYPES as readonly string[]).includes(bed.type)) return 'Unknown bed type';
      if (!Number.isInteger(bed.count) || bed.count < 1 || bed.count > 9) return 'Bed count must be 1 to 9';
      if (seen.has(bed.type)) return 'Each bed type may appear once';
      seen.add(bed.type);
    }
  }
  if (room.amenities != null) {
    if (!Array.isArray(room.amenities)) return 'Amenities must be an array';
    if (room.amenities.some((a: any) => !(AMENITIES as readonly string[]).includes(a))) return 'Unknown amenity';
  }
  if (room.refundability != null && !(REFUNDABILITY as readonly string[]).includes(room.refundability)) {
    return 'Unknown refundability';
  }
  if (room.cancelBy != null && room.cancelBy !== '' && (typeof room.cancelBy !== 'string' || !DATETIME_RE.test(room.cancelBy))) {
    return 'Cancel-by must be YYYY-MM-DD or YYYY-MM-DDTHH:mm';
  }
  return null;
}

export function validateCoupons(coupons: any): string | null {
  if (!Array.isArray(coupons)) return 'Coupons must be an array';
  for (const c of coupons) {
    if (!c || typeof c.code !== 'string' || !c.code.trim()) return 'Coupon code is required';
    if (c.savingsCash != null && (typeof c.savingsCash !== 'number' || !(c.savingsCash >= 0))) return 'Coupon savings must be 0 or more';
    if (c.savingsPoints != null && (!Number.isInteger(c.savingsPoints) || c.savingsPoints < 0)) return 'Coupon points must be a whole number, 0 or more';
  }
  return null;
}
```

- [ ] **Step 4: Run the tests and check that they pass**

Run: `npx vitest --run server/utils/lodgingValidation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/lodgingValidation.ts server/utils/lodgingValidation.test.ts vitest.config.ts
git commit -m "feat(lodging): validation helpers" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Hotel element repository (create, update, hydrate)

**Files:**
- Modify: `server/repositories/tripElementRepository.ts` (`HotelDetails` ~62, hotel insert ~155, hydrate ~219, `updateElement` ~278)
- Test: `server/repositories/tripElementRepository.test.ts` (existing hotel tests at ~80 and ~210 use the old fields; update them)

The new shape (camelCase over the wire):

```ts
export interface HotelDetails {
  address: string | null;
  phone: string | null;
  website: string | null;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
  destinationId: string | null;
  destinationName: string | null;
}
```

- [ ] **Step 1: Write the failing tests** (in `tripElementRepository.test.ts`; adapt setup to how the file already builds a trip/element)

```ts
describe('hotel elements', () => {
  it('creates and hydrates hotel details', async () => {
    const el = await repo.createElement(tripId, {
      elementType: 'hotel', name: 'Casa Azul', notes: 'Quiet floor',
      typeSpecificData: { address: '1 Beach Rd\nCabo', phone: '+52 1', website: 'https://casa.example',
        checkInDate: '2027-01-01', checkInTime: '15:00', checkOutDate: '2027-01-04', checkOutTime: '11:00' },
    } as any);
    const got = await repo.getElementById(el.id);
    expect((got as any)?.hotelDetails).toMatchObject({
      address: '1 Beach Rd\nCabo', phone: '+52 1', website: 'https://casa.example',
      checkInDate: '2027-01-01', checkInTime: '15:00', checkOutDate: '2027-01-04', checkOutTime: '11:00',
      destinationId: null, destinationName: null,
    });
  });

  it('partially updates hotel details, null clears a field', async () => {
    const el = await repo.createElement(tripId, {
      elementType: 'hotel', name: 'Casa',
      typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04', phone: '123' },
    } as any);
    await repo.updateElement(el.id, { typeSpecificData: { checkOutTime: '10:00', phone: null } } as any);
    const got = await repo.getElementById(el.id);
    expect((got as any)?.hotelDetails).toMatchObject({ checkInDate: '2027-01-01', checkOutTime: '10:00', phone: null });
  });

  it('inserts the details row if it is missing', async () => {
    const el = await repo.createElement(tripId, { elementType: 'hotel', name: 'Bare' } as any);
    const db = await getDb();
    await db.run('DELETE FROM hotel_element_details WHERE element_id = ?', [el.id]);
    await repo.updateElement(el.id, { typeSpecificData: { checkInDate: '2027-02-01', checkOutDate: '2027-02-02' } } as any);
    expect(((await repo.getElementById(el.id)) as any)?.hotelDetails).toMatchObject({ checkInDate: '2027-02-01' });
  });

  it('ignores a soft-deleted destination when hydrating', async () => {
    const db = await getDb();
    await db.run(`INSERT INTO trip_destinations (id, trip_id, name, color, position, packing_list_id) VALUES ('d1', ?, 'Cabo', '#000', 0, NULL)`, [tripId]);
    const el = await repo.createElement(tripId, {
      elementType: 'hotel', name: 'Casa',
      typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-02', destinationId: 'd1' },
    } as any);
    expect(((await repo.getElementById(el.id)) as any)?.hotelDetails).toMatchObject({ destinationId: 'd1', destinationName: 'Cabo' });
    await db.run(`UPDATE trip_destinations SET deleted_at = CURRENT_TIMESTAMP WHERE id = 'd1'`);
    expect(((await repo.getElementById(el.id)) as any)?.hotelDetails).toMatchObject({ destinationId: null, destinationName: null });
  });
});
```

Check the real `trip_destinations` columns in `server/db.ts` and fix the INSERT above to match (for example, `packing_list_id` may be NOT NULL; if so, insert a packing list first, or create the destination through `TripDestinationRepository`). Real signatures: `createElement(tripId, element)`, `getElementById(elementId)`, `updateElement(elementId, updates)` (no userId). Hydrated hotels expose their details on **`element.hotelDetails`** (not `typeSpecificData`, which is input only). `getElementsByTrip` calls `getElementById` per row, so hotels in lists are hydrated too.

Update the existing hotel tests (~80, ~210) that reference `roomType`/`bookingSource`/`advertisedPrice*` so they use the new fields.

- [ ] **Step 2: Run it and check that it fails**

Run: `npx vitest --run server/repositories/tripElementRepository.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement**

1. Replace `HotelDetails` with the interface above.
2. Hotel insert in `createElement`:

```ts
if (data.elementType === 'hotel') {
  const h = (data.typeSpecificData ?? {}) as Partial<HotelDetails>;
  await db.run(
    `INSERT INTO hotel_element_details
       (element_id, address, phone, website, check_in_date, check_in_time, check_out_date, check_out_time, destination_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, h.address ?? null, h.phone ?? null, h.website ?? null, h.checkInDate ?? null, h.checkInTime ?? null,
     h.checkOutDate ?? null, h.checkOutTime ?? null, h.destinationId ?? null],
  );
}
```

3. Hydrate (replace the existing hotel branch in `getElementById`, which sets `(row as any).hotelDetails`):

```ts
const h = await db.get(
  `SELECT h.*,
          CASE WHEN d.deleted_at IS NULL THEN d.id END AS live_destination_id,
          CASE WHEN d.deleted_at IS NULL THEN d.name END AS destination_name
     FROM hotel_element_details h
     LEFT JOIN trip_destinations d ON d.id = h.destination_id
    WHERE h.element_id = ?`,
  [row.id],
);
(row as any).hotelDetails = h ? {
  address: h.address ?? null, phone: h.phone ?? null, website: h.website ?? null,
  checkInDate: h.check_in_date ?? null, checkInTime: h.check_in_time ?? null,
  checkOutDate: h.check_out_date ?? null, checkOutTime: h.check_out_time ?? null,
  destinationId: h.live_destination_id ?? null, destinationName: h.destination_name ?? null,
} : null;
```

Also update `updateElement(elementId, updates)`: it currently takes `Partial<TripElement>`. Widen the parameter type to `Partial<TripElement> & { typeSpecificData?: any }`.

4. Add `updateHotelDetails` and call it from `updateElement` when the element is a hotel and `typeSpecificData` was provided:

```ts
private async updateHotelDetails(db: Database, elementId: string, data: Partial<HotelDetails>): Promise<void> {
  const map: Record<string, string> = {
    address: 'address', phone: 'phone', website: 'website',
    checkInDate: 'check_in_date', checkInTime: 'check_in_time',
    checkOutDate: 'check_out_date', checkOutTime: 'check_out_time', destinationId: 'destination_id',
  };
  await db.run('INSERT OR IGNORE INTO hotel_element_details (element_id) VALUES (?)', [elementId]);
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      sets.push(`${col} = ?`);
      const v = (data as any)[key];
      values.push(v === '' ? null : v ?? null);
    }
  }
  if (sets.length === 0) return;
  sets.push('updated_at = CURRENT_TIMESTAMP');
  await db.run(`UPDATE hotel_element_details SET ${sets.join(', ')} WHERE element_id = ?`, [...values, elementId]);
}
```

Read `updateElement` first. If it already handles flight `typeSpecificData`, add the hotel branch beside it. If the `Database` type import differs, match the file.

- [ ] **Step 4: Run the tests and check that they pass**

Run: `npx vitest --run server/repositories/tripElementRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/tripElementRepository.ts server/repositories/tripElementRepository.test.ts
git commit -m "feat(lodging): hotel element details create/update/hydrate" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Clear hotel destination on destination delete

**Files:**
- Modify: `server/services/tripListService.ts` (`deleteDestinationTx`, ~201)
- Test: the existing test file for `tripListService` (find it with `grep -rl deleteDestination server --include=*.test.ts`; if there is none, add the test to `server/__tests__/lodging.routes.test.ts` in Task 6 instead and do this code change there)

- [ ] **Step 1: Write the failing test.** Create a trip with two destinations and a hotel element whose `destination_id` is the first. Delete that destination through the service (or `DELETE /api/trips/:id/destinations/:destId`), then assert `SELECT destination_id FROM hotel_element_details WHERE element_id = ?` is `null`.

```ts
it('clears hotel destination_id when the destination is deleted', async () => {
  // setup per the file's existing helpers: trip, destinations d1 + d2, hotel element h1 with destinationId d1
  await service.deleteDestination(tripId, d1, userId); // use the real public method name
  const db = await getDb();
  const row = await db.get('SELECT destination_id FROM hotel_element_details WHERE element_id = ?', [h1]);
  expect(row.destination_id).toBeNull();
});
```

- [ ] **Step 2: Run it and check that it fails.**
- [ ] **Step 3: Implement.** Inside `deleteDestinationTx`, in the same transaction and before or after the soft delete:

```ts
await db.run('UPDATE hotel_element_details SET destination_id = NULL WHERE destination_id = ?', [destinationId]);
```

(Use the function's actual variable names.)

- [ ] **Step 4: Run the tests and check that they pass.**
- [ ] **Step 5: Commit** with the message `feat(lodging): clear stay destination when destination is deleted` and the trailer.

---

### Task 5: Booking repository: new columns, room and coupons

**Files:**
- Modify: `server/repositories/bookingRepository.ts`
- Test: `server/repositories/bookingRepository.test.ts` (the test at ~170 expects "At least one traveler is required" from updateBooking; change it to expect that an update with `travelerIds: []` succeeds and leaves no travelers, because the rule moves to the route)

Types to add, exported from the repository:

```ts
export type RoomType = 'standard' | 'suite' | 'studio' | '1br' | '2br' | '3br' | 'other';
export type BedType = 'king' | 'queen' | 'full' | 'twin' | 'sofa_bed' | 'bunk' | 'crib';
export type Amenity = 'breakfast' | 'fridge' | 'microwave' | 'kitchen' | 'pool' | 'hot_tub' | 'parking' | 'wifi' | 'laundry' | 'airport_shuttle' | 'gym';
export type Refundability = 'free' | 'partial' | 'nonrefundable';

export interface RoomDetails {
  roomType: RoomType | null;
  beds: { type: BedType; count: number }[];
  roomDescription: string | null;
  amenities: Amenity[];
  otherAmenities: string | null;
  refundability: Refundability | null;
  cancelBy: string | null;
  cancellationPolicy: string | null;
}

export interface BookingCoupon {
  id: string;
  code: string;
  savingsCash: number | null;
  savingsPoints: number | null;
  notes: string | null;
}
export type CouponInput = Omit<BookingCoupon, 'id'> & { id?: string };
```

The `Booking` interface gains `bookingSite: string | null`, `siteItineraryNumber: string | null`, `advertisedIncludesTaxes: boolean`, `room: RoomDetails | null`, `coupons: BookingCoupon[]`. The create/update input types gain optional `bookingSite`, `siteItineraryNumber`, `advertisedIncludesTaxes`, `room?: Partial<RoomDetails> | null`, `coupons?: CouponInput[]`.

- [ ] **Step 1: Write the failing tests** (add to `bookingRepository.test.ts`, reusing its setup for trip, user and element; create a `hotel` element via `getDb()` or the element repository)

```ts
describe('lodging fields', () => {
  it('creates a booking with site fields, room and coupons', async () => {
    const b = await repo.createBooking(tripId, {
      elementIds: [hotelId], travelerIds: [],
      bookingSite: 'Expedia', siteItineraryNumber: '7300', advertisedIncludesTaxes: true,
      advertisedPriceCash: 900, confirmationNumber: 'H1',
      room: { roomType: 'suite', beds: [{ type: 'king', count: 1 }], amenities: ['breakfast'], refundability: 'free', cancelBy: '2027-01-01' },
      coupons: [{ code: 'SAVE10', savingsCash: 10, savingsPoints: null, notes: null }, { code: 'PTS', savingsCash: null, savingsPoints: 500, notes: 'promo' }],
    } as any);
    const got = await repo.getBookingById(b.id);
    expect(got).toMatchObject({
      bookingSite: 'Expedia', siteItineraryNumber: '7300', advertisedIncludesTaxes: true,
      room: { roomType: 'suite', beds: [{ type: 'king', count: 1 }], amenities: ['breakfast'], refundability: 'free', cancelBy: '2027-01-01',
        roomDescription: null, otherAmenities: null, cancellationPolicy: null },
    });
    expect(got!.coupons.map(c => c.code)).toEqual(['SAVE10', 'PTS']);
  });

  it('defaults: no room, no coupons, includes taxes false', async () => {
    const b = await repo.createBooking(tripId, { elementIds: [flightId], travelerIds: [travelerId] } as any);
    expect(await repo.getBookingById(b.id)).toMatchObject({ room: null, coupons: [], advertisedIncludesTaxes: false, bookingSite: null });
  });

  it('update replaces coupons in order, room null deletes the room', async () => {
    const b = await repo.createBooking(tripId, {
      elementIds: [hotelId], travelerIds: [], room: { roomType: 'standard' }, coupons: [{ code: 'A' }],
    } as any);
    await repo.updateBooking(b.id, { coupons: [{ code: 'C' }, { code: 'B' }], room: null, advertisedIncludesTaxes: true } as any);
    const got = await repo.getBookingById(b.id);
    expect(got!.coupons.map(c => c.code)).toEqual(['C', 'B']);
    expect(got!.room).toBeNull();
    expect(got!.advertisedIncludesTaxes).toBe(true);
  });

  it('update merges a partial room', async () => {
    const b = await repo.createBooking(tripId, { elementIds: [hotelId], travelerIds: [], room: { roomType: 'suite', amenities: ['pool'] } } as any);
    await repo.updateBooking(b.id, { room: { refundability: 'nonrefundable' } } as any);
    expect((await repo.getBookingById(b.id))!.room).toMatchObject({ roomType: 'suite', amenities: ['pool'], refundability: 'nonrefundable' });
  });

  it('delete removes room and coupons', async () => {
    const b = await repo.createBooking(tripId, { elementIds: [hotelId], travelerIds: [], room: { roomType: 'suite' }, coupons: [{ code: 'A' }] } as any);
    await repo.deleteBooking(b.id);
    const db = await getDb();
    expect(await db.get('SELECT COUNT(*) n FROM lodging_room_details WHERE booking_id = ?', [b.id])).toEqual({ n: 0 });
    expect(await db.get('SELECT COUNT(*) n FROM booking_coupons WHERE booking_id = ?', [b.id])).toEqual({ n: 0 });
  });

  it('createBooking is atomic: a failing coupon insert rolls back the booking', async () => {
    const db = await getDb();
    const before = (await db.get('SELECT COUNT(*) n FROM bookings')).n;
    await expect(repo.createBooking(tripId, { elementIds: [hotelId], travelerIds: [], coupons: [{ code: null }] } as any)).rejects.toThrow();
    expect((await db.get('SELECT COUNT(*) n FROM bookings')).n).toBe(before);
  });
});
```

Real signatures: `createBooking(tripId, input)`, `getBookingById(id)`, `updateBooking(id, updates)`, `deleteBooking(id)`. The existing Booking fields are `confirmationNumber`, `currentConfirmationNumber`, `loyaltyProgram`, `actualTotalCash`, `actualTotalPoints`. Imports: `uuidv4` from `uuid`, and `withTransaction` from `../utils/transaction`.

- [ ] **Step 2: Run it and check that it fails.** `npx vitest --run server/repositories/bookingRepository.test.ts`

- [ ] **Step 3: Implement**

1. Add `const BOOKING_COLUMNS = 'b.*'`, or an explicit list if the file already lists columns explicitly; in that case add `b.booking_site, b.site_itinerary_number, b.advertised_includes_taxes`. Use it in `getBookingById` and both list queries so the new columns are selected.
2. Wrap `createBooking` in the file's existing `withTransaction` helper (find it with `grep -n withTransaction server -r`). Insert the new columns. After links and travelers, call:

```ts
private async writeRoom(db: Database, bookingId: string, room: Partial<RoomDetails> | null | undefined): Promise<void> {
  if (room === undefined) return;
  if (room === null) {
    await db.run('DELETE FROM lodging_room_details WHERE booking_id = ?', [bookingId]);
    return;
  }
  const existing = await db.get('SELECT * FROM lodging_room_details WHERE booking_id = ?', [bookingId]);
  const current: RoomDetails = existing ? rowToRoom(existing) : EMPTY_ROOM;
  const merged: RoomDetails = { ...current, ...room } as RoomDetails;
  await db.run(
    `INSERT INTO lodging_room_details
       (booking_id, room_type, beds, room_description, amenities, other_amenities, refundability, cancel_by, cancellation_policy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(booking_id) DO UPDATE SET
       room_type = excluded.room_type, beds = excluded.beds, room_description = excluded.room_description,
       amenities = excluded.amenities, other_amenities = excluded.other_amenities, refundability = excluded.refundability,
       cancel_by = excluded.cancel_by, cancellation_policy = excluded.cancellation_policy, updated_at = CURRENT_TIMESTAMP`,
    [bookingId, merged.roomType ?? null, JSON.stringify(merged.beds ?? []), blankToNull(merged.roomDescription),
     JSON.stringify(merged.amenities ?? []), blankToNull(merged.otherAmenities), merged.refundability ?? null,
     blankToNull(merged.cancelBy), blankToNull(merged.cancellationPolicy)],
  );
}

private async writeCoupons(db: Database, bookingId: string, coupons: CouponInput[] | undefined): Promise<void> {
  if (coupons === undefined) return;
  await db.run('DELETE FROM booking_coupons WHERE booking_id = ?', [bookingId]);
  for (const [i, c] of coupons.entries()) {
    await db.run(
      `INSERT INTO booking_coupons (id, booking_id, code, savings_cash, savings_points, notes, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), bookingId, typeof c.code === 'string' ? c.code.trim() : c.code, c.savingsCash ?? null, c.savingsPoints ?? null, blankToNull(c.notes), i],
    );
  }
}
```

with module-level helpers:

```ts
const EMPTY_ROOM: RoomDetails = {
  roomType: null, beds: [], roomDescription: null, amenities: [], otherAmenities: null,
  refundability: null, cancelBy: null, cancellationPolicy: null,
};
function blankToNull(v: string | null | undefined): string | null {
  return v == null || v.trim() === '' ? null : v;
}
function parseJsonArray<T>(v: string | null): T[] {
  if (!v) return [];
  try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function rowToRoom(r: any): RoomDetails {
  return {
    roomType: r.room_type ?? null, beds: parseJsonArray(r.beds), roomDescription: r.room_description ?? null,
    amenities: parseJsonArray(r.amenities), otherAmenities: r.other_amenities ?? null,
    refundability: r.refundability ?? null, cancelBy: r.cancel_by ?? null, cancellationPolicy: r.cancellation_policy ?? null,
  };
}
```

Use whatever uuid helper the file already imports (`uuidv4` or `randomUUID`).

3. `updateBooking`: add `bookingSite: 'booking_site'`, `siteItineraryNumber: 'site_itinerary_number'`, `advertisedIncludesTaxes: 'advertised_includes_taxes'` to the field map (convert booleans to `1/0`). Remove the "At least one traveler is required" check. Call `writeRoom` and `writeCoupons` inside the same transaction.
4. `deleteBooking`: if it hard-deletes, also `DELETE FROM lodging_room_details` and `DELETE FROM booking_coupons` for the id. If it soft-deletes, leave those rows (they cascade with the booking) and change the "delete removes room and coupons" test to assert the booking is gone from `getBookingById`/the list instead.
5. `hydrate`: add

```ts
bookingSite: row.booking_site ?? null,
siteItineraryNumber: row.site_itinerary_number ?? null,
advertisedIncludesTaxes: Boolean(row.advertised_includes_taxes),
room: roomRow ? rowToRoom(roomRow) : null,
coupons: couponRows.map((c: any) => ({ id: c.id, code: c.code, savingsCash: c.savings_cash ?? null, savingsPoints: c.savings_points ?? null, notes: c.notes ?? null })),
```

where `roomRow = await db.get('SELECT * FROM lodging_room_details WHERE booking_id = ?', [row.id])` and `couponRows = await db.all('SELECT * FROM booking_coupons WHERE booking_id = ? ORDER BY position', [row.id])`.

- [ ] **Step 4: Run the tests and check that they pass.** `npx vitest --run server/repositories/bookingRepository.test.ts`, then `npx tsc -p tsconfig.build.json --noEmit`.
- [ ] **Step 5: Commit** with the message `feat(lodging): booking site fields, room details and coupons in repository` and the trailer.

---

### Task 6: Routes: hotel validation, booking kind, optional travelers

**Files:**
- Modify: `server/routes/tripRoutes.ts` (element POST ~197 and PUT ~237; bookings POST ~440, PATCH ~480, POST `bookings/:id/elements` ~522)
- Test: `server/__tests__/lodging.routes.test.ts` (add to the include)

- [ ] **Step 1: Write the failing tests**

Read `server/__tests__/trips.routes.test.ts` and copy its app, auth and seed setup exactly. Then:

```ts
// after setup: `app`, `auth` (Authorization header), `tripId`, `dad`, `mom` (member ids) from seedFamilyTrip()
async function addDestination(name: string, memberIds: string[]) {
  const res = await request(app).post(`/api/trips/${tripId}/destinations`).set(auth).send({ name, memberIds });
  expect(res.status).toBe(201); // adjust to the real status code
  return res.body.id as string;
}
async function addStay(extra: Record<string, unknown> = {}) {
  return request(app).post(`/api/trips/${tripId}/elements`).set(auth).send({
    elementType: 'hotel', name: 'Casa Azul',
    typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04', ...extra },
  });
}
async function addFlight() { /* copy the flight-creation payload from trips.routes.test.ts */ }

describe('stay elements', () => {
  it('creates a stay', async () => {
    const res = await addStay({ checkInTime: '15:00' });
    expect(res.status).toBe(201);
    expect(res.body.hotelDetails).toMatchObject({ checkInDate: '2027-01-01', checkInTime: '15:00' });
  });
  it('rejects a stay without a name', async () => {
    const res = await request(app).post(`/api/trips/${tripId}/elements`).set(auth)
      .send({ elementType: 'hotel', name: ' ', typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-02' } });
    expect(res.status).toBe(400);
  });
  it('rejects check-out not after check-in', async () => {
    expect((await addStay({ checkOutDate: '2027-01-01' })).status).toBe(400);
  });
  it('rejects a destination from another trip or deleted', async () => {
    expect((await addStay({ destinationId: 'nope' })).status).toBe(404);
  });
  it('accepts a live destination of the trip', async () => {
    const d1 = await addDestination('Cabo', [dad]);
    const res = await addStay({ destinationId: d1 });
    expect(res.status).toBe(201);
    expect(res.body.hotelDetails.destinationName).toBe('Cabo');
  });
  it('PUT applies a partial update and validates merged dates', async () => {
    const id = (await addStay()).body.id;
    expect((await request(app).put(`/api/trips/${tripId}/elements/${id}`).set(auth).send({ typeSpecificData: { checkOutTime: '11:00' } })).status).toBe(200);
    expect((await request(app).put(`/api/trips/${tripId}/elements/${id}`).set(auth).send({ typeSpecificData: { checkOutDate: '2026-12-31' } })).status).toBe(400);
  });
  it('clears the stay destination when the destination is deleted', async () => {
    const d1 = await addDestination('Cabo', [dad]);
    await addDestination('La Paz', [mom]);
    const id = (await addStay({ destinationId: d1 })).body.id;
    await request(app).delete(`/api/trips/${tripId}/destinations/${d1}`).set(auth).expect(200); // adjust status
    const el = await request(app).get(`/api/trips/${tripId}/elements/${id}`).set(auth); // or list endpoint
    expect(el.body.hotelDetails.destinationId).toBeNull();
  });
});

describe('room bookings', () => {
  it('creates a room booking without travelers', async () => {
    const stayId = (await addStay()).body.id;
    const res = await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({
      elementIds: [stayId], travelerIds: [], bookingSite: 'Expedia', siteItineraryNumber: '7300',
      advertisedPriceCash: 900, advertisedIncludesTaxes: true,
      room: { roomType: 'suite', beds: [{ type: 'king', count: 1 }] }, coupons: [{ code: 'SAVE10', savingsCash: 10 }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ bookingSite: 'Expedia', room: { roomType: 'suite' }, coupons: [{ code: 'SAVE10' }] });
  });
  it('still requires travelers for flight bookings', async () => {
    const flightId = await addFlight();
    expect((await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [flightId], travelerIds: [] })).status).toBe(400);
  });
  it('rejects mixing a stay with flights, or two stays', async () => {
    const stayId = (await addStay()).body.id;
    const stay2 = (await addStay()).body.id;
    const flightId = await addFlight();
    expect((await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [stayId, flightId], travelerIds: [dad] })).status).toBe(400);
    expect((await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [stayId, stay2], travelerIds: [] })).status).toBe(400);
  });
  it('rejects room or coupons on a flight booking', async () => {
    const flightId = await addFlight();
    expect((await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [flightId], travelerIds: [dad], room: { roomType: 'suite' } })).status).toBe(400);
    expect((await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [flightId], travelerIds: [dad], coupons: [] })).status).toBe(400);
  });
  it('rejects invalid room and coupons', async () => {
    const stayId = (await addStay()).body.id;
    expect((await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [stayId], travelerIds: [], room: { roomType: 'castle' } })).status).toBe(400);
    expect((await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [stayId], travelerIds: [], coupons: [{ code: '' }] })).status).toBe(400);
  });
  it('PATCH updates room and coupons, and adding a flight to a room booking is rejected', async () => {
    const stayId = (await addStay()).body.id;
    const flightId = await addFlight();
    const id = (await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [stayId], travelerIds: [] })).body.id;
    const patched = await request(app).patch(`/api/trips/${tripId}/bookings/${id}`).set(auth).send({ room: { amenities: ['pool'] }, coupons: [{ code: 'X' }] });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ room: { amenities: ['pool'] }, coupons: [{ code: 'X' }] });
    expect((await request(app).post(`/api/trips/${tripId}/bookings/${id}/elements`).set(auth).send({ elementIds: [flightId] })).status).toBe(400);
  });
  it('applies the traveler conflict rule (409) to rooms', async () => {
    const stayId = (await addStay()).body.id;
    await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [stayId], travelerIds: [dad] }).expect(201);
    expect((await request(app).post(`/api/trips/${tripId}/bookings`).set(auth).send({ elementIds: [stayId], travelerIds: [dad] })).status).toBe(409);
  });
});
```

Adjust the endpoint paths, request body shapes (for example, whether `POST bookings/:id/elements` takes `elementIds` or `elementId`) and status codes to the real routes. Read `tripRoutes.ts` first.

- [ ] **Step 2: Run it and check that it fails.** `npx vitest --run server/__tests__/lodging.routes.test.ts`

- [ ] **Step 3: Implement** in `tripRoutes.ts`:

```ts
import { validateStay, validateRoom, validateCoupons } from '../utils/lodgingValidation';

const BOOKING_KIND_ERROR = 'A booking covers flights only, or exactly one stay';

async function bookingKind(elementIds: string[]): Promise<'flight' | 'hotel' | 'invalid'> {
  const types: string[] = [];
  for (const id of elementIds) {
    const el = await elementRepo.getElementById(id);
    if (!el) return 'invalid';
    types.push(el.elementType);
  }
  if (types.length > 0 && types.every(t => t === 'flight')) return 'flight';
  if (types.length === 1 && types[0] === 'hotel') return 'hotel';
  return 'invalid';
}

async function checkStayDestination(tripId: string, destinationId: unknown): Promise<boolean> {
  if (destinationId == null || destinationId === '') return true;
  const db = await getDb();
  const row = await db.get('SELECT id FROM trip_destinations WHERE id = ? AND trip_id = ? AND deleted_at IS NULL', [destinationId, tripId]);
  return Boolean(row);
}

function lodgingBookingError(kind: 'flight' | 'hotel', body: any): string | null {
  if (kind !== 'hotel' && (body.room !== undefined || body.coupons !== undefined)) return 'Room details and coupons are only for stays';
  if (body.room != null) { const e = validateRoom(body.room); if (e) return e; }
  if (body.coupons !== undefined) { const e = validateCoupons(body.coupons); if (e) return e; }
  return null;
}
```

Use the router's existing element-repository instance name and existing `getDb` import (it may already be imported). If element lookup in the existing booking routes already validates that elements belong to the trip, keep that check before `bookingKind`.

- **Element POST:** when `elementType === 'hotel'`, run `validateStay({ name, ...typeSpecificData }, { partial: false })` and return 400 with the message on failure. Then `checkStayDestination` returns 404 `{ error: 'Destination not found' }` when false.
- **Element PUT:** when the existing element is a hotel, build `existing = { checkInDate, checkOutDate }` from its `hotelDetails` and run `validateStay({ ...(name !== undefined ? { name } : {}), ...(typeSpecificData ?? {}) }, { partial: true, existing })`. Check the destination the same way if `typeSpecificData.destinationId` is present.
- **Bookings POST:** compute `kind = await bookingKind(elementIds)`. Return 400 `BOOKING_KIND_ERROR` if invalid. If `kind === 'flight'` and there are no travelers, 400 (keep the existing traveler-required message). Then 400 for `lodgingBookingError`. The traveler-conflict (409) logic stays as it is and applies to both kinds.
- **Bookings PATCH:** compute kind from the new `elementIds` if provided, else the booking's current element ids. Apply the same three checks. The travelers-required check for flights applies only when `travelerIds` is in the body.
- **POST `bookings/:id/elements`:** compute kind from current ids + the added ids, and return 400 `BOOKING_KIND_ERROR` if invalid.
- Pass `bookingSite`, `siteItineraryNumber`, `advertisedIncludesTaxes`, `room` and `coupons` through to the repository.

- [ ] **Step 4: Run the tests and check that they pass.** `npx vitest --run server/__tests__/lodging.routes.test.ts server/__tests__/trips.routes.test.ts server/repositories`, then `npx tsc -p tsconfig.build.json --noEmit`.
- [ ] **Step 5: Commit** with the message `feat(lodging): stay validation and room booking rules in routes` and the trailer.

---

### Task 7: Client types and API

**Files:**
- Modify: `client/src/types/trip.ts`, `client/src/api/tripApi.ts`

No client code reads the old `HotelDetails` fields today (`grep -rn hotelDetails client/src` finds only the type), so it can be replaced.

- [ ] **Step 1: Update the types** in `client/src/types/trip.ts`:

```ts
export interface HotelDetails {
  address: string | null;
  phone: string | null;
  website: string | null;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
  destinationId: string | null;
  destinationName?: string | null;
}

export type RoomType = 'standard' | 'suite' | 'studio' | '1br' | '2br' | '3br' | 'other';
export type BedType = 'king' | 'queen' | 'full' | 'twin' | 'sofa_bed' | 'bunk' | 'crib';
export type AmenityKey = 'breakfast' | 'fridge' | 'microwave' | 'kitchen' | 'pool' | 'hot_tub' | 'parking' | 'wifi' | 'laundry' | 'airport_shuttle' | 'gym';
export type Refundability = 'free' | 'partial' | 'nonrefundable';

export interface BedCount { type: BedType; count: number }

export interface LodgingRoom {
  roomType: RoomType | null;
  beds: BedCount[];
  roomDescription: string | null;
  amenities: AmenityKey[];
  otherAmenities: string | null;
  refundability: Refundability | null;
  cancelBy: string | null;
  cancellationPolicy: string | null;
}

export interface BookingCoupon {
  id?: string;
  code: string;
  savingsCash: number | null;
  savingsPoints: number | null;
  notes: string | null;
}
```

Add to `Booking` (optional, so existing test fixtures still type-check):

```ts
  bookingSite?: string | null;
  siteItineraryNumber?: string | null;
  advertisedIncludesTaxes?: boolean;
  room?: LodgingRoom | null;
  coupons?: BookingCoupon[];
```

Add to `CreateBookingPayload`:

```ts
  bookingSite?: string | null;
  siteItineraryNumber?: string | null;
  advertisedIncludesTaxes?: boolean;
  room?: LodgingRoom | null;
  coupons?: Omit<BookingCoupon, 'id'>[];
```

`TripElement.hotelDetails?: HotelDetails` stays as is.

- [ ] **Step 2: Update `client/src/api/tripApi.ts`.** Change `TripElementWritePayload` (line ~11) so `typeSpecificData` can carry nulls: `typeSpecificData?: Record<string, unknown>` already allows them, so check that `createElement`/`updateElement` pass it through unchanged. Export the type (`export type TripElementWritePayload = ...`) so the stay form can use it. `createBooking`/`updateBooking` already take `CreateBookingPayload`, so no change is needed beyond the type.

- [ ] **Step 3: Type-check.** `npx tsc -p client/tsconfig.json --noEmit` should give no errors.

- [ ] **Step 4: Commit** with the message `feat(lodging): client types for stays, rooms and coupons` and the trailer.

---

### Task 8: `utils/lodging.ts`: labels and deadline state

**Files:**
- Create: `client/src/utils/lodging.ts`
- Test: `client/src/__tests__/lodging.test.ts` (add to the include)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  bedsLabel, amenitiesLabel, formatTime, perNight, cancelDeadlineState, cancelLabel,
  roomTitle, roomMoneyLine, couponsLabel, ROOM_TYPE_OPTIONS, BOOKING_SITES,
} from '../utils/lodging';
import { Booking } from '../types/trip';

const baseBooking: Booking = {
  id: 'b1', tripId: 't', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null,
  loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [],
  currentConfirmationNumber: null, actualTotalCash: 0, actualTotalPoints: 0,
};

describe('lodging labels', () => {
  it('bedsLabel', () => {
    expect(bedsLabel([{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }])).toBe('1 × King + 1 × Sofa bed');
    expect(bedsLabel([])).toBe('');
  });
  it('amenitiesLabel includes other amenities', () => {
    expect(amenitiesLabel(['breakfast', 'pool'], 'Rooftop bar')).toBe('Breakfast · Pool · Rooftop bar');
    expect(amenitiesLabel([], null)).toBe('');
  });
  it('formatTime', () => {
    expect(formatTime('15:00')).toBe('3:00 PM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatTime(null)).toBe('');
  });
  it('perNight', () => {
    expect(perNight(1612, '2027-03-01', '2027-03-05')).toBe(403);
    expect(perNight(100, '2027-03-01', null)).toBeNull();
    expect(perNight(null, '2027-03-01', '2027-03-05')).toBeNull();
  });
  it('roomTitle', () => {
    expect(roomTitle({ roomType: 'suite', beds: [{ type: 'king', count: 1 }] } as any)).toBe('Suite · 1 × King');
    expect(roomTitle(null)).toBe('Room');
  });
  it('couponsLabel', () => {
    expect(couponsLabel([{ code: 'EXP10', savingsCash: 42.18, savingsPoints: null, notes: null }, { code: 'PTS', savingsCash: null, savingsPoints: 500, notes: null }]))
      .toBe('Coupons: EXP10 −$42.18 · PTS −500 pts');
    expect(couponsLabel([])).toBe('');
  });
  it('exposes options', () => {
    expect(ROOM_TYPE_OPTIONS.map(o => o.value)).toContain('2br');
    expect(BOOKING_SITES[0]).toBe('Expedia');
  });
});

describe('cancelDeadlineState', () => {
  const now = new Date(2027, 1, 20, 12, 0); // Feb 20 2027, noon local
  it('ok when more than 7 days away', () => expect(cancelDeadlineState('2027-02-28', now)).toBe('ok'));
  it('soon at exactly 7 days', () => expect(cancelDeadlineState('2027-02-27', now)).toBe('soon'));
  it('soon today (date-only counts to end of day)', () => expect(cancelDeadlineState('2027-02-20', now)).toBe('soon'));
  it('passed yesterday', () => expect(cancelDeadlineState('2027-02-19', now)).toBe('passed'));
  it('passed earlier today with a time', () => expect(cancelDeadlineState('2027-02-20T09:00', now)).toBe('passed'));
  it('soon later today with a time', () => expect(cancelDeadlineState('2027-02-20T18:00', now)).toBe('soon'));
  it('none when missing', () => expect(cancelDeadlineState(null, now)).toBe('none'));
});

describe('cancelLabel', () => {
  it('free with a deadline', () => expect(cancelLabel({ refundability: 'free', cancelBy: '2027-02-27T18:00' } as any)).toBe('Free cancel until Feb 27, 6:00 PM'));
  it('partial', () => expect(cancelLabel({ refundability: 'partial', cancelBy: '2027-02-27' } as any)).toBe('Partial refund until Feb 27'));
  it('non-refundable', () => expect(cancelLabel({ refundability: 'nonrefundable', cancelBy: null } as any)).toBe('Non-refundable'));
  it('deadline only', () => expect(cancelLabel({ refundability: null, cancelBy: '2027-02-27' } as any)).toBe('Cancel by Feb 27'));
  it('nothing', () => expect(cancelLabel(null)).toBe(''));
});

describe('roomMoneyLine', () => {
  it('advertised total with taxes and per night, plus paid', () => {
    const b = { ...baseBooking, advertisedPriceCash: 1612, advertisedIncludesTaxes: true, actualTotalCash: 1580 };
    expect(roomMoneyLine(b, 4)).toBe('Adv $1,612.00 total incl. taxes ($403.00/nt) · Paid $1,580.00');
  });
  it('points only, no nights', () => {
    const b = { ...baseBooking, advertisedPricePoints: 40000 };
    expect(roomMoneyLine(b, null)).toBe('Adv 40,000 pts total · Paid $0.00');
  });
});
```

- [ ] **Step 2: Run it and check that it fails.** `npx vitest --run client/src/__tests__/lodging.test.ts`

- [ ] **Step 3: Implement**

```ts
// client/src/utils/lodging.ts
import { AmenityKey, BedCount, BedType, Booking, BookingCoupon, LodgingRoom, Refundability, RoomType } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';

export const ROOM_TYPE_OPTIONS: { value: RoomType; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'suite', label: 'Suite' },
  { value: 'studio', label: 'Studio' },
  { value: '1br', label: '1 bedroom' },
  { value: '2br', label: '2 bedroom' },
  { value: '3br', label: '3 bedroom' },
  { value: 'other', label: 'Other' },
];

export const BED_TYPE_OPTIONS: { value: BedType; label: string }[] = [
  { value: 'king', label: 'King' },
  { value: 'queen', label: 'Queen' },
  { value: 'full', label: 'Full' },
  { value: 'twin', label: 'Twin' },
  { value: 'sofa_bed', label: 'Sofa bed' },
  { value: 'bunk', label: 'Bunk' },
  { value: 'crib', label: 'Crib' },
];

export const AMENITY_OPTIONS: { value: AmenityKey; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'microwave', label: 'Microwave' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'pool', label: 'Pool' },
  { value: 'hot_tub', label: 'Hot tub' },
  { value: 'parking', label: 'Parking' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'airport_shuttle', label: 'Airport shuttle' },
  { value: 'gym', label: 'Gym' },
];

export const REFUNDABILITY_OPTIONS: { value: Refundability; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'partial', label: 'Partial' },
  { value: 'nonrefundable', label: 'Non-refundable' },
];

export const BOOKING_SITES = [
  'Expedia', 'Hotels.com', 'Booking.com', 'Direct', 'Chase Travel', 'Amex Travel', 'Costco Travel', 'Capital One Travel',
];

function labelOf<T extends string>(options: { value: T; label: string }[], value: T | null | undefined): string {
  return options.find(o => o.value === value)?.label ?? '';
}

export function roomTypeLabel(value: RoomType | null | undefined): string {
  return labelOf(ROOM_TYPE_OPTIONS, value);
}

export function bedsLabel(beds: BedCount[] | null | undefined): string {
  return (beds ?? []).map(b => `${b.count} × ${labelOf(BED_TYPE_OPTIONS, b.type)}`).join(' + ');
}

export function amenitiesLabel(amenities: AmenityKey[] | null | undefined, other: string | null | undefined): string {
  const parts = (amenities ?? []).map(a => labelOf(AMENITY_OPTIONS, a)).filter(Boolean);
  if (other?.trim()) parts.push(other.trim());
  return parts.join(' · ');
}

export function formatTime(value: string | null | undefined): string {
  const m = value?.match(/^(\d{2}):(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

function shortDate(ymd: string): string {
  const [y, mo, d] = ymd.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDeadline(cancelBy: string): string {
  const time = cancelBy.length > 10 ? formatTime(cancelBy.slice(11, 16)) : '';
  return time ? `${shortDate(cancelBy)}, ${time}` : shortDate(cancelBy);
}

export function perNight(total: number | null | undefined, checkIn: string | null | undefined, checkOut: string | null | undefined): number | null {
  if (total == null || !checkIn || !checkOut) return null;
  const a = Date.UTC(+checkIn.slice(0, 4), +checkIn.slice(5, 7) - 1, +checkIn.slice(8, 10));
  const b = Date.UTC(+checkOut.slice(0, 4), +checkOut.slice(5, 7) - 1, +checkOut.slice(8, 10));
  const nights = Math.round((b - a) / 86400000);
  return nights > 0 ? Math.round((total / nights) * 100) / 100 : null;
}

export type DeadlineState = 'none' | 'ok' | 'soon' | 'passed';

// A date-only deadline lasts until the end of that day. "soon" = within 7 days, today included.
export function cancelDeadlineState(cancelBy: string | null | undefined, now: Date = new Date()): DeadlineState {
  if (!cancelBy) return 'none';
  const [y, mo, d] = cancelBy.slice(0, 10).split('-').map(Number);
  const deadline = cancelBy.length > 10
    ? new Date(y, mo - 1, d, Number(cancelBy.slice(11, 13)), Number(cancelBy.slice(14, 16)))
    : new Date(y, mo - 1, d, 23, 59, 59, 999);
  if (deadline.getTime() < now.getTime()) return 'passed';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDay = new Date(y, mo - 1, d);
  const days = Math.round((deadlineDay.getTime() - today.getTime()) / 86400000);
  return days <= 7 ? 'soon' : 'ok';
}

export function cancelLabel(room: Pick<LodgingRoom, 'refundability' | 'cancelBy'> | null | undefined): string {
  if (!room) return '';
  const until = room.cancelBy ? formatDeadline(room.cancelBy) : '';
  switch (room.refundability) {
    case 'free': return until ? `Free cancel until ${until}` : 'Free cancellation';
    case 'partial': return until ? `Partial refund until ${until}` : 'Partial refund';
    case 'nonrefundable': return 'Non-refundable';
    default: return until ? `Cancel by ${until}` : '';
  }
}

export function roomTitle(room: Pick<LodgingRoom, 'roomType' | 'beds'> | null | undefined): string {
  if (!room) return 'Room';
  const parts = [roomTypeLabel(room.roomType), bedsLabel(room.beds)].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Room';
}

export function couponsLabel(coupons: BookingCoupon[] | null | undefined): string {
  if (!coupons?.length) return '';
  const items = coupons.map(c => {
    const savings = [c.savingsCash ? `−${formatMoney(c.savingsCash)}` : '', c.savingsPoints ? `−${c.savingsPoints.toLocaleString('en-US')} pts` : '']
      .filter(Boolean).join(' ');
    return savings ? `${c.code} ${savings}` : c.code;
  });
  return `Coupons: ${items.join(' · ')}`;
}

// "Adv $1,612.00 total incl. taxes ($403.00/nt) · Paid $1,580.00"
export function roomMoneyLine(booking: Booking, nights: number | null): string {
  const parts: string[] = [];
  const advertised = formatPrice(booking.advertisedPriceCash, booking.advertisedPricePoints);
  if (advertised) {
    let text = `Adv ${advertised} total${booking.advertisedIncludesTaxes ? ' incl. taxes' : ''}`;
    if (booking.advertisedPriceCash && nights && nights > 0) {
      text += ` (${formatMoney(Math.round((booking.advertisedPriceCash / nights) * 100) / 100)}/nt)`;
    }
    parts.push(text);
  }
  const paid = formatPrice(booking.actualTotalCash, booking.actualTotalPoints);
  parts.push(`Paid ${paid || formatMoney(0)}`);
  return parts.join(' · ');
}
```

`formatMoney` uses `Intl` USD with cents, so `$1,612.00` is expected. If the existing `formatPrice` shows cents differently, update the test expectations to match `formatPrice` and `formatMoney` and don't change those helpers.

- [ ] **Step 4: Run the tests and check that they pass.** `npx vitest --run client/src/__tests__/lodging.test.ts`
- [ ] **Step 5: Commit** with the message `feat(lodging): client label and deadline helpers` and the trailer.

---

### Task 9: Stay and room drafts

**Files:**
- Create: `client/src/utils/stayDraft.ts`, `client/src/utils/roomDraft.ts`
- Test: `client/src/__tests__/lodgingDrafts.test.ts` (add to the include)

Drafts are the string-valued form state. They convert to API payloads and validate on the client (mirroring the server).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { emptyStayDraft, stayDraftFromElement, validateStayDraft, stayPayload, addDays } from '../utils/stayDraft';
import { emptyRoomDraft, roomDraftFromBooking, validateRoomDraft, roomPayload } from '../utils/roomDraft';

describe('stay drafts', () => {
  it('addDays', () => expect(addDays('2027-02-28', 1)).toBe('2027-03-01'));
  it('validates', () => {
    expect(validateStayDraft({ ...emptyStayDraft(), name: '' })).toMatch(/name/i);
    expect(validateStayDraft({ ...emptyStayDraft(), name: 'H', checkInDate: '2027-01-02', checkOutDate: '2027-01-02' })).toMatch(/after/i);
    expect(validateStayDraft({ ...emptyStayDraft(), name: 'H', checkInDate: '2027-01-02', checkOutDate: '' })).toMatch(/check-out/i);
    expect(validateStayDraft({ ...emptyStayDraft(), name: 'H', checkInDate: '2027-01-02', checkOutDate: '2027-01-03' })).toBeNull();
  });
  it('builds a payload, blanks become null', () => {
    const draft = { ...emptyStayDraft(), name: ' Casa ', address: '1 Rd', checkInDate: '2027-01-02', checkOutDate: '2027-01-03', checkInTime: '15:00', notes: '' };
    expect(stayPayload(draft)).toEqual({
      elementType: 'hotel', name: 'Casa', notes: null,
      typeSpecificData: { address: '1 Rd', phone: null, website: null, checkInDate: '2027-01-02', checkInTime: '15:00',
        checkOutDate: '2027-01-03', checkOutTime: null, destinationId: null },
    });
  });
  it('round-trips an element', () => {
    const draft = stayDraftFromElement({ id: 'h', name: 'Casa', notes: 'n', elementType: 'hotel',
      hotelDetails: { address: 'A', phone: null, website: null, checkInDate: '2027-01-02', checkInTime: null, checkOutDate: '2027-01-03', checkOutTime: '11:00', destinationId: 'd1' } } as any);
    expect(draft).toMatchObject({ name: 'Casa', notes: 'n', address: 'A', phone: '', checkOutTime: '11:00', destinationId: 'd1' });
  });
});

describe('room drafts', () => {
  it('validates numbers, beds and coupons', () => {
    expect(validateRoomDraft({ ...emptyRoomDraft(), priceCash: 'abc' })).toMatch(/price/i);
    expect(validateRoomDraft({ ...emptyRoomDraft(), beds: [{ type: 'king', count: 1 }, { type: 'king', count: 1 }] })).toMatch(/once/i);
    expect(validateRoomDraft({ ...emptyRoomDraft(), coupons: [{ code: '', savingsCash: '', savingsPoints: '', notes: '' }] })).toMatch(/code/i);
    expect(validateRoomDraft({ ...emptyRoomDraft(), cancelTime: '18:00' })).toMatch(/date/i);
    expect(validateRoomDraft(emptyRoomDraft())).toBeNull();
  });
  it('builds a booking payload', () => {
    const draft = {
      ...emptyRoomDraft(), bookingSite: 'Expedia', siteItineraryNumber: '7300', confirmationNumber: 'H1',
      priceCash: '1612', pricePoints: '', includesTaxes: true, roomType: 'suite' as const,
      beds: [{ type: 'king' as const, count: 1 }], amenities: ['pool' as const], refundability: 'free' as const,
      cancelDate: '2027-02-27', cancelTime: '18:00',
      coupons: [{ code: 'EXP10', savingsCash: '42.18', savingsPoints: '', notes: '' }], travelerIds: [],
    };
    expect(roomPayload(draft, 'h1')).toEqual({
      elementIds: ['h1'], travelerIds: [],
      bookingSite: 'Expedia', siteItineraryNumber: '7300', confirmationNumber: 'H1', loyaltyProgram: null,
      advertisedPriceCash: 1612, advertisedPricePoints: null, advertisedIncludesTaxes: true, notes: null,
      room: { roomType: 'suite', beds: [{ type: 'king', count: 1 }], roomDescription: null, amenities: ['pool'], otherAmenities: null,
        refundability: 'free', cancelBy: '2027-02-27T18:00', cancellationPolicy: null },
      coupons: [{ code: 'EXP10', savingsCash: 42.18, savingsPoints: null, notes: null }],
    });
  });
  it('drafts from a booking', () => {
    const draft = roomDraftFromBooking({
      id: 'b', tripId: 't', confirmationNumber: 'H1', advertisedPriceCash: 900, advertisedPricePoints: null, loyaltyProgram: null,
      notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: ['p1'], currentConfirmationNumber: 'H1',
      actualTotalCash: 0, actualTotalPoints: 0, bookingSite: 'Expedia', siteItineraryNumber: null, advertisedIncludesTaxes: false,
      room: { roomType: null, beds: [], roomDescription: null, amenities: [], otherAmenities: null, refundability: null, cancelBy: '2027-02-27T18:00', cancellationPolicy: null },
      coupons: [],
    });
    expect(draft).toMatchObject({ confirmationNumber: 'H1', priceCash: '900', bookingSite: 'Expedia', cancelDate: '2027-02-27', cancelTime: '18:00', travelerIds: ['p1'] });
  });
});
```

- [ ] **Step 2: Run it and check that it fails.** `npx vitest --run client/src/__tests__/lodgingDrafts.test.ts`

- [ ] **Step 3: Implement**

```ts
// client/src/utils/stayDraft.ts
import { TripElement } from '../types/trip';

export interface StayDraft {
  name: string;
  address: string;
  phone: string;
  website: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  destinationId: string | null;
  notes: string;
}

export function emptyStayDraft(): StayDraft {
  return { name: '', address: '', phone: '', website: '', checkInDate: '', checkInTime: '', checkOutDate: '', checkOutTime: '', destinationId: null, notes: '' };
}

export function stayDraftFromElement(element: TripElement): StayDraft {
  const h = element.hotelDetails;
  return {
    name: element.name ?? '', notes: element.notes ?? '',
    address: h?.address ?? '', phone: h?.phone ?? '', website: h?.website ?? '',
    checkInDate: h?.checkInDate ?? '', checkInTime: h?.checkInTime ?? '',
    checkOutDate: h?.checkOutDate ?? '', checkOutTime: h?.checkOutTime ?? '',
    destinationId: h?.destinationId ?? null,
  };
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateStayDraft(draft: StayDraft): string | null {
  if (!draft.name.trim()) return 'Hotel name is required';
  if (!draft.checkInDate) return 'Check-in date is required';
  if (!draft.checkOutDate) return 'Check-out date is required';
  if (!DATE_RE.test(draft.checkInDate) || !DATE_RE.test(draft.checkOutDate)) return 'Dates must be YYYY-MM-DD';
  if (draft.checkOutDate <= draft.checkInDate) return 'Check-out must be after check-in';
  return null;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);

export function stayPayload(draft: StayDraft) {
  return {
    elementType: 'hotel' as const,
    name: draft.name.trim(),
    notes: blank(draft.notes),
    typeSpecificData: {
      address: blank(draft.address), phone: blank(draft.phone), website: blank(draft.website),
      checkInDate: draft.checkInDate, checkInTime: blank(draft.checkInTime),
      checkOutDate: draft.checkOutDate, checkOutTime: blank(draft.checkOutTime),
      destinationId: draft.destinationId || null,
    },
  };
}
```

```ts
// client/src/utils/roomDraft.ts
import { AmenityKey, BedCount, Booking, CreateBookingPayload, Refundability, RoomType } from '../types/trip';

export interface CouponDraft { code: string; savingsCash: string; savingsPoints: string; notes: string }

export interface RoomDraft {
  bookingSite: string;
  siteItineraryNumber: string;
  confirmationNumber: string;
  loyaltyProgram: string;
  priceCash: string;
  pricePoints: string;
  includesTaxes: boolean;
  roomType: RoomType | null;
  beds: BedCount[];
  roomDescription: string;
  amenities: AmenityKey[];
  otherAmenities: string;
  refundability: Refundability | null;
  cancelDate: string;
  cancelTime: string;
  cancellationPolicy: string;
  coupons: CouponDraft[];
  travelerIds: string[];
  notes: string;
}

export function emptyRoomDraft(): RoomDraft {
  return {
    bookingSite: '', siteItineraryNumber: '', confirmationNumber: '', loyaltyProgram: '',
    priceCash: '', pricePoints: '', includesTaxes: false,
    roomType: null, beds: [], roomDescription: '', amenities: [], otherAmenities: '',
    refundability: null, cancelDate: '', cancelTime: '', cancellationPolicy: '',
    coupons: [], travelerIds: [], notes: '',
  };
}

const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export function roomDraftFromBooking(booking: Booking): RoomDraft {
  const room = booking.room;
  const cancelBy = room?.cancelBy ?? '';
  return {
    bookingSite: booking.bookingSite ?? '', siteItineraryNumber: booking.siteItineraryNumber ?? '',
    confirmationNumber: booking.confirmationNumber ?? '', loyaltyProgram: booking.loyaltyProgram ?? '',
    priceCash: str(booking.advertisedPriceCash), pricePoints: str(booking.advertisedPricePoints),
    includesTaxes: Boolean(booking.advertisedIncludesTaxes),
    roomType: room?.roomType ?? null, beds: room?.beds ?? [], roomDescription: room?.roomDescription ?? '',
    amenities: room?.amenities ?? [], otherAmenities: room?.otherAmenities ?? '',
    refundability: room?.refundability ?? null,
    cancelDate: cancelBy.slice(0, 10), cancelTime: cancelBy.length > 10 ? cancelBy.slice(11, 16) : '',
    cancellationPolicy: room?.cancellationPolicy ?? '',
    coupons: (booking.coupons ?? []).map(c => ({ code: c.code, savingsCash: str(c.savingsCash), savingsPoints: str(c.savingsPoints), notes: c.notes ?? '' })),
    travelerIds: booking.travelerIds, notes: booking.notes ?? '',
  };
}

function num(v: string): number | null | 'invalid' {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

export function validateRoomDraft(draft: RoomDraft): string | null {
  if (num(draft.priceCash) === 'invalid') return 'Advertised price must be a number';
  const pts = num(draft.pricePoints);
  if (pts === 'invalid' || (typeof pts === 'number' && !Number.isInteger(pts))) return 'Advertised points must be a whole number';
  const seen = new Set<string>();
  for (const bed of draft.beds) {
    if (!Number.isInteger(bed.count) || bed.count < 1 || bed.count > 9) return 'Bed count must be 1 to 9';
    if (seen.has(bed.type)) return 'Each bed type may appear once';
    seen.add(bed.type);
  }
  if (draft.cancelTime && !draft.cancelDate) return 'Add a cancel-by date for the time';
  for (const c of draft.coupons) {
    if (!c.code.trim()) return 'Coupon code is required';
    if (num(c.savingsCash) === 'invalid') return 'Coupon savings must be a number';
    const p = num(c.savingsPoints);
    if (p === 'invalid' || (typeof p === 'number' && !Number.isInteger(p))) return 'Coupon points must be a whole number';
  }
  return null;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);
const numOrNull = (v: string) => { const n = num(v); return typeof n === 'number' ? n : null; };

export function roomPayload(draft: RoomDraft, stayId: string): CreateBookingPayload {
  return {
    elementIds: [stayId],
    travelerIds: draft.travelerIds,
    bookingSite: blank(draft.bookingSite),
    siteItineraryNumber: blank(draft.siteItineraryNumber),
    confirmationNumber: blank(draft.confirmationNumber),
    loyaltyProgram: blank(draft.loyaltyProgram),
    advertisedPriceCash: numOrNull(draft.priceCash),
    advertisedPricePoints: numOrNull(draft.pricePoints),
    advertisedIncludesTaxes: draft.includesTaxes,
    notes: blank(draft.notes),
    room: {
      roomType: draft.roomType,
      beds: draft.beds,
      roomDescription: blank(draft.roomDescription),
      amenities: draft.amenities,
      otherAmenities: blank(draft.otherAmenities),
      refundability: draft.refundability,
      cancelBy: draft.cancelDate ? (draft.cancelTime ? `${draft.cancelDate}T${draft.cancelTime}` : draft.cancelDate) : null,
      cancellationPolicy: blank(draft.cancellationPolicy),
    },
    coupons: draft.coupons.map(c => ({ code: c.code.trim(), savingsCash: numOrNull(c.savingsCash), savingsPoints: numOrNull(c.savingsPoints), notes: blank(c.notes) })),
  };
}
```

- [ ] **Step 4: Run the tests and check that they pass.** Then run `npx tsc -p client/tsconfig.json --noEmit`.
- [ ] **Step 5: Commit** with the message `feat(lodging): stay and room form drafts` and the trailer.

---

### Task 10: `utils/lodgingRows.ts`

**Files:**
- Create: `client/src/utils/lodgingRows.ts`
- Test: `client/src/__tests__/lodgingRows.test.ts` (add to the include)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildLodgingRows, lodgingTotals } from '../utils/lodgingRows';
import { Booking, TripDestination, TripElement } from '../types/trip';

const now = new Date(2027, 1, 20, 12, 0);
function stay(id: string, name: string, checkIn: string, checkOut: string, destinationId: string | null = null): TripElement {
  return { id, tripId: 't', elementType: 'hotel', name, sortPosition: 0, createdAt: '', updatedAt: '',
    hotelDetails: { address: null, phone: null, website: null, checkInDate: checkIn, checkInTime: null, checkOutDate: checkOut, checkOutTime: null, destinationId } };
}
function room(id: string, elementId: string, extra: Partial<Booking> = {}): Booking {
  return { id, tripId: 't', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null, loyaltyProgram: null,
    notes: null, createdAt: '', updatedAt: '', elementIds: [elementId], travelerIds: [], currentConfirmationNumber: null,
    actualTotalCash: 0, actualTotalPoints: 0, room: null, coupons: [], ...extra };
}
const destinations: TripDestination[] = [{ id: 'd1', tripId: 't', name: 'Paris', color: '#f00', position: 0, packingListId: 'p', memberIds: [] }];

describe('buildLodgingRows', () => {
  it('sorts by check-in then name and ignores non-hotels', () => {
    const rows = buildLodgingRows([
      stay('b', 'Beta', '2027-03-01', '2027-03-02'), stay('a', 'Alpha', '2027-03-01', '2027-03-02'),
      stay('c', 'Earlier', '2027-02-01', '2027-02-02'), { ...stay('f', 'Flight', '', ''), elementType: 'flight' },
    ], [], destinations, now);
    expect(rows.map(r => r.name)).toEqual(['Earlier', 'Alpha', 'Beta']);
  });

  it('builds date, price, confirm, room count and destination', () => {
    const rows = buildLodgingRows([stay('h', 'Hyatt', '2027-03-01', '2027-03-05', 'd1')], [
      room('r1', 'h', { advertisedPriceCash: 1000, siteItineraryNumber: '7231', currentConfirmationNumber: 'H-1' }),
      room('r2', 'h', { advertisedPriceCash: 612, siteItineraryNumber: '9999', currentConfirmationNumber: 'H-2' }),
    ], destinations, now);
    expect(rows[0]).toMatchObject({
      id: 'h', nights: 4, priceLabel: '$1,612.00 ($403.00/nt)',
      confirmation: '7231 / H-1 +1', roomCount: 2, destination: { name: 'Paris', color: '#f00' },
    });
    expect(rows[0].dateLabel).toMatch(/Mar 1 → Mar 5 · 4 nts/);
  });

  it('falls back to paid, then a dash', () => {
    const paid = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [room('r', 'h', { actualTotalCash: 300 })], [], now);
    expect(paid[0].priceLabel).toBe('Paid $300.00');
    const none = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [], [], now);
    expect(none[0]).toMatchObject({ priceLabel: '—', confirmation: '—', roomCount: 0 });
  });

  it('no +N when rooms share a confirmation', () => {
    const rows = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [
      room('r1', 'h', { siteItineraryNumber: '7231' }), room('r2', 'h', { siteItineraryNumber: '7231' }),
    ], [], now);
    expect(rows[0].confirmation).toBe('7231');
  });

  it('picks the earliest non-passed deadline, else the latest passed', () => {
    const r = (id: string, cancelBy: string) => room(id, 'h', { room: { roomType: null, beds: [], roomDescription: null, amenities: [], otherAmenities: null, refundability: 'free', cancelBy, cancellationPolicy: null } });
    const upcoming = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [r('a', '2027-03-10'), r('b', '2027-02-25'), r('c', '2027-02-01')], [], now);
    expect(upcoming[0].deadline).toEqual({ label: 'Free cancel until Feb 25', state: 'soon' });
    const passed = buildLodgingRows([stay('h', 'H', '2027-03-01', '2027-03-03')], [r('a', '2027-02-01'), r('b', '2027-02-10')], [], now);
    expect(passed[0].deadline).toEqual({ label: 'Free cancel until Feb 10', state: 'passed' });
  });
});

describe('lodgingTotals', () => {
  it('sums advertised totals across rooms of non-deleted stays, falling back to paid per room', () => {
    const elements = [stay('h', 'H', '2027-03-01', '2027-03-03')];
    const bookings = [room('r1', 'h', { advertisedPriceCash: 1000 }), room('r2', 'h', { advertisedPricePoints: 40000, actualTotalCash: 0 }),
      room('r3', 'h', { actualTotalCash: 200 }), room('orphan', 'gone', { advertisedPriceCash: 999 })];
    expect(lodgingTotals(elements, bookings).label).toBe('40,000 pts + $1,200.00');
  });
});
```

- [ ] **Step 2: Run it and check that it fails.** `npx vitest --run client/src/__tests__/lodgingRows.test.ts`

- [ ] **Step 3: Implement**

```ts
// client/src/utils/lodgingRows.ts
import { Booking, TripDestination, TripElement } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';
import { nightsBetween } from './tripDates';
import { DeadlineState, cancelDeadlineState, cancelLabel } from './lodging';

export interface LodgingRow {
  id: string;
  name: string;
  checkInDate: string;
  dateLabel: string;
  nights: number | null;
  priceLabel: string;
  confirmation: string;
  roomCount: number;
  destination: { name: string; color: string | null } | null;
  deadline: { label: string; state: Exclude<DeadlineState, 'none'> } | null;
}

function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function roomsFor(elementId: string, bookings: Booking[]): Booking[] {
  return bookings.filter(b => b.elementIds.length === 1 && b.elementIds[0] === elementId);
}

function confirmLabel(b: Booking): string {
  return [b.siteItineraryNumber, b.currentConfirmationNumber].filter(Boolean).join(' / ');
}

export function buildLodgingRows(elements: TripElement[], bookings: Booking[], destinations: TripDestination[], now: Date = new Date()): LodgingRow[] {
  return elements
    .filter(e => e.elementType === 'hotel')
    .map(element => {
      const h = element.hotelDetails;
      const rooms = roomsFor(element.id, bookings);
      const nights = nightsBetween(h?.checkInDate, h?.checkOutDate);
      const dateLabel = h?.checkInDate && h?.checkOutDate
        ? `${shortDate(h.checkInDate)} → ${shortDate(h.checkOutDate)}${nights ? ` · ${nights} nt${nights === 1 ? '' : 's'}` : ''}`
        : '';

      const advCash = rooms.reduce((s, r) => s + (r.advertisedPriceCash ?? 0), 0);
      const advPts = rooms.reduce((s, r) => s + (r.advertisedPricePoints ?? 0), 0);
      const paidCash = rooms.reduce((s, r) => s + r.actualTotalCash, 0);
      const paidPts = rooms.reduce((s, r) => s + r.actualTotalPoints, 0);
      let priceLabel = '—';
      if (advCash || advPts) {
        priceLabel = formatPrice(advCash, advPts);
        if (advCash && nights) priceLabel += ` (${formatMoney(Math.round((advCash / nights) * 100) / 100)}/nt)`;
      } else if (paidCash || paidPts) {
        priceLabel = `Paid ${formatPrice(paidCash, paidPts)}`;
      }

      const labels = rooms.map(confirmLabel);
      const first = labels[0] ?? '';
      const distinct = new Set(labels.filter(Boolean));
      const extra = first && distinct.size > 1 ? ` +${distinct.size - 1}` : '';
      const confirmation = first ? `${first}${extra}` : '—';

      const deadlines = rooms
        .filter(r => r.room?.cancelBy)
        .map(r => ({ cancelBy: r.room!.cancelBy!, label: cancelLabel(r.room), state: cancelDeadlineState(r.room!.cancelBy, now) }));
      const upcoming = deadlines.filter(d => d.state !== 'passed').sort((a, b) => (a.cancelBy < b.cancelBy ? -1 : 1));
      const passed = deadlines.filter(d => d.state === 'passed').sort((a, b) => (a.cancelBy < b.cancelBy ? 1 : -1));
      const pick = upcoming[0] ?? passed[0];

      const dest = h?.destinationId ? destinations.find(d => d.id === h.destinationId) : undefined;

      return {
        id: element.id,
        name: element.name,
        checkInDate: h?.checkInDate ?? '',
        dateLabel,
        nights,
        priceLabel,
        confirmation,
        roomCount: rooms.length,
        destination: dest ? { name: dest.name, color: dest.color } : null,
        deadline: pick ? { label: pick.label, state: pick.state as Exclude<DeadlineState, 'none'> } : null,
      };
    })
    .sort((a, b) => {
      if (a.checkInDate !== b.checkInDate) {
        if (!a.checkInDate) return 1;
        if (!b.checkInDate) return -1;
        return a.checkInDate < b.checkInDate ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

// Each room counts its advertised total, or what was paid when nothing was advertised.
export function lodgingTotals(elements: TripElement[], bookings: Booking[]): { cash: number; points: number; label: string } {
  const stayIds = new Set(elements.filter(e => e.elementType === 'hotel').map(e => e.id));
  let cash = 0;
  let points = 0;
  for (const b of bookings) {
    if (b.elementIds.length !== 1 || !stayIds.has(b.elementIds[0])) continue;
    if (b.advertisedPriceCash || b.advertisedPricePoints) {
      cash += b.advertisedPriceCash ?? 0;
      points += b.advertisedPricePoints ?? 0;
    } else {
      cash += b.actualTotalCash;
      points += b.actualTotalPoints;
    }
  }
  return { cash, points, label: formatPrice(cash, points) };
}
```

Spec note: the section band shows "Total …"; the row price uses advertised, else paid, else "—". That is what this implements.

- [ ] **Step 4: Run the tests and check that they pass.** Adjust only the expected strings if `formatPrice`/`formatMoney` output differs; don't change the logic.
- [ ] **Step 5: Commit** with the message `feat(lodging): lodging row model and totals` and the trailer.

---

### Task 11: AddMenu and TripHeader

**Files:**
- Create: `client/src/components/AddMenu.tsx`
- Modify: `client/src/components/TripHeader.tsx`
- Test: `client/src/__tests__/AddMenu.test.tsx` (add to the include)

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { AddMenu } from '../components/AddMenu';

describe('AddMenu', () => {
  afterEach(() => cleanup());

  it('opens a menu with Flight and Lodging', async () => {
    const onAddFlight = vi.fn();
    const onAddLodging = vi.fn();
    renderWithMantine(<AddMenu onAddFlight={onAddFlight} onAddLodging={onAddLodging} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Lodging' }));
    expect(onAddLodging).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Flight' }));
    expect(onAddFlight).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and check that it fails.** `npx vitest --run client/src/__tests__/AddMenu.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// client/src/components/AddMenu.tsx
import { Button, Menu } from '@mantine/core';
import { IconBed, IconPlane, IconPlus } from '@tabler/icons-react';

interface AddMenuProps {
  onAddFlight: () => void;
  onAddLodging: () => void;
  className?: string;
}

export function AddMenu({ onAddFlight, onAddLodging, className }: AddMenuProps) {
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button className={className} leftSection={<IconPlus size={16} />}>Add</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPlane size={14} />} onClick={onAddFlight}>Flight</Menu.Item>
        <Menu.Item leftSection={<IconBed size={14} />} onClick={onAddLodging}>Lodging</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
```

In `TripHeader.tsx`, replace the props `onAdd`/`addLabel` with `onAddFlight: () => void; onAddLodging: () => void;`, and replace the `<Button className={classes.add} …>` with:

```tsx
<AddMenu className={classes.add} onAddFlight={onAddFlight} onAddLodging={onAddLodging} />
```

Remove the now-unused `Button`/`IconPlus` imports. The `.header .add` CSS keeps it as the floating action button on mobile. `grep -rn "TripHeader" client/src` shows the only caller is TripDetailPage. Update that call in Task 17, or make the minimal change now: `onAddFlight={() => setAdding(true)} onAddLodging={() => {}}` so tsc passes. Task 17 replaces it.

- [ ] **Step 4: Run the tests and check that they pass.** `npx vitest --run client/src/__tests__/AddMenu.test.tsx` and `npx tsc -p client/tsconfig.json --noEmit`.
  `TripDetailPage.test.tsx` will now fail where it clicks "Add flight". Fix those tests in this task: click `getByRole('button', { name: 'Add' })`, then `findByRole('menuitem', { name: 'Flight' })`. Then run `npx vitest --run client/src/__tests__/TripDetailPage.test.tsx`; it should pass.
- [ ] **Step 5: Commit** with the message `feat(lodging): Add menu with Flight and Lodging` and the trailer.

---

### Task 12: LodgingStayForm and AddLodgingDialog

**Files:**
- Create: `client/src/components/LodgingStayForm.tsx`, `client/src/components/AddLodgingDialog.tsx`
- Test: `client/src/__tests__/AddLodgingDialog.test.tsx` (add to the include)

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { AddLodgingDialog } from '../components/AddLodgingDialog';
import { tripApi } from '../api/tripApi';

vi.mock('../api/tripApi', () => ({ tripApi: { createElement: vi.fn() } }));

describe('AddLodgingDialog', () => {
  beforeEach(() => vi.mocked(tripApi.createElement).mockReset());
  afterEach(() => cleanup());

  it('requires a name', async () => {
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    expect(await screen.findByText('Hotel name is required')).toBeTruthy();
    expect(tripApi.createElement).not.toHaveBeenCalled();
  });

  it('defaults check-out to check-in + 1 and creates the stay', async () => {
    const created = { id: 'h1', elementType: 'hotel', name: 'Casa' };
    vi.mocked(tripApi.createElement).mockResolvedValue(created as any);
    const onCreated = vi.fn();
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={onCreated} />);
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Casa');
    fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value: '2027-03-01' } });
    expect((screen.getByLabelText('Check-out date') as HTMLInputElement).value).toBe('2027-03-02');
    expect(screen.queryByLabelText('Destination')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(tripApi.createElement).toHaveBeenCalledWith('t1', expect.objectContaining({
      elementType: 'hotel', name: 'Casa',
      typeSpecificData: expect.objectContaining({ checkInDate: '2027-03-01', checkOutDate: '2027-03-02', destinationId: null }),
    }));
  });

  it('shows the destination select when the trip has destinations', () => {
    renderWithMantine(<AddLodgingDialog tripId="t1" opened
      destinations={[{ id: 'd1', tripId: 't1', name: 'Paris', color: null, position: 0, packingListId: 'p', memberIds: [] }]}
      onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByLabelText('Destination')).toBeTruthy();
  });

  it('shows server errors inline', async () => {
    vi.mocked(tripApi.createElement).mockRejectedValue(new Error('Destination not found'));
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Casa');
    fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value: '2027-03-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    expect(await screen.findByText('Destination not found')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it and check that it fails.**

- [ ] **Step 3: Implement**

```tsx
// client/src/components/LodgingStayForm.tsx
import { useId } from 'react';
import { Select, SimpleGrid, TextInput, Textarea } from '@mantine/core';
import { TripDestination } from '../types/trip';
import { StayDraft, addDays } from '../utils/stayDraft';

interface LodgingStayFormProps {
  draft: StayDraft;
  onChange: (draft: StayDraft) => void;
  destinations: TripDestination[];
}

export function LodgingStayForm({ draft, onChange, destinations }: LodgingStayFormProps) {
  const uid = useId();
  const set = <K extends keyof StayDraft>(key: K, value: StayDraft[K]) => onChange({ ...draft, [key]: value });

  const setCheckIn = (value: string) => {
    const next = { ...draft, checkInDate: value };
    if (value && !draft.checkOutDate) next.checkOutDate = addDays(value, 1);
    onChange(next);
  };

  return (
    <>
      <TextInput id={`${uid}-name`} label="Hotel name" value={draft.name} onChange={e => set('name', e.currentTarget.value)} />
      <Textarea id={`${uid}-address`} mt="xs" label="Address" autosize minRows={2} value={draft.address} onChange={e => set('address', e.currentTarget.value)} />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt="xs">
        <TextInput id={`${uid}-phone`} label="Phone" type="tel" value={draft.phone} onChange={e => set('phone', e.currentTarget.value)} />
        <TextInput id={`${uid}-website`} label="Website" type="url" value={draft.website} onChange={e => set('website', e.currentTarget.value)} />
        <TextInput id={`${uid}-in-date`} label="Check-in date" type="date" value={draft.checkInDate} onChange={e => setCheckIn(e.currentTarget.value)} />
        <TextInput id={`${uid}-in-time`} label="Check-in time" type="time" value={draft.checkInTime} onChange={e => set('checkInTime', e.currentTarget.value)} />
        <TextInput id={`${uid}-out-date`} label="Check-out date" type="date" value={draft.checkOutDate} onChange={e => set('checkOutDate', e.currentTarget.value)} />
        <TextInput id={`${uid}-out-time`} label="Check-out time" type="time" value={draft.checkOutTime} onChange={e => set('checkOutTime', e.currentTarget.value)} />
      </SimpleGrid>
      {destinations.length > 0 && (
        <Select
          id={`${uid}-destination`}
          mt="xs"
          label="Destination"
          placeholder="None"
          clearable
          data={destinations.map(d => ({ value: d.id, label: d.name }))}
          value={draft.destinationId}
          onChange={value => set('destinationId', value)}
        />
      )}
      <Textarea id={`${uid}-notes`} mt="xs" label="Notes" autosize minRows={1} value={draft.notes} onChange={e => set('notes', e.currentTarget.value)} />
    </>
  );
}
```

```tsx
// client/src/components/AddLodgingDialog.tsx
import { useState } from 'react';
import { Alert, Button, Group, Modal, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { tripApi } from '../api/tripApi';
import { TripDestination, TripElement } from '../types/trip';
import { LodgingStayForm } from './LodgingStayForm';
import { emptyStayDraft, stayPayload, validateStayDraft } from '../utils/stayDraft';

interface AddLodgingDialogProps {
  tripId: string;
  opened: boolean;
  destinations: TripDestination[];
  onClose: () => void;
  onCreated: (element: TripElement) => Promise<void> | void;
}

export function AddLodgingDialog({ tripId, opened, destinations, onClose, onCreated }: AddLodgingDialogProps) {
  const isMobile = Boolean(useMediaQuery('(max-width: 48em)'));
  const [draft, setDraft] = useState(emptyStayDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDraft(emptyStayDraft());
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const save = async () => {
    const problem = validateStayDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const created = await tripApi.createElement(tripId, stayPayload(draft));
      reset();
      await onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add lodging');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Add lodging" size="lg" fullScreen={isMobile}>
      {error && <Alert color="red" mb="sm">{error}</Alert>}
      <LodgingStayForm draft={draft} onChange={setDraft} destinations={destinations} />
      <Text size="sm" c="dimmed" mt="xs">
        Rooms, pricing, confirmation numbers and cancellation are entered per room after saving.
      </Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={handleClose}>Cancel</Button>
        <Button onClick={save} loading={saving}>Save stay</Button>
      </Group>
    </Modal>
  );
}
```

Check the return type of `tripApi.createElement`. If it returns `Promise<TripElement>`, this is fine. If its parameter type rejects `stayPayload`'s shape (for example, if `name` or `elementType` is typed narrowly), widen `TripElementWritePayload` to match: `elementType: TripElement['elementType']`, `name?: string`.

- [ ] **Step 4: Run the tests and check that they pass.** Also run tsc.
- [ ] **Step 5: Commit** with the message `feat(lodging): Add lodging dialog and shared stay form` and the trailer.

---

### Task 13: LodgingDetailsTab

**Files:**
- Create: `client/src/components/LodgingDetailsTab.tsx`
- Test: `client/src/__tests__/LodgingDetailsTab.test.tsx` (add to the include)

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingDetailsTab } from '../components/LodgingDetailsTab';
import { tripApi } from '../api/tripApi';
import { TripElement } from '../types/trip';

vi.mock('../api/tripApi', () => ({ tripApi: { updateElement: vi.fn(), deleteElement: vi.fn() } }));

const element: TripElement = {
  id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt Ziva', sortPosition: 0, createdAt: '', updatedAt: '', notes: 'Ocean view',
  hotelDetails: { address: '1 Beach Rd, Cabo', phone: '+1 555', website: 'https://hyatt.com', checkInDate: '2027-03-01', checkInTime: '15:00',
    checkOutDate: '2027-03-05', checkOutTime: '11:00', destinationId: 'd1', destinationName: 'Cabo' },
};

describe('LodgingDetailsTab', () => {
  beforeEach(() => { vi.mocked(tripApi.updateElement).mockReset(); vi.mocked(tripApi.deleteElement).mockReset(); });
  afterEach(() => cleanup());

  it('shows details with links', () => {
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} destinations={[]} onChanged={() => {}} onDeleted={() => {}} onEditingChange={() => {}} />);
    expect(screen.getByRole('link', { name: 'Open in Maps' }).getAttribute('href'))
      .toBe('https://www.google.com/maps/search/?api=1&query=1%20Beach%20Rd%2C%20Cabo');
    expect(screen.getByRole('link', { name: '+1 555' }).getAttribute('href')).toBe('tel:+1 555');
    const site = screen.getByRole('link', { name: 'https://hyatt.com' });
    expect(site.getAttribute('target')).toBe('_blank');
    expect(screen.getByText(/Mar 1, 3:00 PM → Mar 5, 11:00 AM · 4 nights/)).toBeTruthy();
    expect(screen.getByText('Cabo')).toBeTruthy();
    expect(screen.getByText('Ocean view')).toBeTruthy();
  });

  it('edits and saves', async () => {
    vi.mocked(tripApi.updateElement).mockResolvedValue({} as any);
    const onChanged = vi.fn();
    const onEditingChange = vi.fn();
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} destinations={[]} onChanged={onChanged} onDeleted={() => {}} onEditingChange={onEditingChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit stay' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    const name = screen.getByLabelText('Hotel name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Hyatt');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(tripApi.updateElement).toHaveBeenCalledWith('t1', 'h1', expect.objectContaining({ name: 'Hyatt' }));
  });

  it('confirms before deleting', async () => {
    vi.mocked(tripApi.deleteElement).mockResolvedValue(undefined as any);
    const onDeleted = vi.fn();
    renderWithMantine(<LodgingDetailsTab tripId="t1" element={element} destinations={[]} onChanged={() => {}} onDeleted={onDeleted} onEditingChange={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete stay' }));
    expect(screen.getByText('Delete this stay?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(tripApi.deleteElement).toHaveBeenCalledWith('t1', 'h1');
  });
});
```

Before writing the test, check the argument order of `tripApi.updateElement` and `tripApi.deleteElement` in `client/src/api/tripApi.ts` (lines ~105 and ~123), and see how `FlightDetailsTab.tsx` calls them. Match the test and the implementation to the real signatures.

- [ ] **Step 2: Run it and check that it fails.**

- [ ] **Step 3: Implement**

```tsx
// client/src/components/LodgingDetailsTab.tsx
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { TripDestination, TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { LodgingStayForm } from './LodgingStayForm';
import { StayDraft, stayDraftFromElement, stayPayload, validateStayDraft } from '../utils/stayDraft';
import { formatTime } from '../utils/lodging';
import { formatNights, nightsBetween } from '../utils/tripDates';

interface LodgingDetailsTabProps {
  tripId: string;
  element: TripElement;
  destinations: TripDestination[];
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
}

function dayLabel(ymd: string | null | undefined, time: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const t = formatTime(time);
  return t ? `${date}, ${t}` : date;
}

export function LodgingDetailsTab({ tripId, element, destinations, onChanged, onDeleted, onEditingChange }: LodgingDetailsTabProps) {
  const [draft, setDraft] = useState<StayDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const editing = draft !== null;
  useEffect(() => {
    onEditingChangeRef.current(editing);
  }, [editing]);
  useEffect(() => () => onEditingChangeRef.current(false), []);

  const h = element.hotelDetails;

  const save = async () => {
    if (!draft) return;
    const problem = validateStayDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const { elementType: _type, ...payload } = stayPayload(draft);
      await tripApi.updateElement(tripId, element.id, payload);
      setDraft(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stay');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      setDeleting(true);
      setError(null);
      await tripApi.deleteElement(tripId, element.id);
      await onDeleted();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete stay');
    } finally {
      setDeleting(false);
    }
  };

  if (draft) {
    return (
      <Stack gap={0}>
        {error && <Alert color="red" mb="xs">{error}</Alert>}
        <LodgingStayForm draft={draft} onChange={setDraft} destinations={destinations} />
        <Group mt="sm" justify="flex-end">
          <Button variant="default" size="xs" onClick={() => { setDraft(null); setError(null); }}>Cancel</Button>
          <Button size="xs" onClick={save} loading={saving}>Save</Button>
        </Group>
      </Stack>
    );
  }

  const nights = nightsBetween(h?.checkInDate, h?.checkOutDate);
  const range = [dayLabel(h?.checkInDate, h?.checkInTime), dayLabel(h?.checkOutDate, h?.checkOutTime)].filter(Boolean).join(' → ');
  const destinationName = h?.destinationName ?? destinations.find(d => d.id === h?.destinationId)?.name ?? null;

  return (
    <Stack gap={6}>
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text fw={600}>{range}{nights ? ` · ${formatNights(nights)}` : ''}</Text>
        <Group gap={2} wrap="nowrap">
          <ActionIcon variant="subtle" size="lg" aria-label="Edit stay" onClick={() => { setConfirmingDelete(false); setError(null); setDraft(stayDraftFromElement(element)); }}>
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" size="lg" aria-label="Delete stay" onClick={() => setConfirmingDelete(true)}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {confirmingDelete && (
        <Group gap="xs">
          <Text size="sm">Delete this stay?</Text>
          <Button size="compact-xs" color="red" onClick={remove} loading={deleting}>Confirm</Button>
          <Button size="compact-xs" variant="default" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
        </Group>
      )}

      {h?.address && (
        <div>
          <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{h.address}</Text>
          <Anchor size="sm" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.address)}`} target="_blank" rel="noopener noreferrer">
            Open in Maps
          </Anchor>
        </div>
      )}
      {h?.phone && <Anchor size="sm" href={`tel:${h.phone}`}>{h.phone}</Anchor>}
      {h?.website && (
        <Anchor size="sm" href={h.website} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{h.website}</Anchor>
      )}
      {destinationName && <Text size="sm"><Text span c="dimmed">Destination: </Text>{destinationName}</Text>}
      {element.notes && <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{element.notes}</Text>}
    </Stack>
  );
}
```

`formatNights(4)` must produce "4 nights". Check `client/src/utils/tripDates.ts`; if its wording differs, change the test's regex to match it.

`element.notes` must exist on `TripElement`. If it does not, add `notes?: string | null` to `TripElement` in `client/src/types/trip.ts`; the server already returns it.

- [ ] **Step 4: Run the tests and check that they pass.** Also run tsc.
- [ ] **Step 5: Commit** with the message `feat(lodging): stay details tab` and the trailer.

---

### Task 14: BedsEditor, CouponsEditor and RoomForm

**Files:**
- Create: `client/src/components/BedsEditor.tsx`, `client/src/components/CouponsEditor.tsx`, `client/src/components/RoomForm.tsx`
- Test: `client/src/__tests__/RoomForm.test.tsx` (add to the include)

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { RoomForm } from '../components/RoomForm';
import { tripApi } from '../api/tripApi';
import { Booking, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({ tripApi: { createBooking: vi.fn(), updateBooking: vi.fn(), createParticipant: vi.fn() } }));

const participants: TripParticipant[] = [
  { id: 'p1', displayName: 'Jeremy' } as TripParticipant,
  { id: 'p2', displayName: 'Grandma' } as TripParticipant,
];
const otherRoom: Booking = {
  id: 'r0', tripId: 't1', confirmationNumber: 'H-1', advertisedPriceCash: null, advertisedPricePoints: null, loyaltyProgram: null,
  notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: ['p2'], currentConfirmationNumber: 'H-1',
  actualTotalCash: 0, actualTotalPoints: 0,
};

describe('RoomForm', () => {
  beforeEach(() => { vi.mocked(tripApi.createBooking).mockReset(); vi.mocked(tripApi.updateBooking).mockReset(); });
  afterEach(() => cleanup());

  it('creates a room with beds, amenities and coupons and no travelers', async () => {
    vi.mocked(tripApi.createBooking).mockResolvedValue({} as any);
    const onSaved = vi.fn();
    renderWithMantine(<RoomForm tripId="t1" stayId="h1" participants={participants} bookings={[otherRoom]}
      onParticipantsChanged={() => {}} onSaved={onSaved} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText('Booking site'), 'Expedia');
    await userEvent.type(screen.getByLabelText('Site itinerary #'), '7231004');
    await userEvent.type(screen.getByLabelText('Hotel confirmation #'), 'H-88213');
    await userEvent.type(screen.getByLabelText('Advertised total (cash)'), '1612');
    await userEvent.click(screen.getByLabelText('Includes taxes & fees'));
    await userEvent.click(screen.getByRole('button', { name: '+ Bed' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pool' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Coupon' }));
    await userEvent.type(screen.getByLabelText('Coupon code 1'), 'EXP10');
    await userEvent.type(screen.getByLabelText('Coupon savings $ 1'), '42.18');
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createBooking).toHaveBeenCalledWith('t1', expect.objectContaining({
      elementIds: ['h1'], travelerIds: [], bookingSite: 'Expedia', siteItineraryNumber: '7231004', confirmationNumber: 'H-88213',
      advertisedPriceCash: 1612, advertisedIncludesTaxes: true,
      room: expect.objectContaining({ beds: [{ type: 'king', count: 1 }], amenities: ['pool'] }),
      coupons: [{ code: 'EXP10', savingsCash: 42.18, savingsPoints: null, notes: null }],
    }));
  });

  it('disables travelers already in another room of the stay', () => {
    renderWithMantine(<RoomForm tripId="t1" stayId="h1" participants={participants} bookings={[otherRoom]}
      onParticipantsChanged={() => {}} onSaved={() => {}} onCancel={() => {}} />);
    const grandma = screen.getByRole('checkbox', { name: 'Grandma (in room H-1)' }) as HTMLInputElement;
    expect(grandma.disabled).toBe(true);
  });

  it('shows validation errors inline and keeps the form', async () => {
    renderWithMantine(<RoomForm tripId="t1" stayId="h1" participants={[]} bookings={[]}
      onParticipantsChanged={() => {}} onSaved={() => {}} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Coupon' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    expect(await screen.findByText('Coupon code is required')).toBeTruthy();
    expect(tripApi.createBooking).not.toHaveBeenCalled();
  });

  it('updates an existing room', async () => {
    vi.mocked(tripApi.updateBooking).mockResolvedValue({} as any);
    renderWithMantine(<RoomForm tripId="t1" stayId="h1" participants={participants} bookings={[otherRoom]} booking={otherRoom}
      onParticipantsChanged={() => {}} onSaved={() => {}} onCancel={() => {}} />);
    expect((screen.getByRole('checkbox', { name: 'Grandma' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(tripApi.updateBooking).toHaveBeenCalledWith('t1', 'r0', expect.objectContaining({ travelerIds: ['p2'] })));
  });
});
```

Notes for the implementer:
- Mantine `Chip` renders `<input type="checkbox">` labelled by its text, so `getByRole('checkbox', { name: 'Pool' })` works.
- If Mantine's `Autocomplete` makes `getByLabelText('Booking site')` ambiguous, give it an explicit `id` (the label's `htmlFor` uses it).
- Check the argument order of `tripApi.createBooking`/`updateBooking` (~216/225) and match the test to the real signatures.
- `within` is imported for convenience; remove it if unused, so lint doesn't complain.

- [ ] **Step 2: Run it and check that it fails.**

- [ ] **Step 3: Implement**

```tsx
// client/src/components/BedsEditor.tsx
import { ActionIcon, Button, Group, NumberInput, Select, Stack } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { BedCount, BedType } from '../types/trip';
import { BED_TYPE_OPTIONS } from '../utils/lodging';

interface BedsEditorProps {
  beds: BedCount[];
  onChange: (beds: BedCount[]) => void;
}

export function BedsEditor({ beds, onChange }: BedsEditorProps) {
  const used = new Set(beds.map(b => b.type));
  const nextType = BED_TYPE_OPTIONS.find(o => !used.has(o.value))?.value;

  const update = (index: number, patch: Partial<BedCount>) =>
    onChange(beds.map((bed, i) => (i === index ? { ...bed, ...patch } : bed)));

  return (
    <Stack gap={4}>
      {beds.map((bed, index) => (
        <Group key={index} gap="xs" wrap="nowrap">
          <Select
            aria-label={`Bed type ${index + 1}`}
            data={BED_TYPE_OPTIONS.filter(o => o.value === bed.type || !used.has(o.value))}
            value={bed.type}
            allowDeselect={false}
            onChange={value => value && update(index, { type: value as BedType })}
            style={{ flex: 1 }}
          />
          <NumberInput
            aria-label={`Bed count ${index + 1}`}
            min={1}
            max={9}
            w={72}
            value={bed.count}
            onChange={value => update(index, { count: typeof value === 'number' ? value : 1 })}
          />
          <ActionIcon variant="subtle" color="gray" aria-label={`Remove bed ${index + 1}`} onClick={() => onChange(beds.filter((_, i) => i !== index))}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
      {nextType && (
        <Button variant="subtle" size="compact-sm" onClick={() => onChange([...beds, { type: nextType, count: 1 }])} style={{ alignSelf: 'flex-start' }}>
          + Bed
        </Button>
      )}
    </Stack>
  );
}
```

```tsx
// client/src/components/CouponsEditor.tsx
import { ActionIcon, Button, Group, Stack, TextInput } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { CouponDraft } from '../utils/roomDraft';

interface CouponsEditorProps {
  coupons: CouponDraft[];
  onChange: (coupons: CouponDraft[]) => void;
}

export function CouponsEditor({ coupons, onChange }: CouponsEditorProps) {
  const update = (index: number, patch: Partial<CouponDraft>) =>
    onChange(coupons.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <Stack gap={4}>
      {coupons.map((coupon, index) => (
        <Group key={index} gap="xs" wrap="wrap" align="flex-end">
          <TextInput aria-label={`Coupon code ${index + 1}`} placeholder="Code" value={coupon.code} onChange={e => update(index, { code: e.currentTarget.value })} style={{ flex: '1 1 8rem' }} />
          <TextInput aria-label={`Coupon savings $ ${index + 1}`} placeholder="Savings $" type="number" step="0.01" value={coupon.savingsCash} onChange={e => update(index, { savingsCash: e.currentTarget.value })} w={100} />
          <TextInput aria-label={`Coupon savings pts ${index + 1}`} placeholder="Savings pts" type="number" step="1" value={coupon.savingsPoints} onChange={e => update(index, { savingsPoints: e.currentTarget.value })} w={110} />
          <TextInput aria-label={`Coupon note ${index + 1}`} placeholder="Note" value={coupon.notes} onChange={e => update(index, { notes: e.currentTarget.value })} style={{ flex: '2 1 10rem' }} />
          <ActionIcon variant="subtle" color="gray" mb={4} aria-label={`Remove coupon ${index + 1}`} onClick={() => onChange(coupons.filter((_, i) => i !== index))}>
            <IconX size={14} />
          </ActionIcon>
        </Group>
      ))}
      <Button variant="subtle" size="compact-sm" style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...coupons, { code: '', savingsCash: '', savingsPoints: '', notes: '' }])}>
        + Coupon
      </Button>
    </Stack>
  );
}
```

```tsx
// client/src/components/RoomForm.tsx
import { useId, useState } from 'react';
import {
  Alert, Autocomplete, Button, Checkbox, Chip, Group, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea,
} from '@mantine/core';
import { Booking, Refundability, RoomType, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BedsEditor } from './BedsEditor';
import { CouponsEditor } from './CouponsEditor';
import { AMENITY_OPTIONS, BOOKING_SITES, REFUNDABILITY_OPTIONS, ROOM_TYPE_OPTIONS } from '../utils/lodging';
import { RoomDraft, emptyRoomDraft, roomDraftFromBooking, roomPayload, validateRoomDraft } from '../utils/roomDraft';
import { bookedTravelers, bookingLabel } from '../utils/bookingCoverage';
import { AmenityKey } from '../types/trip';

interface RoomFormProps {
  tripId: string;
  stayId: string;
  participants: TripParticipant[];
  bookings: Booking[];
  booking?: Booking;
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}

function Heading({ children }: { children: string }) {
  return <Text size="sm" fw={600} mt="sm" mb={4}>{children}</Text>;
}

export function RoomForm({ tripId, stayId, participants, bookings, booking, onParticipantsChanged, onSaved, onCancel }: RoomFormProps) {
  const uid = useId();
  const [draft, setDraft] = useState<RoomDraft>(() => (booking ? roomDraftFromBooking(booking) : emptyRoomDraft()));
  const [newTravelerName, setNewTravelerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) => setDraft(prev => ({ ...prev, [key]: value }));
  const taken = bookedTravelers(bookings, [stayId], booking?.id);

  const toggleTraveler = (id: string) =>
    set('travelerIds', draft.travelerIds.includes(id) ? draft.travelerIds.filter(x => x !== id) : [...draft.travelerIds, id]);

  const save = async () => {
    const problem = validateRoomDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      let travelerIds = draft.travelerIds;
      if (newTravelerName.trim()) {
        const created = await tripApi.createParticipant(tripId, { displayName: newTravelerName.trim() });
        onParticipantsChanged([...participants, created]);
        travelerIds = [...travelerIds, created.id];
        // Keep the new traveler selected so a retry doesn't create them twice.
        setDraft(prev => ({ ...prev, travelerIds }));
        setNewTravelerName('');
      }
      const payload = roomPayload({ ...draft, travelerIds }, stayId);
      if (booking) await tripApi.updateBooking(tripId, booking.id, payload);
      else await tripApi.createBooking(tripId, payload);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save room');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper withBorder p="sm" mt="xs">
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <div>
          <Heading>Booking</Heading>
          <Stack gap="xs">
            <Autocomplete id={`${uid}-site`} label="Booking site" data={BOOKING_SITES} value={draft.bookingSite} onChange={value => set('bookingSite', value)} />
            <TextInput id={`${uid}-itin`} label="Site itinerary #" value={draft.siteItineraryNumber} onChange={e => set('siteItineraryNumber', e.currentTarget.value)} />
            <TextInput id={`${uid}-conf`} label="Hotel confirmation #" value={draft.confirmationNumber} onChange={e => set('confirmationNumber', e.currentTarget.value)} />
            <TextInput id={`${uid}-loyalty`} label="Loyalty program" value={draft.loyaltyProgram} onChange={e => set('loyaltyProgram', e.currentTarget.value)} />
          </Stack>

          <Heading>Price</Heading>
          <Stack gap="xs">
            <TextInput id={`${uid}-cash`} label="Advertised total (cash)" type="number" step="0.01" value={draft.priceCash} onChange={e => set('priceCash', e.currentTarget.value)} />
            <TextInput id={`${uid}-points`} label="Advertised total (points)" type="number" step="1" value={draft.pricePoints} onChange={e => set('pricePoints', e.currentTarget.value)} />
            <Checkbox id={`${uid}-taxes`} label="Includes taxes & fees" checked={draft.includesTaxes} onChange={e => set('includesTaxes', e.currentTarget.checked)} />
          </Stack>

          <Heading>Room</Heading>
          <Stack gap="xs">
            <Select id={`${uid}-type`} label="Room type" placeholder="Not set" clearable data={ROOM_TYPE_OPTIONS}
              value={draft.roomType} onChange={value => set('roomType', value as RoomType | null)} />
            <div>
              <Text size="sm" fw={500}>Beds</Text>
              <BedsEditor beds={draft.beds} onChange={beds => set('beds', beds)} />
            </div>
            <TextInput id={`${uid}-desc`} label="Room description" placeholder="e.g. Ocean view, high floor" value={draft.roomDescription} onChange={e => set('roomDescription', e.currentTarget.value)} />
          </Stack>
        </div>

        <div>
          <Heading>Amenities</Heading>
          <Chip.Group multiple value={draft.amenities} onChange={value => set('amenities', value as AmenityKey[])}>
            <Group gap={6}>
              {AMENITY_OPTIONS.map(o => <Chip key={o.value} value={o.value} size="xs">{o.label}</Chip>)}
            </Group>
          </Chip.Group>
          <TextInput id={`${uid}-other`} mt="xs" label="Other amenities" value={draft.otherAmenities} onChange={e => set('otherAmenities', e.currentTarget.value)} />

          <Heading>Cancellation</Heading>
          <Stack gap="xs">
            <SegmentedControl
              aria-label="Refundability"
              fullWidth
              size="xs"
              data={[...REFUNDABILITY_OPTIONS, { value: '', label: 'Unset' }]}
              value={draft.refundability ?? ''}
              onChange={value => set('refundability', (value || null) as Refundability | null)}
            />
            <Group gap="xs" grow>
              <TextInput id={`${uid}-cancel-date`} label="Cancel by date" type="date" value={draft.cancelDate} onChange={e => set('cancelDate', e.currentTarget.value)} />
              <TextInput id={`${uid}-cancel-time`} label="Cancel by time" type="time" value={draft.cancelTime} onChange={e => set('cancelTime', e.currentTarget.value)} />
            </Group>
            <Textarea id={`${uid}-policy`} label="Policy" autosize minRows={1} value={draft.cancellationPolicy} onChange={e => set('cancellationPolicy', e.currentTarget.value)} />
          </Stack>

          <Heading>Coupons</Heading>
          <CouponsEditor coupons={draft.coupons} onChange={coupons => set('coupons', coupons)} />
        </div>
      </SimpleGrid>

      <Heading>Travelers</Heading>
      <Group gap="sm">
        {participants.map(p => {
          const other = taken.get(p.id);
          const checked = draft.travelerIds.includes(p.id);
          return (
            <Checkbox
              key={p.id}
              label={other ? `${p.displayName} (in room ${bookingLabel(other)})` : p.displayName}
              checked={checked}
              disabled={Boolean(other) && !checked}
              onChange={() => toggleTraveler(p.id)}
            />
          );
        })}
      </Group>
      <TextInput id={`${uid}-new-traveler`} mt="xs" label="+ New traveler" placeholder="Optional" value={newTravelerName} onChange={e => setNewTravelerName(e.currentTarget.value)} />

      <Textarea id={`${uid}-notes`} mt="xs" label="Notes" autosize minRows={1} value={draft.notes} onChange={e => set('notes', e.currentTarget.value)} />

      <Group mt="sm" justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={save} loading={saving}>Save room</Button>
      </Group>
    </Paper>
  );
}
```

Merge the two `../types/trip` imports into one.

- [ ] **Step 4: Run the tests and check that they pass.** `npx vitest --run client/src/__tests__/RoomForm.test.tsx`, plus tsc.
  If `+ Bed` adds `king` first (`BED_TYPE_OPTIONS[0]`), the test's `beds: [{ type: 'king', count: 1 }]` holds.
- [ ] **Step 5: Commit** with the message `feat(lodging): room form with beds, amenities, cancellation and coupons` and the trailer.

---

### Task 15: RoomBlock and LodgingRoomsTab

**Files:**
- Create: `client/src/components/RoomBlock.tsx`, `client/src/components/LodgingRoomsTab.tsx`
- Test: `client/src/__tests__/LodgingRoomsTab.test.tsx` (add to the include)

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingRoomsTab } from '../components/LodgingRoomsTab';
import { Booking, TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: { deleteBooking: vi.fn(), listTransactions: vi.fn().mockResolvedValue([]), createBooking: vi.fn(), updateBooking: vi.fn(), createParticipant: vi.fn() },
}));

const stay: TripElement = {
  id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt', sortPosition: 0, createdAt: '', updatedAt: '',
  hotelDetails: { address: null, phone: null, website: null, checkInDate: '2027-03-01', checkInTime: null, checkOutDate: '2027-03-05', checkOutTime: null, destinationId: null },
};
const participants = [{ id: 'p1', displayName: 'Jeremy' }, { id: 'p2', displayName: 'Grandma' }] as TripParticipant[];
const room: Booking = {
  id: 'r1', tripId: 't1', confirmationNumber: 'H-80000', advertisedPriceCash: 1612, advertisedPricePoints: null, loyaltyProgram: null,
  notes: 'Late arrival', createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: ['p1'], currentConfirmationNumber: 'H-88213',
  actualTotalCash: 1580, actualTotalPoints: 0, bookingSite: 'Expedia', siteItineraryNumber: '7231004', advertisedIncludesTaxes: true,
  room: { roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }], roomDescription: null, amenities: ['breakfast', 'pool'],
    otherAmenities: 'Rooftop bar', refundability: 'free', cancelBy: '2099-02-27T18:00', cancellationPolicy: null },
  coupons: [{ code: 'EXPEDIA10', savingsCash: 42.18, savingsPoints: null, notes: null }],
};

function renderTab(bookings: Booking[], initialFormOpen = false) {
  return renderWithMantine(<LodgingRoomsTab tripId="t1" stay={stay} participants={participants} bookings={bookings}
    onParticipantsChanged={() => {}} refreshKey={0} onBookingsChanged={() => {}} onEditingChange={() => {}} initialFormOpen={initialFormOpen} />);
}

describe('LodgingRoomsTab', () => {
  afterEach(() => cleanup());

  it('shows the empty state', () => {
    renderTab([]);
    expect(screen.getByText('No rooms yet for this stay')).toBeTruthy();
  });

  it('renders the room summary lines', () => {
    renderTab([room]);
    expect(screen.getByText('Suite · 1 × King + 1 × Sofa bed')).toBeTruthy();
    expect(screen.getByText('Expedia 7231004 · Hotel H-88213 · orig H-80000')).toBeTruthy();
    expect(screen.getByText('Adv $1,612.00 total incl. taxes ($403.00/nt) · Paid $1,580.00')).toBeTruthy();
    expect(screen.getByText('Free cancel until Feb 27, 6:00 PM')).toBeTruthy();
    expect(screen.getByText('Breakfast · Pool · Rooftop bar')).toBeTruthy();
    expect(screen.getByText('Coupons: EXPEDIA10 −$42.18')).toBeTruthy();
    expect(screen.getByText('Late arrival')).toBeTruthy();
    expect(screen.getByText('Jeremy')).toBeTruthy();
    expect(screen.getByText('Not in a room: Grandma')).toBeTruthy();
  });

  it('opens the form from + Room and when initialFormOpen', async () => {
    renderTab([]);
    await userEvent.click(screen.getByRole('button', { name: '+ Room' }));
    expect(screen.getByRole('button', { name: 'Save room' })).toBeTruthy();
    cleanup();
    renderTab([], true);
    expect(screen.getByRole('button', { name: 'Save room' })).toBeTruthy();
  });

  it('asks before deleting a room', async () => {
    renderTab([room]);
    await userEvent.click(screen.getByRole('button', { name: 'Delete room' }));
    expect(screen.getByText(/Delete room H-88213/)).toBeTruthy();
  });
});
```

First check which tripApi methods `BookingTransactionList` calls on mount (for example, `listTransactions`), and mock them with the real method names so the list renders.

- [ ] **Step 2: Run it and check that it fails.**

- [ ] **Step 3: Implement**

```tsx
// client/src/components/RoomBlock.tsx
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Paper, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { RoomForm } from './RoomForm';
import { BookingTransactionList } from './BookingTransactionList';
import { amenitiesLabel, cancelDeadlineState, cancelLabel, couponsLabel, roomMoneyLine, roomTitle } from '../utils/lodging';
import { nightsBetween } from '../utils/tripDates';

interface RoomBlockProps {
  tripId: string;
  stay: TripElement;
  booking: Booking;
  bookings: Booking[];
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey: number;
  onChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  actionsDisabled?: boolean;
}

const DEADLINE_COLOR = { ok: 'green', soon: 'orange', passed: 'dimmed', none: 'dimmed' } as const;

export function RoomBlock({
  tripId, stay, booking, bookings, participants, onParticipantsChanged, refreshKey, onChanged, onEditingChange, actionsDisabled,
}: RoomBlockProps) {
  const [editing, setEditing] = useState(false);
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const anyEditing = editing || transactionFormOpen;
  useEffect(() => {
    onEditingChangeRef.current(anyEditing);
  }, [anyEditing]);
  useEffect(() => () => onEditingChangeRef.current(false), []);

  const remove = async () => {
    try {
      setDeleting(true);
      setError(null);
      await tripApi.deleteBooking(tripId, booking.id);
      await onChanged();
    } catch (err) {
      setConfirmingDelete(false);
      setError(err instanceof Error ? err.message : 'Failed to delete room');
    } finally {
      setDeleting(false);
    }
  };

  if (editing) {
    return (
      <RoomForm
        tripId={tripId}
        stayId={stay.id}
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
  const room = booking.room ?? null;
  const travelerNames = booking.travelerIds.map(id => participants.find(p => p.id === id)?.displayName ?? 'Unknown traveler');
  const refs = [
    [booking.bookingSite, booking.siteItineraryNumber].filter(Boolean).join(' '),
    conf ? `Hotel ${conf}` : '',
    booking.confirmationNumber && booking.confirmationNumber !== conf ? `orig ${booking.confirmationNumber}` : '',
  ].filter(Boolean).join(' · ');
  const nights = nightsBetween(stay.hotelDetails?.checkInDate, stay.hotelDetails?.checkOutDate);
  const cancel = cancelLabel(room);
  const deadline = cancelDeadlineState(room?.cancelBy ?? null);
  const amenities = amenitiesLabel(room?.amenities, room?.otherAmenities);
  const coupons = couponsLabel(booking.coupons);
  const deletePrompt = `Delete ${conf ? `room ${conf}` : 'this room'}${
    transactionCount > 0 ? ` and its ${transactionCount} transaction${transactionCount === 1 ? '' : 's'}` : ''
  }?`;

  return (
    <Paper withBorder p="xs" mt="xs">
      {error && <Alert color="red" mb="xs">{error}</Alert>}
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Group gap="xs">
          <Text fw={700}>{roomTitle(room)}</Text>
          {travelerNames.map((name, index) => (
            <Badge key={`${name}-${index}`} variant="outline" tt="none" size="sm">{name}</Badge>
          ))}
        </Group>
        <Group gap={2} wrap="nowrap">
          <ActionIcon variant="subtle" size="lg" aria-label="Edit room" disabled={actionsDisabled}
            onClick={() => { setConfirmingDelete(false); setError(null); setEditing(true); }}>
            <IconPencil size={16} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" size="lg" aria-label="Delete room" disabled={actionsDisabled} onClick={() => setConfirmingDelete(true)}>
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

      {refs && <Text size="sm">{refs}</Text>}
      <Text size="sm" c="dimmed">{roomMoneyLine(booking, nights)}</Text>
      {cancel && (
        <Text size="sm" c={DEADLINE_COLOR[deadline]} td={deadline === 'passed' ? 'line-through' : undefined}>{cancel}</Text>
      )}
      {room?.cancellationPolicy && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{room.cancellationPolicy}</Text>}
      {room?.roomDescription && <Text size="sm">{room.roomDescription}</Text>}
      {amenities && <Text size="sm">{amenities}</Text>}
      {coupons && <Text size="sm">{coupons}</Text>}
      {booking.notes && <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{booking.notes}</Text>}

      <BookingTransactionList
        tripId={tripId}
        bookingId={booking.id}
        originalConfirmationNumber={booking.confirmationNumber}
        refreshKey={refreshKey}
        onChanged={onChanged}
        onCountChange={setTransactionCount}
        onEditingChange={setTransactionFormOpen}
      />
    </Paper>
  );
}
```

```tsx
// client/src/components/LodgingRoomsTab.tsx
import { useEffect, useRef, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { RoomBlock } from './RoomBlock';
import { RoomForm } from './RoomForm';

interface LodgingRoomsTabProps {
  tripId: string;
  stay: TripElement;
  participants: TripParticipant[];
  bookings: Booking[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  refreshKey: number;
  onBookingsChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  initialFormOpen?: boolean;
}

export function LodgingRoomsTab({
  tripId, stay, participants, bookings, onParticipantsChanged, refreshKey, onBookingsChanged, onEditingChange, initialFormOpen = false,
}: LodgingRoomsTabProps) {
  const [adding, setAdding] = useState(initialFormOpen);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;

  const anyEditing = adding || editingIds.size > 0;
  useEffect(() => {
    onEditingChangeRef.current(anyEditing);
  }, [anyEditing]);
  useEffect(() => () => onEditingChangeRef.current(false), []);

  const rooms = bookings.filter(b => b.elementIds.length === 1 && b.elementIds[0] === stay.id);
  const inRoom = new Set(rooms.flatMap(r => r.travelerIds));
  const notInRoom = inRoom.size > 0 ? participants.filter(p => !inRoom.has(p.id)) : [];

  const setBlockEditing = (id: string, editing: boolean) =>
    setEditingIds(prev => {
      const next = new Set(prev);
      if (editing) next.add(id);
      else next.delete(id);
      return next.size === prev.size && [...next].every(x => prev.has(x)) ? prev : next;
    });

  return (
    <div>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{rooms.length === 0 ? 'No rooms yet for this stay' : `${rooms.length} room${rooms.length === 1 ? '' : 's'}`}</Text>
        {!adding && <Button size="xs" variant="light" onClick={() => setAdding(true)}>+ Room</Button>}
      </Group>

      {adding && (
        <RoomForm
          tripId={tripId}
          stayId={stay.id}
          participants={participants}
          bookings={bookings}
          onParticipantsChanged={onParticipantsChanged}
          onSaved={async () => {
            setAdding(false);
            await onBookingsChanged();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {rooms.map(room => (
        <RoomBlock
          key={room.id}
          tripId={tripId}
          stay={stay}
          booking={room}
          bookings={bookings}
          participants={participants}
          onParticipantsChanged={onParticipantsChanged}
          refreshKey={refreshKey}
          onChanged={onBookingsChanged}
          onEditingChange={editing => setBlockEditing(room.id, editing)}
          actionsDisabled={adding}
        />
      ))}

      {notInRoom.length > 0 && (
        <Text size="sm" c="dimmed" mt="xs">{`Not in a room: ${notInRoom.map(p => p.displayName).join(', ')}`}</Text>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and check that they pass.** `npx vitest --run client/src/__tests__/LodgingRoomsTab.test.tsx`, plus tsc.
- [ ] **Step 5: Commit** with the message `feat(lodging): rooms tab with room summary blocks` and the trailer.

---

### Task 16: LodgingSection

**Files:**
- Create: `client/src/components/LodgingSection.tsx`, `client/src/components/LodgingSection.module.css`
- Test: `client/src/__tests__/LodgingSection.test.tsx` (add to the include)

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingSection } from '../components/LodgingSection';
import { LodgingRow } from '../utils/lodgingRows';

const rows: LodgingRow[] = [
  { id: 'h1', name: 'Hyatt Ziva', checkInDate: '2027-03-01', dateLabel: 'Mar 1 → Mar 5 · 4 nts', nights: 4,
    priceLabel: '$1,612.00 ($403.00/nt)', confirmation: '7231004 / H-88213', roomCount: 2,
    destination: { name: 'Cabo', color: '#ff8800' }, deadline: { label: 'Free cancel until Feb 27', state: 'soon' } },
  { id: 'h2', name: 'Airport Inn', checkInDate: '2027-03-05', dateLabel: 'Mar 5 → Mar 6 · 1 nt', nights: 1,
    priceLabel: '—', confirmation: '—', roomCount: 0, destination: null, deadline: { label: 'Cancel by Feb 1', state: 'passed' } },
];

describe('LodgingSection', () => {
  afterEach(() => cleanup());

  it('renders the band, rows, chips and deadline states', () => {
    renderWithMantine(<LodgingSection rows={rows} totalLabel="$1,612.00" onOpen={() => {}} />);
    const section = screen.getByRole('region', { name: 'Lodging' });
    expect(within(section).getByText(/Lodging \(2\)/)).toBeTruthy();
    expect(within(section).getByText('Total $1,612.00')).toBeTruthy();
    const first = within(section).getByRole('button', { name: 'Open Hyatt Ziva' });
    expect(within(first).getByText('Mar 1 → Mar 5 · 4 nts')).toBeTruthy();
    expect(within(first).getByText('$1,612.00 ($403.00/nt)')).toBeTruthy();
    expect(within(first).getByText('7231004 / H-88213')).toBeTruthy();
    expect(within(first).getByText('2 rooms')).toBeTruthy();
    expect(within(first).getByText('Cabo')).toBeTruthy();
    expect(within(first).getByText('Free cancel until Feb 27').getAttribute('data-state')).toBe('soon');
    const second = within(section).getByRole('button', { name: 'Open Airport Inn' });
    expect(within(second).queryByText(/rooms?$/)).toBeNull();
    expect(within(second).getByText('Cancel by Feb 1').getAttribute('data-state')).toBe('passed');
  });

  it('opens on click and Enter', () => {
    const onOpen = vi.fn();
    renderWithMantine(<LodgingSection rows={rows} totalLabel="" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Hyatt Ziva' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Open Airport Inn' }), { key: 'Enter' });
    expect(onOpen.mock.calls).toEqual([['h1'], ['h2']]);
  });
});
```

- [ ] **Step 2: Run it and check that it fails.**

- [ ] **Step 3: Implement**

```tsx
// client/src/components/LodgingSection.tsx
import { KeyboardEvent } from 'react';
import { Badge, Text } from '@mantine/core';
import { IconBed } from '@tabler/icons-react';
import { LodgingRow } from '../utils/lodgingRows';
import classes from './LodgingSection.module.css';

interface LodgingSectionProps {
  rows: LodgingRow[];
  totalLabel: string;
  onOpen: (elementId: string) => void;
}

export function LodgingSection({ rows, totalLabel, onOpen }: LodgingSectionProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(id);
    }
  };

  return (
    <section aria-label="Lodging" className={classes.section}>
      <div className={classes.band}>
        <Text fw={700} className={classes.bandTitle}>
          <IconBed size={16} aria-hidden /> Lodging ({rows.length})
        </Text>
        {totalLabel && <Text size="sm" c="dimmed">Total {totalLabel}</Text>}
      </div>

      <div className={`${classes.grid} ${classes.columns}`} aria-hidden>
        <span className={classes.name}>Hotel</span>
        <span className={classes.date}>Dates</span>
        <span className={classes.price}>Price</span>
        <span className={classes.confirm}>Confirm #</span>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.id}
          className={`${classes.grid} ${classes.row}`}
          data-tone={index % 2 === 0 ? 'a' : 'b'}
          role="button"
          tabIndex={0}
          aria-label={`Open ${row.name}`}
          onClick={() => onOpen(row.id)}
          onKeyDown={event => handleKeyDown(event, row.id)}
        >
          <span className={`${classes.name} ${classes.strong}`}>{row.name}</span>
          <span className={classes.date}>{row.dateLabel}</span>
          <span className={classes.price}>{row.priceLabel}</span>
          <span className={classes.confirm}>{row.confirmation}</span>
          <span className={classes.badges}>
            {row.roomCount > 0 && (
              <Badge size="sm" variant="light" tt="none">
                {row.roomCount} {row.roomCount === 1 ? 'room' : 'rooms'}
              </Badge>
            )}
          </span>
          {(row.destination || row.deadline) && (
            <span className={classes.sub}>
              {row.destination && (
                <Badge size="sm" variant="light" tt="none" color={row.destination.color ?? 'gray'}>{row.destination.name}</Badge>
              )}
              {row.deadline && (
                <span className={classes.deadline} data-state={row.deadline.state}>{row.deadline.label}</span>
              )}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
```

```css
/* client/src/components/LodgingSection.module.css */
.section {
  margin-top: var(--mantine-spacing-md);
  border: 1px solid var(--mantine-color-default-border);
  border-radius: var(--mantine-radius-sm);
  overflow: hidden;
}

.band {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--mantine-spacing-sm);
  padding: 6px 10px;
  background: var(--mantine-color-default-hover);
}

.bandTitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1.4fr) minmax(0, 1.3fr) minmax(0, 1.3fr) auto;
  column-gap: var(--mantine-spacing-sm);
  align-items: baseline;
  padding: 4px 10px;
}

.columns {
  font-size: var(--mantine-font-size-xs);
  color: var(--mantine-color-dimmed);
  border-bottom: 1px solid var(--mantine-color-default-border);
}

.row {
  cursor: pointer;
  font-size: var(--mantine-font-size-sm);
  padding-top: 6px;
  padding-bottom: 6px;
}

.row[data-tone='a'] {
  background: var(--mantine-color-yellow-light);
}

.row[data-tone='b'] {
  background: var(--mantine-color-grape-light);
}

.row:hover {
  filter: brightness(0.96);
}

.row:focus-visible {
  outline: 2px solid var(--mantine-color-blue-filled);
  outline-offset: -2px;
}

.name { grid-column: 1; overflow-wrap: anywhere; }
.date { grid-column: 2; }
.price { grid-column: 3; }
.confirm { grid-column: 4; overflow-wrap: anywhere; }
.badges { grid-column: 5; }

.strong {
  font-weight: 700;
}

.sub {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mantine-spacing-xs);
  padding-left: 1.25rem;
  font-size: var(--mantine-font-size-xs);
}

.deadline {
  color: var(--mantine-color-dimmed);
}

.deadline[data-state='soon'] {
  color: var(--mantine-color-orange-filled);
  font-weight: 600;
}

.deadline[data-state='passed'] {
  text-decoration: line-through;
}

@media (max-width: 48em) {
  .grid {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .columns {
    display: none;
  }

  .name,
  .price {
    grid-column: 1;
  }

  .date,
  .confirm {
    grid-column: 2;
    text-align: right;
  }

  .badges {
    grid-column: 1 / -1;
  }

  .sub {
    padding-left: 0;
  }
}
```

The Mantine Badge `color` accepts CSS colors such as `#ff8800` as well as theme names, so destination colors work.

- [ ] **Step 4: Run the tests and check that they pass.**
- [ ] **Step 5: Commit** with the message `feat(lodging): lodging section on the trip page` and the trailer.

---

### Task 17: ElementDialog `initialTab` and TripDetailPage wiring

**Files:**
- Modify: `client/src/components/ElementDialog.tsx`, `client/src/pages/TripDetailPage.tsx`
- Modify tests: `client/src/__tests__/ElementDialog.test.tsx`, `client/src/__tests__/TripDetailPage.test.tsx`

- [ ] **Step 1: Write the failing tests.**

In `ElementDialog.test.tsx`, add (reuse that file's existing tab fixtures and imports):

```tsx
it('starts on initialTab when given', () => {
  renderWithMantine(
    <ElementDialog opened onClose={() => {}} title="T" initialTab="b"
      tabs={[{ value: 'a', label: 'A', content: <div>tab a</div> }, { value: 'b', label: 'B', content: <div>tab b</div> }]} />
  );
  expect(screen.getByText('tab b')).toBeTruthy();
  expect(screen.queryByText('tab a')).toBeNull();
});
```

In `TripDetailPage.test.tsx`:
1. Add `listDestinations: vi.fn()` to the `tripApi` mock, and `api.listDestinations.mockResolvedValue([]);` in `beforeEach`. `resetAllMocks` clears it each time, so it must be set there.
2. Mock the lodging tab components to keep this page test focused:

```tsx
vi.mock('../components/LodgingRoomsTab', () => ({
  LodgingRoomsTab: ({ stay, initialFormOpen }: { stay: { id: string }; initialFormOpen?: boolean }) => (
    <div>{`rooms tab ${stay.id}${initialFormOpen ? ' form open' : ''}`}</div>
  ),
}));
```

3. Replace the "add-first-flight" test:

```tsx
it('shows add-flight and add-lodging buttons when there are no elements', async () => {
  renderPage();
  expect(await screen.findByRole('button', { name: 'Add a flight' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add lodging' })).toBeTruthy();
});
```

4. Replace the hidden-elements test so it uses `car_rental`, and add a check that hotels are not counted:

```tsx
it('shows a notice for hidden elements, not counting hotels', async () => {
  const car = { id: 'c-1', tripId: 'trip-1', elementType: 'car_rental', name: 'Hertz', sortPosition: 1, createdAt: '', updatedAt: '' };
  const hotel = { id: 'h-1', tripId: 'trip-1', elementType: 'hotel', name: 'Resort', sortPosition: 2, createdAt: '', updatedAt: '',
    hotelDetails: { address: null, phone: null, website: null, checkInDate: '2026-09-01', checkInTime: null, checkOutDate: '2026-09-03', checkOutTime: null, destinationId: null } };
  api.listElements.mockResolvedValue([flightEl(), car, hotel]);
  renderPage();
  expect(await screen.findByText('1 other element hidden until its section is built')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Lodging' })).toBeTruthy();
  cleanup();
  api.listElements.mockResolvedValue([flightEl(), car, { ...car, id: 'c-2' }]);
  renderPage();
  expect(await screen.findByText('2 other elements hidden until their sections are built')).toBeTruthy();
});
```

5. Add tests for opening a stay and for creating one:

```tsx
it('opens a stay with Details and Rooms tabs', async () => {
  const user = userEvent.setup();
  const hotel = { id: 'h-1', tripId: 'trip-1', elementType: 'hotel', name: 'Resort', sortPosition: 2, createdAt: '', updatedAt: '',
    hotelDetails: { address: '1 Beach Rd', phone: null, website: null, checkInDate: '2026-09-01', checkInTime: null, checkOutDate: '2026-09-03', checkOutTime: null, destinationId: null } };
  api.listElements.mockResolvedValue([hotel]);
  renderPage();
  await user.click(await screen.findByRole('button', { name: 'Open Resort' }));
  const dialog = await screen.findByRole('dialog', { name: 'Resort' });
  expect(within(dialog).getByRole('tab', { name: /Details/ })).toBeTruthy();
  expect(within(dialog).getByRole('tab', { name: /Rooms/ })).toBeTruthy();
  expect(within(dialog).queryByRole('tab', { name: /Seats/ })).toBeNull();
  expect(within(dialog).getByRole('link', { name: 'Open in Maps' })).toBeTruthy();
});

it('adds lodging and opens the new stay on the Rooms tab with the form open', async () => {
  const user = userEvent.setup();
  const created = { id: 'h-9', tripId: 'trip-1', elementType: 'hotel', name: 'Casa', sortPosition: 0, createdAt: '', updatedAt: '',
    hotelDetails: { address: null, phone: null, website: null, checkInDate: '2026-09-01', checkInTime: null, checkOutDate: '2026-09-02', checkOutTime: null, destinationId: null } };
  api.createElement.mockResolvedValue(created);
  renderPage();
  await user.click(await screen.findByRole('button', { name: 'Add' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Lodging' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add lodging' });
  await user.type(within(dialog).getByLabelText('Hotel name'), 'Casa');
  fireEvent.change(within(dialog).getByLabelText('Check-in date'), { target: { value: '2026-09-01' } });
  api.listElements.mockResolvedValue([created]);
  await user.click(within(dialog).getByRole('button', { name: 'Save stay' }));
  const stayDialog = await screen.findByRole('dialog', { name: 'Casa' });
  expect(within(stayDialog).getByText('rooms tab h-9 form open')).toBeTruthy();
});
```

Add `fireEvent` to the `@testing-library/react` import. Task 11 already moved the three "Add flight" clicks to the Add menu.

- [ ] **Step 2: Run them and check that they fail.** `npx vitest --run client/src/__tests__/ElementDialog.test.tsx client/src/__tests__/TripDetailPage.test.tsx`

- [ ] **Step 3: Implement.**

`ElementDialog.tsx`: add `initialTab?: string` to the props, and initialize `useState(initialTab ?? tabs[0]?.value ?? '')`.

`TripDetailPage.tsx` changes:

```tsx
// imports
import { Booking, Trip, TripDestination, TripElement, TripParticipant } from '../types/trip';
import { buildLodgingRows, lodgingTotals } from '../utils/lodgingRows';
import { LodgingSection } from '../components/LodgingSection';
import { AddLodgingDialog } from '../components/AddLodgingDialog';
import { LodgingDetailsTab } from '../components/LodgingDetailsTab';
import { LodgingRoomsTab } from '../components/LodgingRoomsTab';
import { ElementDialog, ElementDialogTab } from '../components/ElementDialog';
import { Group } from '@mantine/core'; // merge into the existing @mantine/core import

// state
const [destinations, setDestinations] = useState<TripDestination[]>([]);
const [addingLodging, setAddingLodging] = useState(false);
const [openRoomForm, setOpenRoomForm] = useState(false);

// in load(): add tripApi.listDestinations(id) to Promise.all and setDestinations(destinationsData)

// derived
const lodgingRows = useMemo(() => buildLodgingRows(elements, bookings, destinations), [elements, bookings, destinations]);
const lodgingTotal = useMemo(() => lodgingTotals(elements, bookings), [elements, bookings]);
const hiddenCount = elements.filter(e => e.elementType !== 'flight' && e.elementType !== 'hotel').length;

const openElement = (id: string | null, roomForm = false) => {
  setOpenRoomForm(roomForm);
  setSelectedId(id);
};
```

Header and sections:

```tsx
<TripHeader trip={trip} onAddFlight={() => setAdding(true)} onAddLodging={() => setAddingLodging(true)} />
...
{rows.length === 0 && lodgingRows.length === 0 ? (
  <Group mt="md" gap="xs">
    <Button variant="light" onClick={() => setAdding(true)}>Add a flight</Button>
    <Button variant="light" onClick={() => setAddingLodging(true)}>Add lodging</Button>
  </Group>
) : (
  <>
    {rows.length > 0 && <FlightsSection rows={rows} totalLabel={totals.label} onOpen={id => openElement(id)} />}
    {lodgingRows.length > 0 && <LodgingSection rows={lodgingRows} totalLabel={lodgingTotal.label} onOpen={id => openElement(id)} />}
  </>
)}
```

Add the lodging dialog next to `AddElementDialog`:

```tsx
<AddLodgingDialog
  tripId={tripId}
  opened={addingLodging}
  destinations={destinations}
  onClose={() => setAddingLodging(false)}
  onCreated={async created => {
    setAddingLodging(false);
    await reload();
    openElement(created.id, true);
  }}
/>
```

Build the tabs by element type. Replace the inline `tabs={[...]}` with a `tabs` variable computed before `return`. Keep the flight tabs exactly as they are today:

```tsx
const flightTabs = (el: TripElement): ElementDialogTab[] => [ /* the existing details/bookings/seats tab objects, unchanged */ ];

const hotelTabs = (el: TripElement): ElementDialogTab[] => [
  {
    value: 'details',
    label: 'Details',
    content: (
      <LodgingDetailsTab
        key={el.id}
        tripId={tripId}
        element={el}
        destinations={destinations}
        onChanged={reload}
        onDeleted={async () => {
          openElement(null);
          await reload();
        }}
        onEditingChange={setEditingDetails}
      />
    ),
  },
  {
    value: 'rooms',
    label: 'Rooms',
    count: selectedBookingCount,
    content: (
      <LodgingRoomsTab
        key={el.id}
        tripId={tripId}
        stay={el}
        participants={participants}
        bookings={bookings}
        onParticipantsChanged={handleParticipantsFromBooking}
        refreshKey={bookingsVersion}
        onBookingsChanged={reloadBookings}
        onEditingChange={setEditingBookings}
        initialFormOpen={openRoomForm}
      />
    ),
  },
];
```

```tsx
{selected && (
  <ElementDialog
    key={selected.id}
    opened
    onClose={() => openElement(null)}
    title={selected.name}
    swipeEnabled={!editingDetails && !editingBookings}
    initialTab={selected.elementType === 'hotel' && openRoomForm ? 'rooms' : undefined}
    tabs={selected.elementType === 'hotel' ? hotelTabs(selected) : flightTabs(selected)}
  />
)}
```

These helpers come after the early returns, where `tripId` is known to be a string. Since they are plain functions (not hooks), that is fine. `ElementDialogTab` is already exported by `ElementDialog.tsx`.

- [ ] **Step 4: Run the tests and check that they pass.** `npx vitest --run client/src/__tests__/ElementDialog.test.tsx client/src/__tests__/TripDetailPage.test.tsx`, then `npx tsc -p client/tsconfig.json --noEmit`.
- [ ] **Step 5: Commit** with the message `feat(lodging): show lodging on the trip page and open stays` and the trailer.

---

### Task 18: Docs

**Files:**
- Modify: `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`, `docs/ServerAPIUsage.md`

- [ ] **Step 1: Update `client/src/APIUsage.md`** (find the trip elements and bookings entries, ~lines 110–140):
  - `createElement`: add `client/src/components/AddLodgingDialog.tsx (hotel stay with typeSpecificData: address, phone, website, check-in/out date+time, destinationId)`.
  - `updateElement`, `deleteElement`: add `client/src/components/LodgingDetailsTab.tsx`.
  - `listDestinations`: add `client/src/pages/TripDetailPage.tsx (destination chip and stay destination select)`.
  - `createBooking`, `updateBooking`: add `client/src/components/RoomForm.tsx (hotel room: bookingSite, siteItineraryNumber, advertisedIncludesTaxes, room, coupons; travelers optional)`.
  - `deleteBooking`: add `client/src/components/RoomBlock.tsx`.
  - `createParticipant`: add `client/src/components/RoomForm.tsx`.

- [ ] **Step 2: Update `client/src/components/ComponentUsage.md`.** Add a section for each new component, following the style of the existing `### FlightsSection` / `### BookingBlock` sections: one-line purpose plus "Used by":
  - `AddMenu`: header "+ Add" menu (Flight, Lodging). Used by `TripHeader`.
  - `LodgingSection`: lodging rows and total on the trip page. Used by `TripDetailPage`.
  - `LodgingStayForm`: stay fields shared by add and edit. Used by `AddLodgingDialog`, `LodgingDetailsTab`.
  - `AddLodgingDialog`: creates a stay, then the page opens it on Rooms. Used by `TripDetailPage`.
  - `LodgingDetailsTab`: stay read view with maps, phone and website links, edit and delete. Used by `TripDetailPage` (via `ElementDialog`).
  - `LodgingRoomsTab`: rooms list, "+ Room", "Not in a room" hint. Used by `TripDetailPage`.
  - `RoomBlock`: room summary lines plus `BookingTransactionList`. Used by `LodgingRoomsTab`.
  - `RoomForm`: room booking form. Used by `LodgingRoomsTab`, `RoomBlock`.
  - `BedsEditor`, `CouponsEditor`: row editors. Used by `RoomForm`.
  - Update the existing `BookingTransactionList` "used by" list to include `RoomBlock`, and update `TripHeader` to say it uses `AddMenu`.

- [ ] **Step 3: Update `docs/ServerAPIUsage.md`.** Find the existing trip element and booking route entries (`grep -n "elements\|bookings" docs/ServerAPIUsage.md`). If there are none, add them under `## Trips` after the `copy` entry:

```markdown
- POST /trips/:tripId/elements, PUT /trips/:tripId/elements/:elementId
  - Purpose: Create/update a trip element. For `elementType: 'hotel'`, `typeSpecificData` carries `address`, `phone`, `website`, `checkInDate`, `checkInTime`, `checkOutDate`, `checkOutTime`, `destinationId` (must belong to the trip, else 404). Check-in and check-out dates are required on create; check-out must be after check-in. Elements return the stay as `hotelDetails` (plus `destinationName`).
  - Client helper: `tripApi.createElement`, `tripApi.updateElement`

- POST /trips/:tripId/bookings, PUT /trips/:tripId/bookings/:bookingId
  - Purpose: Bookings for flights or hotel rooms. A booking links either flights or exactly one hotel (400 otherwise). Hotel-room bookings accept `bookingSite`, `siteItineraryNumber`, `advertisedIncludesTaxes`, `room` (`roomType`, `beds`, `roomDescription`, `amenities`, `otherAmenities`, `refundability`, `cancelBy`, `cancellationPolicy`; `null` removes it) and `coupons` (full replacement). `travelerIds` may be empty for hotel rooms. 409 when a traveler is already in another booking for the same element.
  - Client helper: `tripApi.createBooking`, `tripApi.updateBooking`
```

If entries for these routes already exist, extend them with the hotel details instead of duplicating them. Also, when a destination is deleted, its stays' `destination_id` is cleared: add that sentence to the existing destination DELETE entry under `## Trip Destinations`.

- [ ] **Step 4: Commit** with the message `docs(lodging): API and component usage maps` and the trailer.

---

### Task 19: Final verification

- [ ] **Step 1: Type-check and run the full test suite.**

```bash
npx tsc -p client/tsconfig.json --noEmit
npx tsc -p tsconfig.build.json --noEmit
npx vitest --run
```

Expected: no type errors, and all tests pass. Confirm that the new files were actually run: the vitest output should list `lodging.test.ts`, `lodgingDrafts.test.ts`, `lodgingRows.test.ts`, `AddMenu.test.tsx`, `AddLodgingDialog.test.tsx`, `LodgingDetailsTab.test.tsx`, `RoomForm.test.tsx`, `LodgingRoomsTab.test.tsx`, `LodgingSection.test.tsx`, and the server lodging tests. If a failure exists before your changes too (check with `git stash` on the base commit), mention it rather than fixing unrelated code.

- [ ] **Step 2: Playwright smoke against a copy of the dev DB.** Never touch `data/travel-list.sqlite` itself.

```bash
mkdir -p /config/workspace/shots
cp data/travel-list.sqlite /tmp/lodging-smoke.sqlite
DB_FILE=/tmp/lodging-smoke.sqlite node server/migrations/run-migrations.cjs up
npm --prefix client run build
DB_FILE=/tmp/lodging-smoke.sqlite PORT=3101 npx tsx server/index.ts   # run in the background; it serves client/dist
```

If `data/travel-list.sqlite` doesn't exist in this worktree, look for it in the main checkout (`git worktree list`). If there is no DB anywhere, start with an empty `DB_FILE` and register a user through the UI.

Write `/config/workspace/shots/lodging-smoke.cjs` using `playwright` (`require('playwright')`; if the browser is missing, run `npx playwright install chromium`). At viewports 1440×900 and 390×844, the script should:
1. Open `http://localhost:3101`, log in as `uitester` / `UiTest123!` (if that user doesn't exist in the copy, register it through the UI), and open the trip "Cabo" (or create a trip).
2. Click "Add" → "Lodging". Fill Hotel name "Smoke Hotel", Address "1 Beach Rd, Cabo San Lucas", Check-in date (a date inside the trip), and click "Save stay".
3. Expect a dialog titled "Smoke Hotel", with the Rooms tab showing "Save room". Fill Booking site "Expedia", Site itinerary # "7231004", Hotel confirmation # "H-88213", Advertised total (cash) "1612", tick "Includes taxes & fees", click "+ Bed", tick chips "Breakfast" and "Pool", set Refundability "Free" and Cancel by date, then click "Save room".
4. Assert the room block shows "Expedia 7231004 · Hotel H-88213" and an "Adv $1,612.00 total incl. taxes" line. Close the dialog.
5. Assert the Lodging section row "Open Smoke Hotel" is visible, and that `document.documentElement.scrollWidth <= window.innerWidth` (no horizontal overflow). Do the same overflow check inside the open stay dialog and room form.
6. Save screenshots `/config/workspace/shots/lodging-desktop.png`, `lodging-desktop-room.png`, `lodging-mobile.png`, `lodging-mobile-room.png`.
7. Delete the test stay afterwards (in the copy DB, so this is optional).

Fix any real defects the smoke test finds, re-run the relevant unit tests, and commit the fixes. Then stop the server with `kill <pid>`.

- [ ] **Step 3: Final commit** (if anything changed) with the trailer. Then report the tsc/vitest results, smoke results and screenshot paths.
