# Lodging Booking Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework lodging so each stay owns exactly one booking (with nightly rate, payment schedule and a visible "remaining at check-in" balance), rooms become a plain list on the stay, the hotel dialog guards unsaved edits, and check-in/out times are picked by hour.

**Architecture:** The unmerged lodging migration and `server/db.ts` are rewritten in place: rooms move to `lodging_rooms` + `lodging_room_travelers`, generic money/cancellation columns are added to `bookings`, and `lodging_room_details` disappears. A new `stayService` creates/updates the hotel element and its single booking in one transaction; a new `lodgingRoomRepository` owns room CRUD. On the client the hotel dialog gets Details / Rooms / Payments tabs that stay mounted and report dirty state to `ElementDialog`, which prompts before discarding.

**Tech Stack:** Express + sqlite (`sqlite`/`sqlite3`), TypeScript, React 18 + Mantine 8.3, Vitest (+ jsdom, Testing Library), Playwright for the smoke test.

**Spec:** `docs/superpowers/specs/2026-11-26-lodging-booking-rework-design.md` (source of truth — read it first).

---

## Ground rules (read before Task 1)

- Work in `/config/.paseo/worktrees/0zd8zt0o/large-falcon` on branch `add-hotel-lodging-tracking`. Commit after every task with a `feat:`/`refactor:`/`test:`/`docs:` message ending in the trailer line `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- **Never touch the real DB** at `/config/localData/travel-list/data/` (the worktree's `data/` symlinks there). Tests use in-memory DBs. For manual runs copy the DB to `/tmp` and set `DB_FILE`.
- If you run the migration runner with `DB_FILE`, it rewrites the tracked `server/migrations/migrations.json` — `git checkout server/migrations/migrations.json` afterwards.
- Type checks: `npx tsc -p tsconfig.build.json --noEmit` (server, must be clean) and `npx tsc -p client/tsconfig.json --noEmit` (client has **93 pre-existing errors** — record the count before you start and make sure it never goes up; none of the errors may be in files you touched).
- Tests: `npx vitest --run <paths>` for targeted runs, `npx vitest --run` for the full suite. Every **new** test file must be added to the `include` array in `vitest.config.ts` or it will not run.
- Client tests start with `/* @vitest-environment jsdom */` and render with `renderWithMantine` from `client/src/test-utils/renderWithMantine`.
- Do not put Mantine `required` / `withAsterisk` on inputs that tests query by label (the asterisk changes the accessible name).
- Mantine `Select` in jsdom: open with `fireEvent.click(input)` then `fireEvent.click(screen.getByRole('option', { name }))`; look at existing tests (e.g. `client/src/__tests__/RoomForm.test.tsx`) for the working pattern before writing new ones.
- Existing helpers you will reuse: `formatPrice(cash, points)` (`client/src/utils/flightRows.ts`, gives `"9,000 pts + $5.60"`), `formatMoney(n)` (`client/src/utils/money.ts`, gives `"$1,612.00"`), `nightsBetween(a, b)` / `formatNights(n)` (`client/src/utils/tripDates.ts`), `BookingTransactionList` (`client/src/components/BookingTransactionList.tsx`, props `tripId, bookingId, originalConfirmationNumber, refreshKey, onChanged, onCountChange, onEditingChange`), `BedsEditor`, `CouponsEditor`, `withTransaction(db, fn)` (`server/utils/transaction.ts`, re-entrant on the same db).
- Keep the flight UI unchanged. The new booking columns are generic but only the lodging UI shows them.

## File map

Server
- Modify `server/migrations/migrations/20261124_01_lodging.cjs` — rewritten in place (new tables/columns, backfill, down).
- Modify `server/db.ts` — fresh-DB schema matches the migration.
- Modify `server/__tests__/lodging-migration.test.ts` — new legacy fixture, backfill + down tests.
- Modify `server/utils/lodgingValidation.ts` (+ `server/utils/lodgingValidation.test.ts`) — split amenity lists, `validateRoom` (room-only), `validateBookingFields`.
- Create `server/repositories/lodgingRoomRepository.ts` (+ `.test.ts`) — room CRUD, room traveler conflict, `listRoomsForElement`.
- Modify `server/repositories/bookingRepository.ts` (+ test) — new columns, no `room`, `getBookingIdForElement`.
- Modify `server/repositories/tripElementRepository.ts` (+ test) — hotel amenities, `rooms`, `bookingId` hydration.
- Create `server/services/stayService.ts` (+ `.test.ts`) — create/update stay + booking in one transaction.
- Modify `server/routes/tripRoutes.ts` (+ `server/__tests__/lodging.routes.test.ts`) — stay routes use `stayService`, room routes, one-booking-per-stay, booking field validation.
- Modify server types: `HotelDetails`/`TripElement` in `server/repositories/tripElementRepository.ts`, and the `Booking`/`LodgingRoom` types wherever they are declared.

Client
- Modify `client/src/types/trip.ts`, `client/src/api/tripApi.ts`.
- Modify `client/src/utils/lodging.ts`, `client/src/utils/lodgingRows.ts`, `client/src/utils/stayDraft.ts`, `client/src/utils/roomDraft.ts`.
- Create `client/src/components/HourPicker.tsx`, `client/src/components/DiscardChangesModal.tsx`, `client/src/components/LodgingPaymentsTab.tsx`.
- Modify `client/src/components/LodgingStayForm.tsx`, `AddLodgingDialog.tsx`, `LodgingDetailsTab.tsx`, `LodgingRoomsTab.tsx`, `RoomBlock.tsx`, `RoomForm.tsx`, `LodgingSection.tsx` (+ `.module.css`), `ElementDialog.tsx`.
- Modify `client/src/pages/TripDetailPage.tsx`.
- Tests in `client/src/__tests__/`: update `lodging`, `lodgingDrafts`, `lodgingRows`, `AddLodgingDialog`, `LodgingDetailsTab`, `RoomForm`, `LodgingRoomsTab`, `LodgingSection`, `TripDetailPage`, `ElementDialog`; create `HourPicker.test.tsx`, `LodgingPaymentsTab.test.tsx`.
- Docs: `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`, `docs/ServerAPIUsage.md`.

---

## Task 1: Rewrite the lodging migration and fresh schema

**Files:**
- Modify: `server/migrations/migrations/20261124_01_lodging.cjs` (full rewrite)
- Modify: `server/db.ts` (bookings table ~355–370; hotel/lodging tables ~411–452; indexes ~497)
- Test: `server/__tests__/lodging-migration.test.ts` (full rewrite)

- [ ] **Step 1: Read the current migration and test** so you know the runner contract (`module.exports = { up, down }`, each receives `{ db }`; the migration manages its own `BEGIN`/`COMMIT`/`ROLLBACK`).

```bash
cat server/migrations/migrations/20261124_01_lodging.cjs
cat server/__tests__/lodging-migration.test.ts
```

- [ ] **Step 2: Rewrite the migration test**

Replace `server/__tests__/lodging-migration.test.ts` with the following:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { getDb } from '../db';
import migration from '../migrations/migrations/20261124_01_lodging.cjs';

async function legacyDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE trips (id TEXT PRIMARY KEY);
    CREATE TABLE trip_destinations (id TEXT PRIMARY KEY, trip_id TEXT, name TEXT);
    CREATE TABLE trip_participants (id TEXT PRIMARY KEY, trip_id TEXT, display_name TEXT);
    CREATE TABLE trip_elements (id TEXT PRIMARY KEY, trip_id TEXT, element_type TEXT, name TEXT, deleted_at TEXT);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, confirmation_number TEXT,
      advertised_price_cash DECIMAL, advertised_price_points INTEGER, loyalty_program TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE booking_links (booking_id TEXT NOT NULL, element_id TEXT NOT NULL, PRIMARY KEY (booking_id, element_id));
    CREATE TABLE hotel_element_details (
      element_id TEXT PRIMARY KEY, address TEXT, phone TEXT, website TEXT,
      check_in_date TEXT, check_in_time TEXT, check_out_date TEXT, check_out_time TEXT,
      room_type TEXT, booking_source TEXT, advertised_price_cash DECIMAL, advertised_price_points INTEGER,
      advertised_loyalty_program TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO trips VALUES ('t1');
    INSERT INTO trip_elements VALUES ('h1', 't1', 'hotel', 'Casa', NULL);
    INSERT INTO trip_elements VALUES ('h2', 't1', 'hotel', 'Suite Inn', NULL);
    INSERT INTO trip_elements VALUES ('h3', 't1', 'hotel', 'Booked Already', NULL);
    INSERT INTO hotel_element_details (element_id, address, check_in_date, check_out_date, room_type, booking_source, advertised_price_cash, advertised_price_points, advertised_loyalty_program)
      VALUES ('h1', '1 Main', '2027-01-01', '2027-01-04', 'king', 'expedia', 500, NULL, 'Hilton Honors');
    INSERT INTO hotel_element_details (element_id, room_type) VALUES ('h2', 'Suite');
    INSERT INTO hotel_element_details (element_id) VALUES ('h3');
    INSERT INTO bookings (id, trip_id, confirmation_number) VALUES ('b3', 't1', 'XYZ');
    INSERT INTO booking_links VALUES ('b3', 'h3');
  `);
  return db;
}

const cols = async (db: Database, table: string) =>
  (await db.all(`PRAGMA table_info(${table})`)).map((c: { name: string }) => c.name);

describe('20261124_01_lodging migration', () => {
  let db: Database;
  beforeEach(async () => { db = await legacyDb(); });

  it('adds generic booking columns', async () => {
    await migration.up({ db });
    expect(await cols(db, 'bookings')).toEqual(expect.arrayContaining([
      'booking_site', 'site_itinerary_number', 'advertised_includes_taxes',
      'advertised_rate_cash', 'advertised_rate_points', 'due_at_booking_cash', 'due_at_booking_points',
      'due_later_cash', 'due_later_notes', 'refundability', 'cancel_by', 'cancellation_policy',
    ]));
  });

  it('rebuilds hotel details with destination and amenities, dropping legacy columns', async () => {
    await migration.up({ db });
    const c = await cols(db, 'hotel_element_details');
    expect(c).toEqual(expect.arrayContaining(['destination_id', 'amenities', 'other_amenities', 'address']));
    expect(c).not.toContain('room_type');
    expect(c).not.toContain('booking_source');
    expect(await db.get('SELECT address, amenities FROM hotel_element_details WHERE element_id = ?', ['h1']))
      .toEqual({ address: '1 Main', amenities: '[]' });
  });

  it('creates room, room traveler and coupon tables and no lodging_room_details', async () => {
    await migration.up({ db });
    const tables = (await db.all(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((r: { name: string }) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['lodging_rooms', 'lodging_room_travelers', 'booking_coupons']));
    expect(tables).not.toContain('lodging_room_details');
  });

  it('backfills one booking per unbooked hotel from legacy columns', async () => {
    await migration.up({ db });
    const b1 = await db.get(
      `SELECT b.trip_id, b.booking_site, b.advertised_price_cash, b.loyalty_program
       FROM bookings b JOIN booking_links l ON l.booking_id = b.id WHERE l.element_id = 'h1'`);
    expect(b1).toEqual({ trip_id: 't1', booking_site: 'expedia', advertised_price_cash: 500, loyalty_program: 'Hilton Honors' });
    expect(await db.get(`SELECT COUNT(*) n FROM booking_links WHERE element_id = 'h2'`)).toEqual({ n: 1 });
    expect(await db.get(`SELECT COUNT(*) n FROM booking_links WHERE element_id = 'h3'`)).toEqual({ n: 1 });
    expect(await db.get(`SELECT booking_id FROM booking_links WHERE element_id = 'h3'`)).toEqual({ booking_id: 'b3' });
  });

  it('backfills a room from the legacy room type', async () => {
    await migration.up({ db });
    expect(await db.get(`SELECT room_type, description, beds, amenities, position FROM lodging_rooms WHERE element_id = 'h1'`))
      .toEqual({ room_type: 'other', description: 'king', beds: '[]', amenities: '[]', position: 0 });
    expect(await db.get(`SELECT room_type, description FROM lodging_rooms WHERE element_id = 'h2'`))
      .toEqual({ room_type: 'suite', description: null });
    expect(await db.get(`SELECT COUNT(*) n FROM lodging_rooms WHERE element_id = 'h3'`)).toEqual({ n: 0 });
  });

  it('is idempotent', async () => {
    await migration.up({ db });
    await migration.up({ db });
    expect(await db.get(`SELECT COUNT(*) n FROM booking_links WHERE element_id = 'h1'`)).toEqual({ n: 1 });
    expect(await db.get(`SELECT COUNT(*) n FROM lodging_rooms WHERE element_id = 'h1'`)).toEqual({ n: 1 });
  });

  it('is a no-op on the current schema from initializeDatabase', async () => {
    const current = await getDb();
    const before = await cols(current, 'hotel_element_details');
    const bookingBefore = await cols(current, 'bookings');
    await migration.up({ db: current });
    expect(await cols(current, 'hotel_element_details')).toEqual(before);
    expect(await cols(current, 'bookings')).toEqual(bookingBefore);
  });

  it('down restores the legacy hotel table and removes new tables and columns', async () => {
    await migration.up({ db });
    await migration.down({ db });
    const hotel = await cols(db, 'hotel_element_details');
    expect(hotel).toEqual(expect.arrayContaining(['room_type', 'booking_source', 'advertised_price_cash']));
    expect(hotel).not.toContain('destination_id');
    const tables = (await db.all(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((r: { name: string }) => r.name);
    expect(tables).not.toContain('lodging_rooms');
    expect(tables).not.toContain('lodging_room_travelers');
    expect(tables).not.toContain('booking_coupons');
    const booking = await cols(db, 'bookings');
    expect(booking).not.toContain('due_later_cash');
    expect(booking).not.toContain('booking_site');
    // backfilled bookings are left in place
    expect(await db.get(`SELECT COUNT(*) n FROM booking_links WHERE element_id = 'h1'`)).toEqual({ n: 1 });
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx vitest --run server/__tests__/lodging-migration.test.ts`
Expected: FAIL (missing columns / tables / backfill).

- [ ] **Step 4: Rewrite the migration**

Replace the body of `server/migrations/migrations/20261124_01_lodging.cjs` with the following. Note `ALTER TABLE ... DROP COLUMN` needs SQLite ≥ 3.35 (bundled sqlite3 is newer).

```js
'use strict';
const { randomUUID } = require('crypto');

const BOOKING_COLUMNS = [
  ['booking_site', 'TEXT'],
  ['site_itinerary_number', 'TEXT'],
  ['advertised_includes_taxes', 'INTEGER NOT NULL DEFAULT 0'],
  ['advertised_rate_cash', 'DECIMAL'],
  ['advertised_rate_points', 'INTEGER'],
  ['due_at_booking_cash', 'DECIMAL'],
  ['due_at_booking_points', 'INTEGER'],
  ['due_later_cash', 'DECIMAL'],
  ['due_later_notes', 'TEXT'],
  ['refundability', 'TEXT'],
  ['cancel_by', 'TEXT'],
  ['cancellation_policy', 'TEXT'],
];

const NEW_HOTEL_TABLE = `
  CREATE TABLE hotel_element_details (
    element_id TEXT PRIMARY KEY,
    address TEXT,
    phone TEXT,
    website TEXT,
    check_in_date TEXT,
    check_in_time TEXT,
    check_out_date TEXT,
    check_out_time TEXT,
    destination_id TEXT,
    amenities TEXT NOT NULL DEFAULT '[]',
    other_amenities TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE,
    FOREIGN KEY (destination_id) REFERENCES trip_destinations(id) ON DELETE SET NULL
  )`;

const LEGACY_HOTEL_TABLE = `
  CREATE TABLE hotel_element_details (
    element_id TEXT PRIMARY KEY,
    address TEXT,
    phone TEXT,
    website TEXT,
    check_in_date TEXT,
    check_in_time TEXT,
    check_out_date TEXT,
    check_out_time TEXT,
    room_type TEXT,
    booking_source TEXT,
    advertised_price_cash DECIMAL,
    advertised_price_points INTEGER,
    advertised_loyalty_program TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
  )`;

const ROOM_TABLES = `
  CREATE TABLE IF NOT EXISTS lodging_rooms (
    id TEXT PRIMARY KEY,
    element_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    room_type TEXT,
    beds TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    amenities TEXT NOT NULL DEFAULT '[]',
    other_amenities TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_lodging_rooms_element ON lodging_rooms(element_id);
  CREATE TABLE IF NOT EXISTS lodging_room_travelers (
    room_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    PRIMARY KEY (room_id, participant_id),
    FOREIGN KEY (room_id) REFERENCES lodging_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE RESTRICT
  );
  CREATE TABLE IF NOT EXISTS booking_coupons (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    code TEXT NOT NULL,
    savings_cash DECIMAL,
    savings_points INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_booking_coupons_booking ON booking_coupons(booking_id);
`;

const KNOWN_ROOM_TYPES = ['standard', 'suite', 'studio', '1br', '2br', '3br', 'other'];

async function columns(db, table) {
  return (await db.all(`PRAGMA table_info(${table})`)).map(c => c.name);
}

async function tableExists(db, table) {
  return !!(await db.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]));
}

function mapRoomType(raw) {
  const value = (raw || '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (KNOWN_ROOM_TYPES.includes(lower)) return { roomType: lower, description: null };
  return { roomType: 'other', description: value };
}

async function up({ db }) {
  await db.exec('BEGIN');
  try {
    const bookingCols = await columns(db, 'bookings');
    for (const [name, type] of BOOKING_COLUMNS) {
      if (!bookingCols.includes(name)) await db.exec(`ALTER TABLE bookings ADD COLUMN ${name} ${type}`);
    }

    await db.exec(ROOM_TABLES);

    const hotelCols = await columns(db, 'hotel_element_details');
    if (hotelCols.includes('room_type')) {
      const legacy = await db.all(
        `SELECT h.element_id, h.room_type, h.booking_source, h.advertised_price_cash, h.advertised_price_points,
                h.advertised_loyalty_program, e.trip_id
         FROM hotel_element_details h JOIN trip_elements e ON e.id = h.element_id`);

      for (const row of legacy) {
        const linked = await db.get('SELECT booking_id FROM booking_links WHERE element_id = ? LIMIT 1', [row.element_id]);
        if (!linked) {
          const bookingId = randomUUID();
          await db.run(
            `INSERT INTO bookings (id, trip_id, booking_site, advertised_price_cash, advertised_price_points, loyalty_program)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [bookingId, row.trip_id, row.booking_source || null, row.advertised_price_cash ?? null,
              row.advertised_price_points ?? null, row.advertised_loyalty_program || null]);
          await db.run('INSERT INTO booking_links (booking_id, element_id) VALUES (?, ?)', [bookingId, row.element_id]);
        }
        const room = mapRoomType(row.room_type);
        const hasRoom = await db.get('SELECT id FROM lodging_rooms WHERE element_id = ? LIMIT 1', [row.element_id]);
        if (room && !hasRoom) {
          await db.run(
            `INSERT INTO lodging_rooms (id, element_id, position, room_type, description) VALUES (?, ?, 0, ?, ?)`,
            [randomUUID(), row.element_id, room.roomType, room.description]);
        }
      }

      await db.exec('ALTER TABLE hotel_element_details RENAME TO hotel_element_details_legacy');
      await db.exec(NEW_HOTEL_TABLE);
      await db.exec(
        `INSERT INTO hotel_element_details (element_id, address, phone, website, check_in_date, check_in_time,
                                            check_out_date, check_out_time, created_at, updated_at)
         SELECT element_id, address, phone, website, check_in_date, check_in_time,
                check_out_date, check_out_time, created_at, updated_at
         FROM hotel_element_details_legacy`);
      await db.exec('DROP TABLE hotel_element_details_legacy');
    } else {
      if (!hotelCols.includes('amenities')) {
        await db.exec(`ALTER TABLE hotel_element_details ADD COLUMN amenities TEXT NOT NULL DEFAULT '[]'`);
      }
      if (!hotelCols.includes('other_amenities')) {
        await db.exec('ALTER TABLE hotel_element_details ADD COLUMN other_amenities TEXT');
      }
    }

    await db.exec('DROP TABLE IF EXISTS lodging_room_details');
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

async function down({ db }) {
  await db.exec('BEGIN');
  try {
    await db.exec('DROP TABLE IF EXISTS lodging_room_travelers');
    await db.exec('DROP TABLE IF EXISTS lodging_rooms');
    await db.exec('DROP INDEX IF EXISTS idx_booking_coupons_booking');
    await db.exec('DROP TABLE IF EXISTS booking_coupons');

    const hotelCols = await columns(db, 'hotel_element_details');
    if (hotelCols.includes('destination_id')) {
      await db.exec('ALTER TABLE hotel_element_details RENAME TO hotel_element_details_new');
      await db.exec(LEGACY_HOTEL_TABLE);
      await db.exec(
        `INSERT INTO hotel_element_details (element_id, address, phone, website, check_in_date, check_in_time,
                                            check_out_date, check_out_time, created_at, updated_at)
         SELECT element_id, address, phone, website, check_in_date, check_in_time,
                check_out_date, check_out_time, created_at, updated_at
         FROM hotel_element_details_new`);
      await db.exec('DROP TABLE hotel_element_details_new');
    }

    const bookingCols = await columns(db, 'bookings');
    for (const [name] of BOOKING_COLUMNS) {
      if (bookingCols.includes(name)) await db.exec(`ALTER TABLE bookings DROP COLUMN ${name}`);
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { up, down };
```

Delete the `tableExists` helper if you don't use it.

- [ ] **Step 5: Run the migration test**

Run: `npx vitest --run server/__tests__/lodging-migration.test.ts`
Expected: PASS (8 tests). The no-op test runs only after Step 6 updates `db.ts`; if it fails now, continue to Step 6 and re-run.

- [ ] **Step 6: Update the fresh-DB schema in `server/db.ts`**

1. In `CREATE TABLE IF NOT EXISTS bookings`, after `advertised_includes_taxes ...`, add:

```sql
      advertised_rate_cash DECIMAL,
      advertised_rate_points INTEGER,
      due_at_booking_cash DECIMAL,
      due_at_booking_points INTEGER,
      due_later_cash DECIMAL,
      due_later_notes TEXT,
      refundability TEXT,
      cancel_by TEXT,
      cancellation_policy TEXT,
```

2. In `CREATE TABLE IF NOT EXISTS hotel_element_details`, after `destination_id TEXT,` add:

```sql
      amenities TEXT NOT NULL DEFAULT '[]',
      other_amenities TEXT,
```

3. Delete the whole `CREATE TABLE IF NOT EXISTS lodging_room_details (...)` block and any index on it.

4. Add after `hotel_element_details` (keep `booking_coupons` as-is):

```sql
    CREATE TABLE IF NOT EXISTS lodging_rooms (
      id TEXT PRIMARY KEY,
      element_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      room_type TEXT,
      beds TEXT NOT NULL DEFAULT '[]',
      description TEXT,
      amenities TEXT NOT NULL DEFAULT '[]',
      other_amenities TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lodging_room_travelers (
      room_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      PRIMARY KEY (room_id, participant_id),
      FOREIGN KEY (room_id) REFERENCES lodging_rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE RESTRICT
    );
```

5. In the indexes block add `CREATE INDEX IF NOT EXISTS idx_lodging_rooms_element ON lodging_rooms(element_id);`.

Then `grep -rn "lodging_room_details" server client/src` — every remaining hit is code that later tasks rewrite (bookingRepository, its test, routes test). Note them; do not fix them yet.

- [ ] **Step 7: Verify migration test and db smoke**

Run: `npx vitest --run server/__tests__/lodging-migration.test.ts server/repositories/tripElementRepository.test.ts`
Expected: migration test PASS. `tripElementRepository` tests should still pass (they don't touch room tables). Booking repository tests are expected to fail until Task 4 — do not run them now.

- [ ] **Step 8: Commit**

```bash
git add server/migrations/migrations/20261124_01_lodging.cjs server/db.ts server/__tests__/lodging-migration.test.ts
git commit -m "refactor: lodging schema with stay booking fields and room list

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Lodging validation rework

**Files:**
- Modify: `server/utils/lodgingValidation.ts`
- Test: `server/utils/lodgingValidation.test.ts`

- [ ] **Step 1: Read the current file** (`cat server/utils/lodgingValidation.ts server/utils/lodgingValidation.test.ts`). Keep `validateStay(data, { partial, existing })` and its date/time/name/destination behaviour; you are adding property amenities to it, replacing `validateRoom` (room-only fields + travelerIds, no cancellation), adding `validateBookingFields`, and keeping `validateCoupons` unchanged. Keep the existing error-message wording (shown below).

- [ ] **Step 2: Write the failing tests**

In `server/utils/lodgingValidation.test.ts`: delete the tests of the old `validateRoom` that cover refundability / cancelBy / old `AMENITIES`, keep the `validateStay` and `validateCoupons` tests, and add:

```ts
import { validateStay, validateRoom, validateBookingFields, PROPERTY_AMENITIES, ROOM_AMENITIES } from './lodgingValidation';

describe('amenity lists', () => {
  it('splits property and room amenities', () => {
    expect(PROPERTY_AMENITIES).toEqual(['breakfast', 'pool', 'hot_tub', 'parking', 'wifi', 'laundry', 'airport_shuttle', 'gym']);
    expect(ROOM_AMENITIES).toEqual(['fridge', 'microwave', 'kitchenette', 'jetted_tub', 'balcony']);
  });
});

describe('validateStay amenities', () => {
  const base = { name: 'Casa', checkInDate: '2027-01-01', checkOutDate: '2027-01-03' };
  it('accepts property amenities', () => {
    expect(validateStay({ ...base, amenities: ['pool', 'breakfast'], otherAmenities: 'EV charger' }, { partial: false })).toBeNull();
  });
  it('rejects room amenities at property level', () => {
    expect(validateStay({ ...base, amenities: ['microwave'] }, { partial: false })).toBe('Unknown amenity');
  });
  it('rejects non-array amenities, also on partial updates', () => {
    expect(validateStay({ ...base, amenities: 'pool' }, { partial: false })).toBe('Amenities must be an array');
    expect(validateStay({ amenities: 'pool' }, { partial: true, existing: { checkInDate: '2027-01-01', checkOutDate: '2027-01-03' } }))
      .toBe('Amenities must be an array');
  });
});

describe('validateRoom', () => {
  it('accepts a full room', () => {
    expect(validateRoom({
      roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }],
      description: 'Ocean view', amenities: ['microwave', 'jetted_tub'], otherAmenities: null, travelerIds: ['p1'],
    })).toBeNull();
  });
  it('accepts an empty room', () => {
    expect(validateRoom({})).toBeNull();
  });
  it('rejects non-objects', () => {
    expect(validateRoom(null)).toBe('Room must be an object');
  });
  it('rejects unknown room type', () => {
    expect(validateRoom({ roomType: 'castle' })).toBe('Unknown room type');
  });
  it('rejects property amenities on a room', () => {
    expect(validateRoom({ amenities: ['pool'] })).toBe('Unknown amenity');
  });
  it('rejects bad beds', () => {
    expect(validateRoom({ beds: [{ type: 'king', count: 0 }] })).toBe('Bed count must be 1 to 9');
    expect(validateRoom({ beds: [{ type: 'hammock', count: 1 }] })).toBe('Unknown bed type');
    expect(validateRoom({ beds: [{ type: 'king', count: 1 }, { type: 'king', count: 2 }] })).toBe('Each bed type may appear once');
  });
  it('rejects non-array travelerIds', () => {
    expect(validateRoom({ travelerIds: 'p1' })).toBe('Travelers must be an array');
  });
});

describe('validateBookingFields', () => {
  it('accepts an empty body', () => {
    expect(validateBookingFields({})).toBeNull();
  });
  it('accepts all fields', () => {
    expect(validateBookingFields({
      advertisedPriceCash: 612.4, advertisedPricePoints: 0, advertisedRateCash: 189, advertisedRatePoints: null,
      dueAtBookingCash: 430, dueAtBookingPoints: 0, dueLaterCash: 182.4, dueLaterNotes: 'resort fee',
      refundability: 'partial', cancelBy: '2027-01-01T18:00', cancellationPolicy: '1 night penalty',
      coupons: [{ code: 'SAVE10', savingsCash: 10 }],
    })).toBeNull();
  });
  it('rejects negative cash', () => {
    expect(validateBookingFields({ dueLaterCash: -1 })).toBe('Amounts must be 0 or more');
    expect(validateBookingFields({ advertisedRateCash: 'x' })).toBe('Amounts must be 0 or more');
  });
  it('rejects non-integer points', () => {
    expect(validateBookingFields({ dueAtBookingPoints: 1.5 })).toBe('Points must be a whole number, 0 or more');
  });
  it('rejects bad refundability and cancelBy', () => {
    expect(validateBookingFields({ refundability: 'maybe' })).toBe('Unknown refundability');
    expect(validateBookingFields({ cancelBy: '01/02/2027' })).toBe('Cancel-by must be YYYY-MM-DD or YYYY-MM-DDTHH:mm');
  });
  it('delegates coupon validation', () => {
    expect(validateBookingFields({ coupons: [{ code: '' }] })).toBe('Coupon code is required');
  });
});
```

- [ ] **Step 3: Run tests to see them fail**

Run: `npx vitest --run server/utils/lodgingValidation.test.ts`
Expected: FAIL (`PROPERTY_AMENITIES` / `validateBookingFields` not exported; old `validateRoom` accepts property amenities).

- [ ] **Step 4: Implement**

In `server/utils/lodgingValidation.ts`:

1. Replace the `AMENITIES` export with:

```ts
export const PROPERTY_AMENITIES = ['breakfast', 'pool', 'hot_tub', 'parking', 'wifi', 'laundry', 'airport_shuttle', 'gym'] as const;
export const ROOM_AMENITIES = ['fridge', 'microwave', 'kitchenette', 'jetted_tub', 'balcony'] as const;

function amenitiesError(value: unknown, allowed: readonly string[]): string | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) return 'Amenities must be an array';
  if (value.some(a => !allowed.includes(a))) return 'Unknown amenity';
  return null;
}
```

2. In `validateStay`, before the final `return null`, add (runs for full and partial validation):

```ts
  const amenityErr = amenitiesError(d.amenities, PROPERTY_AMENITIES);
  if (amenityErr) return amenityErr;
```

3. Replace `validateRoom` with:

```ts
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
  const amenityErr = amenitiesError(room.amenities, ROOM_AMENITIES);
  if (amenityErr) return amenityErr;
  if (room.travelerIds !== undefined && !Array.isArray(room.travelerIds)) return 'Travelers must be an array';
  return null;
}
```

4. Add:

```ts
const CASH_FIELDS = ['advertisedPriceCash', 'advertisedRateCash', 'dueAtBookingCash', 'dueLaterCash'] as const;
const POINTS_FIELDS = ['advertisedPricePoints', 'advertisedRatePoints', 'dueAtBookingPoints'] as const;

export function validateBookingFields(data: any): string | null {
  const d = data ?? {};
  for (const key of CASH_FIELDS) {
    const v = d[key];
    if (v != null && (typeof v !== 'number' || !(v >= 0) || !Number.isFinite(v))) return 'Amounts must be 0 or more';
  }
  for (const key of POINTS_FIELDS) {
    const v = d[key];
    if (v != null && (!Number.isInteger(v) || v < 0)) return 'Points must be a whole number, 0 or more';
  }
  if (d.refundability != null && !(REFUNDABILITY as readonly string[]).includes(d.refundability)) return 'Unknown refundability';
  if (d.cancelBy != null && d.cancelBy !== '' && (typeof d.cancelBy !== 'string' || !DATETIME_RE.test(d.cancelBy))) {
    return 'Cancel-by must be YYYY-MM-DD or YYYY-MM-DDTHH:mm';
  }
  if (d.coupons !== undefined) return validateCoupons(d.coupons);
  return null;
}
```

(`DATETIME_RE` already exists in this file.)

- [ ] **Step 5: Run tests**

Run: `npx vitest --run server/utils/lodgingValidation.test.ts`
Expected: PASS. (`tripRoutes.ts` may no longer compile because it imported `AMENITIES` or relied on the old `validateRoom` — fixed in Task 7; do not run server tsc yet.)

- [ ] **Step 6: Commit**

```bash
git add server/utils/lodgingValidation.ts server/utils/lodgingValidation.test.ts
git commit -m "refactor: split lodging amenities and validate booking money fields

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Server types

Server lodging types live in `server/repositories/bookingRepository.ts` (top of file) and `server/repositories/tripElementRepository.ts` (`HotelDetails`, ~line 62).

**Files:**
- Modify: `server/repositories/bookingRepository.ts:1-88`
- Modify: `server/repositories/tripElementRepository.ts:62-72` and the `TripElement` interface in the same file

- [ ] **Step 1: Replace the type block at the top of `bookingRepository.ts`**

Replace the `Amenity` type, `RoomDetails` interface, `EMPTY_ROOM` and `rowToRoom` with:

```ts
export type RoomType = 'standard' | 'suite' | 'studio' | '1br' | '2br' | '3br' | 'other';
export type BedType = 'king' | 'queen' | 'full' | 'twin' | 'sofa_bed' | 'bunk' | 'crib';
export type PropertyAmenity = 'breakfast' | 'pool' | 'hot_tub' | 'parking' | 'wifi' | 'laundry' | 'airport_shuttle' | 'gym';
export type RoomAmenity = 'fridge' | 'microwave' | 'kitchenette' | 'jetted_tub' | 'balcony';
export type Refundability = 'free' | 'partial' | 'nonrefundable';
export interface BedCount { type: BedType; count: number }
```

Export `blankToNull` and `parseJsonArray` (add `export`) — `lodgingRoomRepository` reuses them.

In `interface Booking` remove `room: RoomDetails | null;` and add:

```ts
  advertisedRateCash: number | null;
  advertisedRatePoints: number | null;
  dueAtBookingCash: number | null;
  dueAtBookingPoints: number | null;
  dueLaterCash: number | null;
  dueLaterNotes: string | null;
  refundability: Refundability | null;
  cancelBy: string | null;
  cancellationPolicy: string | null;
```

In `CreateBookingInput` and `UpdateBookingInput` remove `room` and add the same nine fields as optional (`advertisedRateCash?: number | null;` …).

- [ ] **Step 2: Update `HotelDetails` and `TripElement` in `tripElementRepository.ts`**

```ts
import type { PropertyAmenity } from './bookingRepository';
import type { LodgingRoom } from './lodgingRoomRepository';

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
  amenities: PropertyAmenity[];
  otherAmenities: string | null;
}
```

On `TripElement` add `rooms?: LodgingRoom[];` and `bookingId?: string | null;`. (`LodgingRoom` is created in Task 5 — this task and Task 4 compile together with Task 5; do not run server tsc until Task 6.)

No test or commit in this task — commit it together with Task 4.

---

## Task 4: Booking repository — generic money fields, no room

**Files:**
- Modify: `server/repositories/bookingRepository.ts`
- Test: `server/repositories/bookingRepository.test.ts` (`describe('lodging fields')` block, ~line 323 onward)

- [ ] **Step 1: Rewrite the `lodging fields` tests**

Replace the `describe('lodging fields', ...)` block with:

```ts
  describe('stay booking fields', () => {
    let hotelId: string;

    beforeEach(async () => {
      hotelId = (await new TripElementRepository().createElement(tripId, {
        elementType: 'hotel', name: 'Casa',
        typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04' },
      })).id;
    });

    it('creates a booking with site, price, schedule, cancellation and coupons', async () => {
      const b = await repo.createBooking(tripId, {
        elementIds: [hotelId], travelerIds: [],
        bookingSite: 'expedia', siteItineraryNumber: '7301', confirmationNumber: 'H-1',
        advertisedPriceCash: 612.4, advertisedRateCash: 189, advertisedIncludesTaxes: true,
        dueAtBookingCash: 430, dueLaterCash: 182.4, dueLaterNotes: 'resort fee',
        refundability: 'free', cancelBy: '2026-12-30', cancellationPolicy: 'Free until 48h',
        coupons: [{ code: 'SAVE10', savingsCash: 10 }],
      });
      expect(b).toMatchObject({
        bookingSite: 'expedia', siteItineraryNumber: '7301', confirmationNumber: 'H-1',
        advertisedPriceCash: 612.4, advertisedRateCash: 189, advertisedRatePoints: null, advertisedIncludesTaxes: true,
        dueAtBookingCash: 430, dueAtBookingPoints: null, dueLaterCash: 182.4, dueLaterNotes: 'resort fee',
        refundability: 'free', cancelBy: '2026-12-30', cancellationPolicy: 'Free until 48h',
        coupons: [{ code: 'SAVE10', savingsCash: 10, savingsPoints: null, notes: null }],
      });
      expect(b).not.toHaveProperty('room');
      const list = await repo.getBookingsForTrip(tripId);
      expect(list.find(x => x.id === b.id)).toMatchObject({ dueLaterCash: 182.4, refundability: 'free' });
    });

    it('defaults new fields to null / empty', async () => {
      const b = await repo.createBooking(tripId, { elementIds: [hotelId], travelerIds: [] });
      expect(await repo.getBookingById(b.id)).toMatchObject({
        coupons: [], advertisedIncludesTaxes: false, bookingSite: null,
        advertisedRateCash: null, dueAtBookingCash: null, dueLaterCash: null, refundability: null, cancelBy: null,
      });
    });

    it('updates new fields and replaces coupons in order', async () => {
      const b = await repo.createBooking(tripId, { elementIds: [hotelId], travelerIds: [], coupons: [{ code: 'A' }] });
      await repo.updateBooking(b.id, {
        coupons: [{ code: 'C' }, { code: 'B' }], dueLaterCash: 50, refundability: 'nonrefundable', cancelBy: null,
      });
      const got = await repo.getBookingById(b.id);
      expect(got!.coupons!.map(c => c.code)).toEqual(['C', 'B']);
      expect(got).toMatchObject({ dueLaterCash: 50, refundability: 'nonrefundable', cancelBy: null });
    });

    it('delete removes coupons', async () => {
      const b = await repo.createBooking(tripId, { elementIds: [hotelId], travelerIds: [], coupons: [{ code: 'A' }] });
      await repo.deleteBooking(b.id);
      const db = await getDb();
      expect(await db.get('SELECT COUNT(*) n FROM booking_coupons WHERE booking_id = ?', [b.id])).toEqual({ n: 0 });
    });

    it('getBookingIdForElement returns the stay booking or null', async () => {
      expect(await repo.getBookingIdForElement(hotelId)).toBeNull();
      const b = await repo.createBooking(tripId, { elementIds: [hotelId], travelerIds: [] });
      expect(await repo.getBookingIdForElement(hotelId)).toBe(b.id);
    });
  });
```

Also delete any other test in this file that references `room`, `lodging_room_details` or "at most one room of a stay" (the room-traveler rule moves to `lodgingRoomRepository` in Task 5).

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run server/repositories/bookingRepository.test.ts`
Expected: FAIL (unknown columns in insert / missing fields / `getBookingIdForElement` missing).

- [ ] **Step 3: Implement**

In `server/repositories/bookingRepository.ts`:

1. Add a single column list near the top and use it in all three booking SELECTs (`getBookingById` and both queries in `getBookingsForTrip`; in queries that alias the table, e.g. `b.`, use `BOOKING_SELECT('b.')`):

```ts
const BOOKING_SELECT = (p = '') => `
  ${p}id as id, ${p}trip_id as tripId, ${p}confirmation_number as confirmationNumber,
  ${p}advertised_price_cash as advertisedPriceCash, ${p}advertised_price_points as advertisedPricePoints,
  ${p}loyalty_program as loyaltyProgram, ${p}notes as notes, ${p}booking_site as bookingSite,
  ${p}site_itinerary_number as siteItineraryNumber, ${p}advertised_includes_taxes as advertisedIncludesTaxes,
  ${p}advertised_rate_cash as advertisedRateCash, ${p}advertised_rate_points as advertisedRatePoints,
  ${p}due_at_booking_cash as dueAtBookingCash, ${p}due_at_booking_points as dueAtBookingPoints,
  ${p}due_later_cash as dueLaterCash, ${p}due_later_notes as dueLaterNotes,
  ${p}refundability as refundability, ${p}cancel_by as cancelBy, ${p}cancellation_policy as cancellationPolicy,
  ${p}created_at as createdAt, ${p}updated_at as updatedAt`;
```

2. Add a field map used by both insert and update so there is one source of truth:

```ts
const SCALAR_FIELDS: Array<[keyof UpdateBookingInput, string]> = [
  ['confirmationNumber', 'confirmation_number'],
  ['advertisedPriceCash', 'advertised_price_cash'],
  ['advertisedPricePoints', 'advertised_price_points'],
  ['loyaltyProgram', 'loyalty_program'],
  ['notes', 'notes'],
  ['bookingSite', 'booking_site'],
  ['siteItineraryNumber', 'site_itinerary_number'],
  ['advertisedRateCash', 'advertised_rate_cash'],
  ['advertisedRatePoints', 'advertised_rate_points'],
  ['dueAtBookingCash', 'due_at_booking_cash'],
  ['dueAtBookingPoints', 'due_at_booking_points'],
  ['dueLaterCash', 'due_later_cash'],
  ['dueLaterNotes', 'due_later_notes'],
  ['refundability', 'refundability'],
  ['cancelBy', 'cancel_by'],
  ['cancellationPolicy', 'cancellation_policy'],
];
const TEXT_FIELDS = new Set(['confirmationNumber', 'loyaltyProgram', 'notes', 'bookingSite', 'siteItineraryNumber',
  'dueLaterNotes', 'refundability', 'cancelBy', 'cancellationPolicy']);
const fieldValue = (key: string, v: unknown) => (v === undefined ? null : TEXT_FIELDS.has(key) ? blankToNull(v as string | null) : v);
```

3. (Types were updated in Task 3.)

4. In `createBooking`, replace the explicit INSERT column list with one built from `SCALAR_FIELDS` plus `id, trip_id, advertised_includes_taxes`:

```ts
const cols = ['id', 'trip_id', 'advertised_includes_taxes', ...SCALAR_FIELDS.map(([, c]) => c)];
const vals = [id, tripId, input.advertisedIncludesTaxes ? 1 : 0,
  ...SCALAR_FIELDS.map(([k]) => fieldValue(k, (input as Record<string, unknown>)[k]))];
await db.run(`INSERT INTO bookings (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
```

5. In `updateBooking`, build the SET list from `SCALAR_FIELDS` for keys present in `updates` (`k in updates`), plus `advertised_includes_taxes` when defined, plus `updated_at = datetime('now')`.

6. Delete `writeRoom`, the `lodging_room_details` load in `hydrate`, the `room` property on returned bookings, and the `lodging_room_details` delete in `deleteBooking`. Keep `writeCoupons` and coupon hydration. Convert `advertisedIncludesTaxes` to boolean in `hydrate` as before.

7. Add:

```ts
  async getBookingIdForElement(elementId: string): Promise<string | null> {
    const db = await this.db;
    const row = await db.get<{ bookingId: string }>(
      `SELECT bl.booking_id as bookingId FROM booking_links bl JOIN bookings b ON b.id = bl.booking_id
       WHERE bl.element_id = ? ORDER BY b.created_at, b.id LIMIT 1`, [elementId]);
    return row?.bookingId ?? null;
  }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest --run server/repositories/bookingRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/bookingRepository.ts server/repositories/bookingRepository.test.ts server/repositories/tripElementRepository.ts
git commit -m "refactor: generic booking payment and cancellation fields

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Lodging room repository

**Files:**
- Create: `server/repositories/lodgingRoomRepository.ts`
- Test: `server/repositories/lodgingRoomRepository.test.ts` (new — add to `vitest.config.ts` `include`)

- [ ] **Step 1: Write the failing test**

Create `server/repositories/lodgingRoomRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import { LodgingRoomRepository, RoomConflictError, listRoomsForElement } from './lodgingRoomRepository';
import { TripElementRepository } from './tripElementRepository';
import { TripParticipantRepository } from './tripParticipantRepository';

describe('LodgingRoomRepository', () => {
  let repo: LodgingRoomRepository;
  let tripId: string;
  let stayId: string;
  let stay2Id: string;
  let a: string;
  let b: string;

  beforeEach(async () => {
    const db = await getDb();
    repo = new LodgingRoomRepository();
    const familyId = uuidv4();
    tripId = uuidv4();
    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, 'F', datetime('now'), datetime('now'))`, [familyId]);
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, 'T', '2027-01-01', '2027-01-10', datetime('now'), datetime('now'))`, [tripId, familyId]);
    const elements = new TripElementRepository();
    const stay = { elementType: 'hotel' as const, name: 'Casa', typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04' } };
    stayId = (await elements.createElement(tripId, stay)).id;
    stay2Id = (await elements.createElement(tripId, { ...stay, name: 'Other' })).id;
    const participants = new TripParticipantRepository();
    a = (await participants.createParticipant(tripId, { displayName: 'Ann' })).id;
    b = (await participants.createParticipant(tripId, { displayName: 'Ben' })).id;
  });

  afterEach(async () => {
    await closeDb();
  });

  it('creates rooms in position order with defaults', async () => {
    const r1 = await repo.createRoom(stayId, { roomType: 'suite', beds: [{ type: 'king', count: 1 }], amenities: ['microwave'], travelerIds: [a] });
    const r2 = await repo.createRoom(stayId, {});
    expect(r1).toMatchObject({
      elementId: stayId, position: 0, roomType: 'suite', beds: [{ type: 'king', count: 1 }],
      description: null, amenities: ['microwave'], otherAmenities: null, travelerIds: [a],
    });
    expect(r2).toMatchObject({ position: 1, roomType: null, beds: [], amenities: [], travelerIds: [] });
    expect((await listRoomsForElement(await getDb(), stayId)).map(r => r.id)).toEqual([r1.id, r2.id]);
  });

  it('updates a room partially and replaces travelers when given', async () => {
    const r = await repo.createRoom(stayId, { roomType: 'standard', description: 'Garden', travelerIds: [a] });
    const updated = await repo.updateRoom(r.id, { description: ' ', travelerIds: [a, b] });
    expect(updated).toMatchObject({ roomType: 'standard', description: null });
    expect(updated.travelerIds.sort()).toEqual([a, b].sort());
    const again = await repo.updateRoom(r.id, { roomType: 'suite' });
    expect(again.travelerIds.sort()).toEqual([a, b].sort());
  });

  it('keeps a traveler in at most one room per stay', async () => {
    await repo.createRoom(stayId, { travelerIds: [a] });
    await expect(repo.createRoom(stayId, { travelerIds: [a] })).rejects.toThrow(RoomConflictError);
    await expect(repo.createRoom(stayId, { travelerIds: [a] })).rejects.toThrow('Ann is already in another room of this stay');
    const r2 = await repo.createRoom(stayId, { travelerIds: [b] });
    await expect(repo.updateRoom(r2.id, { travelerIds: [a, b] })).rejects.toThrow(RoomConflictError);
    // same traveler in a different stay is fine
    await expect(repo.createRoom(stay2Id, { travelerIds: [a] })).resolves.toBeTruthy();
    // updating a room with its own traveler is fine
    await expect(repo.updateRoom(r2.id, { travelerIds: [b] })).resolves.toBeTruthy();
  });

  it('getRoom returns null when missing and deleteRoom removes travelers', async () => {
    expect(await repo.getRoom('nope')).toBeNull();
    const r = await repo.createRoom(stayId, { travelerIds: [a] });
    await repo.deleteRoom(r.id);
    expect(await repo.getRoom(r.id)).toBeNull();
    const db = await getDb();
    expect(await db.get('SELECT COUNT(*) n FROM lodging_room_travelers WHERE room_id = ?', [r.id])).toEqual({ n: 0 });
  });
});
```

Add `'server/repositories/lodgingRoomRepository.test.ts'` to the `include` array in `vitest.config.ts` (follow the existing format; if the include uses globs that already match `server/repositories/*.test.ts`, skip this).

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest --run server/repositories/lodgingRoomRepository.test.ts`
Expected: FAIL — cannot resolve `./lodgingRoomRepository`.

- [ ] **Step 3: Implement**

Create `server/repositories/lodgingRoomRepository.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { BedCount, RoomAmenity, RoomType, blankToNull, parseJsonArray } from './bookingRepository';

export interface LodgingRoom {
  id: string;
  elementId: string;
  position: number;
  roomType: RoomType | null;
  beds: BedCount[];
  description: string | null;
  amenities: RoomAmenity[];
  otherAmenities: string | null;
  travelerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RoomInput {
  roomType?: RoomType | null;
  beds?: BedCount[];
  description?: string | null;
  amenities?: RoomAmenity[];
  otherAmenities?: string | null;
  travelerIds?: string[];
}

export class RoomConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomConflictError';
  }
}

function rowToRoom(r: any, travelerIds: string[]): LodgingRoom {
  return {
    id: r.id, elementId: r.element_id, position: r.position, roomType: r.room_type ?? null,
    beds: parseJsonArray(r.beds), description: r.description ?? null,
    amenities: parseJsonArray(r.amenities), otherAmenities: r.other_amenities ?? null,
    travelerIds, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

async function travelersFor(db: Database, roomId: string): Promise<string[]> {
  const rows = await db.all<{ participant_id: string }[]>(
    'SELECT participant_id FROM lodging_room_travelers WHERE room_id = ? ORDER BY rowid', [roomId]);
  return rows.map(r => r.participant_id);
}

export async function listRoomsForElement(db: Database, elementId: string): Promise<LodgingRoom[]> {
  const rows = await db.all('SELECT * FROM lodging_rooms WHERE element_id = ? ORDER BY position, created_at, id', [elementId]);
  const rooms: LodgingRoom[] = [];
  for (const r of rows) rooms.push(rowToRoom(r, await travelersFor(db, r.id)));
  return rooms;
}

export class LodgingRoomRepository {
  private db = getDb();

  async getRoom(id: string): Promise<LodgingRoom | null> {
    const db = await this.db;
    const r = await db.get('SELECT * FROM lodging_rooms WHERE id = ?', [id]);
    return r ? rowToRoom(r, await travelersFor(db, id)) : null;
  }

  async createRoom(elementId: string, input: RoomInput): Promise<LodgingRoom> {
    const db = await this.db;
    const id = uuidv4();
    await withTransaction(db, async () => {
      await this.assertNoConflict(db, elementId, input.travelerIds ?? [], null);
      const { next } = (await db.get<{ next: number }>(
        'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM lodging_rooms WHERE element_id = ?', [elementId]))!;
      await db.run(
        `INSERT INTO lodging_rooms (id, element_id, position, room_type, beds, description, amenities, other_amenities)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, elementId, next, input.roomType ?? null, JSON.stringify(input.beds ?? []), blankToNull(input.description),
          JSON.stringify(input.amenities ?? []), blankToNull(input.otherAmenities)]);
      await this.writeTravelers(db, id, input.travelerIds ?? []);
    });
    return (await this.getRoom(id))!;
  }

  async updateRoom(id: string, input: RoomInput): Promise<LodgingRoom> {
    const db = await this.db;
    await withTransaction(db, async () => {
      const existing = await db.get<{ element_id: string }>('SELECT element_id FROM lodging_rooms WHERE id = ?', [id]);
      if (!existing) throw new Error('Room not found');
      if (input.travelerIds !== undefined) await this.assertNoConflict(db, existing.element_id, input.travelerIds, id);
      const sets: string[] = [];
      const values: unknown[] = [];
      if ('roomType' in input) { sets.push('room_type = ?'); values.push(input.roomType ?? null); }
      if ('beds' in input) { sets.push('beds = ?'); values.push(JSON.stringify(input.beds ?? [])); }
      if ('description' in input) { sets.push('description = ?'); values.push(blankToNull(input.description)); }
      if ('amenities' in input) { sets.push('amenities = ?'); values.push(JSON.stringify(input.amenities ?? [])); }
      if ('otherAmenities' in input) { sets.push('other_amenities = ?'); values.push(blankToNull(input.otherAmenities)); }
      sets.push(`updated_at = datetime('now')`);
      await db.run(`UPDATE lodging_rooms SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
      if (input.travelerIds !== undefined) await this.writeTravelers(db, id, input.travelerIds);
    });
    return (await this.getRoom(id))!;
  }

  async deleteRoom(id: string): Promise<void> {
    const db = await this.db;
    await withTransaction(db, async () => {
      await db.run('DELETE FROM lodging_room_travelers WHERE room_id = ?', [id]);
      await db.run('DELETE FROM lodging_rooms WHERE id = ?', [id]);
    });
  }

  private async writeTravelers(db: Database, roomId: string, travelerIds: string[]): Promise<void> {
    await db.run('DELETE FROM lodging_room_travelers WHERE room_id = ?', [roomId]);
    for (const pid of new Set(travelerIds)) {
      await db.run('INSERT INTO lodging_room_travelers (room_id, participant_id) VALUES (?, ?)', [roomId, pid]);
    }
  }

  private async assertNoConflict(db: Database, elementId: string, travelerIds: string[], excludeRoomId: string | null) {
    if (travelerIds.length === 0) return;
    const marks = travelerIds.map(() => '?').join(', ');
    const hit = await db.get<{ name: string }>(
      `SELECT p.display_name AS name
         FROM lodging_room_travelers t
         JOIN lodging_rooms r ON r.id = t.room_id
         JOIN trip_participants p ON p.id = t.participant_id
        WHERE r.element_id = ? AND r.id != ? AND t.participant_id IN (${marks})
        ORDER BY p.display_name LIMIT 1`,
      [elementId, excludeRoomId ?? '', ...travelerIds]);
    if (hit) throw new RoomConflictError(`${hit.name} is already in another room of this stay`);
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest --run server/repositories/lodgingRoomRepository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/repositories/lodgingRoomRepository.ts server/repositories/lodgingRoomRepository.test.ts vitest.config.ts
git commit -m "feat: lodging room repository with one-room-per-traveler rule

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Element hydration (amenities, rooms, bookingId) and stay service

**Files:**
- Modify: `server/repositories/tripElementRepository.ts` (hotel insert in `createElement` ~line 153; hotel hydrate in `getElementById` ~line 215; `updateHotelDetails` ~line 326)
- Modify: `server/repositories/bookingRepository.ts` (add `pickBookingInput`)
- Create: `server/services/stayService.ts`
- Test: `server/repositories/tripElementRepository.test.ts`, `server/services/stayService.test.ts` (new — add to `vitest.config.ts` `include` unless a glob already covers it)

- [ ] **Step 1: Write failing element-repository tests**

Add inside `describe('TripElementRepository')` in `server/repositories/tripElementRepository.test.ts`:

```ts
  describe('hotel lodging hydration', () => {
    it('stores property amenities and returns empty rooms and null bookingId', async () => {
      const el = await repo.createElement(tripId, {
        elementType: 'hotel', name: 'Casa',
        typeSpecificData: { checkInDate: '2026-06-01', checkOutDate: '2026-06-03', amenities: ['pool', 'breakfast'], otherAmenities: 'EV' },
      });
      expect(el.hotelDetails).toMatchObject({ amenities: ['pool', 'breakfast'], otherAmenities: 'EV' });
      expect(el.rooms).toEqual([]);
      expect(el.bookingId).toBeNull();
    });

    it('updates amenities and hydrates rooms and bookingId', async () => {
      const el = await repo.createElement(tripId, {
        elementType: 'hotel', name: 'Casa', typeSpecificData: { checkInDate: '2026-06-01', checkOutDate: '2026-06-03' },
      });
      expect(el.hotelDetails!.amenities).toEqual([]);
      await repo.updateElement(el.id, { typeSpecificData: { amenities: ['gym'], otherAmenities: '' } });
      const { LodgingRoomRepository } = await import('./lodgingRoomRepository');
      const { BookingRepository } = await import('./bookingRepository');
      const room = await new LodgingRoomRepository().createRoom(el.id, { roomType: 'suite' });
      const booking = await new BookingRepository().createBooking(tripId, { elementIds: [el.id], travelerIds: [] });
      const got = await repo.getElementById(el.id);
      expect(got!.hotelDetails).toMatchObject({ amenities: ['gym'], otherAmenities: null });
      expect(got!.rooms!.map(r => r.id)).toEqual([room.id]);
      expect(got!.bookingId).toBe(booking.id);
    });

    it('does not add rooms or bookingId to non-hotel elements', async () => {
      const el = await repo.createElement(tripId, { elementType: 'activity', name: 'Zip line' });
      expect(el).not.toHaveProperty('rooms');
      expect(el).not.toHaveProperty('bookingId');
    });
  });
```

If `TripElement` does not expose `hotelDetails` in its TS type, use `(el as any).hotelDetails` as the existing tests do.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest --run server/repositories/tripElementRepository.test.ts`
Expected: FAIL (`amenities` undefined, `rooms` undefined).

- [ ] **Step 3: Implement element hydration**

In `server/repositories/tripElementRepository.ts`:

1. Imports: `import { listRoomsForElement } from './lodgingRoomRepository';`
2. Hotel insert in `createElement` — add `amenities, other_amenities`:

```ts
      await db.run(
        `INSERT INTO hotel_element_details
           (element_id, address, phone, website, check_in_date, check_in_time, check_out_date, check_out_time, destination_id,
            amenities, other_amenities)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, h.address || null, h.phone || null, h.website || null, h.checkInDate || null, h.checkInTime || null,
         h.checkOutDate || null, h.checkOutTime || null, h.destinationId || null,
         JSON.stringify(Array.isArray(h.amenities) ? h.amenities : []), h.otherAmenities?.trim() || null]
      );
```

3. Hotel hydrate in `getElementById` — add to the `hotelDetails` object and then attach rooms/bookingId:

```ts
      (row as any).hotelDetails = h ? {
        address: h.address ?? null, phone: h.phone ?? null, website: h.website ?? null,
        checkInDate: h.check_in_date ?? null, checkInTime: h.check_in_time ?? null,
        checkOutDate: h.check_out_date ?? null, checkOutTime: h.check_out_time ?? null,
        destinationId: h.live_destination_id ?? null, destinationName: h.destination_name ?? null,
        amenities: parseAmenities(h.amenities), otherAmenities: h.other_amenities ?? null,
      } : null;
      (row as any).rooms = await listRoomsForElement(db, elementId);
      const link = await db.get<{ bookingId: string }>(
        `SELECT bl.booking_id AS bookingId FROM booking_links bl JOIN bookings b ON b.id = bl.booking_id
          WHERE bl.element_id = ? ORDER BY b.created_at, b.id LIMIT 1`, [elementId]);
      (row as any).bookingId = link?.bookingId ?? null;
```

with a module-level helper:

```ts
function parseAmenities(v: string | null | undefined): any[] {
  if (!v) return [];
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
}
```

4. `updateHotelDetails` — add amenities/other amenities. Replace the map/loop with:

```ts
    const map: Record<string, string> = {
      address: 'address', phone: 'phone', website: 'website',
      checkInDate: 'check_in_date', checkInTime: 'check_in_time',
      checkOutDate: 'check_out_date', checkOutTime: 'check_out_time', destinationId: 'destination_id',
      amenities: 'amenities', otherAmenities: 'other_amenities',
    };
    await db.run('INSERT OR IGNORE INTO hotel_element_details (element_id) VALUES (?)', [elementId]);
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, col] of Object.entries(map)) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sets.push(`${col} = ?`);
        const v = (data as any)[key];
        if (key === 'amenities') values.push(JSON.stringify(Array.isArray(v) ? v : []));
        else values.push(typeof v === 'string' && v.trim() === '' ? null : v ?? null);
      }
    }
```

(rest of the method unchanged).

- [ ] **Step 4: Run element tests**

Run: `npx vitest --run server/repositories/tripElementRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `pickBookingInput` to `bookingRepository.ts`**

```ts
export const BOOKING_INPUT_KEYS = [
  'confirmationNumber', 'advertisedPriceCash', 'advertisedPricePoints', 'loyaltyProgram', 'notes',
  'bookingSite', 'siteItineraryNumber', 'advertisedIncludesTaxes',
  'advertisedRateCash', 'advertisedRatePoints', 'dueAtBookingCash', 'dueAtBookingPoints',
  'dueLaterCash', 'dueLaterNotes', 'refundability', 'cancelBy', 'cancellationPolicy', 'coupons',
] as const;

// Copies only the booking fields present in `body` (so PATCH stays partial).
export function pickBookingInput(body: any): UpdateBookingInput {
  const out: Record<string, unknown> = {};
  for (const key of BOOKING_INPUT_KEYS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  if ('advertisedIncludesTaxes' in out) out.advertisedIncludesTaxes = Boolean(out.advertisedIncludesTaxes);
  return out as UpdateBookingInput;
}
```

(`UpdateBookingInput` must include `coupons?: CouponInput[]` — add it if missing.)

- [ ] **Step 6: Write the failing stay service test**

Create `server/services/stayService.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import { StayService } from './stayService';
import { BookingRepository } from '../repositories/bookingRepository';

describe('StayService', () => {
  let service: StayService;
  let bookings: BookingRepository;
  let tripId: string;
  const stay = { name: 'Casa', notes: null, typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04' } };

  beforeEach(async () => {
    const db = await getDb();
    service = new StayService();
    bookings = new BookingRepository();
    const familyId = uuidv4();
    tripId = uuidv4();
    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, 'F', datetime('now'), datetime('now'))`, [familyId]);
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, 'T', '2027-01-01', '2027-01-10', datetime('now'), datetime('now'))`, [tripId, familyId]);
  });

  afterEach(async () => {
    await closeDb();
  });

  it('creates the stay and its booking together', async () => {
    const el = await service.createStay(tripId, {
      ...stay, booking: { bookingSite: 'expedia', siteItineraryNumber: '7301', dueLaterCash: 182.4, coupons: [{ code: 'A' }] },
    });
    expect(el.elementType).toBe('hotel');
    expect(el.bookingId).toBeTruthy();
    const b = await bookings.getBookingById(el.bookingId!);
    expect(b).toMatchObject({ bookingSite: 'expedia', siteItineraryNumber: '7301', dueLaterCash: 182.4, travelerIds: [], elementIds: [el.id] });
    expect(b!.coupons.map(c => c.code)).toEqual(['A']);
  });

  it('creates an empty booking when none is given', async () => {
    const el = await service.createStay(tripId, stay);
    expect(el.bookingId).toBeTruthy();
  });

  it('rolls back the element when the booking insert fails', async () => {
    const db = await getDb();
    const before = (await db.get<{ n: number }>(`SELECT COUNT(*) n FROM trip_elements WHERE trip_id = ?`, [tripId]))!.n;
    await expect(service.createStay(tripId, { ...stay, booking: { coupons: [{ code: null as any }] } })).rejects.toThrow();
    expect(await db.get(`SELECT COUNT(*) n FROM trip_elements WHERE trip_id = ?`, [tripId])).toEqual({ n: before });
  });

  it('updates element fields and booking fields together', async () => {
    const el = await service.createStay(tripId, stay);
    const updated = await service.updateStay(tripId, el.id, {
      name: 'Casa Roja', typeSpecificData: { amenities: ['pool'] }, booking: { confirmationNumber: 'H-1', refundability: 'free' },
    });
    expect(updated.name).toBe('Casa Roja');
    expect(updated.hotelDetails!.amenities).toEqual(['pool']);
    expect(await bookings.getBookingById(el.bookingId!)).toMatchObject({ confirmationNumber: 'H-1', refundability: 'free' });
  });

  it('creates the booking on update when the stay has none', async () => {
    const el = await service.createStay(tripId, stay);
    await bookings.deleteBooking(el.bookingId!);
    const updated = await service.updateStay(tripId, el.id, { booking: { bookingSite: 'direct' } });
    expect(updated.bookingId).toBeTruthy();
    expect(updated.bookingId).not.toBe(el.bookingId);
    expect((await bookings.getBookingById(updated.bookingId!))!.bookingSite).toBe('direct');
  });
});
```

The rollback test relies on `booking_coupons.code` being `NOT NULL` (it is) — the insert fails inside the transaction.

- [ ] **Step 7: Run to see it fail**

Run: `npx vitest --run server/services/stayService.test.ts`
Expected: FAIL — cannot resolve `./stayService`.

- [ ] **Step 8: Implement the stay service**

Create `server/services/stayService.ts`:

```ts
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { TripElement, TripElementRepository } from '../repositories/tripElementRepository';
import { BookingRepository, UpdateBookingInput } from '../repositories/bookingRepository';

export interface StayInput {
  name?: string;
  notes?: string | null;
  typeSpecificData?: Record<string, unknown>;
  booking?: UpdateBookingInput;
}

// A stay (hotel element) always owns exactly one booking; both are written in one transaction.
export class StayService {
  private elements = new TripElementRepository();
  private bookings = new BookingRepository();

  async createStay(tripId: string, input: StayInput): Promise<TripElement> {
    const db = await getDb();
    const id = await withTransaction(db, async () => {
      const element = await this.elements.createElement(tripId, {
        elementType: 'hotel', name: input.name, notes: input.notes ?? undefined, typeSpecificData: input.typeSpecificData,
      } as any);
      await this.bookings.createBooking(tripId, { ...(input.booking ?? {}), elementIds: [element.id], travelerIds: [] } as any);
      return element.id;
    });
    return (await this.elements.getElementById(id))!;
  }

  async updateStay(tripId: string, elementId: string, input: StayInput): Promise<TripElement> {
    const db = await getDb();
    await withTransaction(db, async () => {
      const { booking, ...elementUpdates } = input;
      if (Object.keys(elementUpdates).length > 0) {
        await this.elements.updateElement(elementId, elementUpdates as any);
      }
      if (booking !== undefined) {
        const bookingId = await this.bookings.getBookingIdForElement(elementId);
        if (bookingId) await this.bookings.updateBooking(bookingId, booking);
        else await this.bookings.createBooking(tripId, { ...booking, elementIds: [elementId], travelerIds: [] } as any);
      }
    });
    return (await this.elements.getElementById(elementId))!;
  }
}
```

Note: `getDb()` must return the same `Database` the repositories use (it is a cached singleton), so `withTransaction` nests correctly with the repositories' own `withTransaction` calls. Check the `createElement` input type and pass `notes` in the form it expects (`string | undefined` vs `null`).

- [ ] **Step 9: Run tests**

Run: `npx vitest --run server/services/stayService.test.ts server/repositories/tripElementRepository.test.ts server/repositories/bookingRepository.test.ts server/repositories/lodgingRoomRepository.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/repositories server/services/stayService.ts server/services/stayService.test.ts vitest.config.ts
git commit -m "feat: stay service owning one booking per stay; hydrate rooms and bookingId

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Routes — stay with booking, rooms, one booking per stay

**Files:**
- Modify: `server/routes/tripRoutes.ts` (lodging helpers ~197–235, element create ~237–270, element update ~284–310, bookings ~503–640)
- Test: `server/__tests__/lodging.routes.test.ts` (replace the `describe('room bookings')` block ~line 103 to end)

- [ ] **Step 1: Write the failing route tests**

In `server/__tests__/lodging.routes.test.ts`:

1. Add a `del` helper next to `post/patch/put`:

```ts
  const del = (path: string) => request(app).delete(`/api/trips/${tripId}${path}`).set('Authorization', auth);
  const get = (path: string) => request(app).get(`/api/trips/${tripId}${path}`).set('Authorization', auth);
```

2. Replace the whole `describe('room bookings', ...)` block with:

```ts
  describe('stay booking', () => {
    it('creates the stay with its booking in one request', async () => {
      const res = await post('/elements', {
        elementType: 'hotel', name: 'Casa Azul',
        typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04', amenities: ['pool'] },
        booking: {
          bookingSite: 'expedia', siteItineraryNumber: '7301', confirmationNumber: 'H-1',
          advertisedPriceCash: 612.4, advertisedRateCash: 189, dueAtBookingCash: 430, dueLaterCash: 182.4,
          refundability: 'free', cancelBy: '2026-12-30', coupons: [{ code: 'SAVE10', savingsCash: 10 }],
        },
      });
      expect(res.status).toBe(201);
      expect(res.body.hotelDetails.amenities).toEqual(['pool']);
      expect(res.body.rooms).toEqual([]);
      const booking = (await get(`/bookings/${res.body.bookingId}`)).body;
      expect(booking).toMatchObject({
        elementIds: [res.body.id], travelerIds: [], bookingSite: 'expedia', siteItineraryNumber: '7301',
        advertisedRateCash: 189, dueAtBookingCash: 430, dueLaterCash: 182.4, refundability: 'free',
        coupons: [{ code: 'SAVE10' }],
      });
      expect(booking).not.toHaveProperty('room');
    });

    it('creates an empty booking when none is sent', async () => {
      const res = await addStay();
      expect(res.status).toBe(201);
      expect(res.body.bookingId).toBeTruthy();
    });

    it('rejects invalid booking fields and property amenities on create', async () => {
      const base = { elementType: 'hotel', name: 'Casa', typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04' } };
      expect((await post('/elements', { ...base, booking: { dueLaterCash: -5 } })).status).toBe(400);
      expect((await post('/elements', { ...base, booking: { refundability: 'maybe' } })).status).toBe(400);
      expect((await post('/elements', { ...base, booking: { coupons: [{ code: '' }] } })).status).toBe(400);
      expect((await post('/elements', { ...base, typeSpecificData: { ...base.typeSpecificData, amenities: ['microwave'] } })).status).toBe(400);
    });

    it('PUT updates stay and booking together', async () => {
      const stay = (await addStay()).body;
      const res = await put(`/elements/${stay.id}`, {
        name: 'Casa Roja', typeSpecificData: { amenities: ['gym'] },
        booking: { confirmationNumber: 'H-9', dueLaterCash: 50, coupons: [{ code: 'B' }] },
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Casa Roja', bookingId: stay.bookingId });
      expect(res.body.hotelDetails.amenities).toEqual(['gym']);
      expect((await get(`/bookings/${stay.bookingId}`)).body).toMatchObject({ confirmationNumber: 'H-9', dueLaterCash: 50, coupons: [{ code: 'B' }] });
      expect((await put(`/elements/${stay.id}`, { booking: { cancelBy: 'soon' } })).status).toBe(400);
    });

    it('allows only one booking per stay', async () => {
      const stay = (await addStay()).body;
      const res = await post('/bookings', { elementIds: [stay.id], travelerIds: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('This stay already has a booking');
    });

    it('rejects travelers on a stay booking', async () => {
      const stay = (await addStay()).body;
      expect((await patch(`/bookings/${stay.bookingId}`, { travelerIds: [dadP] })).status).toBe(400);
    });

    it('rejects mixing a stay with flights, or two stays', async () => {
      const stayId = (await addStay()).body.id;
      const stay2 = (await addStay()).body.id;
      const flightId = await addFlight();
      expect((await post('/bookings', { elementIds: [stayId, flightId], travelerIds: [dadP] })).status).toBe(400);
      expect((await post('/bookings', { elementIds: [stayId, stay2], travelerIds: [] })).status).toBe(400);
    });

    it('PATCH on a stay booking accepts the new fields; adding a flight is rejected', async () => {
      const stay = (await addStay()).body;
      const flightId = await addFlight();
      const patched = await patch(`/bookings/${stay.bookingId}`, { dueAtBookingPoints: 9000, dueLaterNotes: 'resort fee' });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ dueAtBookingPoints: 9000, dueLaterNotes: 'resort fee' });
      expect((await patch(`/bookings/${stay.bookingId}`, { dueAtBookingPoints: 1.5 })).status).toBe(400);
      expect((await post(`/bookings/${stay.bookingId}/elements`, { elementId: flightId })).status).toBe(400);
    });

    it('flight bookings still require travelers and accept the generic fields', async () => {
      const flightId = await addFlight();
      expect((await post('/bookings', { elementIds: [flightId], travelerIds: [] })).status).toBe(400);
      const res = await post('/bookings', { elementIds: [flightId], travelerIds: [dadP], refundability: 'nonrefundable' });
      expect(res.status).toBe(201);
      expect(res.body.refundability).toBe('nonrefundable');
    });

    it('PATCH still edits notes on a booking whose flight was deleted', async () => {
      const flightId = await addFlight();
      const id = (await post('/bookings', { elementIds: [flightId], travelerIds: [dadP] })).body.id;
      await del(`/elements/${flightId}`).expect(204);
      expect((await patch(`/bookings/${id}`, { notes: 'still editable' })).status).toBe(200);
    });
  });

  describe('rooms', () => {
    it('adds, updates and deletes rooms on a stay', async () => {
      const stay = (await addStay()).body;
      const created = await post(`/elements/${stay.id}/rooms`, {
        roomType: 'suite', beds: [{ type: 'king', count: 1 }], amenities: ['jetted_tub'], travelerIds: [dadP],
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ elementId: stay.id, roomType: 'suite', amenities: ['jetted_tub'], travelerIds: [dadP] });
      const roomId = created.body.id;
      const updated = await put(`/rooms/${roomId}`, { description: 'Ocean view', travelerIds: [dadP, momP] });
      expect(updated.status).toBe(200);
      expect(updated.body.description).toBe('Ocean view');
      const el = (await get(`/elements/${stay.id}`)).body;
      expect(el.rooms).toHaveLength(1);
      expect(el.rooms[0].travelerIds.sort()).toEqual([dadP, momP].sort());
      expect((await del(`/rooms/${roomId}`)).status).toBe(204);
      expect((await get(`/elements/${stay.id}`)).body.rooms).toEqual([]);
    });

    it('validates rooms', async () => {
      const stay = (await addStay()).body;
      expect((await post(`/elements/${stay.id}/rooms`, { roomType: 'castle' })).status).toBe(400);
      expect((await post(`/elements/${stay.id}/rooms`, { amenities: ['pool'] })).status).toBe(400);
      expect((await post(`/elements/${stay.id}/rooms`, { travelerIds: ['nope'] })).status).toBe(404);
    });

    it('rejects rooms on non-hotel elements and unknown ids', async () => {
      const flightId = await addFlight();
      expect((await post(`/elements/${flightId}/rooms`, {})).status).toBe(400);
      expect((await post(`/elements/nope/rooms`, {})).status).toBe(404);
      expect((await put(`/rooms/nope`, {})).status).toBe(404);
      expect((await del(`/rooms/nope`)).status).toBe(404);
    });

    it('returns 409 when a traveler is already in another room of the stay', async () => {
      const stay = (await addStay()).body;
      expect((await post(`/elements/${stay.id}/rooms`, { travelerIds: [dadP] })).status).toBe(201);
      const conflict = await post(`/elements/${stay.id}/rooms`, { travelerIds: [dadP] });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error).toBe('Dad is already in another room of this stay');
      expect((await post(`/elements/${stay.id}/rooms`, { travelerIds: [momP] })).status).toBe(201);
    });
  });
```

3. In the existing `stay elements` tests, nothing else changes.

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run server/__tests__/lodging.routes.test.ts`
Expected: FAIL (no `bookingId`, no room routes, second stay booking allowed, etc.).

- [ ] **Step 3: Implement route changes**

In `server/routes/tripRoutes.ts`:

1. Imports:

```ts
import { BookingRepository, BookingConflictError, pickBookingInput } from '../repositories/bookingRepository';
import { LodgingRoomRepository, RoomConflictError } from '../repositories/lodgingRoomRepository';
import { StayService } from '../services/stayService';
import { validateStay, validateRoom, validateBookingFields } from '../utils/lodgingValidation';
```

and next to the other repository instances:

```ts
const lodgingRoomRepository = new LodgingRoomRepository();
const stayService = new StayService();
```

2. Replace `lodgingBookingError` with:

```ts
const STAY_HAS_BOOKING = 'This stay already has a booking';

// Stays own exactly one booking; returns an error if `elementId` is a stay already booked by another booking.
async function stayBookingError(elementId: string, bookingId: string | null): Promise<string | null> {
  const existing = await bookingRepository.getBookingIdForElement(elementId);
  return existing && existing !== bookingId ? STAY_HAS_BOOKING : null;
}

async function foreignTravelerError(tripId: string, travelerIds: unknown): Promise<string | null> {
  if (!Array.isArray(travelerIds)) return null;
  for (const id of travelerIds) {
    const p = await tripParticipantRepository.getParticipantById(id);
    if (!p || p.tripId !== tripId) return 'Traveler not found';
  }
  return null;
}
```

3. Create element: in the `if (elementType === 'hotel')` block, after the destination check, validate the booking and create via the service, returning early:

```ts
    if (elementType === 'hotel') {
      const stayError = validateStay({ name, ...(typeSpecificData ?? {}) }, { partial: false });
      if (stayError) return res.status(400).json({ error: stayError });
      if (!(await checkStayDestination(req.trip!.id, typeSpecificData?.destinationId))) {
        return res.status(404).json({ error: 'Destination not found' });
      }
      const bookingError = validateBookingFields(req.body.booking ?? {});
      if (bookingError) return res.status(400).json({ error: bookingError });
      const stay = await stayService.createStay(req.trip!.id, {
        name, notes, typeSpecificData, booking: pickBookingInput(req.body.booking ?? {}),
      });
      return res.status(201).json(stay);
    }
```

4. Update element: in the hotel branch, also validate `req.body.booking` and route the update through the service:

```ts
    if (element.elementType === 'hotel') {
      const { name, typeSpecificData, booking } = req.body ?? {};
      if (name !== undefined || typeSpecificData !== undefined) {
        // ...existing validateStay + destination checks unchanged...
      }
      if (booking !== undefined) {
        const bookingError = validateBookingFields(booking);
        if (bookingError) return res.status(400).json({ error: bookingError });
      }
      const { booking: _ignored, ...elementUpdates } = req.body ?? {};
      const updated = await stayService.updateStay(req.trip!.id, element.id, {
        ...elementUpdates, ...(booking !== undefined ? { booking: pickBookingInput(booking) } : {}),
      });
      return res.json(updated);
    }
```

5. POST `/bookings`: replace the destructuring and the `lodgingBookingError` call, and pass `pickBookingInput`:

```ts
    const { elementIds, travelerIds } = req.body;
    // ...existing elementIds / travelerIds / foreign / kind checks unchanged...
    if (kind === 'hotel') {
      if (travelerIds?.length) return res.status(400).json({ error: 'Stay travelers are set on rooms' });
      const stayError = await stayBookingError(elementIds[0], null);
      if (stayError) return res.status(400).json({ error: stayError });
    }
    const fieldsError = validateBookingFields(req.body);
    if (fieldsError) return res.status(400).json({ error: fieldsError });
    const booking = await bookingRepository.createBooking(req.trip!.id, {
      ...pickBookingInput(req.body), elementIds, travelerIds: travelerIds ?? [],
    } as any);
    res.status(201).json(booking);
```

6. PATCH `/bookings/:id`: same idea:

```ts
    const { elementIds, travelerIds } = req.body ?? {};
    // ...existing elementIds / travelerIds / foreign / kind checks unchanged...
    if (kind === 'hotel') {
      if (travelerIds?.length) return res.status(400).json({ error: 'Stay travelers are set on rooms' });
      if (elementIds !== undefined) {
        const stayError = await stayBookingError(elementIds[0], booking.id);
        if (stayError) return res.status(400).json({ error: stayError });
      }
    }
    const fieldsError = validateBookingFields(req.body ?? {});
    if (fieldsError) return res.status(400).json({ error: fieldsError });
    const updates: Record<string, unknown> = { ...pickBookingInput(req.body ?? {}) };
    if (elementIds !== undefined) updates.elementIds = elementIds;
    if (travelerIds !== undefined) updates.travelerIds = travelerIds;
    const updated = await bookingRepository.updateBooking(req.params.id, updates);
    res.json(updated);
```

7. POST `/bookings/:id/elements`: after the `bookingKind` check, add:

```ts
    if (element.elementType === 'hotel') {
      const stayError = await stayBookingError(elementId, booking.id);
      if (stayError) return res.status(400).json({ error: stayError });
    }
```

8. Room routes (place after the element update route):

```ts
async function findRoomForTrip(tripId: string, roomId: string) {
  const room = await lodgingRoomRepository.getRoom(roomId);
  if (!room) return null;
  const element = await tripElementRepository.getElementById(room.elementId);
  return element && element.tripId === tripId ? room : null;
}

function sendRoomError(res: Response, error: unknown, fallback: string) {
  if (error instanceof RoomConflictError) return res.status(409).json({ error: error.message });
  return res.status(500).json({ error: fallback });
}

tripRouter.post('/:tripId/elements/:elementId/rooms', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const element = await tripElementRepository.getElementById(req.params.elementId);
    if (!element || element.tripId !== req.trip!.id) return res.status(404).json({ error: 'Element not found' });
    if (element.elementType !== 'hotel') return res.status(400).json({ error: 'Rooms are only for stays' });
    const body = req.body ?? {};
    const roomError = validateRoom(body);
    if (roomError) return res.status(400).json({ error: roomError });
    const travelerError = await foreignTravelerError(req.trip!.id, body.travelerIds);
    if (travelerError) return res.status(404).json({ error: travelerError });
    const room = await lodgingRoomRepository.createRoom(element.id, {
      roomType: body.roomType, beds: body.beds, description: body.description,
      amenities: body.amenities, otherAmenities: body.otherAmenities, travelerIds: body.travelerIds,
    });
    res.status(201).json(room);
  } catch (error) {
    sendRoomError(res, error, 'Failed to add room');
  }
});

tripRouter.put('/:tripId/rooms/:roomId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const room = await findRoomForTrip(req.trip!.id, req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const body = req.body ?? {};
    const roomError = validateRoom(body);
    if (roomError) return res.status(400).json({ error: roomError });
    const travelerError = await foreignTravelerError(req.trip!.id, body.travelerIds);
    if (travelerError) return res.status(404).json({ error: travelerError });
    const input: Record<string, unknown> = {};
    for (const key of ['roomType', 'beds', 'description', 'amenities', 'otherAmenities', 'travelerIds']) {
      if (key in body) input[key] = body[key];
    }
    res.json(await lodgingRoomRepository.updateRoom(room.id, input));
  } catch (error) {
    sendRoomError(res, error, 'Failed to update room');
  }
});

tripRouter.delete('/:tripId/rooms/:roomId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const room = await findRoomForTrip(req.trip!.id, req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    await lodgingRoomRepository.deleteRoom(room.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete room' });
  }
});
```

Check `TripParticipant` has `tripId` (it does — see `TripParticipantRepository.getParticipantById`). Remove the now-unused `validateCoupons` import if nothing else uses it.

- [ ] **Step 4: Run route tests, then all server tests and server tsc**

Run: `npx vitest --run server/__tests__/lodging.routes.test.ts`
Expected: PASS.

Run: `npx vitest --run server && npx tsc -p tsconfig.build.json --noEmit`
Expected: all server tests PASS (fix any remaining references to `room`, `lodging_room_details`, `AMENITIES`, `RoomDetails` that `grep -rn "lodging_room_details\|RoomDetails\|\bAMENITIES\b\|\.room\b" server` reveals — e.g. in `server/services/tripListService.ts`/its test); tsc reports 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server
git commit -m "feat: stay create/update with booking, room routes, one booking per stay

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Client types and API

**Files:**
- Modify: `client/src/types/trip.ts` (lodging types block before `CarRentalDetails`; `TripElement` ~line 31; `Booking`/`CreateBookingPayload` near the end)
- Modify: `client/src/api/tripApi.ts` (`TripElementWritePayload` ~line 11; add room methods after `deleteBooking` ~line 240)
- Test: `client/src/__tests__/tripApi.test.ts`

- [ ] **Step 1: Write the failing API test**

Append to `client/src/__tests__/tripApi.test.ts` (reuse the file's existing `fetch` mocking pattern — read the top of the file first; the snippet below assumes `global.fetch = vi.fn()` style mocking, adapt names if different):

```ts
describe('room api', () => {
  it('creates, updates and deletes rooms', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'r1' }) });
    vi.stubGlobal('fetch', fetchMock);
    await tripApi.createRoom('t1', 'h1', { roomType: 'suite', travelerIds: [] });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/t1/elements/h1/rooms', expect.objectContaining({ method: 'POST' }));
    await tripApi.updateRoom('t1', 'r1', { description: 'x' });
    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/t1/rooms/r1', expect.objectContaining({ method: 'PUT' }));
    await tripApi.deleteRoom('t1', 'r1');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/trips/t1/rooms/r1', expect.objectContaining({ method: 'DELETE' }));
    vi.unstubAllGlobals();
  });

  it('surfaces the 409 room conflict message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: 'Dad is already in another room of this stay' }) }));
    await expect(tripApi.createRoom('t1', 'h1', { travelerIds: ['p1'] })).rejects.toThrow('Dad is already in another room of this stay');
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest --run client/src/__tests__/tripApi.test.ts`
Expected: FAIL — `tripApi.createRoom is not a function`.

- [ ] **Step 3: Update the types**

In `client/src/types/trip.ts`, replace the lodging block (`HotelDetails` through `BookingCoupon`) with:

```ts
export type PropertyAmenity = 'breakfast' | 'pool' | 'hot_tub' | 'parking' | 'wifi' | 'laundry' | 'airport_shuttle' | 'gym';
export type RoomAmenity = 'fridge' | 'microwave' | 'kitchenette' | 'jetted_tub' | 'balcony';

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
  amenities?: PropertyAmenity[];
  otherAmenities?: string | null;
}
export type RoomType = 'standard' | 'suite' | 'studio' | '1br' | '2br' | '3br' | 'other';
export type BedType = 'king' | 'queen' | 'full' | 'twin' | 'sofa_bed' | 'bunk' | 'crib';
export type Refundability = 'free' | 'partial' | 'nonrefundable';

export interface BedCount { type: BedType; count: number }

export interface LodgingRoom {
  id: string;
  elementId: string;
  position: number;
  roomType: RoomType | null;
  beds: BedCount[];
  description: string | null;
  amenities: RoomAmenity[];
  otherAmenities: string | null;
  travelerIds: string[];
}

export type RoomPayload = Partial<Omit<LodgingRoom, 'id' | 'elementId' | 'position'>>;

export interface BookingCoupon {
  id?: string;
  code: string;
  savingsCash: number | null;
  savingsPoints: number | null;
  notes: string | null;
}
```

On `TripElement` (next to `hotelDetails?: HotelDetails;`) add:

```ts
  rooms?: LodgingRoom[];
  bookingId?: string | null;
```

Define the generic booking money fields once and use them in both `Booking` and `CreateBookingPayload`:

```ts
export interface BookingMoneyFields {
  bookingSite?: string | null;
  siteItineraryNumber?: string | null;
  advertisedIncludesTaxes?: boolean;
  advertisedRateCash?: number | null;
  advertisedRatePoints?: number | null;
  dueAtBookingCash?: number | null;
  dueAtBookingPoints?: number | null;
  dueLaterCash?: number | null;
  dueLaterNotes?: string | null;
  refundability?: Refundability | null;
  cancelBy?: string | null;
  cancellationPolicy?: string | null;
}
```

Change `export interface Booking {` to `export interface Booking extends BookingMoneyFields {` and remove its `bookingSite`, `siteItineraryNumber`, `advertisedIncludesTaxes` and `room` members (keep `coupons?: BookingCoupon[];`). Change `export interface CreateBookingPayload {` to `export interface CreateBookingPayload extends BookingMoneyFields {` and likewise remove those three members and `room` (keep `coupons?: Omit<BookingCoupon, 'id'>[];`).

Add the stay booking write shape:

```ts
export type StayBookingPayload = Omit<CreateBookingPayload, 'elementIds' | 'travelerIds'>;
```

Remove `AmenityKey` — then `grep -rn "AmenityKey\|LodgingRoom\b\|\.room\b" client/src` and note every hit; later tasks rewrite those files.

- [ ] **Step 4: Update the API**

In `client/src/api/tripApi.ts`:

1. Add `RoomPayload, LodgingRoom, StayBookingPayload` to the type import.
2. Extend the element write payload:

```ts
export type TripElementWritePayload = Omit<Partial<TripElement>, 'notes'> & {
  notes?: string | null;
  typeSpecificData?: Record<string, unknown>;
  booking?: StayBookingPayload;
};
```

3. After `deleteBooking`, add:

```ts
  createRoom: async (tripId: string, elementId: string, payload: RoomPayload): Promise<LodgingRoom> => {
    const response = await fetch(`${API_BASE}/${tripId}/elements/${elementId}/rooms`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  updateRoom: async (tripId: string, roomId: string, payload: RoomPayload): Promise<LodgingRoom> => {
    const response = await fetch(`${API_BASE}/${tripId}/rooms/${roomId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteRoom: async (tripId: string, roomId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/rooms/${roomId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.error || `Failed to delete room: ${response.status}`);
    }
  },
```

- [ ] **Step 5: Run the test**

Run: `npx vitest --run client/src/__tests__/tripApi.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/types/trip.ts client/src/api/tripApi.ts client/src/__tests__/tripApi.test.ts
git commit -m "feat: client types and API for stay booking and rooms

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Lodging helpers — amenities, hours, nightly price, payment summary

**Files:**
- Modify: `client/src/utils/lodging.ts`
- Test: `client/src/__tests__/lodging.test.ts`

- [ ] **Step 1: Write the failing tests**

In `client/src/__tests__/lodging.test.ts`: delete tests for `roomMoneyLine`, `AMENITY_OPTIONS` and `perNight` (replaced by `nightlyPrice`); change any `cancelLabel(room)` test inputs to plain `{ refundability, cancelBy }` objects (the signature still accepts that shape). Then add:

```ts
import {
  PROPERTY_AMENITY_OPTIONS, ROOM_AMENITY_OPTIONS, HOUR_OPTIONS, CHECK_IN_QUICK, CHECK_OUT_QUICK, hourLabel,
  nightlyPrice, paymentSummary, roomTitle, amenitiesLabel,
} from '../utils/lodging';
import { Booking } from '../types/trip';

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', tripId: 't1', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null,
  loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [],
  currentConfirmationNumber: null, actualTotalCash: 0, actualTotalPoints: 0, ...over,
});

describe('amenity options', () => {
  it('splits property and room amenities', () => {
    expect(PROPERTY_AMENITY_OPTIONS.map(o => o.value)).toEqual(['breakfast', 'pool', 'hot_tub', 'parking', 'wifi', 'laundry', 'airport_shuttle', 'gym']);
    expect(ROOM_AMENITY_OPTIONS.map(o => o.value)).toEqual(['fridge', 'microwave', 'kitchenette', 'jetted_tub', 'balcony']);
    expect(ROOM_AMENITY_OPTIONS.find(o => o.value === 'jetted_tub')!.label).toBe('Jetted tub');
  });
  it('labels amenities from either list', () => {
    expect(amenitiesLabel(['pool', 'microwave'], 'EV charger')).toBe('Pool · Microwave · EV charger');
  });
});

describe('hours', () => {
  it('lists 24 on-the-hour options labelled like "3 PM"', () => {
    expect(HOUR_OPTIONS).toHaveLength(24);
    expect(HOUR_OPTIONS[0]).toEqual({ value: '00:00', label: '12 AM' });
    expect(HOUR_OPTIONS[12]).toEqual({ value: '12:00', label: '12 PM' });
    expect(HOUR_OPTIONS[15]).toEqual({ value: '15:00', label: '3 PM' });
    expect(CHECK_IN_QUICK).toEqual(['14:00', '15:00', '16:00', '17:00']);
    expect(CHECK_OUT_QUICK).toEqual(['10:00', '11:00', '12:00']);
  });
  it('hourLabel keeps legacy minutes', () => {
    expect(hourLabel('15:00')).toBe('3 PM');
    expect(hourLabel('15:30')).toBe('3:30 PM');
    expect(hourLabel(null)).toBe('');
  });
});

describe('nightlyPrice', () => {
  it('prefers the advertised nightly rate', () => {
    expect(nightlyPrice(booking({ advertisedRateCash: 189, advertisedPriceCash: 900 }), 4)).toBe(189);
  });
  it('falls back to total divided by nights', () => {
    expect(nightlyPrice(booking({ advertisedPriceCash: 1612 }), 4)).toBe(403);
    expect(nightlyPrice(booking({ advertisedPriceCash: 100 }), 3)).toBe(33.33);
  });
  it('returns null without data', () => {
    expect(nightlyPrice(booking(), 4)).toBeNull();
    expect(nightlyPrice(booking({ advertisedPriceCash: 100 }), null)).toBeNull();
    expect(nightlyPrice(null, 4)).toBeNull();
  });
});

describe('paymentSummary', () => {
  it('is null when no due amounts are set', () => {
    expect(paymentSummary(booking({ advertisedPriceCash: 900 }))).toBeNull();
    expect(paymentSummary(null)).toBeNull();
  });
  it('reports the remaining at check-in once the booking part is paid', () => {
    const s = paymentSummary(booking({ dueAtBookingCash: 1430, dueLaterCash: 182.4, actualTotalCash: 1430 }))!;
    expect(s).toMatchObject({ dueCash: 1612.4, paidCash: 1430, remainingCash: 182.4, remainingPoints: 0, atCheckIn: true });
    expect(s.label).toBe('Remaining $182.40 at check-in');
  });
  it('includes the unpaid booking part', () => {
    const s = paymentSummary(booking({ dueAtBookingCash: 1430, dueLaterCash: 182.4, actualTotalCash: 1000 }))!;
    expect(s.atCheckIn).toBe(false);
    expect(s.remainingCash).toBe(612.4);
    expect(s.label).toBe('Remaining $612.40 (incl. $430.00 due at booking)');
  });
  it('handles a booking with nothing due later', () => {
    expect(paymentSummary(booking({ dueAtBookingCash: 500 }))!.label).toBe('Remaining $500.00 (incl. $500.00 due at booking)');
  });
  it('reports paid in full and clamps overpayment', () => {
    const s = paymentSummary(booking({ dueAtBookingCash: 100, dueLaterCash: 50, actualTotalCash: 200 }))!;
    expect(s).toMatchObject({ remainingCash: 0, atCheckIn: false, label: 'Paid in full' });
  });
  it('tracks points due at booking', () => {
    const s = paymentSummary(booking({ dueAtBookingPoints: 9000, dueLaterCash: 40, actualTotalPoints: 0 }))!;
    expect(s).toMatchObject({ duePoints: 9000, remainingPoints: 9000, remainingCash: 40, atCheckIn: false });
    expect(s.label).toBe('Remaining 9,000 pts + $40.00 (incl. 9,000 pts due at booking)');
    const paidPts = paymentSummary(booking({ dueAtBookingPoints: 9000, dueLaterCash: 40, actualTotalPoints: 9000 }))!;
    expect(paidPts.label).toBe('Remaining $40.00 at check-in');
  });
});

describe('roomTitle', () => {
  it('joins type and beds', () => {
    expect(roomTitle({ roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }] })).toBe('Suite · 1 × King + 1 × Sofa bed');
    expect(roomTitle({ roomType: null, beds: [] })).toBe('Room');
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run client/src/__tests__/lodging.test.ts`
Expected: FAIL (missing exports).

- [ ] **Step 3: Implement**

Edit `client/src/utils/lodging.ts`:

1. Imports become:

```ts
import { BedCount, BedType, Booking, BookingCoupon, PropertyAmenity, Refundability, RoomAmenity, RoomType } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';
```

2. Replace `AMENITY_OPTIONS` with:

```ts
export const PROPERTY_AMENITY_OPTIONS: { value: PropertyAmenity; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'pool', label: 'Pool' },
  { value: 'hot_tub', label: 'Hot tub' },
  { value: 'parking', label: 'Parking' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'airport_shuttle', label: 'Airport shuttle' },
  { value: 'gym', label: 'Gym' },
];

export const ROOM_AMENITY_OPTIONS: { value: RoomAmenity; label: string }[] = [
  { value: 'fridge', label: 'Fridge' },
  { value: 'microwave', label: 'Microwave' },
  { value: 'kitchenette', label: 'Kitchenette' },
  { value: 'jetted_tub', label: 'Jetted tub' },
  { value: 'balcony', label: 'Balcony' },
];

const ALL_AMENITY_OPTIONS = [...PROPERTY_AMENITY_OPTIONS, ...ROOM_AMENITY_OPTIONS] as { value: string; label: string }[];
```

3. `amenitiesLabel` becomes:

```ts
export function amenitiesLabel(amenities: string[] | null | undefined, other: string | null | undefined): string {
  const parts = (amenities ?? []).map(a => ALL_AMENITY_OPTIONS.find(o => o.value === a)?.label ?? '').filter(Boolean);
  if (other?.trim()) parts.push(other.trim());
  return parts.join(' · ');
}
```

4. After `formatTime`, add hours:

```ts
// "15:00" → "3 PM"; legacy values with minutes keep them ("15:30" → "3:30 PM").
export function hourLabel(value: string | null | undefined): string {
  const m = value?.match(/^(\d{2}):(\d{2})$/);
  if (!m) return '';
  if (m[2] !== '00') return formatTime(value);
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

export const HOUR_OPTIONS: { value: string; label: string }[] = Array.from({ length: 24 }, (_, h) => {
  const value = `${String(h).padStart(2, '0')}:00`;
  return { value, label: hourLabel(value) };
});

export const CHECK_IN_QUICK = ['14:00', '15:00', '16:00', '17:00'];
export const CHECK_OUT_QUICK = ['10:00', '11:00', '12:00'];
```

5. Replace `perNight` with `nightlyPrice` (delete the `nightsBetween` import if now unused):

```ts
const round2 = (n: number) => Math.round(n * 100) / 100;

export function nightlyPrice(booking: Booking | null | undefined, nights: number | null | undefined): number | null {
  if (!booking) return null;
  if (booking.advertisedRateCash != null) return booking.advertisedRateCash;
  if (booking.advertisedPriceCash != null && nights && nights > 0) return round2(booking.advertisedPriceCash / nights);
  return null;
}
```

6. `cancelLabel` parameter type becomes `Pick<Booking, 'refundability' | 'cancelBy'> | null | undefined` (body unchanged). `roomTitle` parameter type becomes `{ roomType: RoomType | null; beds: BedCount[] } | null | undefined` (body unchanged).

7. Delete `roomMoneyLine`. Add:

```ts
export interface PaymentSummary {
  dueCash: number;
  duePoints: number;
  paidCash: number;
  paidPoints: number;
  remainingCash: number;
  remainingPoints: number;
  atCheckIn: boolean;
  label: string;
}

// Remaining = (due at booking + due at check-in) − paid transactions, never below zero.
export function paymentSummary(booking: Booking | null | undefined): PaymentSummary | null {
  if (!booking) return null;
  if (booking.dueAtBookingCash == null && booking.dueAtBookingPoints == null && booking.dueLaterCash == null) return null;
  const dueLater = booking.dueLaterCash ?? 0;
  const dueCash = round2((booking.dueAtBookingCash ?? 0) + dueLater);
  const duePoints = booking.dueAtBookingPoints ?? 0;
  const paidCash = booking.actualTotalCash ?? 0;
  const paidPoints = booking.actualTotalPoints ?? 0;
  const remainingCash = Math.max(0, round2(dueCash - paidCash));
  const remainingPoints = Math.max(0, duePoints - paidPoints);
  const atCheckIn = remainingCash > 0 && remainingCash <= dueLater && remainingPoints === 0;

  let label: string;
  if (remainingCash === 0 && remainingPoints === 0) {
    label = 'Paid in full';
  } else if (atCheckIn) {
    label = `Remaining ${formatMoney(remainingCash)} at check-in`;
  } else {
    const atBookingCash = Math.max(0, round2(remainingCash - dueLater));
    const atBooking = formatPrice(atBookingCash, remainingPoints);
    label = `Remaining ${formatPrice(remainingCash, remainingPoints)}${atBooking ? ` (incl. ${atBooking} due at booking)` : ''}`;
  }
  return { dueCash, duePoints, paidCash, paidPoints, remainingCash, remainingPoints, atCheckIn, label };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest --run client/src/__tests__/lodging.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/lodging.ts client/src/__tests__/lodging.test.ts
git commit -m "feat: lodging hour options, nightly price and payment summary helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Stay and room drafts

**Files:**
- Modify: `client/src/utils/stayDraft.ts` (full rewrite)
- Modify: `client/src/utils/roomDraft.ts` (full rewrite)
- Modify: `client/src/components/CouponsEditor.tsx` (import `CouponDraft` from `stayDraft`)
- Test: `client/src/__tests__/lodgingDrafts.test.ts` (full rewrite)

- [ ] **Step 1: Rewrite the draft tests**

Replace `client/src/__tests__/lodgingDrafts.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { Booking, LodgingRoom, TripElement } from '../types/trip';
import { addDays, emptyStayDraft, stayDraftFromElement, stayPayload, validateStayDraft, isStayDraftDirty } from '../utils/stayDraft';
import { emptyRoomDraft, roomDraftFromRoom, roomPayload, validateRoomDraft } from '../utils/roomDraft';

const element: TripElement = {
  id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt', sortPosition: 0, createdAt: '', updatedAt: '', notes: 'n',
  hotelDetails: {
    address: '1 Beach', phone: null, website: null, checkInDate: '2027-03-01', checkInTime: '15:00',
    checkOutDate: '2027-03-05', checkOutTime: '11:00', destinationId: null, amenities: ['pool'], otherAmenities: 'Bar',
  },
  bookingId: 'b1',
};

const booking: Booking = {
  id: 'b1', tripId: 't1', confirmationNumber: 'H-1', advertisedPriceCash: 1612, advertisedPricePoints: null,
  loyaltyProgram: 'Hyatt', notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [],
  currentConfirmationNumber: 'H-1', actualTotalCash: 0, actualTotalPoints: 0,
  bookingSite: 'Expedia', siteItineraryNumber: '7231', advertisedIncludesTaxes: true,
  advertisedRateCash: 403, advertisedRatePoints: null, dueAtBookingCash: 1430, dueAtBookingPoints: null,
  dueLaterCash: 182.4, dueLaterNotes: 'Resort fee', refundability: 'free', cancelBy: '2027-02-27T18:00',
  cancellationPolicy: 'Free until 2 days', coupons: [{ id: 'c1', code: 'X', savingsCash: 10, savingsPoints: null, notes: null }],
};

describe('stay draft', () => {
  it('round-trips element + booking through the draft', () => {
    const draft = stayDraftFromElement(element, booking);
    expect(draft).toMatchObject({
      name: 'Hyatt', checkInTime: '15:00', amenities: ['pool'], otherAmenities: 'Bar',
      bookingSite: 'Expedia', siteItineraryNumber: '7231', confirmationNumber: 'H-1', loyaltyProgram: 'Hyatt',
      rateCash: '403', priceCash: '1612', includesTaxes: true, dueAtBookingCash: '1430', dueLaterCash: '182.4',
      dueLaterNotes: 'Resort fee', refundability: 'free', cancelDate: '2027-02-27', cancelTime: '18:00',
      cancellationPolicy: 'Free until 2 days', coupons: [{ code: 'X', savingsCash: '10', savingsPoints: '', notes: '' }],
    });
    const payload = stayPayload(draft);
    expect(payload).toEqual({
      elementType: 'hotel', name: 'Hyatt', notes: 'n',
      typeSpecificData: {
        address: '1 Beach', phone: null, website: null, checkInDate: '2027-03-01', checkInTime: '15:00',
        checkOutDate: '2027-03-05', checkOutTime: '11:00', destinationId: null, amenities: ['pool'], otherAmenities: 'Bar',
      },
      booking: {
        bookingSite: 'Expedia', siteItineraryNumber: '7231', confirmationNumber: 'H-1', loyaltyProgram: 'Hyatt',
        advertisedRateCash: 403, advertisedRatePoints: null, advertisedPriceCash: 1612, advertisedPricePoints: null,
        advertisedIncludesTaxes: true, dueAtBookingCash: 1430, dueAtBookingPoints: null, dueLaterCash: 182.4,
        dueLaterNotes: 'Resort fee', refundability: 'free', cancelBy: '2027-02-27T18:00', cancellationPolicy: 'Free until 2 days',
        coupons: [{ code: 'X', savingsCash: 10, savingsPoints: null, notes: null }],
      },
    });
  });

  it('builds a draft without a booking', () => {
    expect(stayDraftFromElement(element, null)).toMatchObject({ bookingSite: '', rateCash: '', coupons: [], refundability: null });
  });

  it('validates', () => {
    const ok = { ...emptyStayDraft(), name: 'X', checkInDate: '2027-01-01', checkOutDate: '2027-01-02' };
    expect(validateStayDraft(ok)).toBeNull();
    expect(validateStayDraft({ ...ok, name: ' ' })).toBe('Hotel name is required');
    expect(validateStayDraft({ ...ok, checkOutDate: '2027-01-01' })).toBe('Check-out must be after check-in');
    expect(validateStayDraft({ ...ok, dueLaterCash: '-1' })).toBe('Amounts must be 0 or more');
    expect(validateStayDraft({ ...ok, rateCash: 'abc' })).toBe('Amounts must be 0 or more');
    expect(validateStayDraft({ ...ok, dueAtBookingPoints: '1.5' })).toBe('Points must be a whole number, 0 or more');
    expect(validateStayDraft({ ...ok, cancelTime: '18:00' })).toBe('Add a cancel-by date for the time');
    expect(validateStayDraft({ ...ok, coupons: [{ code: '', savingsCash: '', savingsPoints: '', notes: '' }] })).toBe('Coupon code is required');
  });

  it('detects dirty drafts', () => {
    const start = emptyStayDraft();
    expect(isStayDraftDirty(start, emptyStayDraft())).toBe(false);
    expect(isStayDraftDirty(start, { ...start, name: 'a' })).toBe(true);
  });

  it('addDays crosses months', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01');
  });
});

describe('room draft', () => {
  const room: LodgingRoom = {
    id: 'r1', elementId: 'h1', position: 0, roomType: 'suite', beds: [{ type: 'king', count: 1 }],
    description: 'Ocean', amenities: ['microwave'], otherAmenities: null, travelerIds: ['p1'],
  };

  it('round-trips a room', () => {
    const draft = roomDraftFromRoom(room);
    expect(draft).toEqual({ roomType: 'suite', beds: [{ type: 'king', count: 1 }], description: 'Ocean', amenities: ['microwave'], otherAmenities: '', travelerIds: ['p1'] });
    expect(roomPayload(draft)).toEqual({ roomType: 'suite', beds: [{ type: 'king', count: 1 }], description: 'Ocean', amenities: ['microwave'], otherAmenities: null, travelerIds: ['p1'] });
  });

  it('validates beds', () => {
    expect(validateRoomDraft(emptyRoomDraft())).toBeNull();
    expect(validateRoomDraft({ ...emptyRoomDraft(), beds: [{ type: 'king', count: 0 }] })).toBe('Bed count must be 1 to 9');
    expect(validateRoomDraft({ ...emptyRoomDraft(), beds: [{ type: 'king', count: 1 }, { type: 'king', count: 1 }] })).toBe('Each bed type may appear once');
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run client/src/__tests__/lodgingDrafts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `client/src/utils/stayDraft.ts`**

```ts
import { Booking, PropertyAmenity, Refundability, StayBookingPayload, TripElement } from '../types/trip';

export interface CouponDraft { code: string; savingsCash: string; savingsPoints: string; notes: string }

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
  amenities: PropertyAmenity[];
  otherAmenities: string;
  notes: string;
  bookingSite: string;
  siteItineraryNumber: string;
  confirmationNumber: string;
  loyaltyProgram: string;
  rateCash: string;
  ratePoints: string;
  priceCash: string;
  pricePoints: string;
  includesTaxes: boolean;
  dueAtBookingCash: string;
  dueAtBookingPoints: string;
  dueLaterCash: string;
  dueLaterNotes: string;
  refundability: Refundability | null;
  cancelDate: string;
  cancelTime: string;
  cancellationPolicy: string;
  coupons: CouponDraft[];
}

export function emptyStayDraft(): StayDraft {
  return {
    name: '', address: '', phone: '', website: '', checkInDate: '', checkInTime: '', checkOutDate: '', checkOutTime: '',
    destinationId: null, amenities: [], otherAmenities: '', notes: '',
    bookingSite: '', siteItineraryNumber: '', confirmationNumber: '', loyaltyProgram: '',
    rateCash: '', ratePoints: '', priceCash: '', pricePoints: '', includesTaxes: false,
    dueAtBookingCash: '', dueAtBookingPoints: '', dueLaterCash: '', dueLaterNotes: '',
    refundability: null, cancelDate: '', cancelTime: '', cancellationPolicy: '', coupons: [],
  };
}

const str = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export function stayDraftFromElement(element: TripElement, booking: Booking | null | undefined): StayDraft {
  const h = element.hotelDetails;
  const b = booking ?? null;
  const cancelBy = b?.cancelBy ?? '';
  return {
    name: element.name ?? '', notes: element.notes ?? '',
    address: h?.address ?? '', phone: h?.phone ?? '', website: h?.website ?? '',
    checkInDate: h?.checkInDate ?? '', checkInTime: h?.checkInTime ?? '',
    checkOutDate: h?.checkOutDate ?? '', checkOutTime: h?.checkOutTime ?? '',
    destinationId: h?.destinationId ?? null,
    amenities: h?.amenities ?? [], otherAmenities: h?.otherAmenities ?? '',
    bookingSite: b?.bookingSite ?? '', siteItineraryNumber: b?.siteItineraryNumber ?? '',
    confirmationNumber: b?.confirmationNumber ?? '', loyaltyProgram: b?.loyaltyProgram ?? '',
    rateCash: str(b?.advertisedRateCash), ratePoints: str(b?.advertisedRatePoints),
    priceCash: str(b?.advertisedPriceCash), pricePoints: str(b?.advertisedPricePoints),
    includesTaxes: Boolean(b?.advertisedIncludesTaxes),
    dueAtBookingCash: str(b?.dueAtBookingCash), dueAtBookingPoints: str(b?.dueAtBookingPoints),
    dueLaterCash: str(b?.dueLaterCash), dueLaterNotes: b?.dueLaterNotes ?? '',
    refundability: b?.refundability ?? null,
    cancelDate: cancelBy.slice(0, 10), cancelTime: cancelBy.length > 10 ? cancelBy.slice(11, 16) : '',
    cancellationPolicy: b?.cancellationPolicy ?? '',
    coupons: (b?.coupons ?? []).map(c => ({ code: c.code, savingsCash: str(c.savingsCash), savingsPoints: str(c.savingsPoints), notes: c.notes ?? '' })),
  };
}

export function isStayDraftDirty(initial: StayDraft, current: StayDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(v: string): number | null | 'invalid' {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
}

const badPoints = (v: string) => {
  const n = num(v);
  return n === 'invalid' || (typeof n === 'number' && !Number.isInteger(n));
};

export function validateStayDraft(draft: StayDraft): string | null {
  if (!draft.name.trim()) return 'Hotel name is required';
  if (!draft.checkInDate) return 'Check-in date is required';
  if (!draft.checkOutDate) return 'Check-out date is required';
  if (!DATE_RE.test(draft.checkInDate) || !DATE_RE.test(draft.checkOutDate)) return 'Dates must be YYYY-MM-DD';
  if (draft.checkOutDate <= draft.checkInDate) return 'Check-out must be after check-in';
  for (const v of [draft.rateCash, draft.priceCash, draft.dueAtBookingCash, draft.dueLaterCash]) {
    if (num(v) === 'invalid') return 'Amounts must be 0 or more';
  }
  for (const v of [draft.ratePoints, draft.pricePoints, draft.dueAtBookingPoints]) {
    if (badPoints(v)) return 'Points must be a whole number, 0 or more';
  }
  if (draft.cancelTime && !draft.cancelDate) return 'Add a cancel-by date for the time';
  for (const c of draft.coupons) {
    if (!c.code.trim()) return 'Coupon code is required';
    if (num(c.savingsCash) === 'invalid') return 'Coupon savings must be a number';
    if (badPoints(c.savingsPoints)) return 'Coupon points must be a whole number';
  }
  return null;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);
const numOrNull = (v: string) => { const n = num(v); return typeof n === 'number' ? n : null; };

export function stayPayload(draft: StayDraft) {
  const booking: StayBookingPayload = {
    bookingSite: blank(draft.bookingSite),
    siteItineraryNumber: blank(draft.siteItineraryNumber),
    confirmationNumber: blank(draft.confirmationNumber),
    loyaltyProgram: blank(draft.loyaltyProgram),
    advertisedRateCash: numOrNull(draft.rateCash),
    advertisedRatePoints: numOrNull(draft.ratePoints),
    advertisedPriceCash: numOrNull(draft.priceCash),
    advertisedPricePoints: numOrNull(draft.pricePoints),
    advertisedIncludesTaxes: draft.includesTaxes,
    dueAtBookingCash: numOrNull(draft.dueAtBookingCash),
    dueAtBookingPoints: numOrNull(draft.dueAtBookingPoints),
    dueLaterCash: numOrNull(draft.dueLaterCash),
    dueLaterNotes: blank(draft.dueLaterNotes),
    refundability: draft.refundability,
    cancelBy: draft.cancelDate ? (draft.cancelTime ? `${draft.cancelDate}T${draft.cancelTime}` : draft.cancelDate) : null,
    cancellationPolicy: blank(draft.cancellationPolicy),
    coupons: draft.coupons.map(c => ({ code: c.code.trim(), savingsCash: numOrNull(c.savingsCash), savingsPoints: numOrNull(c.savingsPoints), notes: blank(c.notes) })),
  };
  return {
    elementType: 'hotel' as const,
    name: draft.name.trim(),
    notes: blank(draft.notes),
    typeSpecificData: {
      address: blank(draft.address), phone: blank(draft.phone), website: blank(draft.website),
      checkInDate: draft.checkInDate, checkInTime: blank(draft.checkInTime),
      checkOutDate: draft.checkOutDate, checkOutTime: blank(draft.checkOutTime),
      destinationId: draft.destinationId || null,
      amenities: draft.amenities, otherAmenities: blank(draft.otherAmenities),
    },
    booking,
  };
}
```

Note: the `coupons` element type in `StayBookingPayload` is `Omit<BookingCoupon, 'id'>`; the mapped objects match it.

- [ ] **Step 4: Rewrite `client/src/utils/roomDraft.ts`**

```ts
import { BedCount, LodgingRoom, RoomAmenity, RoomPayload, RoomType } from '../types/trip';

export interface RoomDraft {
  roomType: RoomType | null;
  beds: BedCount[];
  description: string;
  amenities: RoomAmenity[];
  otherAmenities: string;
  travelerIds: string[];
}

export function emptyRoomDraft(): RoomDraft {
  return { roomType: null, beds: [], description: '', amenities: [], otherAmenities: '', travelerIds: [] };
}

export function roomDraftFromRoom(room: LodgingRoom): RoomDraft {
  return {
    roomType: room.roomType ?? null, beds: room.beds ?? [], description: room.description ?? '',
    amenities: room.amenities ?? [], otherAmenities: room.otherAmenities ?? '', travelerIds: room.travelerIds ?? [],
  };
}

export function isRoomDraftDirty(initial: RoomDraft, current: RoomDraft, newTravelerName = ''): boolean {
  return Boolean(newTravelerName.trim()) || JSON.stringify(initial) !== JSON.stringify(current);
}

export function validateRoomDraft(draft: RoomDraft): string | null {
  const seen = new Set<string>();
  for (const bed of draft.beds) {
    if (!Number.isInteger(bed.count) || bed.count < 1 || bed.count > 9) return 'Bed count must be 1 to 9';
    if (seen.has(bed.type)) return 'Each bed type may appear once';
    seen.add(bed.type);
  }
  return null;
}

const blank = (v: string) => (v.trim() ? v.trim() : null);

export function roomPayload(draft: RoomDraft): RoomPayload {
  return {
    roomType: draft.roomType,
    beds: draft.beds,
    description: blank(draft.description),
    amenities: draft.amenities,
    otherAmenities: blank(draft.otherAmenities),
    travelerIds: draft.travelerIds,
  };
}
```

- [ ] **Step 5: Point `CouponsEditor` at the new `CouponDraft`**

In `client/src/components/CouponsEditor.tsx` change `import { CouponDraft } from '../utils/roomDraft';` to `import { CouponDraft } from '../utils/stayDraft';`.

- [ ] **Step 6: Run tests**

Run: `npx vitest --run client/src/__tests__/lodgingDrafts.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/utils/stayDraft.ts client/src/utils/roomDraft.ts client/src/components/CouponsEditor.tsx client/src/__tests__/lodgingDrafts.test.ts
git commit -m "feat: stay draft carries booking fields; room draft is room-only

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Lodging row model

**Files:**
- Modify: `client/src/utils/lodgingRows.ts` (full rewrite)
- Test: `client/src/__tests__/lodgingRows.test.ts` (full rewrite)

- [ ] **Step 1: Rewrite the tests**

Replace `client/src/__tests__/lodgingRows.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { Booking, TripDestination, TripElement } from '../types/trip';
import { buildLodgingRows, lodgingTotals, stayBooking } from '../utils/lodgingRows';

const now = new Date(2027, 1, 20, 12, 0);

function stay(id: string, over: Partial<TripElement> = {}, checkIn = '2027-03-01', checkOut = '2027-03-05'): TripElement {
  return {
    id, tripId: 't1', elementType: 'hotel', name: `Stay ${id}`, sortPosition: 0, createdAt: '', updatedAt: '',
    hotelDetails: { address: null, phone: null, website: null, checkInDate: checkIn, checkInTime: null, checkOutDate: checkOut, checkOutTime: null, destinationId: null },
    rooms: [], bookingId: `b-${id}`, ...over,
  };
}

function booking(elementId: string, over: Partial<Booking> = {}): Booking {
  return {
    id: `b-${elementId}`, tripId: 't1', confirmationNumber: null, advertisedPriceCash: null, advertisedPricePoints: null,
    loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '', elementIds: [elementId], travelerIds: [],
    currentConfirmationNumber: null, actualTotalCash: 0, actualTotalPoints: 0, ...over,
  };
}

describe('stayBooking', () => {
  it('finds by bookingId, else by link', () => {
    const b = booking('h1');
    expect(stayBooking(stay('h1'), [b])).toBe(b);
    expect(stayBooking(stay('h1', { bookingId: undefined }), [b])).toBe(b);
    expect(stayBooking(stay('h2'), [b])).toBeNull();
  });
});

describe('buildLodgingRows', () => {
  it('builds price with nightly rate, confirm label, room count and remaining', () => {
    const el = stay('h1', { rooms: [{ id: 'r1', elementId: 'h1', position: 0, roomType: 'suite', beds: [], description: null, amenities: [], otherAmenities: null, travelerIds: [] }] });
    const b = booking('h1', {
      advertisedPriceCash: 1612, advertisedRateCash: 403, siteItineraryNumber: '7231004', currentConfirmationNumber: 'H-88213',
      dueAtBookingCash: 1430, dueLaterCash: 182.4, actualTotalCash: 1430, refundability: 'free', cancelBy: '2027-02-27T18:00',
    });
    const [row] = buildLodgingRows([el], [b], [], now);
    expect(row).toMatchObject({
      priceLabel: '$1,612.00 ($403.00/nt)', confirmation: '7231004 / H-88213', roomCount: 1,
      remaining: 'Remaining $182.40 at check-in', deadline: { state: 'soon' },
    });
    expect(row.dateLabel).toBe('Mar 1 → Mar 5 · 4 nts');
  });

  it('falls back to total ÷ nights, then paid, then a dash', () => {
    expect(buildLodgingRows([stay('h1')], [booking('h1', { advertisedPriceCash: 1612 })], [], now)[0].priceLabel).toBe('$1,612.00 ($403.00/nt)');
    expect(buildLodgingRows([stay('h1')], [booking('h1', { actualTotalCash: 50 })], [], now)[0].priceLabel).toBe('Paid $50.00');
    expect(buildLodgingRows([stay('h1')], [], [], now)[0]).toMatchObject({ priceLabel: '—', confirmation: '—', remaining: null, deadline: null });
  });

  it('shows no remaining when paid in full or no dues', () => {
    expect(buildLodgingRows([stay('h1')], [booking('h1', { dueAtBookingCash: 100, actualTotalCash: 100 })], [], now)[0].remaining).toBeNull();
    expect(buildLodgingRows([stay('h1')], [booking('h1', { advertisedPriceCash: 100 })], [], now)[0].remaining).toBeNull();
  });

  it('uses only whichever confirmation numbers exist', () => {
    expect(buildLodgingRows([stay('h1')], [booking('h1', { currentConfirmationNumber: 'H-1' })], [], now)[0].confirmation).toBe('H-1');
  });

  it('attaches the destination and sorts by check-in', () => {
    const dest: TripDestination = { id: 'd1', tripId: 't1', name: 'Cabo', color: 'teal', position: 0, packingListId: 'pl1', memberIds: [] };
    const a = stay('a', {}, '2027-03-05', '2027-03-06');
    const b = stay('b', { hotelDetails: { ...stay('b').hotelDetails!, destinationId: 'd1' } });
    const rows = buildLodgingRows([a, b], [], [dest], now);
    expect(rows.map(r => r.id)).toEqual(['b', 'a']);
    expect(rows[0].destination).toEqual({ name: 'Cabo', color: 'teal' });
  });
});

describe('lodgingTotals', () => {
  it('uses dues, else advertised, else paid, per stay', () => {
    const els = [stay('h1'), stay('h2'), stay('h3')];
    const bs = [
      booking('h1', { dueAtBookingCash: 100, dueLaterCash: 20, advertisedPriceCash: 999 }),
      booking('h2', { advertisedPriceCash: 300, advertisedPricePoints: 1000 }),
      booking('h3', { actualTotalCash: 50 }),
    ];
    expect(lodgingTotals(els, bs)).toEqual({ cash: 470, points: 1000, label: '1,000 pts + $470.00' });
  });
});
```

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run client/src/__tests__/lodgingRows.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `client/src/utils/lodgingRows.ts`**

```ts
import { Booking, TripDestination, TripElement } from '../types/trip';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';
import { nightsBetween } from './tripDates';
import { DeadlineState, cancelDeadlineState, cancelLabel, nightlyPrice, paymentSummary } from './lodging';

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
  remaining: string | null;
}

function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The stay's single booking: by bookingId, else the first booking linking only this stay.
export function stayBooking(element: TripElement, bookings: Booking[]): Booking | null {
  if (element.bookingId) {
    const byId = bookings.find(b => b.id === element.bookingId);
    if (byId) return byId;
  }
  return bookings.find(b => b.elementIds.length === 1 && b.elementIds[0] === element.id) ?? null;
}

export function buildLodgingRows(elements: TripElement[], bookings: Booking[], destinations: TripDestination[], now: Date = new Date()): LodgingRow[] {
  return elements
    .filter(e => e.elementType === 'hotel')
    .map(element => {
      const h = element.hotelDetails;
      const b = stayBooking(element, bookings);
      const nights = nightsBetween(h?.checkInDate, h?.checkOutDate);
      const dateLabel = h?.checkInDate && h?.checkOutDate
        ? `${shortDate(h.checkInDate)} → ${shortDate(h.checkOutDate)}${nights ? ` · ${nights} nt${nights === 1 ? '' : 's'}` : ''}`
        : '';

      let priceLabel = '—';
      if (b && (b.advertisedPriceCash || b.advertisedPricePoints)) {
        priceLabel = formatPrice(b.advertisedPriceCash, b.advertisedPricePoints);
        const nightly = nightlyPrice(b, nights);
        if (nightly) priceLabel += ` (${formatMoney(nightly)}/nt)`;
      } else if (b && (b.actualTotalCash || b.actualTotalPoints)) {
        priceLabel = `Paid ${formatPrice(b.actualTotalCash, b.actualTotalPoints)}`;
      }

      const confirmation = b ? [b.siteItineraryNumber, b.currentConfirmationNumber].filter(Boolean).join(' / ') || '—' : '—';
      const state = cancelDeadlineState(b?.cancelBy ?? null, now);
      const summary = paymentSummary(b);
      const dest = h?.destinationId ? destinations.find(d => d.id === h.destinationId) : undefined;

      return {
        id: element.id,
        name: element.name,
        checkInDate: h?.checkInDate ?? '',
        dateLabel,
        nights,
        priceLabel,
        confirmation,
        roomCount: element.rooms?.length ?? 0,
        destination: dest ? { name: dest.name, color: dest.color } : null,
        deadline: state !== 'none' ? { label: cancelLabel(b), state } : null,
        remaining: summary && (summary.remainingCash > 0 || summary.remainingPoints > 0) ? summary.label : null,
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

// Per stay: the amounts due if any are set, else the advertised total, else what was paid.
export function lodgingTotals(elements: TripElement[], bookings: Booking[]): { cash: number; points: number; label: string } {
  let cash = 0;
  let points = 0;
  for (const element of elements) {
    if (element.elementType !== 'hotel') continue;
    const b = stayBooking(element, bookings);
    if (!b) continue;
    const summary = paymentSummary(b);
    if (summary) {
      cash += summary.dueCash;
      points += summary.duePoints;
    } else if (b.advertisedPriceCash || b.advertisedPricePoints) {
      cash += b.advertisedPriceCash ?? 0;
      points += b.advertisedPricePoints ?? 0;
    } else {
      cash += b.actualTotalCash;
      points += b.actualTotalPoints;
    }
  }
  cash = Math.round(cash * 100) / 100;
  return { cash, points, label: formatPrice(cash, points) };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest --run client/src/__tests__/lodgingRows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/utils/lodgingRows.ts client/src/__tests__/lodgingRows.test.ts
git commit -m "feat: lodging rows use the stay booking, nightly price and remaining

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: HourPicker

**Files:**
- Create: `client/src/components/HourPicker.tsx`
- Test: `client/src/__tests__/HourPicker.test.tsx` (new — add to `vitest.config.ts` `include` with comment `// Hour chips + other select`)

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { HourPicker } from '../components/HourPicker';
import { CHECK_IN_QUICK } from '../utils/lodging';

describe('HourPicker', () => {
  afterEach(() => cleanup());

  it('renders quick chips and picks one', () => {
    const onChange = vi.fn();
    renderWithMantine(<HourPicker label="Check-in time" value={null} onChange={onChange} quick={CHECK_IN_QUICK} />);
    expect(screen.getByRole('group', { name: 'Check-in time' })).toBeTruthy();
    for (const name of ['2 PM', '3 PM', '4 PM', '5 PM']) expect(screen.getByRole('checkbox', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: '3 PM' }));
    expect(onChange).toHaveBeenCalledWith('15:00');
  });

  it('clears when the selected chip is clicked', () => {
    const onChange = vi.fn();
    renderWithMantine(<HourPicker label="Check-in time" value="15:00" onChange={onChange} quick={CHECK_IN_QUICK} />);
    expect((screen.getByRole('checkbox', { name: '3 PM' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '3 PM' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a non-quick value in the Other select and picks from it', () => {
    const onChange = vi.fn();
    renderWithMantine(<HourPicker label="Check-in time" value="13:00" onChange={onChange} quick={CHECK_IN_QUICK} />);
    const other = screen.getByLabelText('Check-in time other') as HTMLInputElement;
    expect(other.value).toBe('1 PM');
    fireEvent.click(other);
    fireEvent.click(screen.getByRole('option', { name: '6 PM' }));
    expect(onChange).toHaveBeenCalledWith('18:00');
  });

  it('shows a legacy value with minutes', () => {
    renderWithMantine(<HourPicker label="Check-in time" value="15:30" onChange={() => {}} quick={CHECK_IN_QUICK} />);
    expect((screen.getByLabelText('Check-in time other') as HTMLInputElement).value).toBe('3:30 PM');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest --run client/src/__tests__/HourPicker.test.tsx`
Expected: FAIL — cannot resolve `../components/HourPicker`.

- [ ] **Step 3: Implement**

Create `client/src/components/HourPicker.tsx`:

```tsx
import { Chip, Group, Select, Text } from '@mantine/core';
import { HOUR_OPTIONS, hourLabel } from '../utils/lodging';

interface HourPickerProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  quick: string[];
}

export function HourPicker({ label, value, onChange, quick }: HourPickerProps) {
  const isQuick = value != null && quick.includes(value);
  const options = value && !HOUR_OPTIONS.some(o => o.value === value)
    ? [...HOUR_OPTIONS, { value, label: hourLabel(value) }]
    : HOUR_OPTIONS;

  return (
    <div role="group" aria-label={label}>
      <Text size="sm" fw={500} mb={4}>{label}</Text>
      <Group gap={6} wrap="wrap">
        {quick.map(hour => (
          <Chip key={hour} size="xs" checked={value === hour} onChange={() => onChange(value === hour ? null : hour)}>
            {hourLabel(hour)}
          </Chip>
        ))}
        <Select
          aria-label={`${label} other`}
          placeholder="Other"
          size="xs"
          w={110}
          clearable
          data={options}
          value={isQuick ? null : value}
          onChange={next => onChange(next)}
        />
      </Group>
    </div>
  );
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest --run client/src/__tests__/HourPicker.test.tsx`
Expected: PASS. If Mantine's Select in jsdom needs a different interaction to open, copy the working pattern from an existing test that picks a Select option (e.g. `client/src/__tests__/RoomForm.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/HourPicker.tsx client/src/__tests__/HourPicker.test.tsx vitest.config.ts
git commit -m "feat: HourPicker with quick hour chips

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 13: Unsaved-changes guard in ElementDialog

Decision: `keepMounted` is a new `ElementDialog` prop (default `false`) so flight tabs keep today's behaviour exactly; the hotel dialog passes `keepMounted`.

**Files:**
- Create: `client/src/components/DiscardChangesModal.tsx`
- Modify: `client/src/components/ElementDialog.tsx`
- Test: `client/src/__tests__/ElementDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('ElementDialog')` in `client/src/__tests__/ElementDialog.test.tsx` (add `vi` and `useState` imports as needed):

```tsx
  it('keeps inactive tabs mounted when keepMounted is set, preserving typed values', () => {
    renderDialog({ keepMounted: true });
    fireEvent.change(screen.getByLabelText('notes'), { target: { value: 'typed' } });
    fireEvent.click(screen.getByRole('tab', { name: /seats/i }));
    fireEvent.click(screen.getByRole('tab', { name: /details/i }));
    expect((screen.getByLabelText('notes') as HTMLInputElement).value).toBe('typed');
  });

  it('closes immediately when not dirty', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('asks before discarding when dirty; Keep editing keeps it open', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose, dirty: true });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/details body/i)).toBeTruthy();
  });

  it('Discard closes the dialog', async () => {
    const onClose = vi.fn();
    renderDialog({ onClose, dirty: true });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });
```

If the Mantine modal close button has no accessible name matching `/close/i` in this version, find it with `document.querySelector('.mantine-Modal-close')` instead.

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run client/src/__tests__/ElementDialog.test.tsx`
Expected: the 4 new tests FAIL; the existing ones PASS.

- [ ] **Step 3: Create `DiscardChangesModal`**

`client/src/components/DiscardChangesModal.tsx`:

```tsx
import { Button, Group, Modal, Text } from '@mantine/core';

interface DiscardChangesModalProps {
  opened: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export function DiscardChangesModal({ opened, onKeepEditing, onDiscard }: DiscardChangesModalProps) {
  return (
    <Modal opened={opened} onClose={onKeepEditing} title="Discard unsaved changes?" centered size="sm" zIndex={400}>
      <Text size="sm">You have changes that haven't been saved.</Text>
      <Group mt="md" justify="flex-end">
        <Button variant="default" onClick={onDiscard}>Discard</Button>
        <Button onClick={onKeepEditing} data-autofocus>Keep editing</Button>
      </Group>
    </Modal>
  );
}
```

- [ ] **Step 4: Update `ElementDialog`**

In `client/src/components/ElementDialog.tsx`:

1. Props: add `keepMounted?: boolean;` and `dirty?: boolean;`, destructure with defaults `keepMounted = false, dirty = false`.
2. Add state and a guarded close:

```tsx
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const requestClose = () => {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  };
```

3. Render the discard modal as a **sibling** of the main modal (a nested child would receive bubbled key events from the outer modal):

```tsx
  return (
    <>
      <Modal opened={opened} onClose={requestClose} title={title} size="lg" fullScreen={isMobile} centered={!isMobile}>
        <Tabs value={active} onChange={value => value && setActive(value)} keepMounted={keepMounted}>
          {/* ...unchanged tab list and panels... */}
        </Tabs>
      </Modal>
      <DiscardChangesModal
        opened={confirmingDiscard}
        onKeepEditing={() => setConfirmingDiscard(false)}
        onDiscard={() => { setConfirmingDiscard(false); onClose(); }}
      />
    </>
  );
```

and `import { DiscardChangesModal } from './DiscardChangesModal';`.

- [ ] **Step 5: Run tests**

Run: `npx vitest --run client/src/__tests__/ElementDialog.test.tsx`
Expected: PASS (all old + 4 new).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/DiscardChangesModal.tsx client/src/components/ElementDialog.tsx client/src/__tests__/ElementDialog.test.tsx
git commit -m "feat: ElementDialog keepMounted option and discard-changes guard

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: Stay form and Add Lodging dialog

**Files:**
- Modify: `client/src/components/LodgingStayForm.tsx` (full rewrite)
- Modify: `client/src/components/AddLodgingDialog.tsx`
- Test: `client/src/__tests__/AddLodgingDialog.test.tsx`

- [ ] **Step 1: Update the tests**

In `client/src/__tests__/AddLodgingDialog.test.tsx` keep the existing four tests and append:

```tsx
  it('sends the booking fields with the stay', async () => {
    vi.mocked(tripApi.createElement).mockResolvedValue({ id: 'h1' } as any);
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Casa');
    fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value: '2027-03-01' } });
    await userEvent.click(screen.getByRole('checkbox', { name: '3 PM' }));
    await userEvent.click(screen.getByRole('checkbox', { name: '11 AM' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Booking site' }), 'Expedia');
    await userEvent.type(screen.getByLabelText('Site itinerary #'), '7231004');
    await userEvent.type(screen.getByLabelText('Hotel confirmation #'), 'H-88213');
    await userEvent.type(screen.getByLabelText('Advertised nightly (cash)'), '403');
    await userEvent.type(screen.getByLabelText('Advertised total (cash)'), '1612');
    await userEvent.type(screen.getByLabelText('Due at booking (cash)'), '1430');
    await userEvent.type(screen.getByLabelText('Due at check-in (cash)'), '182.40');
    await userEvent.type(screen.getByLabelText('Due at check-in note'), 'Resort fee');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Pool' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    await waitFor(() => expect(tripApi.createElement).toHaveBeenCalled());
    const payload = vi.mocked(tripApi.createElement).mock.calls[0][1] as any;
    expect(payload.typeSpecificData).toMatchObject({ checkInTime: '15:00', checkOutTime: '11:00', amenities: ['pool'] });
    expect(payload.booking).toMatchObject({
      bookingSite: 'Expedia', siteItineraryNumber: '7231004', confirmationNumber: 'H-88213',
      advertisedRateCash: 403, advertisedPriceCash: 1612, dueAtBookingCash: 1430, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee',
    });
  });

  it('closes without asking when nothing was entered', async () => {
    const onClose = vi.fn();
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={onClose} onCreated={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('asks before discarding typed values', async () => {
    const onClose = vi.fn();
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={onClose} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Casa');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Hotel name') as HTMLInputElement).value).toBe('Casa');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });
```

The "Save stay" flow in the existing test still passes: `stayPayload` now also has `booking`, and the assertion uses `objectContaining`.

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run client/src/__tests__/AddLodgingDialog.test.tsx`
Expected: the 3 new tests FAIL.

- [ ] **Step 3: Rewrite `LodgingStayForm`**

Replace `client/src/components/LodgingStayForm.tsx` with:

```tsx
import { ReactNode, useId } from 'react';
import { Autocomplete, Checkbox, Chip, Group, SegmentedControl, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { PropertyAmenity, Refundability, TripDestination } from '../types/trip';
import { StayDraft, addDays } from '../utils/stayDraft';
import { BOOKING_SITES, CHECK_IN_QUICK, CHECK_OUT_QUICK, PROPERTY_AMENITY_OPTIONS, REFUNDABILITY_OPTIONS } from '../utils/lodging';
import { HourPicker } from './HourPicker';
import { CouponsEditor } from './CouponsEditor';

interface LodgingStayFormProps {
  draft: StayDraft;
  onChange: (draft: StayDraft) => void;
  destinations: TripDestination[];
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Text size="sm" fw={600} mt="sm" mb={4}>{title}</Text>
      <Stack gap="xs">{children}</Stack>
    </div>
  );
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
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <div>
          <Section title="Hotel">
            <TextInput id={`${uid}-name`} label="Hotel name" value={draft.name} onChange={e => set('name', e.currentTarget.value)} />
            <Textarea id={`${uid}-address`} label="Address" autosize minRows={2} value={draft.address} onChange={e => set('address', e.currentTarget.value)} />
            <TextInput id={`${uid}-phone`} label="Phone" type="tel" value={draft.phone} onChange={e => set('phone', e.currentTarget.value)} />
            <TextInput id={`${uid}-website`} label="Website" type="url" value={draft.website} onChange={e => set('website', e.currentTarget.value)} />
            <TextInput id={`${uid}-in-date`} label="Check-in date" type="date" value={draft.checkInDate} onChange={e => setCheckIn(e.currentTarget.value)} />
            <HourPicker label="Check-in time" value={draft.checkInTime || null} onChange={v => set('checkInTime', v ?? '')} quick={CHECK_IN_QUICK} />
            <TextInput id={`${uid}-out-date`} label="Check-out date" type="date" value={draft.checkOutDate} onChange={e => set('checkOutDate', e.currentTarget.value)} />
            <HourPicker label="Check-out time" value={draft.checkOutTime || null} onChange={v => set('checkOutTime', v ?? '')} quick={CHECK_OUT_QUICK} />
            {destinations.length > 0 && (
              <Select
                id={`${uid}-destination`}
                label="Destination"
                placeholder="None"
                clearable
                data={destinations.map(d => ({ value: d.id, label: d.name }))}
                value={draft.destinationId}
                onChange={value => set('destinationId', value)}
              />
            )}
          </Section>

          <Section title="Booking">
            <Autocomplete id={`${uid}-site`} label="Booking site" data={BOOKING_SITES} value={draft.bookingSite} onChange={value => set('bookingSite', value)} />
            <TextInput id={`${uid}-itin`} label="Site itinerary #" value={draft.siteItineraryNumber} onChange={e => set('siteItineraryNumber', e.currentTarget.value)} />
            <TextInput id={`${uid}-conf`} label="Hotel confirmation #" value={draft.confirmationNumber} onChange={e => set('confirmationNumber', e.currentTarget.value)} />
            <TextInput id={`${uid}-loyalty`} label="Loyalty program" value={draft.loyaltyProgram} onChange={e => set('loyaltyProgram', e.currentTarget.value)} />
          </Section>
        </div>

        <div>
          <Section title="Price">
            <Group grow gap="xs">
              <TextInput id={`${uid}-rate-cash`} label="Advertised nightly (cash)" type="number" step="0.01" value={draft.rateCash} onChange={e => set('rateCash', e.currentTarget.value)} />
              <TextInput id={`${uid}-rate-points`} label="Advertised nightly (points)" type="number" step="1" value={draft.ratePoints} onChange={e => set('ratePoints', e.currentTarget.value)} />
            </Group>
            <Group grow gap="xs">
              <TextInput id={`${uid}-cash`} label="Advertised total (cash)" type="number" step="0.01" value={draft.priceCash} onChange={e => set('priceCash', e.currentTarget.value)} />
              <TextInput id={`${uid}-points`} label="Advertised total (points)" type="number" step="1" value={draft.pricePoints} onChange={e => set('pricePoints', e.currentTarget.value)} />
            </Group>
            <Checkbox id={`${uid}-taxes`} label="Includes taxes & fees" checked={draft.includesTaxes} onChange={e => set('includesTaxes', e.currentTarget.checked)} />
          </Section>

          <Section title="Payment schedule">
            <Group grow gap="xs">
              <TextInput id={`${uid}-due-cash`} label="Due at booking (cash)" type="number" step="0.01" value={draft.dueAtBookingCash} onChange={e => set('dueAtBookingCash', e.currentTarget.value)} />
              <TextInput id={`${uid}-due-points`} label="Due at booking (points)" type="number" step="1" value={draft.dueAtBookingPoints} onChange={e => set('dueAtBookingPoints', e.currentTarget.value)} />
            </Group>
            <TextInput id={`${uid}-later-cash`} label="Due at check-in (cash)" type="number" step="0.01" value={draft.dueLaterCash} onChange={e => set('dueLaterCash', e.currentTarget.value)} />
            <TextInput id={`${uid}-later-notes`} label="Due at check-in note" placeholder="e.g. Resort fee + taxes" value={draft.dueLaterNotes} onChange={e => set('dueLaterNotes', e.currentTarget.value)} />
          </Section>

          <Section title="Cancellation">
            <SegmentedControl
              aria-label="Refundability"
              fullWidth
              size="xs"
              data={[...REFUNDABILITY_OPTIONS, { value: '', label: 'Unset' }]}
              value={draft.refundability ?? ''}
              onChange={value => set('refundability', (value || null) as Refundability | null)}
            />
            <TextInput id={`${uid}-cancel-date`} label="Cancel by date" type="date" value={draft.cancelDate} onChange={e => set('cancelDate', e.currentTarget.value)} />
            <HourPicker label="Cancel by time" value={draft.cancelTime || null} onChange={v => set('cancelTime', v ?? '')} quick={[]} />
            <Textarea id={`${uid}-policy`} label="Policy" autosize minRows={1} value={draft.cancellationPolicy} onChange={e => set('cancellationPolicy', e.currentTarget.value)} />
          </Section>
        </div>
      </SimpleGrid>

      <Section title="Property amenities">
        <Chip.Group multiple value={draft.amenities} onChange={value => set('amenities', value as PropertyAmenity[])}>
          <Group gap={6}>
            {PROPERTY_AMENITY_OPTIONS.map(o => <Chip key={o.value} value={o.value} size="xs">{o.label}</Chip>)}
          </Group>
        </Chip.Group>
        <TextInput id={`${uid}-other`} label="Other amenities" value={draft.otherAmenities} onChange={e => set('otherAmenities', e.currentTarget.value)} />
      </Section>

      <Section title="Coupons">
        <CouponsEditor coupons={draft.coupons} onChange={coupons => set('coupons', coupons)} />
      </Section>

      <Textarea id={`${uid}-notes`} mt="sm" label="Notes" autosize minRows={1} value={draft.notes} onChange={e => set('notes', e.currentTarget.value)} />
    </>
  );
}
```

- [ ] **Step 4: Update `AddLodgingDialog`**

In `client/src/components/AddLodgingDialog.tsx`:

1. Imports: `import { emptyStayDraft, isStayDraftDirty, stayPayload, validateStayDraft } from '../utils/stayDraft';`, `import { DiscardChangesModal } from './DiscardChangesModal';`, and drop `Text` from the Mantine import.
2. Add `const [confirmingDiscard, setConfirmingDiscard] = useState(false);`
3. Replace `handleClose` with:

```tsx
  const closeNow = () => {
    reset();
    setConfirmingDiscard(false);
    onClose();
  };

  const handleClose = () => {
    if (isStayDraftDirty(emptyStayDraft(), draft)) setConfirmingDiscard(true);
    else closeNow();
  };
```

4. Replace the returned JSX with (the per-room hint text is removed):

```tsx
  return (
    <>
      <Modal opened={opened} onClose={handleClose} title="Add lodging" size="lg" fullScreen={isMobile}>
        {error && <Alert color="red" mb="sm">{error}</Alert>}
        <LodgingStayForm draft={draft} onChange={setDraft} destinations={destinations} />
        <Group mt="md" justify="flex-end">
          <Button variant="default" onClick={handleClose}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save stay</Button>
        </Group>
      </Modal>
      <DiscardChangesModal opened={confirmingDiscard} onKeepEditing={() => setConfirmingDiscard(false)} onDiscard={closeNow} />
    </>
  );
```

- [ ] **Step 5: Run tests**

Run: `npx vitest --run client/src/__tests__/AddLodgingDialog.test.tsx`
Expected: PASS. If `getByRole('checkbox', { name: 'Pool' })` is ambiguous or a quick-hour chip name collides, scope the query with `within(screen.getByRole('group', { name: 'Check-in time' }))`.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/LodgingStayForm.tsx client/src/components/AddLodgingDialog.tsx client/src/__tests__/AddLodgingDialog.test.tsx
git commit -m "feat: stay form with booking, price, payment schedule and hour pickers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 15: Details tab

**Files:**
- Modify: `client/src/components/LodgingDetailsTab.tsx` (full rewrite)
- Test: `client/src/__tests__/LodgingDetailsTab.test.tsx`

- [ ] **Step 1: Update the tests**

In `client/src/__tests__/LodgingDetailsTab.test.tsx`:

1. Add a booking fixture after `element`:

```tsx
const booking: Booking = {
  id: 'b1', tripId: 't1', confirmationNumber: 'H-80000', advertisedPriceCash: 1612, advertisedPricePoints: null,
  loyaltyProgram: 'World of Hyatt', notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [],
  currentConfirmationNumber: 'H-88213', actualTotalCash: 1430, actualTotalPoints: 0,
  bookingSite: 'Expedia', siteItineraryNumber: '7231004', advertisedIncludesTaxes: true, advertisedRateCash: 403,
  dueAtBookingCash: 1430, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee', refundability: 'nonrefundable',
  cancellationPolicy: 'No refunds', coupons: [{ id: 'c1', code: 'EXP10', savingsCash: 10, savingsPoints: null, notes: null }],
};
```

(import `Booking` from `../types/trip`) and add `amenities: ['pool'], otherAmenities: 'Swim-up bar'` to `element.hotelDetails`.

2. Every render now passes `booking={booking}` and `onDirtyChange={() => {}}`. Add a helper and use it in all existing tests:

```tsx
function renderTab(props: Partial<React.ComponentProps<typeof LodgingDetailsTab>> = {}) {
  return renderWithMantine(
    <LodgingDetailsTab tripId="t1" element={element} booking={booking} destinations={[]} onChanged={() => {}} onDeleted={() => {}}
      onEditingChange={() => {}} onDirtyChange={() => {}} {...props} />,
  );
}
```

3. Append:

```tsx
  it('shows booking, price, payment, cancellation, amenities and coupons', () => {
    renderTab();
    expect(screen.getByText('Expedia 7231004 · Hotel H-88213 · orig H-80000')).toBeTruthy();
    expect(screen.getByText('Loyalty: World of Hyatt')).toBeTruthy();
    expect(screen.getByText('Adv $403.00/nt · $1,612.00 total incl. taxes')).toBeTruthy();
    expect(screen.getByText('Due at booking $1,430.00 · Due at check-in $182.40 (Resort fee)')).toBeTruthy();
    expect(screen.getByText('Non-refundable')).toBeTruthy();
    expect(screen.getByText('No refunds')).toBeTruthy();
    expect(screen.getByText('Pool · Swim-up bar')).toBeTruthy();
    expect(screen.getByText('Coupons: EXP10 −$10.00')).toBeTruthy();
  });

  it('renders without a booking', () => {
    renderTab({ booking: null });
    expect(screen.getByText(/Mar 1, 3:00 PM/)).toBeTruthy();
    expect(screen.queryByText(/Due at booking/)).toBeNull();
  });

  it('reports dirty only after a change', async () => {
    const onDirtyChange = vi.fn();
    renderTab({ onDirtyChange });
    await userEvent.click(screen.getByRole('button', { name: 'Edit stay' }));
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    await userEvent.type(screen.getByLabelText('Hotel name'), ' X');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('saves the booking with the stay', async () => {
    vi.mocked(tripApi.updateElement).mockResolvedValue({} as any);
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'Edit stay' }));
    const due = screen.getByLabelText('Due at check-in (cash)');
    await userEvent.clear(due);
    await userEvent.type(due, '200');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(tripApi.updateElement).toHaveBeenCalled());
    const payload = vi.mocked(tripApi.updateElement).mock.calls[0][2] as any;
    expect(payload).not.toHaveProperty('elementType');
    expect(payload.booking).toMatchObject({ dueLaterCash: 200, siteItineraryNumber: '7231004' });
  });
```

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run client/src/__tests__/LodgingDetailsTab.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Rewrite `LodgingDetailsTab`**

```tsx
import { ReactNode, useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { Booking, TripDestination, TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { LodgingStayForm } from './LodgingStayForm';
import { StayDraft, isStayDraftDirty, stayDraftFromElement, stayPayload, validateStayDraft } from '../utils/stayDraft';
import { amenitiesLabel, cancelDeadlineState, cancelLabel, couponsLabel, formatTime } from '../utils/lodging';
import { formatPrice } from '../utils/flightRows';
import { formatMoney } from '../utils/money';
import { formatNights, nightsBetween } from '../utils/tripDates';

interface LodgingDetailsTabProps {
  tripId: string;
  element: TripElement;
  booking: Booking | null;
  destinations: TripDestination[];
  onChanged: () => Promise<void> | void;
  onDeleted: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}

const DEADLINE_COLOR = { ok: 'green', soon: 'orange', passed: 'dimmed', none: undefined } as const;

function dayLabel(ymd: string | null | undefined, time: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const t = formatTime(time);
  return t ? `${date}, ${t}` : date;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">{title}</Text>
      {children}
    </div>
  );
}

function bookingLine(b: Booking): string {
  const conf = b.currentConfirmationNumber ?? b.confirmationNumber;
  return [
    [b.bookingSite, b.siteItineraryNumber].filter(Boolean).join(' '),
    conf ? `Hotel ${conf}` : '',
    b.confirmationNumber && b.confirmationNumber !== conf ? `orig ${b.confirmationNumber}` : '',
  ].filter(Boolean).join(' · ');
}

function priceLine(b: Booking): string {
  const nightly = formatPrice(b.advertisedRateCash, b.advertisedRatePoints);
  const total = formatPrice(b.advertisedPriceCash, b.advertisedPricePoints);
  const parts = [
    nightly ? `${nightly}/nt` : '',
    total ? `${total} total${b.advertisedIncludesTaxes ? ' incl. taxes' : ''}` : '',
  ].filter(Boolean);
  return parts.length ? `Adv ${parts.join(' · ')}` : '';
}

function paymentLine(b: Booking): string {
  const atBooking = formatPrice(b.dueAtBookingCash, b.dueAtBookingPoints);
  return [
    atBooking ? `Due at booking ${atBooking}` : '',
    b.dueLaterCash ? `Due at check-in ${formatMoney(b.dueLaterCash)}${b.dueLaterNotes ? ` (${b.dueLaterNotes})` : ''}` : '',
  ].filter(Boolean).join(' · ');
}

export function LodgingDetailsTab({
  tripId, element, booking, destinations, onChanged, onDeleted, onEditingChange, onDirtyChange,
}: LodgingDetailsTabProps) {
  const [draft, setDraft] = useState<StayDraft | null>(null);
  const [initialDraft, setInitialDraft] = useState<StayDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const editing = draft !== null;
  const dirty = Boolean(draft && initialDraft && isStayDraftDirty(initialDraft, draft));
  useEffect(() => {
    onEditingChangeRef.current(editing);
  }, [editing]);
  useEffect(() => {
    onDirtyChangeRef.current(dirty);
  }, [dirty]);
  useEffect(() => () => {
    onEditingChangeRef.current(false);
    onDirtyChangeRef.current(false);
  }, []);

  const h = element.hotelDetails;

  const startEdit = () => {
    const start = stayDraftFromElement(element, booking);
    setConfirmingDelete(false);
    setError(null);
    setInitialDraft(start);
    setDraft(start);
  };

  const stopEdit = () => {
    setDraft(null);
    setInitialDraft(null);
    setError(null);
  };

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
      stopEdit();
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
          <Button variant="default" size="xs" onClick={stopEdit}>Cancel</Button>
          <Button size="xs" onClick={save} loading={saving}>Save</Button>
        </Group>
      </Stack>
    );
  }

  const nights = nightsBetween(h?.checkInDate, h?.checkOutDate);
  const range = [dayLabel(h?.checkInDate, h?.checkInTime), dayLabel(h?.checkOutDate, h?.checkOutTime)].filter(Boolean).join(' → ');
  const destinationName = h?.destinationName ?? destinations.find(d => d.id === h?.destinationId)?.name ?? null;
  const refs = booking ? bookingLine(booking) : '';
  const price = booking ? priceLine(booking) : '';
  const payment = booking ? paymentLine(booking) : '';
  const cancel = cancelLabel(booking);
  const deadline = cancelDeadlineState(booking?.cancelBy ?? null);
  const amenities = amenitiesLabel(h?.amenities, h?.otherAmenities);
  const coupons = couponsLabel(booking?.coupons);

  return (
    <Stack gap="sm">
      {error && <Alert color="red">{error}</Alert>}
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Text fw={600}>{range}{nights ? ` · ${formatNights(nights)}` : ''}</Text>
        <Group gap={2} wrap="nowrap">
          <ActionIcon variant="subtle" size="lg" aria-label="Edit stay" onClick={startEdit}>
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

      <Stack gap={4}>
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
      </Stack>

      {(refs || booking?.loyaltyProgram) && (
        <Section title="Booking">
          {refs && <Text size="sm">{refs}</Text>}
          {booking?.loyaltyProgram && <Text size="sm">{`Loyalty: ${booking.loyaltyProgram}`}</Text>}
        </Section>
      )}
      {price && <Section title="Price"><Text size="sm">{price}</Text></Section>}
      {payment && <Section title="Payment schedule"><Text size="sm">{payment}</Text></Section>}
      {(cancel || booking?.cancellationPolicy) && (
        <Section title="Cancellation">
          {cancel && (
            <Text size="sm" c={DEADLINE_COLOR[deadline]} td={deadline === 'passed' ? 'line-through' : undefined}>{cancel}</Text>
          )}
          {booking?.cancellationPolicy && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{booking.cancellationPolicy}</Text>}
        </Section>
      )}
      {amenities && <Section title="Amenities"><Text size="sm">{amenities}</Text></Section>}
      {coupons && <Text size="sm">{coupons}</Text>}
      {element.notes && <Text size="sm" style={{ whiteSpace: 'pre-line' }}>{element.notes}</Text>}
    </Stack>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest --run client/src/__tests__/LodgingDetailsTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/LodgingDetailsTab.tsx client/src/__tests__/LodgingDetailsTab.test.tsx
git commit -m "feat: stay details show booking, price, payment schedule and amenities

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 16: Rooms tab (room form, room block, list)

Rooms are now plain rows under the stay: room type, beds, description, room amenities and travelers. There is no money, confirmation, cancellation or transaction data on a room.

**Files:**
- Modify: `client/src/components/RoomForm.tsx` (full rewrite)
- Modify: `client/src/components/RoomBlock.tsx` (full rewrite)
- Modify: `client/src/components/LodgingRoomsTab.tsx` (full rewrite)
- Test: `client/src/__tests__/RoomForm.test.tsx` (full rewrite)
- Test: `client/src/__tests__/LodgingRoomsTab.test.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the RoomForm tests**

Replace `client/src/__tests__/RoomForm.test.tsx` with:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { RoomForm } from '../components/RoomForm';
import { tripApi } from '../api/tripApi';
import { LodgingRoom, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({ tripApi: { createRoom: vi.fn(), updateRoom: vi.fn(), createParticipant: vi.fn() } }));

const participants: TripParticipant[] = [
  { id: 'p1', displayName: 'Jeremy' } as TripParticipant,
  { id: 'p2', displayName: 'Grandma' } as TripParticipant,
];
const room: LodgingRoom = {
  id: 'r1', elementId: 'h1', position: 0, roomType: 'suite', beds: [{ type: 'king', count: 1 }], description: 'Ocean view',
  amenities: ['microwave'], otherAmenities: null, travelerIds: ['p1'],
};

function renderForm(props: Partial<React.ComponentProps<typeof RoomForm>> = {}) {
  return renderWithMantine(
    <RoomForm tripId="t1" stayId="h1" takenTravelerIds={new Set(['p2'])} participants={participants}
      onParticipantsChanged={() => {}} onSaved={() => {}} onCancel={() => {}} onDirtyChange={() => {}} {...props} />,
  );
}

describe('RoomForm', () => {
  beforeEach(() => {
    vi.mocked(tripApi.createRoom).mockReset();
    vi.mocked(tripApi.updateRoom).mockReset();
    vi.mocked(tripApi.createParticipant).mockReset();
  });
  afterEach(() => cleanup());

  it('creates a room with beds, room amenities and a traveler', async () => {
    vi.mocked(tripApi.createRoom).mockResolvedValue({} as any);
    const onSaved = vi.fn();
    renderForm({ onSaved });
    await userEvent.click(screen.getByRole('button', { name: '+ Bed' }));
    await userEvent.type(screen.getByLabelText('Room description'), 'High floor');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Jetted tub' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Jeremy' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createRoom).toHaveBeenCalledWith('t1', 'h1', expect.objectContaining({
      description: 'High floor', amenities: ['jetted_tub'], travelerIds: ['p1'], beds: [expect.objectContaining({ count: 1 })],
    }));
  });

  it('only offers room amenities and no booking fields', () => {
    renderForm();
    expect(screen.getByRole('checkbox', { name: 'Microwave' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Pool' })).toBeNull();
    expect(screen.queryByLabelText('Hotel confirmation #')).toBeNull();
  });

  it('disables travelers already in another room', () => {
    renderForm();
    const grandma = screen.getByRole('checkbox', { name: 'Grandma (in another room)' }) as HTMLInputElement;
    expect(grandma.disabled).toBe(true);
  });

  it('updates an existing room', async () => {
    vi.mocked(tripApi.updateRoom).mockResolvedValue({} as any);
    const onSaved = vi.fn();
    renderForm({ room, onSaved });
    expect((screen.getByLabelText('Room description') as HTMLInputElement).value).toBe('Ocean view');
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateRoom).toHaveBeenCalledWith('t1', 'r1', expect.objectContaining({ roomType: 'suite', travelerIds: ['p1'] }));
  });

  it('creates a new traveler before saving and keeps them selected', async () => {
    vi.mocked(tripApi.createParticipant).mockResolvedValue({ id: 'p3', displayName: 'Ava' } as any);
    vi.mocked(tripApi.createRoom).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({} as any);
    const onParticipantsChanged = vi.fn();
    renderForm({ onParticipantsChanged });
    await userEvent.type(screen.getByLabelText('+ New traveler'), 'Ava');
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    expect(await screen.findByText('boom')).toBeTruthy();
    expect(onParticipantsChanged).toHaveBeenCalledWith([...participants, { id: 'p3', displayName: 'Ava' }]);
    await userEvent.click(screen.getByRole('button', { name: 'Save room' }));
    await waitFor(() => expect(tripApi.createRoom).toHaveBeenCalledTimes(2));
    expect(tripApi.createParticipant).toHaveBeenCalledTimes(1);
    expect(vi.mocked(tripApi.createRoom).mock.calls[1][2]).toMatchObject({ travelerIds: ['p3'] });
  });

  it('reports dirty after typing', async () => {
    const onDirtyChange = vi.fn();
    renderForm({ onDirtyChange });
    expect(onDirtyChange).not.toHaveBeenCalledWith(true);
    await userEvent.type(screen.getByLabelText('Room description'), 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
```

- [ ] **Step 2: Rewrite the LodgingRoomsTab tests**

Replace `client/src/__tests__/LodgingRoomsTab.test.tsx` with:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingRoomsTab } from '../components/LodgingRoomsTab';
import { tripApi } from '../api/tripApi';
import { LodgingRoom, TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: { createRoom: vi.fn(), updateRoom: vi.fn(), deleteRoom: vi.fn(), createParticipant: vi.fn() },
}));

const participants = [{ id: 'p1', displayName: 'Jeremy' }, { id: 'p2', displayName: 'Grandma' }] as TripParticipant[];
const room: LodgingRoom = {
  id: 'r1', elementId: 'h1', position: 0, roomType: 'suite', beds: [{ type: 'king', count: 1 }, { type: 'sofa_bed', count: 1 }],
  description: 'Ocean view', amenities: ['microwave', 'jetted_tub'], otherAmenities: 'Espresso machine', travelerIds: ['p1'],
};

function stayWith(rooms: LodgingRoom[]): TripElement {
  return {
    id: 'h1', tripId: 't1', elementType: 'hotel', name: 'Hyatt', sortPosition: 0, createdAt: '', updatedAt: '', rooms,
    hotelDetails: { address: null, phone: null, website: null, checkInDate: '2027-03-01', checkInTime: null, checkOutDate: '2027-03-05', checkOutTime: null, destinationId: null },
  };
}

function renderTab(rooms: LodgingRoom[], props: Partial<React.ComponentProps<typeof LodgingRoomsTab>> = {}) {
  return renderWithMantine(
    <LodgingRoomsTab tripId="t1" stay={stayWith(rooms)} participants={participants} onParticipantsChanged={() => {}}
      onRoomsChanged={() => {}} onEditingChange={() => {}} onDirtyChange={() => {}} {...props} />,
  );
}

describe('LodgingRoomsTab', () => {
  beforeEach(() => vi.mocked(tripApi.deleteRoom).mockReset());
  afterEach(() => cleanup());

  it('shows an empty state', () => {
    renderTab([]);
    expect(screen.getByText('No rooms yet for this stay')).toBeTruthy();
  });

  it('lists rooms with travelers, description and amenities', () => {
    renderTab([room]);
    expect(screen.getByText('Suite · 1 × King + 1 × Sofa bed')).toBeTruthy();
    expect(screen.getByText('Jeremy')).toBeTruthy();
    expect(screen.getByText('Ocean view')).toBeTruthy();
    expect(screen.getByText('Microwave · Jetted tub · Espresso machine')).toBeTruthy();
    expect(screen.getByText('Not in a room: Grandma')).toBeTruthy();
    expect(screen.queryByText(/transaction/i)).toBeNull();
  });

  it('opens the form initially when asked', () => {
    renderTab([], { initialFormOpen: true });
    expect(screen.getByRole('button', { name: 'Save room' })).toBeTruthy();
  });

  it('marks travelers in other rooms as taken in the add form', async () => {
    renderTab([room]);
    await userEvent.click(screen.getByRole('button', { name: '+ Room' }));
    expect((screen.getByRole('checkbox', { name: 'Jeremy (in another room)' }) as HTMLInputElement).disabled).toBe(true);
  });

  it('does not mark a room\'s own travelers as taken when editing it', async () => {
    renderTab([room]);
    await userEvent.click(screen.getByRole('button', { name: 'Edit room' }));
    expect((screen.getByRole('checkbox', { name: 'Jeremy' }) as HTMLInputElement).checked).toBe(true);
  });

  it('confirms before deleting a room', async () => {
    vi.mocked(tripApi.deleteRoom).mockResolvedValue(undefined as any);
    const onRoomsChanged = vi.fn();
    renderTab([room], { onRoomsChanged });
    await userEvent.click(screen.getByRole('button', { name: 'Delete room' }));
    expect(screen.getByText('Delete this room?')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onRoomsChanged).toHaveBeenCalled());
    expect(tripApi.deleteRoom).toHaveBeenCalledWith('t1', 'r1');
  });

  it('reports editing and dirty state', async () => {
    const onEditingChange = vi.fn();
    const onDirtyChange = vi.fn();
    renderTab([room], { onEditingChange, onDirtyChange });
    await userEvent.click(screen.getByRole('button', { name: '+ Room' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    await userEvent.type(screen.getByLabelText('Room description'), 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
  });
});
```

The expected strings come from the existing `roomTitle`/`bedsLabel` helpers (`1 × King + 1 × Sofa bed`) and the Task 9 `amenitiesLabel`.

- [ ] **Step 3: Run to see failures**

Run: `npx vitest --run client/src/__tests__/RoomForm.test.tsx client/src/__tests__/LodgingRoomsTab.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Rewrite `RoomForm`**

```tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Chip, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { LodgingRoom, RoomAmenity, RoomType, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BedsEditor } from './BedsEditor';
import { ROOM_AMENITY_OPTIONS, ROOM_TYPE_OPTIONS } from '../utils/lodging';
import { RoomDraft, emptyRoomDraft, isRoomDraftDirty, roomDraftFromRoom, roomPayload, validateRoomDraft } from '../utils/roomDraft';

interface RoomFormProps {
  tripId: string;
  stayId: string;
  room?: LodgingRoom;
  takenTravelerIds: Set<string>;
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function Heading({ children }: { children: string }) {
  return <Text size="sm" fw={600} mt="sm" mb={4}>{children}</Text>;
}

export function RoomForm({
  tripId, stayId, room, takenTravelerIds, participants, onParticipantsChanged, onSaved, onCancel, onDirtyChange,
}: RoomFormProps) {
  const uid = useId();
  const [initial] = useState<RoomDraft>(() => (room ? roomDraftFromRoom(room) : emptyRoomDraft()));
  const [draft, setDraft] = useState<RoomDraft>(initial);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const set = <K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) => setDraft(prev => ({ ...prev, [key]: value }));

  const dirty = isRoomDraftDirty(initial, draft, newTravelerName);
  useEffect(() => {
    onDirtyChangeRef.current(dirty);
  }, [dirty]);
  useEffect(() => () => onDirtyChangeRef.current(false), []);

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
      const payload = roomPayload({ ...draft, travelerIds });
      if (room) await tripApi.updateRoom(tripId, room.id, payload);
      else await tripApi.createRoom(tripId, stayId, payload);
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
      <Stack gap="xs">
        <Select id={`${uid}-type`} label="Room type" placeholder="Not set" clearable data={ROOM_TYPE_OPTIONS}
          value={draft.roomType} onChange={value => set('roomType', value as RoomType | null)} />
        <div>
          <Text size="sm" fw={500}>Beds</Text>
          <BedsEditor beds={draft.beds} onChange={beds => set('beds', beds)} />
        </div>
        <TextInput id={`${uid}-desc`} label="Room description" placeholder="e.g. Ocean view, high floor" value={draft.description}
          onChange={e => set('description', e.currentTarget.value)} />
      </Stack>

      <Heading>Room amenities</Heading>
      <Chip.Group multiple value={draft.amenities} onChange={value => set('amenities', value as RoomAmenity[])}>
        <Group gap={6}>
          {ROOM_AMENITY_OPTIONS.map(o => <Chip key={o.value} value={o.value} size="xs">{o.label}</Chip>)}
        </Group>
      </Chip.Group>
      <TextInput id={`${uid}-other`} mt="xs" label="Other amenities" value={draft.otherAmenities}
        onChange={e => set('otherAmenities', e.currentTarget.value)} />

      <Heading>Travelers</Heading>
      <Group gap="sm">
        {participants.map(p => {
          const taken = takenTravelerIds.has(p.id);
          const checked = draft.travelerIds.includes(p.id);
          return (
            <Checkbox
              key={p.id}
              label={taken ? `${p.displayName} (in another room)` : p.displayName}
              checked={checked}
              disabled={taken && !checked}
              onChange={() => toggleTraveler(p.id)}
            />
          );
        })}
      </Group>
      <TextInput id={`${uid}-new-traveler`} mt="xs" label="+ New traveler" placeholder="Optional" value={newTravelerName}
        onChange={e => setNewTravelerName(e.currentTarget.value)} />

      <Group mt="sm" justify="flex-end">
        <Button variant="default" size="xs" onClick={onCancel}>Cancel</Button>
        <Button size="xs" onClick={save} loading={saving}>Save room</Button>
      </Group>
    </Paper>
  );
}
```

- [ ] **Step 5: Rewrite `RoomBlock`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Group, Paper, Text } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { LodgingRoom, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { RoomForm } from './RoomForm';
import { amenitiesLabel, roomTitle } from '../utils/lodging';

interface RoomBlockProps {
  tripId: string;
  room: LodgingRoom;
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  takenTravelerIds: Set<string>;
  onChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  actionsDisabled?: boolean;
}

export function RoomBlock({
  tripId, room, participants, onParticipantsChanged, takenTravelerIds, onChanged, onEditingChange, onDirtyChange, actionsDisabled,
}: RoomBlockProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      await tripApi.deleteRoom(tripId, room.id);
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
        stayId={room.elementId}
        room={room}
        takenTravelerIds={takenTravelerIds}
        participants={participants}
        onParticipantsChanged={onParticipantsChanged}
        onSaved={async () => {
          setEditing(false);
          await onChanged();
        }}
        onCancel={() => setEditing(false)}
        onDirtyChange={onDirtyChange}
      />
    );
  }

  const travelerNames = room.travelerIds.map(id => participants.find(p => p.id === id)?.displayName ?? 'Unknown traveler');
  const amenities = amenitiesLabel(room.amenities, room.otherAmenities);

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
          <Text size="sm">Delete this room?</Text>
          <Button size="compact-xs" color="red" onClick={remove} loading={deleting}>Confirm</Button>
          <Button size="compact-xs" variant="default" onClick={() => setConfirmingDelete(false)}>Cancel</Button>
        </Group>
      )}

      {room.description && <Text size="sm">{room.description}</Text>}
      {amenities && <Text size="sm">{amenities}</Text>}
    </Paper>
  );
}
```

- [ ] **Step 6: Rewrite `LodgingRoomsTab`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { Button, Group, Text } from '@mantine/core';
import { TripElement, TripParticipant } from '../types/trip';
import { RoomBlock } from './RoomBlock';
import { RoomForm } from './RoomForm';

interface LodgingRoomsTabProps {
  tripId: string;
  stay: TripElement;
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
  onRoomsChanged: () => Promise<void> | void;
  onEditingChange: (editing: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  initialFormOpen?: boolean;
}

function toggled(prev: Set<string>, key: string, on: boolean): Set<string> {
  if (prev.has(key) === on) return prev;
  const next = new Set(prev);
  if (on) next.add(key);
  else next.delete(key);
  return next;
}

export function LodgingRoomsTab({
  tripId, stay, participants, onParticipantsChanged, onRoomsChanged, onEditingChange, onDirtyChange, initialFormOpen = false,
}: LodgingRoomsTabProps) {
  const [adding, setAdding] = useState(initialFormOpen);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  const anyEditing = adding || editingIds.size > 0;
  const anyDirty = dirtyKeys.size > 0;
  useEffect(() => {
    onEditingChangeRef.current(anyEditing);
  }, [anyEditing]);
  useEffect(() => {
    onDirtyChangeRef.current(anyDirty);
  }, [anyDirty]);
  useEffect(() => () => {
    onEditingChangeRef.current(false);
    onDirtyChangeRef.current(false);
  }, []);

  const rooms = stay.rooms ?? [];
  const takenBy = (exceptRoomId: string | null) =>
    new Set(rooms.filter(r => r.id !== exceptRoomId).flatMap(r => r.travelerIds));
  const inRoom = takenBy(null);
  const notInRoom = inRoom.size > 0 ? participants.filter(p => !inRoom.has(p.id)) : [];

  const setDirty = (key: string, dirty: boolean) => setDirtyKeys(prev => toggled(prev, key, dirty));

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
          takenTravelerIds={inRoom}
          participants={participants}
          onParticipantsChanged={onParticipantsChanged}
          onSaved={async () => {
            setAdding(false);
            await onRoomsChanged();
          }}
          onCancel={() => setAdding(false)}
          onDirtyChange={dirty => setDirty('new', dirty)}
        />
      )}

      {rooms.map(room => (
        <RoomBlock
          key={room.id}
          tripId={tripId}
          room={room}
          participants={participants}
          onParticipantsChanged={onParticipantsChanged}
          takenTravelerIds={takenBy(room.id)}
          onChanged={onRoomsChanged}
          onEditingChange={editing => setEditingIds(prev => toggled(prev, room.id, editing))}
          onDirtyChange={dirty => setDirty(room.id, dirty)}
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

Note: `RoomForm` reports `false` on unmount, so cancelling or saving clears its key in `dirtyKeys`.

- [ ] **Step 7: Run tests**

Run: `npx vitest --run client/src/__tests__/RoomForm.test.tsx client/src/__tests__/LodgingRoomsTab.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/RoomForm.tsx client/src/components/RoomBlock.tsx client/src/components/LodgingRoomsTab.tsx \
  client/src/__tests__/RoomForm.test.tsx client/src/__tests__/LodgingRoomsTab.test.tsx
git commit -m "feat: rooms are simple rows with room amenities and travelers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 17: Payments tab

**Files:**
- Create: `client/src/components/LodgingPaymentsTab.tsx`
- Create: `client/src/__tests__/LodgingPaymentsTab.test.tsx`
- Modify: `vitest.config.ts` (add the new test to the include list next to the other lodging entries)

- [ ] **Step 1: Write the failing test**

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { LodgingPaymentsTab } from '../components/LodgingPaymentsTab';
import { Booking } from '../types/trip';

vi.mock('../components/BookingTransactionList', () => ({
  BookingTransactionList: (props: { bookingId: string }) => <div>{`transactions for ${props.bookingId}`}</div>,
}));

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b1', tripId: 't1', confirmationNumber: 'H-1', advertisedPriceCash: 1612, advertisedPricePoints: null, loyaltyProgram: null,
    notes: null, createdAt: '', updatedAt: '', elementIds: ['h1'], travelerIds: [], currentConfirmationNumber: 'H-1',
    actualTotalCash: 1430, actualTotalPoints: 0, ...overrides,
  };
}

function renderTab(b: Booking | null) {
  return renderWithMantine(
    <LodgingPaymentsTab tripId="t1" booking={b} refreshKey={0} onChanged={() => {}} onCountChange={() => {}} onEditingChange={() => {}} />,
  );
}

describe('LodgingPaymentsTab', () => {
  afterEach(() => cleanup());

  it('summarises dues, paid and remaining', () => {
    renderTab(booking({ dueAtBookingCash: 1430, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee' }));
    expect(screen.getByText('Due $1,612.40 · Paid $1,430.00')).toBeTruthy();
    expect(screen.getByText('Remaining $182.40 at check-in')).toBeTruthy();
    expect(screen.getByText('Resort fee')).toBeTruthy();
    expect(screen.getByText('transactions for b1')).toBeTruthy();
  });

  it('hints when no amounts are due', () => {
    renderTab(booking());
    expect(screen.getByText("Add amounts due on the Details tab to track what's remaining.")).toBeTruthy();
    expect(screen.getByText('transactions for b1')).toBeTruthy();
  });

  it('asks to save details when there is no booking', () => {
    renderTab(null);
    expect(screen.getByText('Save the stay details to start recording payments.')).toBeTruthy();
    expect(screen.queryByText(/transactions for/)).toBeNull();
  });
});
```

Add `'client/src/__tests__/LodgingPaymentsTab.test.tsx',` to the include array in `vitest.config.ts` (next to `LodgingRoomsTab.test.tsx`).

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest --run client/src/__tests__/LodgingPaymentsTab.test.tsx`
Expected: FAIL — cannot resolve `../components/LodgingPaymentsTab`.

- [ ] **Step 3: Implement**

`client/src/components/LodgingPaymentsTab.tsx`:

```tsx
import { Stack, Text } from '@mantine/core';
import { Booking } from '../types/trip';
import { BookingTransactionList } from './BookingTransactionList';
import { paymentSummary } from '../utils/lodging';
import { formatPrice } from '../utils/flightRows';

interface LodgingPaymentsTabProps {
  tripId: string;
  booking: Booking | null;
  refreshKey: number;
  onChanged: () => void;
  onCountChange: (count: number) => void;
  onEditingChange: (editing: boolean) => void;
}

export function LodgingPaymentsTab({ tripId, booking, refreshKey, onChanged, onCountChange, onEditingChange }: LodgingPaymentsTabProps) {
  if (!booking) {
    return <Text size="sm" c="dimmed">Save the stay details to start recording payments.</Text>;
  }

  const summary = paymentSummary(booking);

  return (
    <Stack gap="xs">
      {summary ? (
        <div>
          <Text size="sm" c="dimmed">
            {`Due ${formatPrice(summary.dueCash, summary.duePoints) || '$0.00'} · Paid ${formatPrice(summary.paidCash, summary.paidPoints) || '$0.00'}`}
          </Text>
          <Text fw={700}>{summary.label}</Text>
          {booking.dueLaterNotes && <Text size="sm" c="dimmed">{booking.dueLaterNotes}</Text>}
        </div>
      ) : (
        <Text size="sm" c="dimmed">Add amounts due on the Details tab to track what's remaining.</Text>
      )}
      <BookingTransactionList
        tripId={tripId}
        bookingId={booking.id}
        originalConfirmationNumber={booking.confirmationNumber}
        refreshKey={refreshKey}
        onChanged={onChanged}
        onCountChange={onCountChange}
        onEditingChange={onEditingChange}
      />
    </Stack>
  );
}
```

- [ ] **Step 4: Run test**

Run: `npx vitest --run client/src/__tests__/LodgingPaymentsTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/LodgingPaymentsTab.tsx client/src/__tests__/LodgingPaymentsTab.test.tsx vitest.config.ts
git commit -m "feat: lodging payments tab with remaining-to-pay summary

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 18: Remaining amount on the trip-page row

**Files:**
- Modify: `client/src/components/LodgingSection.tsx`
- Modify: `client/src/components/LodgingSection.module.css`
- Test: `client/src/__tests__/LodgingSection.test.tsx`

- [ ] **Step 1: Update the test fixture and add a test**

In `client/src/__tests__/LodgingSection.test.tsx`, add `remaining` to both fixture rows: `remaining: 'Remaining $182.40 at check-in'` on `h1` and `remaining: null` on `h2`. Append:

```tsx
  it('shows the remaining amount on the sub-line', () => {
    renderWithMantine(<LodgingSection rows={rows} totalLabel="" onOpen={() => {}} />);
    const row = screen.getByRole('button', { name: 'Open Hyatt Ziva' });
    expect(within(row).getByText('Remaining $182.40 at check-in')).toBeTruthy();
    const inn = screen.getByRole('button', { name: 'Open Airport Inn' });
    expect(within(inn).queryByText(/Remaining/)).toBeNull();
  });

  it('shows the sub-line when only a remaining amount is present', () => {
    const only: LodgingRow[] = [{ ...rows[1], deadline: null, remaining: 'Remaining $50.00 at check-in' }];
    renderWithMantine(<LodgingSection rows={only} totalLabel="" onOpen={() => {}} />);
    expect(screen.getByText('Remaining $50.00 at check-in')).toBeTruthy();
  });
```

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run client/src/__tests__/LodgingSection.test.tsx`
Expected: the 2 new tests FAIL.

- [ ] **Step 3: Implement**

In `LodgingSection.tsx` replace the sub-line block with:

```tsx
          {(row.destination || row.deadline || row.remaining) && (
            <span className={classes.sub}>
              {row.destination && (
                <Badge size="sm" variant="light" tt="none" color={row.destination.color ?? 'gray'}>{row.destination.name}</Badge>
              )}
              {row.deadline && (
                <span className={classes.deadline} data-state={row.deadline.state}>{row.deadline.label}</span>
              )}
              {row.remaining && <span className={classes.remaining}>{row.remaining}</span>}
            </span>
          )}
```

In `LodgingSection.module.css`, after the `.deadline[data-state='passed']` rule, add:

```css
.remaining {
  font-weight: 700;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest --run client/src/__tests__/LodgingSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/LodgingSection.tsx client/src/components/LodgingSection.module.css client/src/__tests__/LodgingSection.test.tsx
git commit -m "feat: show the remaining amount on lodging rows

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 19: Wire the stay dialog in TripDetailPage

**Files:**
- Modify: `client/src/pages/TripDetailPage.tsx`
- Test: `client/src/__tests__/TripDetailPage.test.tsx`

- [ ] **Step 1: Update the tests**

In `client/src/__tests__/TripDetailPage.test.tsx`:

1. Add `listBookingTransactions: vi.fn(),` to the `tripApi` mock object (harmless if unused).
2. Keep the `LodgingRoomsTab` mock as is (it reads `stay` and `initialFormOpen`, which still exist) and add a `LodgingPaymentsTab` mock below it:

```tsx
vi.mock('../components/LodgingPaymentsTab', () => ({
  LodgingPaymentsTab: ({ booking }: { booking: { id: string } | null }) => <div>{`payments tab ${booking?.id ?? 'none'}`}</div>,
}));
```

3. Rename `it('opens a stay with Details and Rooms tabs'` to `it('opens a stay with Details, Rooms and Payments tabs'`, give the hotel `bookingId: 'b-1'`, make `api.listBookings` resolve to a matching booking, and add assertions:

```tsx
    const hotel = { id: 'h-1', tripId: 'trip-1', elementType: 'hotel', name: 'Resort', sortPosition: 2, createdAt: '', updatedAt: '', bookingId: 'b-1',
      rooms: [{ id: 'r-1', elementId: 'h-1', position: 0, roomType: null, beds: [], description: null, amenities: [], otherAmenities: null, travelerIds: [] }],
      hotelDetails: { address: '1 Beach Rd', phone: null, website: null, checkInDate: '2026-09-01', checkInTime: null, checkOutDate: '2026-09-03', checkOutTime: null, destinationId: null } };
    api.listElements.mockResolvedValue([hotel]);
    api.listBookings.mockResolvedValue([{ id: 'b-1', tripId: 'trip-1', elementIds: ['h-1'], travelerIds: [], confirmationNumber: 'H-1',
      currentConfirmationNumber: 'H-1', advertisedPriceCash: null, advertisedPricePoints: null, loyaltyProgram: null, notes: null,
      createdAt: '', updatedAt: '', actualTotalCash: 0, actualTotalPoints: 0, bookingSite: 'Expedia', siteItineraryNumber: '7231004' }]);
```

and after the existing tab assertions:

```tsx
    expect(within(dialog).getByRole('tab', { name: /Payments/ })).toBeTruthy();
    expect(within(dialog).getByRole('tab', { name: /Rooms/ }).textContent).toContain('1');
    expect(within(dialog).getByText('Expedia 7231004 · Hotel H-1')).toBeTruthy();
    expect(within(dialog).getByText('payments tab b-1')).toBeTruthy();
```

(The hidden Payments panel is in the DOM because the hotel dialog uses `keepMounted`; `getByText` does not filter hidden elements.)

4. Append a discard-guard test:

```tsx
  it('asks before closing a stay with unsaved edits', async () => {
    const user = userEvent.setup();
    const hotel = { id: 'h-1', tripId: 'trip-1', elementType: 'hotel', name: 'Resort', sortPosition: 2, createdAt: '', updatedAt: '',
      hotelDetails: { address: null, phone: null, website: null, checkInDate: '2026-09-01', checkInTime: null, checkOutDate: '2026-09-03', checkOutTime: null, destinationId: null } };
    api.listElements.mockResolvedValue([hotel]);
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Open Resort' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resort' });
    await user.click(within(dialog).getByRole('button', { name: 'Edit stay' }));
    await user.type(within(dialog).getByLabelText('Hotel name'), ' Spa');
    await user.click(dialog.querySelector('.mantine-Modal-close') as HTMLElement);
    expect(await screen.findByText('Discard unsaved changes?')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('dialog', { name: 'Resort' })).toBeTruthy();
    expect((within(dialog).getByLabelText('Hotel name') as HTMLInputElement).value).toBe('Resort Spa');
    await user.click(dialog.querySelector('.mantine-Modal-close') as HTMLElement);
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Resort' })).toBeNull());
  });
```

If `dialog.querySelector('.mantine-Modal-close')` returns null (the dialog role may sit on the content rather than the root), use `document.querySelector('.mantine-Modal-close')` — the same fallback Task 13 allows.

- [ ] **Step 2: Run to see failures**

Run: `npx vitest --run client/src/__tests__/TripDetailPage.test.tsx`
Expected: the updated stay test and the discard test FAIL; flight tests PASS.

- [ ] **Step 3: Implement**

In `client/src/pages/TripDetailPage.tsx`:

1. Imports: change `import { buildLodgingRows, lodgingTotals } from '../utils/lodgingRows';` to `import { buildLodgingRows, lodgingTotals, stayBooking } from '../utils/lodgingRows';` and add `import { LodgingPaymentsTab } from '../components/LodgingPaymentsTab';`.

2. Next to the other dialog state (before any early return), add:

```tsx
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [roomsDirty, setRoomsDirty] = useState(false);
  const [editingPayments, setEditingPayments] = useState(false);
  const [paymentCount, setPaymentCount] = useState(0);
```

3. Replace `openElement` with:

```tsx
  const openElement = (id: string | null, roomForm = false) => {
    setOpenRoomForm(roomForm);
    setDetailsDirty(false);
    setRoomsDirty(false);
    setEditingPayments(false);
    setPaymentCount(0);
    setSelectedId(id);
  };
```

4. Replace `hotelTabs` with:

```tsx
  const hotelTabs = (el: TripElement): ElementDialogTab[] => {
    const booking = stayBooking(el, bookings);
    return [
      {
        value: 'details',
        label: 'Details',
        content: (
          <LodgingDetailsTab
            key={el.id}
            tripId={tripId}
            element={el}
            booking={booking}
            destinations={destinations}
            onChanged={reload}
            onDeleted={async () => {
              openElement(null);
              await reload();
            }}
            onEditingChange={setEditingDetails}
            onDirtyChange={setDetailsDirty}
          />
        ),
      },
      {
        value: 'rooms',
        label: 'Rooms',
        count: el.rooms?.length ?? 0,
        content: (
          <LodgingRoomsTab
            key={el.id}
            tripId={tripId}
            stay={el}
            participants={participants}
            onParticipantsChanged={handleParticipantsFromBooking}
            onRoomsChanged={reload}
            onEditingChange={setEditingBookings}
            onDirtyChange={setRoomsDirty}
            initialFormOpen={openRoomForm}
          />
        ),
      },
      {
        value: 'payments',
        label: 'Payments',
        count: paymentCount,
        content: (
          <LodgingPaymentsTab
            key={el.id}
            tripId={tripId}
            booking={booking}
            refreshKey={bookingsVersion}
            onChanged={reloadBookings}
            onCountChange={setPaymentCount}
            onEditingChange={setEditingPayments}
          />
        ),
      },
    ];
  };
```

(`reload` refetches bookings too, so a details save that changes the booking updates the Payments summary and the row.)

5. Replace the `ElementDialog` element with:

```tsx
      {selected && (
        <ElementDialog
          key={selected.id}
          opened
          onClose={() => openElement(null)}
          title={selected.name}
          swipeEnabled={!editingDetails && !editingBookings && !editingPayments}
          initialTab={selected.elementType === 'hotel' && openRoomForm ? 'rooms' : undefined}
          keepMounted={selected.elementType === 'hotel'}
          dirty={selected.elementType === 'hotel' && (detailsDirty || roomsDirty || editingPayments)}
          tabs={selected.elementType === 'hotel' ? hotelTabs(selected) : flightTabs(selected)}
        />
      )}
```

`selectedBookingCount` stays — the flight Bookings tab still uses it.

Deviation from spec §3.5: `BookingTransactionList` does not expose a draft, so an open payment form (`editingPayments`) counts as dirty.

- [ ] **Step 4: Run tests**

Run: `npx vitest --run client/src/__tests__/TripDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TripDetailPage.tsx client/src/__tests__/TripDetailPage.test.tsx
git commit -m "feat: stay dialog with Payments tab and unsaved-changes guard

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 20: Documentation

**Files:**
- Modify: `docs/ServerAPIUsage.md`
- Modify: `client/src/APIUsage.md`
- Modify: `client/src/components/ComponentUsage.md`

- [ ] **Step 1: `docs/ServerAPIUsage.md`**

Replace the `POST /trips/:tripId/elements, PUT /trips/:tripId/elements/:elementId` entry's Purpose line with:

```markdown
  - Purpose: Create/update a trip element. For `elementType: 'hotel'`, `typeSpecificData` carries `address`, `phone`, `website`, `checkInDate`, `checkInTime`, `checkOutDate`, `checkOutTime`, `destinationId` (must belong to the trip, else 404), `amenities` (property amenities: `breakfast`, `pool`, `hot_tub`, `parking`, `wifi`, `laundry`, `airport_shuttle`, `gym`) and `otherAmenities`. Check-in and check-out dates are required on create; check-out must be after check-in. A hotel body may include `booking` (`confirmationNumber`, `loyaltyProgram`, `bookingSite`, `siteItineraryNumber`, `advertisedRateCash/Points`, `advertisedPriceCash/Points`, `advertisedIncludesTaxes`, `dueAtBookingCash/Points`, `dueLaterCash`, `dueLaterNotes`, `refundability`, `cancelBy`, `cancellationPolicy`, `coupons`); it creates or updates the stay's single booking in the same transaction. Elements return the stay as `hotelDetails` (plus `destinationName`), `rooms` and `bookingId`.
```

Replace the bookings entry heading and Purpose with:

```markdown
- POST /trips/:tripId/bookings, PATCH /trips/:tripId/bookings/:id
  - Purpose: Bookings for flights or a hotel stay. A booking links either flights or exactly one hotel (400 otherwise). A stay has at most one booking (400 "This stay already has a booking") and stay bookings carry no travelers (travelers belong to rooms). All bookings accept the money fields listed above; `coupons` is a full replacement. Flight bookings require travelers; 409 when a traveler is already in another booking for the same element.
```

After the bookings entry add:

```markdown
- POST /trips/:tripId/elements/:elementId/rooms, PUT /trips/:tripId/rooms/:roomId, DELETE /trips/:tripId/rooms/:roomId
  - Purpose: Rooms of a hotel stay: `roomType`, `beds`, `description`, `amenities` (room amenities: `fridge`, `microwave`, `kitchenette`, `jetted_tub`, `balcony`), `otherAmenities`, `travelerIds`. 400 when the element is not a hotel or a field is invalid; 409 when a traveler is already in another room of the stay. Create returns 201, delete 204.
  - Client helper: `tripApi.createRoom`, `tripApi.updateRoom`, `tripApi.deleteRoom`
```

- [ ] **Step 2: `client/src/APIUsage.md`**

1. In the `createElement` list change the `AddLodgingDialog.tsx` line to:
   `  - client/src/components/AddLodgingDialog.tsx (hotel stay with \`typeSpecificData\` and the stay's \`booking\`)`
2. Change `- \`updateElement\` (notes only, \`null\` clears), \`deleteElement\`:` to `- \`updateElement\` (flight notes, \`null\` clears; hotel stay fields plus \`booking\`), \`deleteElement\`:`.
3. In the `listBookingTransactions, addBookingTransaction, deleteBookingTransaction` entry change `RoomBlock.tsx` to `LodgingPaymentsTab.tsx`.
4. Change the `listBookings` line `  - client/src/pages/TripDetailPage.tsx (trip-wide list passed to \`BookingCard\`)` to `  - client/src/pages/TripDetailPage.tsx (trip-wide list passed to \`BookingCard\`; the stay's booking via \`stayBooking\` for the lodging Details and Payments tabs)`.
5. Add a new entry after the bookings entries:

```markdown
- `createRoom`, `updateRoom`:
  - client/src/components/RoomForm.tsx
- `deleteRoom`:
  - client/src/components/RoomBlock.tsx
```

- [ ] **Step 3: `client/src/components/ComponentUsage.md`**

1. `ElementDialog` description: replace `Details/Rooms for stays` with `Details/Rooms/Payments for stays` in both lines, and append to the description: ` \`keepMounted\` keeps inactive tabs mounted (stays only) and \`dirty\` shows \`DiscardChangesModal\` before closing.`
2. `LodgingStayForm` description → `Stay fields shared by add and edit: hotel, check-in/out hours (\`HourPicker\`), booking references, advertised nightly and total price, payment schedule, cancellation, property amenities, coupons and notes.`
3. `AddLodgingDialog` description → `Creates a stay with its booking (asks before discarding typed values), then the page opens it on the Rooms tab.`
4. `LodgingDetailsTab` description → `Stay read view (maps, phone, website, booking references, price, payment schedule, cancellation, amenities, coupons) with edit and delete; reports dirty state.`
5. `RoomBlock` description → `Room summary (type, beds, travelers, description, room amenities) with edit and delete.`
6. `RoomForm` description → `Room form: type, beds, description, room amenities and travelers.`
7. Add, after `RoomForm`:

```markdown
### LodgingPaymentsTab
**Used in:**
  - `pages/TripDetailPage.tsx` (passed into `ElementDialog`)

Due / paid / remaining summary for the stay's booking plus `BookingTransactionList`.

### HourPicker
**Used in:**
  - `LodgingStayForm` (check-in, check-out and cancel-by times)

Hour-only time picker: quick chips plus an "Other" hour select.

### DiscardChangesModal
**Used in:**
  - `ElementDialog`
  - `AddLodgingDialog`

"Discard unsaved changes?" confirmation with Discard / Keep editing.
```

8. If `BookingTransactionList`'s entry lists `RoomBlock`, replace it with `LodgingPaymentsTab`.

- [ ] **Step 4: Commit**

```bash
git add docs/ServerAPIUsage.md client/src/APIUsage.md client/src/components/ComponentUsage.md
git commit -m "docs: lodging booking rework usage maps

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 21: Full verification and browser smoke test

**Files:** none (temporary script lives outside the repo).

- [ ] **Step 1: Type-checks**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no output (clean).

Run: `npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"`
Expected: `93` or fewer (pre-existing baseline). Any error in a file this plan touched must be fixed.

- [ ] **Step 2: Full test suite**

Run: `npx vitest --run`
Expected: all files pass.

- [ ] **Step 3: Leftover scan**

Run: `grep -rn "roomMoneyLine\|AmenityKey\|perNight\|roomDraftFromBooking\|lodging_room_details\|[^_]AMENITY_OPTIONS" client/src server --include=*.ts --include=*.tsx --include=*.cjs`
Expected: only hits inside `server/migrations/` (the migration drops the old table). Fix anything else.

Also check `git status` — `server/migrations/migrations.json` (or any data file) must not be modified; `git checkout -- <file>` if it is.

- [ ] **Step 4: Browser smoke test (never touch the real DB)**

```bash
cp /config/localData/travel-list/data/travel-list.sqlite /tmp/lodging-smoke.sqlite
npm --prefix client run build
PORT=3101 DB_FILE=/tmp/lodging-smoke.sqlite npx tsx server/index.ts > /tmp/lodging-smoke.log 2>&1 &
```

Run migrations against the copy if the server does not do so on start (check `/tmp/lodging-smoke.log`). Copy `/config/workspace/shots/lodging-smoke.cjs` to `/tmp/lodging-smoke2.cjs` and adapt it (same login: `uitester` / `UiTest123!`, trip "Cabo", port 3101) to run at 1440×900 and 390×844 and check:

1. Add lodging: fill hotel name, check-in/out dates, click the `3 PM` and `11 AM` chips, booking site Expedia, itinerary, hotel confirmation, advertised nightly 403, total 1612, due at booking 1430, due at check-in 182.40 with note "Resort fee", tick Pool. Save → the stay opens on the Rooms tab with the form open.
2. Rooms tab: pick a room type, add a bed, tick Microwave, type a room description, switch to the Details tab and back → the typed description is still there. Save the room.
3. Payments tab: shows `Due $1,612.40 · Paid $0.00` and `Remaining $1,612.40 (incl. $1,430.00 due at booking)`. Record a $1,430 payment → `Remaining $182.40 at check-in`.
4. Details tab: Edit stay, change the hotel name, press Escape or the close button → "Discard unsaved changes?" appears; Keep editing keeps the value; Discard closes.
5. Trip page row shows `Remaining $182.40 at check-in` and `7231004 / <confirmation>`.
6. No horizontal page or dialog overflow at either viewport (reuse `dialogOverflow`). Save screenshots to `/config/workspace/shots/rework-<viewport>-<step>.png`.

Then stop the server (`kill <pid>`) and delete `/tmp/lodging-smoke.sqlite`.

- [ ] **Step 5: Final commit (if anything changed)**

```bash
git status --short
git add -A client server docs vitest.config.ts
git commit -m "chore: lodging rework verification fixes

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```
