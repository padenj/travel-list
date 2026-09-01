# Flight Bookings & Travelers Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, single-price/single-confirmation flight element model with trip participant management, a generic `bookings` concept (PNR-level, per-person advertised pricing, many-to-many with elements and travelers), an append-only `booking_transactions` ledger (actual amounts paid, price-drop rebooking history), and per-traveler per-leg seat assignments — matching `docs/superpowers/specs/2026-08-31-flight-bookings-redesign-design.md`.

**Architecture:** Five new SQLite tables (`bookings`, `booking_links`, `booking_travelers`, `booking_transactions`, `flight_traveler_seats`) added to both `server/db.ts` (`SCHEMAS.trips`, for tests/fresh installs) and a new migration file (for existing dev/prod DBs). Four new repositories follow the existing `TripElementConfirmationRepository` pattern (constructor `getDb()`, snake_case↔camelCase SQL aliasing, `Partial<T>` field-map updates). New Express routes are added to `server/routes/tripRoutes.ts` following the existing ownership-check pattern. Frontend gets new types/API methods and four new focused component files (`TripParticipantsPanel`, `BookingCard`/`BookingForm`, `BookingTransactionList`, `FlightSeatGrid`) wired into `TripDetailPage.tsx`, which also gets flight-name auto-generation and has its deprecated flat pricing/confirmation fields removed from the flight creation path.

**Tech Stack:** Express + TypeScript (server), React + TypeScript + Vite (client), SQLite via the existing `getDb()`/`sqlite` wrapper, Vitest for both server repository tests and client component tests, `uuid` for IDs.

---

## Task 0: Read the design spec

Before starting, read `docs/superpowers/specs/2026-08-31-flight-bookings-redesign-design.md` in full. Every task below implements a specific section of that spec — refer back to it if a requirement seems unclear.

---

## Task 1: Add new tables to the runtime schema (`server/db.ts`)

**Files:**
- Modify: `server/db.ts` (inside the `SCHEMAS.trips` template string, ~line 395, right after the `flight_legs` table definition and before the `hotel_element_details` table, and in the trailing `CREATE INDEX` block of the same template string)

- [ ] **Step 1: Add the five new `CREATE TABLE IF NOT EXISTS` statements**

Insert this block into `SCHEMAS.trips`, immediately after the closing `);` of the `flight_legs` table definition and before `CREATE TABLE IF NOT EXISTS hotel_element_details`:

```sql
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      confirmation_number TEXT,
      advertised_price_cash DECIMAL,
      advertised_price_points INTEGER,
      loyalty_program TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS booking_links (
      booking_id TEXT NOT NULL,
      element_id TEXT NOT NULL,
      PRIMARY KEY (booking_id, element_id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS booking_travelers (
      booking_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      PRIMARY KEY (booking_id, participant_id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS booking_transactions (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      amount_cash DECIMAL NOT NULL DEFAULT 0,
      amount_points INTEGER NOT NULL DEFAULT 0,
      transaction_date TEXT NOT NULL,
      confirmation_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS flight_traveler_seats (
      id TEXT PRIMARY KEY,
      leg_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      seat_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (leg_id, participant_id),
      FOREIGN KEY (leg_id) REFERENCES flight_legs(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE CASCADE
    );
```

- [ ] **Step 2: Add the corresponding indexes**

Insert into the same template string's trailing index block, right after `CREATE INDEX IF NOT EXISTS idx_flight_legs_element ON flight_legs(element_id);`:

```sql
    CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
    CREATE INDEX IF NOT EXISTS idx_booking_links_element ON booking_links(element_id);
    CREATE INDEX IF NOT EXISTS idx_booking_travelers_participant ON booking_travelers(participant_id);
    CREATE INDEX IF NOT EXISTS idx_booking_transactions_booking ON booking_transactions(booking_id);
    CREATE INDEX IF NOT EXISTS idx_flight_traveler_seats_leg ON flight_traveler_seats(leg_id);
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd server && npx vitest run repositories/tripElementRepository.test.ts repositories/tripElementConfirmationRepository.test.ts`
Expected: All existing tests PASS (the new tables are additive; nothing references them yet).

- [ ] **Step 4: Commit**

```bash
git add server/db.ts
git commit -m "feat(db): add bookings, booking_links, booking_travelers, booking_transactions, flight_traveler_seats tables"
```

---

## Task 2: Add the matching migration file

**Files:**
- Create: `server/migrations/migrations/20260901_add_bookings_and_participants.cjs`

- [ ] **Step 1: Create the migration**

```js
/*
  Migration: Add bookings, booking_links, booking_travelers, booking_transactions,
  and flight_traveler_seats tables.

  These support per-booking (PNR) tracking with per-person advertised pricing,
  many-to-many booking<->element and booking<->traveler relationships, an
  append-only transaction ledger for actual amounts paid, and per-traveler
  per-leg seat assignments. See docs/superpowers/specs/2026-08-31-flight-bookings-redesign-design.md.
*/

module.exports.up = async function up({ db }) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      confirmation_number TEXT,
      advertised_price_cash DECIMAL,
      advertised_price_points INTEGER,
      loyalty_program TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS booking_links (
      booking_id TEXT NOT NULL,
      element_id TEXT NOT NULL,
      PRIMARY KEY (booking_id, element_id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_booking_links_element ON booking_links(element_id);`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS booking_travelers (
      booking_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      PRIMARY KEY (booking_id, participant_id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE RESTRICT
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_booking_travelers_participant ON booking_travelers(participant_id);`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS booking_transactions (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      amount_cash DECIMAL NOT NULL DEFAULT 0,
      amount_points INTEGER NOT NULL DEFAULT 0,
      transaction_date TEXT NOT NULL,
      confirmation_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_booking_transactions_booking ON booking_transactions(booking_id);`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS flight_traveler_seats (
      id TEXT PRIMARY KEY,
      leg_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      seat_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (leg_id, participant_id),
      FOREIGN KEY (leg_id) REFERENCES flight_legs(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_flight_traveler_seats_leg ON flight_traveler_seats(leg_id);`);
};

module.exports.down = async function down({ db }) {
  await db.exec(`DROP INDEX IF EXISTS idx_flight_traveler_seats_leg;`);
  await db.exec(`DROP TABLE IF EXISTS flight_traveler_seats;`);
  await db.exec(`DROP INDEX IF EXISTS idx_booking_transactions_booking;`);
  await db.exec(`DROP TABLE IF EXISTS booking_transactions;`);
  await db.exec(`DROP INDEX IF EXISTS idx_booking_travelers_participant;`);
  await db.exec(`DROP TABLE IF EXISTS booking_travelers;`);
  await db.exec(`DROP INDEX IF EXISTS idx_booking_links_element;`);
  await db.exec(`DROP TABLE IF EXISTS booking_links;`);
  await db.exec(`DROP INDEX IF EXISTS idx_bookings_trip;`);
  await db.exec(`DROP TABLE IF EXISTS bookings;`);
};
```

- [ ] **Step 2: Verify migration status command sees it**

Run: `node server/migrations/run-migrations.cjs status`
Expected: Output lists `20260901_add_bookings_and_participants.cjs` as pending (not yet applied) alongside prior applied migrations.

- [ ] **Step 3: Commit**

```bash
git add server/migrations/migrations/20260901_add_bookings_and_participants.cjs
git commit -m "feat(db): add migration for bookings and related tables"
```


---

## Task 3: `TripParticipantRepository`

**Files:**
- Create: `server/repositories/tripParticipantRepository.ts`
- Test: `server/repositories/tripParticipantRepository.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { TripParticipantRepository } from './tripParticipantRepository';
import { v4 as uuidv4 } from 'uuid';

describe('TripParticipantRepository', () => {
  let repo: TripParticipantRepository;
  let tripId: string;
  let familyId: string;

  beforeEach(async () => {
    await getDb();
    repo = new TripParticipantRepository();

    const db = await getDb();
    familyId = uuidv4();
    tripId = uuidv4();

    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [tripId, familyId, 'Test Trip', '2026-06-01', '2026-06-10']
    );
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('createParticipant', () => {
    it('creates a participant with a display name only', async () => {
      const participant = await repo.createParticipant(tripId, { displayName: 'Jane Doe' });
      expect(participant.id).toBeDefined();
      expect(participant.tripId).toBe(tripId);
      expect(participant.displayName).toBe('Jane Doe');
      expect(participant.userId).toBeNull();
    });

    it('creates a participant linked to a user id', async () => {
      const participant = await repo.createParticipant(tripId, { displayName: 'Linked User', userId: 'user-1' });
      expect(participant.userId).toBe('user-1');
    });
  });

  describe('getParticipantsForTrip', () => {
    it('returns empty array when trip has no participants', async () => {
      const participants = await repo.getParticipantsForTrip(tripId);
      expect(participants).toEqual([]);
    });

    it('returns all participants for a trip', async () => {
      await repo.createParticipant(tripId, { displayName: 'Alice' });
      await repo.createParticipant(tripId, { displayName: 'Bob' });
      const participants = await repo.getParticipantsForTrip(tripId);
      expect(participants).toHaveLength(2);
      expect(participants.map(p => p.displayName).sort()).toEqual(['Alice', 'Bob']);
    });
  });

  describe('updateParticipant', () => {
    it('updates the display name', async () => {
      const created = await repo.createParticipant(tripId, { displayName: 'Old Name' });
      const updated = await repo.updateParticipant(created.id, { displayName: 'New Name' });
      expect(updated.displayName).toBe('New Name');
    });
  });

  describe('deleteParticipant', () => {
    it('deletes a participant with no bookings or seats', async () => {
      const created = await repo.createParticipant(tripId, { displayName: 'Removable' });
      await repo.deleteParticipant(created.id);
      const participants = await repo.getParticipantsForTrip(tripId);
      expect(participants).toEqual([]);
    });

    it('throws when the participant is attached to a booking', async () => {
      const created = await repo.createParticipant(tripId, { displayName: 'Traveler' });
      const db = await getDb();
      const elementId = uuidv4();
      const bookingId = uuidv4();
      await db.run(
        `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [elementId, tripId, 'flight', 'Test Flight']
      );
      await db.run(
        `INSERT INTO bookings (id, trip_id, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`,
        [bookingId, tripId]
      );
      await db.run(
        `INSERT INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`,
        [bookingId, created.id]
      );

      await expect(repo.deleteParticipant(created.id)).rejects.toThrow(/attached to/i);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run repositories/tripParticipantRepository.test.ts`
Expected: FAIL — `Cannot find module './tripParticipantRepository'`

- [ ] **Step 3: Implement the repository**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface TripParticipant {
  id: string;
  tripId: string;
  userId: string | null;
  displayName: string;
  createdAt: string;
}

export class TripParticipantRepository {
  private db = getDb();

  async createParticipant(tripId: string, input: { displayName: string; userId?: string }): Promise<TripParticipant> {
    const id = uuidv4();
    const db = await this.db;
    await db.run(
      `INSERT INTO trip_participants (id, trip_id, user_id, display_name, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [id, tripId, input.userId || null, input.displayName]
    );
    return this.getParticipantById(id) as Promise<TripParticipant>;
  }

  async getParticipantsForTrip(tripId: string): Promise<TripParticipant[]> {
    const db = await this.db;
    const rows = await db.all(
      `SELECT id, trip_id as tripId, user_id as userId, display_name as displayName, created_at as createdAt
       FROM trip_participants WHERE trip_id = ? ORDER BY display_name ASC`,
      [tripId]
    );
    return rows as TripParticipant[];
  }

  async getParticipantById(id: string): Promise<TripParticipant | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, trip_id as tripId, user_id as userId, display_name as displayName, created_at as createdAt
       FROM trip_participants WHERE id = ?`,
      [id]
    );
    return (row as TripParticipant) || null;
  }

  async updateParticipant(id: string, updates: { displayName?: string; userId?: string | null }): Promise<TripParticipant> {
    const dbUpdates: Record<string, any> = {};
    if ('displayName' in updates) dbUpdates.display_name = updates.displayName;
    if ('userId' in updates) dbUpdates.user_id = updates.userId ?? null;

    if (Object.keys(dbUpdates).length > 0) {
      const db = await this.db;
      const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(dbUpdates), id];
      await db.run(`UPDATE trip_participants SET ${fields} WHERE id = ?`, values);
    }
    return this.getParticipantById(id) as Promise<TripParticipant>;
  }

  async deleteParticipant(id: string): Promise<void> {
    const db = await this.db;
    const bookingCount = await db.get(
      `SELECT COUNT(*) as count FROM booking_travelers WHERE participant_id = ?`,
      [id]
    );
    const seatCount = await db.get(
      `SELECT COUNT(*) as count FROM flight_traveler_seats WHERE participant_id = ?`,
      [id]
    );
    if ((bookingCount?.count || 0) > 0 || (seatCount?.count || 0) > 0) {
      throw new Error('Cannot delete participant: attached to one or more bookings or seat assignments');
    }
    await db.run(`DELETE FROM trip_participants WHERE id = ?`, [id]);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run repositories/tripParticipantRepository.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add server/repositories/tripParticipantRepository.ts server/repositories/tripParticipantRepository.test.ts
git commit -m "feat(server): add TripParticipantRepository with delete-guard for bookings/seats"
```

---

## Task 4: Small addition to `TripElementRepository` — leg ownership lookup

**Files:**
- Modify: `server/repositories/tripElementRepository.ts`
- Test: `server/repositories/tripElementRepository.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `server/repositories/tripElementRepository.test.ts` (inside the existing `describe('TripElementRepository', ...)` block — check the file's existing top-level `describe` name and nest accordingly; add a new nested `describe`):

```typescript
  describe('getLegOwnership', () => {
    it('returns the element and trip id that own a leg', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Test Flight',
        typeSpecificData: {
          legs: [{ legOrder: 1, departureAirport: 'DEN', arrivalAirport: 'LAX', flightDate: '2026-06-01' }],
        },
      });
      const legId = element.legs![0].id;
      const ownership = await repo.getLegOwnership(legId);
      expect(ownership).toEqual({ elementId: element.id, tripId });
    });

    it('returns null for a non-existent leg', async () => {
      const ownership = await repo.getLegOwnership('does-not-exist');
      expect(ownership).toBeNull();
    });
  });
```

(Use whatever `tripId`/`repo` variable names the existing test file's outer `beforeEach` already sets up — check the file before appending so names match.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run repositories/tripElementRepository.test.ts -t "getLegOwnership"`
Expected: FAIL — `repo.getLegOwnership is not a function`

- [ ] **Step 3: Implement the method**

Add this method to the `TripElementRepository` class in `server/repositories/tripElementRepository.ts`, after `deleteElement`:

```typescript
  async getLegOwnership(legId: string): Promise<{ elementId: string; tripId: string } | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT fl.element_id as elementId, te.trip_id as tripId
       FROM flight_legs fl
       JOIN trip_elements te ON te.id = fl.element_id
       WHERE fl.id = ?`,
      [legId]
    );
    return row ? { elementId: row.elementId, tripId: row.tripId } : null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run repositories/tripElementRepository.test.ts -t "getLegOwnership"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/repositories/tripElementRepository.ts server/repositories/tripElementRepository.test.ts
git commit -m "feat(server): add TripElementRepository.getLegOwnership for seat route ownership checks"
```


---

## Task 5: `BookingRepository`

**Files:**
- Create: `server/repositories/bookingRepository.ts`
- Test: `server/repositories/bookingRepository.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { BookingRepository } from './bookingRepository';
import { TripParticipantRepository } from './tripParticipantRepository';
import { v4 as uuidv4 } from 'uuid';

describe('BookingRepository', () => {
  let repo: BookingRepository;
  let participantRepo: TripParticipantRepository;
  let tripId: string;
  let familyId: string;
  let elementId: string;
  let elementId2: string;
  let participantAId: string;
  let participantBId: string;

  beforeEach(async () => {
    await getDb();
    repo = new BookingRepository();
    participantRepo = new TripParticipantRepository();

    const db = await getDb();
    familyId = uuidv4();
    tripId = uuidv4();
    elementId = uuidv4();
    elementId2 = uuidv4();

    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [tripId, familyId, 'Test Trip', '2026-06-01', '2026-06-10']
    );
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [elementId, tripId, 'flight', 'Departure Flights']
    );
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [elementId2, tripId, 'flight', 'Return Flights']
    );
    participantAId = (await participantRepo.createParticipant(tripId, { displayName: 'A' })).id;
    participantBId = (await participantRepo.createParticipant(tripId, { displayName: 'B' })).id;
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('createBooking', () => {
    it('creates a booking with travelers and linked elements', async () => {
      const booking = await repo.createBooking(tripId, {
        confirmationNumber: 'ABC123',
        advertisedPriceCash: 79,
        elementIds: [elementId, elementId2],
        travelerIds: [participantAId, participantBId],
      });

      expect(booking.id).toBeDefined();
      expect(booking.confirmationNumber).toBe('ABC123');
      expect(booking.advertisedPriceCash).toBe(79);
      expect(booking.elementIds.sort()).toEqual([elementId, elementId2].sort());
      expect(booking.travelerIds.sort()).toEqual([participantAId, participantBId].sort());
      expect(booking.actualTotalCash).toBe(0);
      expect(booking.actualTotalPoints).toBe(0);
      expect(booking.currentConfirmationNumber).toBe('ABC123');
    });
  });

  describe('getBookingsForTrip', () => {
    it('filters by elementId when provided', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await repo.createBooking(tripId, { elementIds: [elementId2], travelerIds: [participantBId] });

      const forElement1 = await repo.getBookingsForTrip(tripId, elementId);
      expect(forElement1).toHaveLength(1);
      expect(forElement1[0].elementIds).toContain(elementId);
    });

    it('returns all bookings for the trip when no elementId given', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await repo.createBooking(tripId, { elementIds: [elementId2], travelerIds: [participantBId] });

      const all = await repo.getBookingsForTrip(tripId);
      expect(all).toHaveLength(2);
    });

    it('returns one booking linked to two elements exactly once', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId, elementId2], travelerIds: [participantAId] });
      const all = await repo.getBookingsForTrip(tripId);
      expect(all).toHaveLength(1);
      expect(all[0].elementIds.sort()).toEqual([elementId, elementId2].sort());
    });
  });

  describe('link/unlink elements and travelers', () => {
    it('links an additional element to an existing booking', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await repo.linkElement(booking.id, elementId2);
      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.elementIds.sort()).toEqual([elementId, elementId2].sort());
    });

    it('unlinks an element from a booking', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId, elementId2], travelerIds: [participantAId] });
      await repo.unlinkElement(booking.id, elementId2);
      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.elementIds).toEqual([elementId]);
    });

    it('adds and removes a traveler from a booking', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await repo.addTraveler(booking.id, participantBId);
      let reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.travelerIds.sort()).toEqual([participantAId, participantBId].sort());

      await repo.removeTraveler(booking.id, participantBId);
      reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.travelerIds).toEqual([participantAId]);
    });
  });

  describe('updateBooking', () => {
    it('updates confirmation number and advertised price', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const updated = await repo.updateBooking(booking.id, { confirmationNumber: 'NEW123', advertisedPriceCash: 69 });
      expect(updated.confirmationNumber).toBe('NEW123');
      expect(updated.advertisedPriceCash).toBe(69);
    });
  });

  describe('deleteBooking', () => {
    it('cascades links, travelers, and transactions', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const db = await getDb();
      await db.run(
        `INSERT INTO booking_transactions (id, booking_id, amount_cash, transaction_date, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), booking.id, 79, '2026-01-01']
      );

      await repo.deleteBooking(booking.id);

      expect(await repo.getBookingById(booking.id)).toBeNull();
      const linkCount = await db.get(`SELECT COUNT(*) as count FROM booking_links WHERE booking_id = ?`, [booking.id]);
      const travelerCount = await db.get(`SELECT COUNT(*) as count FROM booking_travelers WHERE booking_id = ?`, [booking.id]);
      const txnCount = await db.get(`SELECT COUNT(*) as count FROM booking_transactions WHERE booking_id = ?`, [booking.id]);
      expect(linkCount.count).toBe(0);
      expect(travelerCount.count).toBe(0);
      expect(txnCount.count).toBe(0);
    });
  });

  describe('computed totals', () => {
    it('sums transactions for actualTotalCash/actualTotalPoints and uses latest transaction confirmation number', async () => {
      const booking = await repo.createBooking(tripId, {
        confirmationNumber: 'ORIGINAL',
        elementIds: [elementId],
        travelerIds: [participantAId, participantBId],
      });
      const db = await getDb();
      await db.run(
        `INSERT INTO booking_transactions (id, booking_id, amount_cash, transaction_date, created_at)
         VALUES (?, ?, ?, ?, datetime('now', '-2 days'))`,
        [uuidv4(), booking.id, 158, '2026-01-01']
      );
      await db.run(
        `INSERT INTO booking_transactions (id, booking_id, amount_cash, confirmation_number, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), booking.id, -20, 'REBOOKED', '2026-02-01']
      );

      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.actualTotalCash).toBe(138);
      expect(reloaded!.currentConfirmationNumber).toBe('REBOOKED');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run repositories/bookingRepository.test.ts`
Expected: FAIL — `Cannot find module './bookingRepository'`

- [ ] **Step 3: Implement the repository**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface Booking {
  id: string;
  tripId: string;
  confirmationNumber: string | null;
  advertisedPriceCash: number | null;
  advertisedPricePoints: number | null;
  loyaltyProgram: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  elementIds: string[];
  travelerIds: string[];
  currentConfirmationNumber: string | null;
  actualTotalCash: number;
  actualTotalPoints: number;
}

export interface CreateBookingInput {
  confirmationNumber?: string;
  advertisedPriceCash?: number;
  advertisedPricePoints?: number;
  loyaltyProgram?: string;
  notes?: string;
  elementIds: string[];
  travelerIds: string[];
}

export class BookingRepository {
  private db = getDb();

  async createBooking(tripId: string, input: CreateBookingInput): Promise<Booking> {
    const id = uuidv4();
    const db = await this.db;
    await db.run(
      `INSERT INTO bookings (id, trip_id, confirmation_number, advertised_price_cash, advertised_price_points, loyalty_program, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, tripId, input.confirmationNumber || null, input.advertisedPriceCash ?? null,
       input.advertisedPricePoints ?? null, input.loyaltyProgram || null, input.notes || null]
    );
    for (const elementId of input.elementIds) {
      await db.run(`INSERT INTO booking_links (booking_id, element_id) VALUES (?, ?)`, [id, elementId]);
    }
    for (const participantId of input.travelerIds) {
      await db.run(`INSERT INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`, [id, participantId]);
    }
    return this.getBookingById(id) as Promise<Booking>;
  }

  async getBookingById(id: string): Promise<Booking | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, trip_id as tripId, confirmation_number as confirmationNumber,
              advertised_price_cash as advertisedPriceCash, advertised_price_points as advertisedPricePoints,
              loyalty_program as loyaltyProgram, notes, created_at as createdAt, updated_at as updatedAt
       FROM bookings WHERE id = ?`,
      [id]
    );
    if (!row) return null;
    return this.hydrate(row);
  }

  async getBookingsForTrip(tripId: string, elementId?: string): Promise<Booking[]> {
    const db = await this.db;
    const rows = elementId
      ? await db.all(
          `SELECT DISTINCT b.id, b.trip_id as tripId, b.confirmation_number as confirmationNumber,
                  b.advertised_price_cash as advertisedPriceCash, b.advertised_price_points as advertisedPricePoints,
                  b.loyalty_program as loyaltyProgram, b.notes, b.created_at as createdAt, b.updated_at as updatedAt
           FROM bookings b
           JOIN booking_links bl ON bl.booking_id = b.id
           WHERE b.trip_id = ? AND bl.element_id = ?
           ORDER BY b.created_at ASC`,
          [tripId, elementId]
        )
      : await db.all(
          `SELECT id, trip_id as tripId, confirmation_number as confirmationNumber,
                  advertised_price_cash as advertisedPriceCash, advertised_price_points as advertisedPricePoints,
                  loyalty_program as loyaltyProgram, notes, created_at as createdAt, updated_at as updatedAt
           FROM bookings WHERE trip_id = ? ORDER BY created_at ASC`,
          [tripId]
        );

    const results: Booking[] = [];
    for (const row of rows) {
      results.push(await this.hydrate(row));
    }
    return results;
  }

  async updateBooking(id: string, updates: {
    confirmationNumber?: string | null;
    advertisedPriceCash?: number | null;
    advertisedPricePoints?: number | null;
    loyaltyProgram?: string | null;
    notes?: string | null;
  }): Promise<Booking> {
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
    if (Object.keys(dbUpdates).length > 0) {
      const db = await this.db;
      const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(dbUpdates), id];
      await db.run(`UPDATE bookings SET ${fields}, updated_at = datetime('now') WHERE id = ?`, values);
    }
    return this.getBookingById(id) as Promise<Booking>;
  }

  async deleteBooking(id: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_transactions WHERE booking_id = ?`, [id]);
    await db.run(`DELETE FROM booking_travelers WHERE booking_id = ?`, [id]);
    await db.run(`DELETE FROM booking_links WHERE booking_id = ?`, [id]);
    await db.run(`DELETE FROM bookings WHERE id = ?`, [id]);
  }

  async linkElement(bookingId: string, elementId: string): Promise<void> {
    const db = await this.db;
    await db.run(
      `INSERT OR IGNORE INTO booking_links (booking_id, element_id) VALUES (?, ?)`,
      [bookingId, elementId]
    );
  }

  async unlinkElement(bookingId: string, elementId: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_links WHERE booking_id = ? AND element_id = ?`, [bookingId, elementId]);
  }

  async addTraveler(bookingId: string, participantId: string): Promise<void> {
    const db = await this.db;
    await db.run(
      `INSERT OR IGNORE INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`,
      [bookingId, participantId]
    );
  }

  async removeTraveler(bookingId: string, participantId: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_travelers WHERE booking_id = ? AND participant_id = ?`, [bookingId, participantId]);
  }

  private async hydrate(row: any): Promise<Booking> {
    const db = await this.db;
    const elementRows = await db.all(`SELECT element_id as elementId FROM booking_links WHERE booking_id = ?`, [row.id]);
    const travelerRows = await db.all(`SELECT participant_id as participantId FROM booking_travelers WHERE booking_id = ?`, [row.id]);
    const totals = await db.get(
      `SELECT COALESCE(SUM(amount_cash), 0) as totalCash, COALESCE(SUM(amount_points), 0) as totalPoints
       FROM booking_transactions WHERE booking_id = ?`,
      [row.id]
    );
    const latestTxnConfirmation = await db.get(
      `SELECT confirmation_number as confirmationNumber FROM booking_transactions
       WHERE booking_id = ? AND confirmation_number IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [row.id]
    );

    return {
      ...row,
      elementIds: elementRows.map((r: any) => r.elementId),
      travelerIds: travelerRows.map((r: any) => r.participantId),
      actualTotalCash: totals?.totalCash ?? 0,
      actualTotalPoints: totals?.totalPoints ?? 0,
      currentConfirmationNumber: latestTxnConfirmation?.confirmationNumber || row.confirmationNumber || null,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run repositories/bookingRepository.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add server/repositories/bookingRepository.ts server/repositories/bookingRepository.test.ts
git commit -m "feat(server): add BookingRepository with element/traveler links and computed totals"
```


---

## Task 6: `BookingTransactionRepository`

**Files:**
- Create: `server/repositories/bookingTransactionRepository.ts`
- Test: `server/repositories/bookingTransactionRepository.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { BookingTransactionRepository } from './bookingTransactionRepository';
import { BookingRepository } from './bookingRepository';
import { TripParticipantRepository } from './tripParticipantRepository';
import { v4 as uuidv4 } from 'uuid';

describe('BookingTransactionRepository', () => {
  let repo: BookingTransactionRepository;
  let bookingId: string;
  let tripId: string;

  beforeEach(async () => {
    await getDb();
    repo = new BookingTransactionRepository();
    const bookingRepo = new BookingRepository();
    const participantRepo = new TripParticipantRepository();

    const db = await getDb();
    const familyId = uuidv4();
    tripId = uuidv4();
    const elementId = uuidv4();

    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [tripId, familyId, 'Test Trip', '2026-06-01', '2026-06-10']
    );
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [elementId, tripId, 'flight', 'Flight']
    );
    const participant = await participantRepo.createParticipant(tripId, { displayName: 'A' });
    const booking = await bookingRepo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participant.id] });
    bookingId = booking.id;
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('addTransaction', () => {
    it('creates a transaction with cash amount and notes', async () => {
      const txn = await repo.addTransaction(bookingId, {
        amountCash: 78.98,
        transactionDate: '2026-01-15',
        notes: 'Fee breakdown: base $70 + taxes $8.98',
      });
      expect(txn.id).toBeDefined();
      expect(txn.bookingId).toBe(bookingId);
      expect(txn.amountCash).toBe(78.98);
      expect(txn.amountPoints).toBe(0);
      expect(txn.notes).toBe('Fee breakdown: base $70 + taxes $8.98');
    });

    it('creates a negative transaction with a new confirmation number for a price drop', async () => {
      const txn = await repo.addTransaction(bookingId, {
        amountCash: -10,
        transactionDate: '2026-02-01',
        confirmationNumber: 'REBOOKED123',
      });
      expect(txn.amountCash).toBe(-10);
      expect(txn.confirmationNumber).toBe('REBOOKED123');
    });

    it('defaults transactionDate to today when omitted', async () => {
      const txn = await repo.addTransaction(bookingId, { amountCash: 50 });
      expect(txn.transactionDate).toBeTruthy();
    });

    it('rejects a transaction with both cash and points as zero', async () => {
      await expect(repo.addTransaction(bookingId, { amountCash: 0, amountPoints: 0 })).rejects.toThrow(/amount/i);
    });
  });

  describe('getTransactionsForBooking', () => {
    it('returns transactions ordered by transaction_date then created_at', async () => {
      await repo.addTransaction(bookingId, { amountCash: 78.98, transactionDate: '2026-01-15' });
      await repo.addTransaction(bookingId, { amountCash: -10, transactionDate: '2026-02-01' });
      const txns = await repo.getTransactionsForBooking(bookingId);
      expect(txns).toHaveLength(2);
      expect(txns[0].transactionDate).toBe('2026-01-15');
      expect(txns[1].transactionDate).toBe('2026-02-01');
    });
  });

  describe('updateTransaction', () => {
    it('updates the amount and notes', async () => {
      const txn = await repo.addTransaction(bookingId, { amountCash: 78.98, transactionDate: '2026-01-15' });
      const updated = await repo.updateTransaction(txn.id, { amountCash: 79.5, notes: 'corrected' });
      expect(updated.amountCash).toBe(79.5);
      expect(updated.notes).toBe('corrected');
    });
  });

  describe('deleteTransaction', () => {
    it('removes a transaction', async () => {
      const txn = await repo.addTransaction(bookingId, { amountCash: 78.98, transactionDate: '2026-01-15' });
      await repo.deleteTransaction(txn.id);
      const txns = await repo.getTransactionsForBooking(bookingId);
      expect(txns).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run repositories/bookingTransactionRepository.test.ts`
Expected: FAIL — `Cannot find module './bookingTransactionRepository'`

- [ ] **Step 3: Implement the repository**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface BookingTransaction {
  id: string;
  bookingId: string;
  amountCash: number;
  amountPoints: number;
  transactionDate: string;
  confirmationNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AddTransactionInput {
  amountCash?: number;
  amountPoints?: number;
  transactionDate?: string;
  confirmationNumber?: string;
  notes?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export class BookingTransactionRepository {
  private db = getDb();

  async addTransaction(bookingId: string, input: AddTransactionInput): Promise<BookingTransaction> {
    const amountCash = input.amountCash ?? 0;
    const amountPoints = input.amountPoints ?? 0;
    if (amountCash === 0 && amountPoints === 0) {
      throw new Error('Transaction must have a non-zero amountCash or amountPoints');
    }
    const id = uuidv4();
    const db = await this.db;
    await db.run(
      `INSERT INTO booking_transactions (id, booking_id, amount_cash, amount_points, transaction_date, confirmation_number, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, bookingId, amountCash, amountPoints, input.transactionDate || todayIsoDate(),
       input.confirmationNumber || null, input.notes || null]
    );
    return this.getTransactionById(id) as Promise<BookingTransaction>;
  }

  async getTransactionsForBooking(bookingId: string): Promise<BookingTransaction[]> {
    const db = await this.db;
    const rows = await db.all(
      `SELECT id, booking_id as bookingId, amount_cash as amountCash, amount_points as amountPoints,
              transaction_date as transactionDate, confirmation_number as confirmationNumber, notes, created_at as createdAt
       FROM booking_transactions WHERE booking_id = ? ORDER BY transaction_date ASC, created_at ASC`,
      [bookingId]
    );
    return rows as BookingTransaction[];
  }

  async updateTransaction(id: string, updates: {
    amountCash?: number;
    amountPoints?: number;
    transactionDate?: string;
    confirmationNumber?: string | null;
    notes?: string | null;
  }): Promise<BookingTransaction> {
    const fieldMap: Record<string, string> = {
      amountCash: 'amount_cash',
      amountPoints: 'amount_points',
      transactionDate: 'transaction_date',
      confirmationNumber: 'confirmation_number',
      notes: 'notes',
    };
    const dbUpdates: Record<string, any> = {};
    for (const [key, dbKey] of Object.entries(fieldMap)) {
      if (key in updates) dbUpdates[dbKey] = (updates as any)[key] ?? null;
    }
    if (Object.keys(dbUpdates).length > 0) {
      const db = await this.db;
      const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(dbUpdates), id];
      await db.run(`UPDATE booking_transactions SET ${fields} WHERE id = ?`, values);
    }
    return this.getTransactionById(id) as Promise<BookingTransaction>;
  }

  async deleteTransaction(id: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_transactions WHERE id = ?`, [id]);
  }

  private async getTransactionById(id: string): Promise<BookingTransaction | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, booking_id as bookingId, amount_cash as amountCash, amount_points as amountPoints,
              transaction_date as transactionDate, confirmation_number as confirmationNumber, notes, created_at as createdAt
       FROM booking_transactions WHERE id = ?`,
      [id]
    );
    return (row as BookingTransaction) || null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run repositories/bookingTransactionRepository.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add server/repositories/bookingTransactionRepository.ts server/repositories/bookingTransactionRepository.test.ts
git commit -m "feat(server): add BookingTransactionRepository with non-zero-amount validation"
```

---

## Task 7: `FlightTravelerSeatRepository`

**Files:**
- Create: `server/repositories/flightTravelerSeatRepository.ts`
- Test: `server/repositories/flightTravelerSeatRepository.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { FlightTravelerSeatRepository } from './flightTravelerSeatRepository';
import { TripParticipantRepository } from './tripParticipantRepository';
import { v4 as uuidv4 } from 'uuid';

describe('FlightTravelerSeatRepository', () => {
  let repo: FlightTravelerSeatRepository;
  let legId: string;
  let participantId: string;

  beforeEach(async () => {
    await getDb();
    repo = new FlightTravelerSeatRepository();
    const participantRepo = new TripParticipantRepository();

    const db = await getDb();
    const familyId = uuidv4();
    const tripId = uuidv4();
    const elementId = uuidv4();
    legId = uuidv4();

    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [tripId, familyId, 'Test Trip', '2026-06-01', '2026-06-10']
    );
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [elementId, tripId, 'flight', 'Flight']
    );
    await db.run(
      `INSERT INTO flight_legs (id, element_id, leg_order, departure_airport, departure_datetime, arrival_airport, arrival_datetime, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [legId, elementId, 1, 'DEN', '2026-06-01T08:00:00Z', 'LAX', '2026-06-01T10:00:00Z']
    );
    participantId = (await participantRepo.createParticipant(tripId, { displayName: 'A' })).id;
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('upsertSeat', () => {
    it('creates a seat assignment', async () => {
      const seat = await repo.upsertSeat(legId, participantId, '14C');
      expect(seat.legId).toBe(legId);
      expect(seat.participantId).toBe(participantId);
      expect(seat.seatNumber).toBe('14C');
    });

    it('updates an existing seat assignment for the same leg/participant', async () => {
      await repo.upsertSeat(legId, participantId, '14C');
      const updated = await repo.upsertSeat(legId, participantId, '20A');
      expect(updated.seatNumber).toBe('20A');
      const seats = await repo.getSeatsForLeg(legId);
      expect(seats).toHaveLength(1);
    });
  });

  describe('getSeatsForLeg', () => {
    it('returns empty array when no seats assigned', async () => {
      const seats = await repo.getSeatsForLeg(legId);
      expect(seats).toEqual([]);
    });
  });

  describe('deleteSeat', () => {
    it('removes a seat assignment', async () => {
      await repo.upsertSeat(legId, participantId, '14C');
      await repo.deleteSeat(legId, participantId);
      const seats = await repo.getSeatsForLeg(legId);
      expect(seats).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run repositories/flightTravelerSeatRepository.test.ts`
Expected: FAIL — `Cannot find module './flightTravelerSeatRepository'`

- [ ] **Step 3: Implement the repository**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface FlightTravelerSeat {
  id: string;
  legId: string;
  participantId: string;
  seatNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export class FlightTravelerSeatRepository {
  private db = getDb();

  async upsertSeat(legId: string, participantId: string, seatNumber: string): Promise<FlightTravelerSeat> {
    const db = await this.db;
    const existing = await db.get(
      `SELECT id FROM flight_traveler_seats WHERE leg_id = ? AND participant_id = ?`,
      [legId, participantId]
    );
    if (existing) {
      await db.run(
        `UPDATE flight_traveler_seats SET seat_number = ?, updated_at = datetime('now') WHERE id = ?`,
        [seatNumber, existing.id]
      );
      return this.getSeatById(existing.id) as Promise<FlightTravelerSeat>;
    }
    const id = uuidv4();
    await db.run(
      `INSERT INTO flight_traveler_seats (id, leg_id, participant_id, seat_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, legId, participantId, seatNumber]
    );
    return this.getSeatById(id) as Promise<FlightTravelerSeat>;
  }

  async getSeatsForLeg(legId: string): Promise<FlightTravelerSeat[]> {
    const db = await this.db;
    const rows = await db.all(
      `SELECT id, leg_id as legId, participant_id as participantId, seat_number as seatNumber, created_at as createdAt, updated_at as updatedAt
       FROM flight_traveler_seats WHERE leg_id = ?`,
      [legId]
    );
    return rows as FlightTravelerSeat[];
  }

  async deleteSeat(legId: string, participantId: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM flight_traveler_seats WHERE leg_id = ? AND participant_id = ?`, [legId, participantId]);
  }

  private async getSeatById(id: string): Promise<FlightTravelerSeat | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, leg_id as legId, participant_id as participantId, seat_number as seatNumber, created_at as createdAt, updated_at as updatedAt
       FROM flight_traveler_seats WHERE id = ?`,
      [id]
    );
    return (row as FlightTravelerSeat) || null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run repositories/flightTravelerSeatRepository.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/repositories/flightTravelerSeatRepository.ts server/repositories/flightTravelerSeatRepository.test.ts
git commit -m "feat(server): add FlightTravelerSeatRepository with per-leg upsert"
```


---

## Task 8: Wire participants, bookings, transactions, and seats routes into `tripRoutes.ts`

**Files:**
- Modify: `server/routes/tripRoutes.ts`

This task has no isolated unit test (per the codebase's established convention: trip routes are covered by repository tests + frontend component tests, not a dedicated supertest route suite — see Task 9's frontend tests for coverage of the request/response contract). Manual verification via `curl` is included in Step 3.

- [ ] **Step 1: Add repository imports and instances**

At the top of `server/routes/tripRoutes.ts`, add these imports and instances alongside the existing ones:

```typescript
import { TripParticipantRepository } from '../repositories/tripParticipantRepository';
import { BookingRepository } from '../repositories/bookingRepository';
import { BookingTransactionRepository } from '../repositories/bookingTransactionRepository';
import { FlightTravelerSeatRepository } from '../repositories/flightTravelerSeatRepository';
```

```typescript
const tripParticipantRepository = new TripParticipantRepository();
const bookingRepository = new BookingRepository();
const bookingTransactionRepository = new BookingTransactionRepository();
const flightTravelerSeatRepository = new FlightTravelerSeatRepository();
```

- [ ] **Step 2: Append the new route handlers**

Add these route handlers at the end of `server/routes/tripRoutes.ts` (after the existing confirmations routes, before any final export statement — the file only exports `tripRouter` via the `export const tripRouter = Router();` declared at the top, so simply append at end of file):

```typescript
// ===== Participants =====

tripRouter.get('/:tripId/participants', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const participants = await tripParticipantRepository.getParticipantsForTrip(req.trip!.id);
    res.json(participants);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

tripRouter.post('/:tripId/participants', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const { displayName, userId } = req.body;
    if (!displayName) {
      return res.status(400).json({ error: 'Missing required field: displayName' });
    }
    const participant = await tripParticipantRepository.createParticipant(req.trip!.id, { displayName, userId });
    res.status(201).json(participant);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create participant' });
  }
});

tripRouter.patch('/:tripId/participants/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const participant = await tripParticipantRepository.getParticipantById(req.params.id);
    if (!participant || participant.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    const updated = await tripParticipantRepository.updateParticipant(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update participant' });
  }
});

tripRouter.delete('/:tripId/participants/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const participant = await tripParticipantRepository.getParticipantById(req.params.id);
    if (!participant || participant.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    await tripParticipantRepository.deleteParticipant(req.params.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete participant';
    res.status(409).json({ error: message });
  }
});

// ===== Bookings =====

tripRouter.get('/:tripId/bookings', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const elementId = typeof req.query.elementId === 'string' ? req.query.elementId : undefined;
    const bookings = await bookingRepository.getBookingsForTrip(req.trip!.id, elementId);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

tripRouter.post('/:tripId/bookings', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const { confirmationNumber, advertisedPriceCash, advertisedPricePoints, loyaltyProgram, notes, elementIds, travelerIds } = req.body;
    if (!Array.isArray(elementIds) || elementIds.length === 0) {
      return res.status(400).json({ error: 'At least one elementId is required' });
    }
    if (!Array.isArray(travelerIds) || travelerIds.length === 0) {
      return res.status(400).json({ error: 'At least one travelerId is required' });
    }
    // Validate every referenced element belongs to this trip
    for (const elementId of elementIds) {
      const element = await tripElementRepository.getElementById(elementId);
      if (!element || element.tripId !== req.trip!.id) {
        return res.status(404).json({ error: `Element not found: ${elementId}` });
      }
    }
    // Validate every referenced traveler belongs to this trip
    for (const participantId of travelerIds) {
      const participant = await tripParticipantRepository.getParticipantById(participantId);
      if (!participant || participant.tripId !== req.trip!.id) {
        return res.status(404).json({ error: `Participant not found: ${participantId}` });
      }
    }
    const booking = await bookingRepository.createBooking(req.trip!.id, {
      confirmationNumber, advertisedPriceCash, advertisedPricePoints, loyaltyProgram, notes, elementIds, travelerIds,
    });
    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

tripRouter.get('/:tripId/bookings/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

tripRouter.patch('/:tripId/bookings/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const updated = await bookingRepository.updateBooking(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

tripRouter.delete('/:tripId/bookings/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    await bookingRepository.deleteBooking(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

tripRouter.post('/:tripId/bookings/:id/elements', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { elementId } = req.body;
    if (!elementId) {
      return res.status(400).json({ error: 'Missing required field: elementId' });
    }
    const element = await tripElementRepository.getElementById(elementId);
    if (!element || element.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Element not found' });
    }
    await bookingRepository.linkElement(req.params.id, elementId);
    res.json(await bookingRepository.getBookingById(req.params.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to link element to booking' });
  }
});

tripRouter.delete('/:tripId/bookings/:id/elements/:elementId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    await bookingRepository.unlinkElement(req.params.id, req.params.elementId);
    res.json(await bookingRepository.getBookingById(req.params.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to unlink element from booking' });
  }
});

tripRouter.post('/:tripId/bookings/:id/travelers', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { participantId } = req.body;
    if (!participantId) {
      return res.status(400).json({ error: 'Missing required field: participantId' });
    }
    const participant = await tripParticipantRepository.getParticipantById(participantId);
    if (!participant || participant.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    await bookingRepository.addTraveler(req.params.id, participantId);
    res.json(await bookingRepository.getBookingById(req.params.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to add traveler to booking' });
  }
});

tripRouter.delete('/:tripId/bookings/:id/travelers/:participantId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.id);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    await bookingRepository.removeTraveler(req.params.id, req.params.participantId);
    res.json(await bookingRepository.getBookingById(req.params.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove traveler from booking' });
  }
});

// ===== Booking transactions =====

tripRouter.get('/:tripId/bookings/:bookingId/transactions', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.bookingId);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const transactions = await bookingTransactionRepository.getTransactionsForBooking(req.params.bookingId);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

tripRouter.post('/:tripId/bookings/:bookingId/transactions', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.bookingId);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { amountCash, amountPoints, transactionDate, confirmationNumber, notes } = req.body;
    const transaction = await bookingTransactionRepository.addTransaction(req.params.bookingId, {
      amountCash, amountPoints, transactionDate, confirmationNumber, notes,
    });
    res.status(201).json(transaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add transaction';
    res.status(400).json({ error: message });
  }
});

tripRouter.patch('/:tripId/bookings/:bookingId/transactions/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.bookingId);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const transactions = await bookingTransactionRepository.getTransactionsForBooking(req.params.bookingId);
    if (!transactions.some(t => t.id === req.params.id)) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const updated = await bookingTransactionRepository.updateTransaction(req.params.id, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

tripRouter.delete('/:tripId/bookings/:bookingId/transactions/:id', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const booking = await bookingRepository.getBookingById(req.params.bookingId);
    if (!booking || booking.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const transactions = await bookingTransactionRepository.getTransactionsForBooking(req.params.bookingId);
    if (!transactions.some(t => t.id === req.params.id)) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    await bookingTransactionRepository.deleteTransaction(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// ===== Flight seats =====

tripRouter.get('/:tripId/legs/:legId/seats', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const ownership = await tripElementRepository.getLegOwnership(req.params.legId);
    if (!ownership || ownership.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Leg not found' });
    }
    const seats = await flightTravelerSeatRepository.getSeatsForLeg(req.params.legId);
    res.json(seats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch seats' });
  }
});

tripRouter.put('/:tripId/legs/:legId/seats/:participantId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const ownership = await tripElementRepository.getLegOwnership(req.params.legId);
    if (!ownership || ownership.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Leg not found' });
    }
    const participant = await tripParticipantRepository.getParticipantById(req.params.participantId);
    if (!participant || participant.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    const { seatNumber } = req.body;
    if (!seatNumber) {
      return res.status(400).json({ error: 'Missing required field: seatNumber' });
    }
    const seat = await flightTravelerSeatRepository.upsertSeat(req.params.legId, req.params.participantId, seatNumber);
    res.json(seat);
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign seat' });
  }
});

tripRouter.delete('/:tripId/legs/:legId/seats/:participantId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const ownership = await tripElementRepository.getLegOwnership(req.params.legId);
    if (!ownership || ownership.tripId !== req.trip!.id) {
      return res.status(404).json({ error: 'Leg not found' });
    }
    await flightTravelerSeatRepository.deleteSeat(req.params.legId, req.params.participantId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove seat' });
  }
});
```

- [ ] **Step 3: Manual verification with curl**

Start the server (`npm run dev` from `server/` or the repo's usual dev command), obtain an auth token via the existing login flow, then verify the new endpoints respond correctly:

```bash
# Replace $TOKEN and $TRIP_ID with real values from your dev session
curl -s -X POST http://localhost:3000/api/trips/$TRIP_ID/participants \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"displayName":"Test Traveler"}'
```

Expected: HTTP 201 with a JSON body containing `id`, `tripId`, `displayName: "Test Traveler"`.

- [ ] **Step 4: Run full server test suite to confirm no regressions**

Run: `cd server && npx vitest run`
Expected: All tests PASS (existing + new repository tests).

- [ ] **Step 5: Commit**

```bash
git add server/routes/tripRoutes.ts
git commit -m "feat(server): add participants, bookings, transactions, and seats routes"
```


---

## Task 9: Frontend types (`client/src/types/trip.ts`)

**Files:**
- Modify: `client/src/types/trip.ts`

- [ ] **Step 1: Add the new types**

Append to `client/src/types/trip.ts`:

```typescript
export interface Booking {
  id: string;
  tripId: string;
  confirmationNumber: string | null;
  advertisedPriceCash: number | null;
  advertisedPricePoints: number | null;
  loyaltyProgram: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  elementIds: string[];
  travelerIds: string[];
  currentConfirmationNumber: string | null;
  actualTotalCash: number;
  actualTotalPoints: number;
}

export interface CreateBookingPayload {
  confirmationNumber?: string;
  advertisedPriceCash?: number;
  advertisedPricePoints?: number;
  loyaltyProgram?: string;
  notes?: string;
  elementIds: string[];
  travelerIds: string[];
}

export interface BookingTransaction {
  id: string;
  bookingId: string;
  amountCash: number;
  amountPoints: number;
  transactionDate: string;
  confirmationNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AddBookingTransactionPayload {
  amountCash?: number;
  amountPoints?: number;
  transactionDate?: string;
  confirmationNumber?: string;
  notes?: string;
}

export interface FlightTravelerSeat {
  id: string;
  legId: string;
  participantId: string;
  seatNumber: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Verify the client type-checks**

Run: `npx tsc -p client/tsconfig.json --noEmit`
Expected: No new errors (this task only adds unused-so-far types).

- [ ] **Step 3: Commit**

```bash
git add client/src/types/trip.ts
git commit -m "feat(client): add Booking, BookingTransaction, FlightTravelerSeat types"
```

---

## Task 10: Frontend API client methods (`client/src/api/tripApi.ts`)

**Files:**
- Modify: `client/src/api/tripApi.ts`

- [ ] **Step 1: Update the import line**

Change:

```typescript
import { Trip, TripElement, TripElementConfirmation, TripAttachment, FlightAutofillLookupInput, FlightAutofillDetails } from '../types/trip';
```

to:

```typescript
import {
  Trip, TripElement, TripElementConfirmation, TripAttachment, FlightAutofillLookupInput, FlightAutofillDetails,
  TripParticipant, Booking, CreateBookingPayload, BookingTransaction, AddBookingTransactionPayload, FlightTravelerSeat,
} from '../types/trip';
```

- [ ] **Step 2: Add the new API methods**

Add these methods inside the `tripApi` object literal, after the existing `deleteConfirmation` method (before the closing `};`):

```typescript
  // Participants
  listParticipants: async (tripId: string): Promise<TripParticipant[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/participants`, { headers: authHeaders() });
    return handleResponse(response);
  },

  createParticipant: async (tripId: string, participant: { displayName: string; userId?: string }): Promise<TripParticipant> => {
    const response = await fetch(`${API_BASE}/${tripId}/participants`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(participant),
    });
    return handleResponse(response);
  },

  updateParticipant: async (tripId: string, participantId: string, updates: Partial<TripParticipant>): Promise<TripParticipant> => {
    const response = await fetch(`${API_BASE}/${tripId}/participants/${participantId}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteParticipant: async (tripId: string, participantId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/participants/${participantId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Failed to delete participant: ${response.status}`);
    }
  },

  // Bookings
  listBookings: async (tripId: string, elementId?: string): Promise<Booking[]> => {
    const url = elementId
      ? `${API_BASE}/${tripId}/bookings?elementId=${encodeURIComponent(elementId)}`
      : `${API_BASE}/${tripId}/bookings`;
    const response = await fetch(url, { headers: authHeaders() });
    return handleResponse(response);
  },

  getBooking: async (tripId: string, bookingId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}`, { headers: authHeaders() });
    return handleResponse(response);
  },

  createBooking: async (tripId: string, booking: CreateBookingPayload): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(booking),
    });
    return handleResponse(response);
  },

  updateBooking: async (tripId: string, bookingId: string, updates: Partial<CreateBookingPayload>): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteBooking: async (tripId: string, bookingId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}`, { method: 'DELETE', headers: authHeaders() });
    if (!response.ok) {
      throw new Error(`Failed to delete booking: ${response.status}`);
    }
  },

  linkBookingElement: async (tripId: string, bookingId: string, elementId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/elements`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ elementId }),
    });
    return handleResponse(response);
  },

  unlinkBookingElement: async (tripId: string, bookingId: string, elementId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/elements/${elementId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(response);
  },

  addBookingTraveler: async (tripId: string, bookingId: string, participantId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/travelers`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ participantId }),
    });
    return handleResponse(response);
  },

  removeBookingTraveler: async (tripId: string, bookingId: string, participantId: string): Promise<Booking> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/travelers/${participantId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return handleResponse(response);
  },

  // Booking transactions
  listBookingTransactions: async (tripId: string, bookingId: string): Promise<BookingTransaction[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/transactions`, { headers: authHeaders() });
    return handleResponse(response);
  },

  addBookingTransaction: async (tripId: string, bookingId: string, transaction: AddBookingTransactionPayload): Promise<BookingTransaction> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/transactions`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(transaction),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `API Error: ${response.status}`);
    }
    return response.json();
  },

  updateBookingTransaction: async (tripId: string, bookingId: string, transactionId: string, updates: Partial<AddBookingTransactionPayload>): Promise<BookingTransaction> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/transactions/${transactionId}`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  deleteBookingTransaction: async (tripId: string, bookingId: string, transactionId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/bookings/${bookingId}/transactions/${transactionId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete transaction: ${response.status}`);
    }
  },

  // Flight seats
  listSeatsForLeg: async (tripId: string, legId: string): Promise<FlightTravelerSeat[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/legs/${legId}/seats`, { headers: authHeaders() });
    return handleResponse(response);
  },

  assignSeat: async (tripId: string, legId: string, participantId: string, seatNumber: string): Promise<FlightTravelerSeat> => {
    const response = await fetch(`${API_BASE}/${tripId}/legs/${legId}/seats/${participantId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ seatNumber }),
    });
    return handleResponse(response);
  },

  removeSeat: async (tripId: string, legId: string, participantId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/legs/${legId}/seats/${participantId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to remove seat: ${response.status}`);
    }
  },
```

- [ ] **Step 3: Verify the client type-checks**

Run: `npx tsc -p client/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 4: Update the API usage map**

Add a new section to `client/src/APIUsage.md` (following the existing format of other sections) documenting the new `tripApi` methods and which files import them (will be `client/src/pages/TripDetailPage.tsx` plus the new components created in Tasks 12-15 — update this entry again after those tasks land if the consuming file list changes).

- [ ] **Step 5: Commit**

```bash
git add client/src/api/tripApi.ts client/src/APIUsage.md
git commit -m "feat(client): add tripApi methods for participants, bookings, transactions, seats"
```


---

## Task 11: `TripParticipantsPanel` component

**Files:**
- Create: `client/src/components/TripParticipantsPanel.tsx`
- Test: `client/src/__tests__/TripParticipantsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listParticipants: vi.fn(),
    createParticipant: vi.fn(),
    updateParticipant: vi.fn(),
    deleteParticipant: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { TripParticipantsPanel } from '../components/TripParticipantsPanel';

describe('TripParticipantsPanel', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listParticipants as any).mockResolvedValue([
      { id: 'p1', tripId: 'trip-1', userId: null, displayName: 'Alice', createdAt: '' },
    ]);
  });

  it('lists existing participants', async () => {
    render(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} />);
    expect(await screen.findByText('Alice')).toBeTruthy();
  });

  it('adds a new participant', async () => {
    (tripApi.createParticipant as any).mockResolvedValue({ id: 'p2', tripId: 'trip-1', userId: null, displayName: 'Bob', createdAt: '' });
    (tripApi.listParticipants as any)
      .mockResolvedValueOnce([{ id: 'p1', tripId: 'trip-1', userId: null, displayName: 'Alice', createdAt: '' }])
      .mockResolvedValueOnce([
        { id: 'p1', tripId: 'trip-1', userId: null, displayName: 'Alice', createdAt: '' },
        { id: 'p2', tripId: 'trip-1', userId: null, displayName: 'Bob', createdAt: '' },
      ]);

    render(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} />);
    await screen.findByText('Alice');

    fireEvent.change(screen.getByPlaceholderText(/traveler name/i), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: /add traveler/i }));

    await waitFor(() => expect(tripApi.createParticipant).toHaveBeenCalledWith('trip-1', { displayName: 'Bob' }));
    expect(await screen.findByText('Bob')).toBeTruthy();
  });

  it('removes a participant and surfaces a 409 error message', async () => {
    (tripApi.deleteParticipant as any).mockRejectedValue(new Error('Cannot delete participant: attached to one or more bookings or seat assignments'));

    render(<TripParticipantsPanel tripId="trip-1" onParticipantsChanged={() => {}} />);
    await screen.findByText('Alice');
    fireEvent.click(screen.getByRole('button', { name: /remove alice/i }));

    expect(await screen.findByText(/attached to one or more bookings/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/TripParticipantsPanel.test.tsx`
Expected: FAIL — `Cannot find module '../components/TripParticipantsPanel'`

- [ ] **Step 3: Implement the component**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';

interface TripParticipantsPanelProps {
  tripId: string;
  onParticipantsChanged: (participants: TripParticipant[]) => void;
}

export function TripParticipantsPanel({ tripId, onParticipantsChanged }: TripParticipantsPanelProps) {
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await tripApi.listParticipants(tripId);
    setParticipants(data);
    onParticipantsChanged(data);
  }, [tripId, onParticipantsChanged]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const addParticipant = async () => {
    if (!newName.trim()) return;
    try {
      setAdding(true);
      setError(null);
      await tripApi.createParticipant(tripId, { displayName: newName.trim() });
      setNewName('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add traveler');
    } finally {
      setAdding(false);
    }
  };

  const removeParticipant = async (id: string) => {
    try {
      setError(null);
      await tripApi.deleteParticipant(tripId, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove traveler');
    }
  };

  return (
    <div className="trip-participants-panel">
      <h2>Travelers</h2>
      {error && <p className="error">{error}</p>}
      <ul className="trip-participants-list">
        {participants.map(p => (
          <li key={p.id} className="trip-participant-item">
            <span>{p.displayName}</span>
            <button type="button" onClick={() => removeParticipant(p.id)} aria-label={`Remove ${p.displayName}`}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="create-element-field">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Traveler name"
        />
        <button type="button" onClick={addParticipant} disabled={adding}>
          {adding ? 'Adding...' : 'Add Traveler'}
        </button>
      </div>
    </div>
  );
}

/**
 * Adds a traveler by display name if they don't already exist among `participants`
 * (case-insensitive match), returning the resulting participant. Used by booking
 * forms to support inline "+ New traveler" creation without duplicating people.
 */
export async function findOrCreateParticipant(
  tripId: string,
  displayName: string,
  participants: TripParticipant[]
): Promise<TripParticipant> {
  const existing = participants.find(p => p.displayName.toLowerCase() === displayName.trim().toLowerCase());
  if (existing) return existing;
  return tripApi.createParticipant(tripId, { displayName: displayName.trim() });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/TripParticipantsPanel.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TripParticipantsPanel.tsx client/src/__tests__/TripParticipantsPanel.test.tsx
git commit -m "feat(client): add TripParticipantsPanel with inline add/remove and findOrCreateParticipant helper"
```


---

## Task 12: `BookingTransactionList` component

**Files:**
- Create: `client/src/components/BookingTransactionList.tsx`
- Test: `client/src/__tests__/BookingTransactionList.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { BookingTransactionList } from '../components/BookingTransactionList';

describe('BookingTransactionList', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listBookingTransactions as any).mockResolvedValue([
      { id: 't1', bookingId: 'b1', amountCash: 78.98, amountPoints: 0, transactionDate: '2026-01-15', confirmationNumber: null, notes: 'Fee breakdown', createdAt: '' },
    ]);
  });

  it('lists transactions with running total', async () => {
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} />);
    expect(await screen.findByText(/78.98/)).toBeTruthy();
    expect(await screen.findByText(/Fee breakdown/)).toBeTruthy();
  });

  it('adds a negative transaction for a price drop with a new confirmation number', async () => {
    (tripApi.addBookingTransaction as any).mockResolvedValue({
      id: 't2', bookingId: 'b1', amountCash: -10, amountPoints: 0, transactionDate: '2026-02-01', confirmationNumber: 'REBOOKED', notes: null, createdAt: '',
    });
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} />);
    await screen.findByText(/78.98/);

    fireEvent.change(screen.getByLabelText(/amount \(cash\)/i), { target: { value: '-10' } });
    fireEvent.change(screen.getByLabelText(/new confirmation number/i), { target: { value: 'REBOOKED' } });
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));

    await waitFor(() => expect(tripApi.addBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', expect.objectContaining({
      amountCash: -10,
      confirmationNumber: 'REBOOKED',
    })));
  });

  it('shows a validation error when both amounts are left blank', async () => {
    render(<BookingTransactionList tripId="trip-1" bookingId="b1" onChanged={() => {}} />);
    await screen.findByText(/78.98/);
    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }));
    expect(await screen.findByText(/enter a cash or points amount/i)).toBeTruthy();
    expect(tripApi.addBookingTransaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/BookingTransactionList.test.tsx`
Expected: FAIL — `Cannot find module '../components/BookingTransactionList'`

- [ ] **Step 3: Implement the component**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';

interface BookingTransactionListProps {
  tripId: string;
  bookingId: string;
  onChanged: () => void;
}

function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookingTransactionList({ tripId, bookingId, onChanged }: BookingTransactionListProps) {
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [amountCash, setAmountCash] = useState('');
  const [amountPoints, setAmountPoints] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await tripApi.listBookingTransactions(tripId, bookingId);
    setTransactions(data);
  }, [tripId, bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const runningTotalCash = transactions.reduce((sum, t) => sum + t.amountCash, 0);
  const runningTotalPoints = transactions.reduce((sum, t) => sum + t.amountPoints, 0);

  const addTransaction = async () => {
    const cash = parseAmount(amountCash);
    const points = parseAmount(amountPoints);
    if ((cash === undefined || cash === 0) && (points === undefined || points === 0)) {
      setError('Please enter a cash or points amount');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await tripApi.addBookingTransaction(tripId, bookingId, {
        amountCash: cash,
        amountPoints: points,
        transactionDate: transactionDate || undefined,
        confirmationNumber: confirmationNumber.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setAmountCash('');
      setAmountPoints('');
      setTransactionDate('');
      setConfirmationNumber('');
      setNotes('');
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transaction');
    } finally {
      setSaving(false);
    }
  };

  const removeTransaction = async (id: string) => {
    await tripApi.deleteBookingTransaction(tripId, bookingId, id);
    await load();
    onChanged();
  };

  return (
    <div className="booking-transaction-list">
      <h4>Transactions</h4>
      {error && <p className="error">{error}</p>}
      <ul>
        {transactions.map(t => (
          <li key={t.id}>
            <span>{t.transactionDate}</span>{' '}
            <span>{t.amountCash !== 0 ? `$${t.amountCash.toFixed(2)}` : ''}</span>{' '}
            <span>{t.amountPoints !== 0 ? `${t.amountPoints} pts` : ''}</span>{' '}
            {t.confirmationNumber && <span>Conf: {t.confirmationNumber}</span>}{' '}
            {t.notes && <span className="element-notes">{t.notes}</span>}
            <button type="button" onClick={() => removeTransaction(t.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <p className="booking-transaction-total">
        Total paid: ${runningTotalCash.toFixed(2)}{runningTotalPoints !== 0 ? ` + ${runningTotalPoints} pts` : ''}
      </p>
      <div className="create-element-field">
        <label htmlFor={`txn-cash-${bookingId}`}>Amount (cash)</label>
        <input id={`txn-cash-${bookingId}`} type="number" step="0.01" value={amountCash} onChange={(e) => setAmountCash(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`txn-points-${bookingId}`}>Amount (points)</label>
        <input id={`txn-points-${bookingId}`} type="number" step="1" value={amountPoints} onChange={(e) => setAmountPoints(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`txn-date-${bookingId}`}>Date</label>
        <input id={`txn-date-${bookingId}`} type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
      </div>
      <div className="create-element-field">
        <label htmlFor={`txn-conf-${bookingId}`}>New confirmation number</label>
        <input id={`txn-conf-${bookingId}`} type="text" value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} placeholder="Optional, e.g. for rebooking" />
      </div>
      <div className="create-element-field">
        <label htmlFor={`txn-notes-${bookingId}`}>Notes</label>
        <input id={`txn-notes-${bookingId}`} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. fee/tax breakdown" />
      </div>
      <button type="button" onClick={addTransaction} disabled={saving}>
        {saving ? 'Saving...' : 'Add Transaction'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/BookingTransactionList.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BookingTransactionList.tsx client/src/__tests__/BookingTransactionList.test.tsx
git commit -m "feat(client): add BookingTransactionList with running total and validation"
```

---

## Task 13: `FlightSeatGrid` component

**Files:**
- Create: `client/src/components/FlightSeatGrid.tsx`
- Test: `client/src/__tests__/FlightSeatGrid.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listSeatsForLeg: vi.fn(),
    assignSeat: vi.fn(),
    removeSeat: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { FlightSeatGrid } from '../components/FlightSeatGrid';

const travelers: TripParticipant[] = [
  { id: 'p1', tripId: 'trip-1', displayName: 'Alice', createdAt: '' },
  { id: 'p2', tripId: 'trip-1', displayName: 'Bob', createdAt: '' },
];

describe('FlightSeatGrid', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listSeatsForLeg as any).mockResolvedValue([]);
  });

  it('renders one seat input per traveler on the booking(s) linked to this leg element', async () => {
    render(<FlightSeatGrid tripId="trip-1" legId="leg-1" travelers={travelers} />);
    expect(await screen.findByLabelText(/alice.*seat/i)).toBeTruthy();
    expect(await screen.findByLabelText(/bob.*seat/i)).toBeTruthy();
  });

  it('saves a seat number on blur', async () => {
    (tripApi.assignSeat as any).mockResolvedValue({ id: 's1', legId: 'leg-1', participantId: 'p1', seatNumber: '14C', createdAt: '', updatedAt: '' });
    render(<FlightSeatGrid tripId="trip-1" legId="leg-1" travelers={travelers} />);
    const input = await screen.findByLabelText(/alice.*seat/i);
    fireEvent.change(input, { target: { value: '14C' } });
    fireEvent.blur(input);
    await waitFor(() => expect(tripApi.assignSeat).toHaveBeenCalledWith('trip-1', 'leg-1', 'p1', '14C'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/FlightSeatGrid.test.tsx`
Expected: FAIL — `Cannot find module '../components/FlightSeatGrid'`

- [ ] **Step 3: Implement the component**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';

interface FlightSeatGridProps {
  tripId: string;
  legId: string;
  travelers: TripParticipant[];
}

export function FlightSeatGrid({ tripId, legId, travelers }: FlightSeatGridProps) {
  const [seatByParticipant, setSeatByParticipant] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const seats = await tripApi.listSeatsForLeg(tripId, legId);
    const map: Record<string, string> = {};
    for (const seat of seats) {
      map[seat.participantId] = seat.seatNumber || '';
    }
    setSeatByParticipant(map);
  }, [tripId, legId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (participantId: string, value: string) => {
    setSeatByParticipant(prev => ({ ...prev, [participantId]: value }));
  };

  const handleBlur = async (participantId: string) => {
    const seatNumber = seatByParticipant[participantId];
    if (!seatNumber || !seatNumber.trim()) {
      await tripApi.removeSeat(tripId, legId, participantId);
      return;
    }
    await tripApi.assignSeat(tripId, legId, participantId, seatNumber.trim());
  };

  if (travelers.length === 0) {
    return null;
  }

  return (
    <div className="flight-seat-grid">
      {travelers.map(traveler => (
        <div key={traveler.id} className="create-element-field">
          <label htmlFor={`seat-${legId}-${traveler.id}`}>{traveler.displayName} seat</label>
          <input
            id={`seat-${legId}-${traveler.id}`}
            type="text"
            value={seatByParticipant[traveler.id] || ''}
            onChange={(e) => handleChange(traveler.id, e.target.value)}
            onBlur={() => handleBlur(traveler.id)}
            placeholder="e.g. 14C"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/FlightSeatGrid.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FlightSeatGrid.tsx client/src/__tests__/FlightSeatGrid.test.tsx
git commit -m "feat(client): add FlightSeatGrid for per-traveler per-leg seat assignment"
```


---

## Task 14: `BookingCard` component (booking form + display + link/traveler management)

**Files:**
- Create: `client/src/components/BookingCard.tsx`
- Test: `client/src/__tests__/BookingCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TripElement, TripParticipant } from '../types/trip';

vi.mock('../api/tripApi', () => ({
  tripApi: {
    listBookings: vi.fn(),
    createBooking: vi.fn(),
    createParticipant: vi.fn(),
    listBookingTransactions: vi.fn(),
    addBookingTransaction: vi.fn(),
    deleteBookingTransaction: vi.fn(),
  },
}));

import { tripApi } from '../api/tripApi';
import { BookingCard } from '../components/BookingCard';

const elements: TripElement[] = [
  { id: 'el-1', tripId: 'trip-1', elementType: 'flight', name: 'Departure Flights', sortPosition: 0, createdAt: '', updatedAt: '' },
  { id: 'el-2', tripId: 'trip-1', elementType: 'flight', name: 'Return Flights', sortPosition: 1, createdAt: '', updatedAt: '' },
];

const participants: TripParticipant[] = [
  { id: 'p1', tripId: 'trip-1', displayName: 'Alice', createdAt: '' },
];

describe('BookingCard', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    (tripApi.listBookings as any).mockResolvedValue([]);
    (tripApi.listBookingTransactions as any).mockResolvedValue([]);
  });

  it('shows "no bookings yet" when there are none for this element', async () => {
    render(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} />);
    expect(await screen.findByText(/no bookings/i)).toBeTruthy();
  });

  it('creates a booking with an existing traveler, advertised per-person price, and a linked second element', async () => {
    (tripApi.createBooking as any).mockResolvedValue({
      id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
      loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
      elementIds: ['el-1', 'el-2'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
    });
    (tripApi.listBookings as any)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
        loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
        elementIds: ['el-1', 'el-2'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
      }]);

    render(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} />);
    await screen.findByText(/no bookings/i);

    fireEvent.click(screen.getByRole('button', { name: /add booking/i }));
    fireEvent.change(screen.getByLabelText(/confirmation number/i), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText(/advertised price per person \(cash\)/i), { target: { value: '79' } });
    fireEvent.click(screen.getByLabelText('Alice'));
    fireEvent.click(screen.getByLabelText('Return Flights'));
    fireEvent.click(screen.getByRole('button', { name: /save booking/i }));

    await waitFor(() => expect(tripApi.createBooking).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      confirmationNumber: 'ABC123',
      advertisedPriceCash: 79,
      travelerIds: ['p1'],
      elementIds: expect.arrayContaining(['el-1', 'el-2']),
    })));
    expect(await screen.findByText('ABC123')).toBeTruthy();
  });

  it('shows "Also covers" for a booking linked to more than one element', async () => {
    (tripApi.listBookings as any).mockResolvedValue([{
      id: 'b1', tripId: 'trip-1', confirmationNumber: 'ABC123', advertisedPriceCash: 79, advertisedPricePoints: null,
      loyaltyProgram: null, notes: null, createdAt: '', updatedAt: '',
      elementIds: ['el-1', 'el-2'], travelerIds: ['p1'], currentConfirmationNumber: 'ABC123', actualTotalCash: 0, actualTotalPoints: 0,
    }]);
    render(<BookingCard tripId="trip-1" elementId="el-1" elements={elements} participants={participants} onParticipantsChanged={() => {}} />);
    expect(await screen.findByText(/also covers/i)).toBeTruthy();
    expect(await screen.findByText('Return Flights')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/BookingCard.test.tsx`
Expected: FAIL — `Cannot find module '../components/BookingCard'`

- [ ] **Step 3: Implement the component**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Booking, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { BookingTransactionList } from './BookingTransactionList';

interface BookingCardProps {
  tripId: string;
  elementId: string;
  elements: TripElement[];
  participants: TripParticipant[];
  onParticipantsChanged: (participants: TripParticipant[]) => void;
}

function parseNumberInput(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function BookingCard({ tripId, elementId, elements, participants, onParticipantsChanged }: BookingCardProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [advertisedPriceCash, setAdvertisedPriceCash] = useState('');
  const [advertisedPricePoints, setAdvertisedPricePoints] = useState('');
  const [loyaltyProgram, setLoyaltyProgram] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTravelerIds, setSelectedTravelerIds] = useState<string[]>([]);
  const [newTravelerName, setNewTravelerName] = useState('');
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([elementId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await tripApi.listBookings(tripId, elementId);
    setBookings(data);
  }, [tripId, elementId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleTraveler = (participantId: string) => {
    setSelectedTravelerIds(prev =>
      prev.includes(participantId) ? prev.filter(id => id !== participantId) : [...prev, participantId]
    );
  };

  const toggleElement = (id: string) => {
    setSelectedElementIds(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const saveBooking = async () => {
    try {
      setSaving(true);
      setError(null);
      let travelerIds = [...selectedTravelerIds];

      if (newTravelerName.trim()) {
        const created = await tripApi.createParticipant(tripId, { displayName: newTravelerName.trim() });
        travelerIds.push(created.id);
        onParticipantsChanged([...participants, created]);
      }

      if (travelerIds.length === 0) {
        setError('Select or add at least one traveler');
        return;
      }
      if (selectedElementIds.length === 0) {
        setError('Select at least one element this booking covers');
        return;
      }

      await tripApi.createBooking(tripId, {
        confirmationNumber: confirmationNumber.trim() || undefined,
        advertisedPriceCash: parseNumberInput(advertisedPriceCash),
        advertisedPricePoints: parseNumberInput(advertisedPricePoints),
        loyaltyProgram: loyaltyProgram.trim() || undefined,
        notes: notes.trim() || undefined,
        elementIds: selectedElementIds,
        travelerIds,
      });

      setConfirmationNumber('');
      setAdvertisedPriceCash('');
      setAdvertisedPricePoints('');
      setLoyaltyProgram('');
      setNotes('');
      setSelectedTravelerIds([]);
      setNewTravelerName('');
      setSelectedElementIds([elementId]);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save booking');
    } finally {
      setSaving(false);
    }
  };

  const otherElements = elements.filter(e => e.id !== elementId && e.elementType === 'flight');

  return (
    <div className="booking-card-section">
      <div className="booking-card-header">
        <h4>Bookings</h4>
        <button type="button" onClick={() => setShowForm(prev => !prev)}>
          {showForm ? 'Cancel' : '+ Add Booking'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {showForm && (
        <div className="booking-form">
          <div className="create-element-field">
            <label htmlFor={`booking-conf-${elementId}`}>Confirmation number</label>
            <input id={`booking-conf-${elementId}`} type="text" value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} />
          </div>
          <div className="create-element-field">
            <label htmlFor={`booking-price-cash-${elementId}`}>Advertised price per person (cash)</label>
            <input id={`booking-price-cash-${elementId}`} type="number" step="0.01" value={advertisedPriceCash} onChange={(e) => setAdvertisedPriceCash(e.target.value)} />
          </div>
          <div className="create-element-field">
            <label htmlFor={`booking-price-points-${elementId}`}>Advertised price per person (points)</label>
            <input id={`booking-price-points-${elementId}`} type="number" step="1" value={advertisedPricePoints} onChange={(e) => setAdvertisedPricePoints(e.target.value)} />
          </div>
          <div className="create-element-field">
            <label htmlFor={`booking-loyalty-${elementId}`}>Loyalty program</label>
            <input id={`booking-loyalty-${elementId}`} type="text" value={loyaltyProgram} onChange={(e) => setLoyaltyProgram(e.target.value)} />
          </div>
          <div className="create-element-field">
            <label htmlFor={`booking-notes-${elementId}`}>Notes</label>
            <input id={`booking-notes-${elementId}`} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <fieldset>
            <legend>Travelers on this booking</legend>
            {participants.map(p => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={selectedTravelerIds.includes(p.id)}
                  onChange={() => toggleTraveler(p.id)}
                />
                {p.displayName}
              </label>
            ))}
            <div className="create-element-field">
              <label htmlFor={`booking-new-traveler-${elementId}`}>+ New traveler</label>
              <input
                id={`booking-new-traveler-${elementId}`}
                type="text"
                value={newTravelerName}
                onChange={(e) => setNewTravelerName(e.target.value)}
                placeholder="Name of traveler not yet on the trip"
              />
            </div>
          </fieldset>

          {otherElements.length > 0 && (
            <fieldset>
              <legend>Also applies to</legend>
              {otherElements.map(el => (
                <label key={el.id}>
                  <input
                    type="checkbox"
                    checked={selectedElementIds.includes(el.id)}
                    onChange={() => toggleElement(el.id)}
                  />
                  {el.name}
                </label>
              ))}
            </fieldset>
          )}

          <button type="button" onClick={saveBooking} disabled={saving}>
            {saving ? 'Saving...' : 'Save Booking'}
          </button>
        </div>
      )}

      {bookings.length === 0 && !showForm && <p className="no-elements">No bookings yet for this element</p>}

      {bookings.map(booking => {
        const travelerNames = booking.travelerIds
          .map(id => participants.find(p => p.id === id)?.displayName || id)
          .join(', ');
        const otherLinkedElements = booking.elementIds
          .filter(id => id !== elementId)
          .map(id => elements.find(e => e.id === id))
          .filter((e): e is TripElement => !!e);
        const actualPerPerson = booking.travelerIds.length > 0
          ? booking.actualTotalCash / booking.travelerIds.length
          : booking.actualTotalCash;

        return (
          <div key={booking.id} className="element-card">
            <div className="element-header">
              <h3>{booking.currentConfirmationNumber || 'No confirmation number'}</h3>
            </div>
            <p>Travelers: {travelerNames}</p>
            {booking.advertisedPriceCash !== null && (
              <p>Advertised: ${booking.advertisedPriceCash.toFixed(2)} / person</p>
            )}
            <p>Actual total: ${booking.actualTotalCash.toFixed(2)} (${actualPerPerson.toFixed(2)} / person)</p>
            {otherLinkedElements.length > 0 && (
              <p>Also covers: {otherLinkedElements.map(e => e.name).join(', ')}</p>
            )}
            <BookingTransactionList tripId={tripId} bookingId={booking.id} onChanged={load} />
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/__tests__/BookingCard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BookingCard.tsx client/src/__tests__/BookingCard.test.tsx
git commit -m "feat(client): add BookingCard with inline new-traveler and multi-element linking"
```


---

## Task 15: Wire participants, bookings, and seat grid into `TripDetailPage.tsx`; auto-generate flight names; retire deprecated flat flight fields

This task modifies the existing monolithic `client/src/pages/TripDetailPage.tsx` (528 lines). Apply each edit below in order using the `edit` tool (`old_str`/`new_str`). Each `old_str` below is copied verbatim from the current file so it will match exactly.

**Files:**
- Modify: `client/src/pages/TripDetailPage.tsx`
- Test: `client/src/__tests__/TripDetailPage.test.tsx` (extend existing file)

- [ ] **Step 1: Update imports and add new state (imports, remove `newFlightConfirmationNumber`, add `nameManuallyEdited` and `participants`)**

```typescript
// old_str
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Trip, TripElement } from '../types/trip';
import { tripApi } from '../api/tripApi';
import '../styles/trips.css';
```

```typescript
// new_str
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Trip, TripElement, TripParticipant } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { TripParticipantsPanel } from '../components/TripParticipantsPanel';
import { BookingCard } from '../components/BookingCard';
import { FlightSeatGrid } from '../components/FlightSeatGrid';
import '../styles/trips.css';
```

- [ ] **Step 2: Remove the deprecated `newFlightConfirmationNumber` state, add `nameManuallyEdited` and `participants` state**

```typescript
// old_str
  const [newFlightNumber, setNewFlightNumber] = useState('');
  const [newFlightConfirmationNumber, setNewFlightConfirmationNumber] = useState('');
  const [newFlightDepartureAirport, setNewFlightDepartureAirport] = useState('');
```

```typescript
// new_str
  const [newFlightNumber, setNewFlightNumber] = useState('');
  const [newFlightDepartureAirport, setNewFlightDepartureAirport] = useState('');
```

```typescript
// old_str
  const [flightAutofillStatus, setFlightAutofillStatus] = useState('');
  const [flightAutofillLoading, setFlightAutofillLoading] = useState(false);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
```

```typescript
// new_str
  const [flightAutofillStatus, setFlightAutofillStatus] = useState('');
  const [flightAutofillLoading, setFlightAutofillLoading] = useState(false);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
```

- [ ] **Step 3: Load participants alongside trip and elements**

```typescript
// old_str
      const [tripData, elementsData] = await Promise.all([
        tripApi.getTrip(id),
        tripApi.listElements(id),
      ]);
      setTrip(tripData);
      setElements(elementsData);
```

```typescript
// new_str
      const [tripData, elementsData, participantsData] = await Promise.all([
        tripApi.getTrip(id),
        tripApi.listElements(id),
        tripApi.listParticipants(id),
      ]);
      setTrip(tripData);
      setElements(elementsData);
      setParticipants(participantsData);
```

- [ ] **Step 4: Auto-generate the flight name from departure/arrival airports until the user edits it manually**

Add this `useEffect` immediately after the `useEffect` that calls `loadTripData` (i.e. after its closing `}, [tripId]);`):

```typescript
  useEffect(() => {
    if (newElementType !== 'flight' || nameManuallyEdited) return;
    const dep = newFlightDepartureAirport.trim();
    const arr = newFlightArrivalAirport.trim();
    if (dep && arr) {
      setNewElementName(`${dep} \u2192 ${arr}`);
    }
  }, [newElementType, newFlightDepartureAirport, newFlightArrivalAirport, nameManuallyEdited]);
```

- [ ] **Step 5: Stop sending the deprecated leg-level confirmation number when creating a flight element**

```typescript
// old_str
              airline: newFlightAirlineCode.trim().toUpperCase() || undefined,
              flightNumber: newFlightNumber.trim() || undefined,
              confirmationNumber: newFlightConfirmationNumber.trim() || undefined,
            },
          ],
        };
```

```typescript
// new_str
              airline: newFlightAirlineCode.trim().toUpperCase() || undefined,
              flightNumber: newFlightNumber.trim() || undefined,
            },
          ],
        };
```

- [ ] **Step 6: Reset `nameManuallyEdited` (instead of the removed confirmation-number state) after saving**

```typescript
// old_str
      setNewFlightNumber('');
      setNewFlightConfirmationNumber('');
      setNewFlightDepartureAirport('');
```

```typescript
// new_str
      setNewFlightNumber('');
      setNewFlightDepartureAirport('');
```

```typescript
// old_str
      setFlightAutofillStatus('');
      setNewElementType('flight');
      setShowAddElementForm(false);
```

```typescript
// new_str
      setFlightAutofillStatus('');
      setNameManuallyEdited(false);
      setNewElementType('flight');
      setShowAddElementForm(false);
```

- [ ] **Step 7: Hide the generic booking-reference / price fields for flight elements (they are now tracked per-booking) and mark the name manually edited when the user types it**

```typescript
// old_str
          <div className="create-element-field">
            <label htmlFor="element-name">Name</label>
            <input
              id="element-name"
              type="text"
              value={newElementName}
              onChange={(e) => setNewElementName(e.target.value)}
              placeholder="e.g. Southwest Flight 1234"
            />
          </div>
          <div className="create-element-field">
            <label htmlFor="element-notes">Notes</label>
            <input
              id="element-notes"
              type="text"
              value={newElementNotes}
              onChange={(e) => setNewElementNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="create-element-field">
            <label htmlFor="element-booking-reference">Booking or itinerary reference</label>
            <input
              id="element-booking-reference"
              type="text"
              value={newBookingReference}
              onChange={(e) => setNewBookingReference(e.target.value)}
              placeholder="e.g. Expedia itinerary # 12345"
            />
          </div>
          <div className="create-element-field">
            <label htmlFor="element-price-cash">Price cash</label>
            <input
              id="element-price-cash"
              type="number"
              min="0"
              step="0.01"
              value={newPriceCash}
              onChange={(e) => setNewPriceCash(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="create-element-field">
            <label htmlFor="element-price-points">Price points</label>
            <input
              id="element-price-points"
              type="number"
              min="0"
              step="1"
              value={newPricePoints}
              onChange={(e) => setNewPricePoints(e.target.value)}
              placeholder="Optional"
            />
          </div>
```

```typescript
// new_str
          <div className="create-element-field">
            <label htmlFor="element-name">Name</label>
            <input
              id="element-name"
              type="text"
              value={newElementName}
              onChange={(e) => {
                setNewElementName(e.target.value);
                setNameManuallyEdited(true);
              }}
              placeholder="e.g. Southwest Flight 1234"
            />
          </div>
          <div className="create-element-field">
            <label htmlFor="element-notes">Notes</label>
            <input
              id="element-notes"
              type="text"
              value={newElementNotes}
              onChange={(e) => setNewElementNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {newElementType !== 'flight' && (
            <>
              <div className="create-element-field">
                <label htmlFor="element-booking-reference">Booking or itinerary reference</label>
                <input
                  id="element-booking-reference"
                  type="text"
                  value={newBookingReference}
                  onChange={(e) => setNewBookingReference(e.target.value)}
                  placeholder="e.g. Expedia itinerary # 12345"
                />
              </div>
              <div className="create-element-field">
                <label htmlFor="element-price-cash">Price cash</label>
                <input
                  id="element-price-cash"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPriceCash}
                  onChange={(e) => setNewPriceCash(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="create-element-field">
                <label htmlFor="element-price-points">Price points</label>
                <input
                  id="element-price-points"
                  type="number"
                  min="0"
                  step="1"
                  value={newPricePoints}
                  onChange={(e) => setNewPricePoints(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </>
          )}
```

Note: flight elements now get pricing and a booking reference exclusively through `BookingCard` (Task 14), created after the element itself. Non-flight element types (`hotel`, `car_rental`, `activity`) are unchanged for now — they are out of scope for this redesign and still use the flat `priceCash`/`pricePoints`/`bookingReference` fields.

- [ ] **Step 8: Remove the deprecated per-leg confirmation-number input from the flight-specific form fields**

```typescript
// old_str
              <div className="create-element-field">
                <button
                  className="view-toggle-btn"
                  type="button"
                  onClick={autoFillFlightDetails}
                  disabled={flightAutofillLoading}
                >
                  {flightAutofillLoading ? 'Looking up...' : 'Auto-fill flight details (POC)'}
                </button>
              </div>
              <div className="create-element-field">
                <label htmlFor="flight-confirmation-number">Confirmation number</label>
                <input
                  id="flight-confirmation-number"
                  type="text"
                  value={newFlightConfirmationNumber}
                  onChange={(e) => setNewFlightConfirmationNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              {(newFlightDepartureAirport || newFlightArrivalAirport || flightAutofillStatus) && (
```

```typescript
// new_str
              <div className="create-element-field">
                <button
                  className="view-toggle-btn"
                  type="button"
                  onClick={autoFillFlightDetails}
                  disabled={flightAutofillLoading}
                >
                  {flightAutofillLoading ? 'Looking up...' : 'Auto-fill flight details (POC)'}
                </button>
              </div>
              <p className="element-notes">
                Confirmation number, pricing, and travelers are entered per-booking below after saving this element.
              </p>
              {(newFlightDepartureAirport || newFlightArrivalAirport || flightAutofillStatus) && (
```

- [ ] **Step 9: Mount `TripParticipantsPanel` in the trip header, above the elements section**

```typescript
// old_str
        <button
          className="create-trip-btn"
          onClick={() => setShowAddElementForm(prev => !prev)}
          type="button"
        >
          {showAddElementForm ? 'Cancel' : 'Add Element'}
        </button>
      </div>

      {showAddElementForm && (
```

```typescript
// new_str
        <button
          className="create-trip-btn"
          onClick={() => setShowAddElementForm(prev => !prev)}
          type="button"
        >
          {showAddElementForm ? 'Cancel' : 'Add Element'}
        </button>
      </div>

      {tripId && (
        <TripParticipantsPanel
          tripId={tripId}
          onParticipantsChanged={setParticipants}
        />
      )}

      {showAddElementForm && (
```

- [ ] **Step 10: Replace the flat booking-reference badge, flight leg confirmation display, and flat pricing display with `BookingCard` + `FlightSeatGrid` for flight elements**

```typescript
// old_str
                {items.map(item => (
                  <div key={item.id} className="element-card">
                    <div className="element-header">
                      <h3>{item.name}</h3>
                      {item.bookingReference && (
                        <span className="booking-ref">{item.bookingReference}</span>
                      )}
                    </div>
                    {item.elementType === 'flight' && item.legs?.[0] && (
                      <div className="element-flight-meta">
                        {displayDateOnly(item.legs[0].departureDatetime) && (
                          <span>Date: {displayDateOnly(item.legs[0].departureDatetime)}</span>
                        )}
                        {item.legs[0].flightNumber && <span>Flight: {item.legs[0].flightNumber}</span>}
                        {item.legs[0].confirmationNumber && <span>Confirmation: {item.legs[0].confirmationNumber}</span>}
                      </div>
                    )}
                    {item.notes && <p className="element-notes">{item.notes}</p>}
                    <div className="element-pricing">
                      {item.priceCash !== undefined && item.priceCash !== null && (
                        <span className="price">${item.priceCash.toFixed(2)}</span>
                      )}
                      {item.pricePoints !== undefined && item.pricePoints !== null && (
                        <span className="points">{item.pricePoints} points</span>
                      )}
                    </div>
                    <button className="edit-link" type="button" onClick={() => startEditingElement(item)}>
                      View/Edit
                    </button>
```

```typescript
// new_str
                {items.map(item => (
                  <div key={item.id} className="element-card">
                    <div className="element-header">
                      <h3>{item.name}</h3>
                      {item.elementType !== 'flight' && item.bookingReference && (
                        <span className="booking-ref">{item.bookingReference}</span>
                      )}
                    </div>
                    {item.elementType === 'flight' && item.legs?.[0] && (
                      <div className="element-flight-meta">
                        {displayDateOnly(item.legs[0].departureDatetime) && (
                          <span>Date: {displayDateOnly(item.legs[0].departureDatetime)}</span>
                        )}
                        {item.legs[0].flightNumber && <span>Flight: {item.legs[0].flightNumber}</span>}
                      </div>
                    )}
                    {item.notes && <p className="element-notes">{item.notes}</p>}
                    {item.elementType !== 'flight' && (
                      <div className="element-pricing">
                        {item.priceCash !== undefined && item.priceCash !== null && (
                          <span className="price">${item.priceCash.toFixed(2)}</span>
                        )}
                        {item.pricePoints !== undefined && item.pricePoints !== null && (
                          <span className="points">{item.pricePoints} points</span>
                        )}
                      </div>
                    )}
                    {item.elementType === 'flight' && tripId && (
                      <>
                        {item.legs?.map(leg => (
                          <FlightSeatGrid key={leg.id} tripId={tripId} legId={leg.id} travelers={participants} />
                        ))}
                        <BookingCard
                          tripId={tripId}
                          elementId={item.id}
                          elements={elements}
                          participants={participants}
                          onParticipantsChanged={setParticipants}
                        />
                      </>
                    )}
                    <button className="edit-link" type="button" onClick={() => startEditingElement(item)}>
                      View/Edit
                    </button>
```

Note on the `FlightSeatGrid` traveler list: it is passed the full trip `participants` list rather than only the travelers on bookings linked to this specific element. This is a deliberate scope-limiting simplification for this plan — filtering seat assignment to only "travelers on a booking linked to this element" would require `TripDetailPage` to also fetch and track bookings per element (duplicating state `BookingCard` already owns internally). A future task can thread booking-derived traveler lists down if this proves confusing in practice.

- [ ] **Step 11: Run the existing frontend test suite and fix any breakage from removed fields/state**

Run: `cd client && npx vitest run src/__tests__/TripDetailPage.test.tsx`
Expected: Existing tests may reference the removed `flight-confirmation-number` field or `newFlightConfirmationNumber` behavior. Update any such assertions in `client/src/__tests__/TripDetailPage.test.tsx` to match the new form (no confirmation-number field in the add-element form; confirmation numbers are entered via `BookingCard`). Since `BookingCard`, `TripParticipantsPanel`, and `FlightSeatGrid` all call `tripApi` methods on mount, ensure the test's `tripApi` mock (`vi.mock('../api/tripApi', ...)`) includes mock implementations for `listParticipants`, `listBookings`, `listSeatsForLeg` returning empty arrays by default, or the existing tests will fail with "not a function" errors.

- [ ] **Step 12: Run the full client test suite**

Run: `cd client && npx vitest run`
Expected: All tests pass.

- [ ] **Step 13: Commit**

```bash
git add client/src/pages/TripDetailPage.tsx client/src/__tests__/TripDetailPage.test.tsx
git commit -m "feat(client): wire participants, bookings, and seat grid into TripDetailPage; auto-generate flight names"
```

---

## Task 16: Update `client/src/components/ComponentUsage.md`

**Files:**
- Modify: `client/src/components/ComponentUsage.md`

- [ ] **Step 1: Add entries for the 4 new components**

Open `client/src/components/ComponentUsage.md` and add a row/entry for each new component, following the file's existing format:

```markdown
- `TripParticipantsPanel` (`TripParticipantsPanel.tsx`) — used in `pages/TripDetailPage.tsx`. Lists/add/removes trip travelers (family members and outside guests). Exports `findOrCreateParticipant` helper used by `BookingCard` for inline traveler creation.
- `BookingCard` (`BookingCard.tsx`) — used in `pages/TripDetailPage.tsx` for each flight-type `TripElement`. Displays existing bookings (confirmation number, per-person advertised price, actual total from transactions, "Also covers" links to other linked elements) and a form to create a new booking with traveler multi-select, inline new-traveler creation, and multi-element linking. Renders `BookingTransactionList` per booking.
- `BookingTransactionList` (`BookingTransactionList.tsx`) — used inside `BookingCard`. Lists/add/removes transactions for a single booking with a running total; supports recording price-drop rebookings (negative amount + new confirmation number) and free-text fee/tax breakdown notes.
- `FlightSeatGrid` (`FlightSeatGrid.tsx`) — used in `pages/TripDetailPage.tsx`, once per flight leg. Inline-editable seat number per trip traveler.
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ComponentUsage.md
git commit -m "docs: document new booking/participant/seat components in ComponentUsage.md"
```

---

## Task 17: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: All tests pass, including the new `TripParticipantRepository`, `BookingRepository`, `BookingTransactionRepository`, and `FlightTravelerSeatRepository` suites, plus the existing `tripElementRepository`/`tripElementConfirmationRepository` suites (unaffected).

- [ ] **Step 2: Run the full client test suite**

Run: `cd client && npx vitest run`
Expected: All tests pass, including the new `TripParticipantsPanel`, `BookingCard`, `BookingTransactionList`, and `FlightSeatGrid` suites, plus the updated `TripDetailPage.test.tsx`.

- [ ] **Step 3: Type-check both projects**

Run: `npx tsc -p client/tsconfig.json --noEmit`
Expected: No errors.

Run: `npx tsc -p server/tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 4: Manually smoke-test against a fresh SQLite file (not `:memory:`)**

Run: `cd server && rm -f data/dev-smoke-test.sqlite && DB_PATH=data/dev-smoke-test.sqlite npm run dev`
In a second terminal, exercise the new endpoints end-to-end with curl (create a trip, create a flight element, create two participants, create a booking linking both, add a transaction, assign a seat) to confirm `SCHEMAS.trips` creates all 5 new tables correctly on a brand-new file (not just `:memory:` test runs). Then stop the server and delete the smoke-test file:

```bash
rm -f server/data/dev-smoke-test.sqlite
```

- [ ] **Step 5: Run the existing migration against a copy of a pre-redesign database file to confirm the `.cjs` migration applies cleanly**

If a pre-existing dev database file is available, copy it, run `node server/migrations/run-migrations.cjs up` against the copy, and confirm it reports the `20260901_add_bookings_and_participants` migration as applied with no errors. If no such file exists, skip this step — Task 1's `SCHEMAS.trips` update already covers fresh installs, and Task 2's migration was already exercised in Task 2's own steps.

- [ ] **Step 6: Final commit (if any fixups were needed in Steps 1-5)**

```bash
git add -A
git commit -m "chore: final verification fixes for flight bookings redesign"
```

