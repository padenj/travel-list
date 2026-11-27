# Price Entry & Payment Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user type one total price (cash and/or points) plus a "pay at" choice for stays and flights, record payment methods by nickname on transactions, edit transactions, and optionally record the first payment while creating a booking.

**Architecture:** Dues stay stored as facts (`due_at_booking_cash/points`, `due_later_cash/notes`) plus a new `bookings.pay_at` column; the total is derived and never stored. A new family-scoped `payment_methods` table is referenced from `booking_transactions.payment_method_id`. The client converts a `PriceEntryValue` (total + pay-at + other amount) to and from the dues with pure helpers in `client/src/utils/priceEntry.ts`. `firstTransaction` on create is written in the same DB transaction as the booking.

**Tech Stack:** Express + sqlite (`sqlite`/`sqlite3`), TypeScript, React 18 + Mantine 8, Vitest + Testing Library + supertest.

**Spec:** `docs/superpowers/specs/2026-11-27-price-entry-and-payment-methods-design.md` — read it first.

---

## Ground rules (read before Task 1)

- Branch `add-hotel-lodging-tracking`, worktree `/config/.paseo/worktrees/0zd8zt0o/large-falcon`. Run every command from the worktree root.
- **Never** touch `/config/localData/travel-list/data/` (the real DB). If `server/migrations/migrations.json` gets modified by a run, revert it with `git checkout server/migrations/migrations.json`.
- Repo is ESM (`"type": "module"`): migration files must be `.cjs`.
- Type checks:
  - Server must be clean: `npx tsc -p tsconfig.build.json --noEmit`
  - Client has a **93-error baseline**: `npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` must print `93` or less. Never add new errors.
- Tests: `npx vitest run <paths>`. **New client test files must be added to the `include` whitelist in `vitest.config.ts`** (server tests under `server/**` are globbed automatically).
- No jest-dom: use `toBeTruthy()` / `toBeNull()` / `.value`.
- Mantine `Select` options: open with `fireEvent.click(input)` then `fireEvent.click(screen.getByRole('option', { name: '…' }))`.
- Big form tests (the lodging form) are slow: pass a timeout of `30000` as the third arg of `it(...)`.
- Every commit message ends with a blank line and `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.
- Doc maps to keep current: `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`, `docs/ServerAPIUsage.md` (Task 18).

## File map

**Server — create**
- `server/migrations/migrations/20261127_01_payment_methods.cjs` — payment_methods table + `booking_transactions.payment_method_id`.
- `server/repositories/paymentMethodRepository.ts` — CRUD, nickname rules, usage counts.
- `server/routes/paymentMethodRoutes.ts` — `/api/payment-methods` router.
- `server/services/bookingService.ts` — `createBookingWithFirstPayment` (booking + optional first transaction, atomic).
- `server/utils/firstTransaction.ts` — validate a `firstTransaction` body and derive its amounts.
- Tests: `server/__tests__/payment-methods-migration.test.ts`, `server/__tests__/paymentMethods.routes.test.ts`, `server/__tests__/priceEntry.routes.test.ts`.

**Server — modify**
- `server/db.ts` — fresh schema: `bookings.pay_at`, `payment_methods`, `booking_transactions.payment_method_id`, index.
- `server/migrations/migrations/20261124_01_lodging.cjs` — add `pay_at` to `BOOKING_COLUMNS`.
- `server/repositories/bookingRepository.ts` — `payAt` field.
- `server/repositories/bookingTransactionRepository.ts` — `paymentMethodId`, joined `paymentMethodNickname`.
- `server/utils/lodgingValidation.ts` — `payAt` check in `validateBookingFields`.
- `server/services/stayService.ts` — `firstTransaction` on `createStay`.
- `server/routes/tripRoutes.ts` — transactions accept/validate `paymentMethodId`; `firstTransaction` on hotel element POST and bookings POST.
- `server/routes.ts` — mount `paymentMethodRouter`.

**Client — create**
- `client/src/api/paymentMethodApi.ts`
- `client/src/utils/priceEntry.ts` — `PriceEntryValue`, `toDues`, `fromDues`, `validatePriceEntry`, `dueSummary`, `todayLocal`.
- `client/src/components/PriceEntry.tsx` — "What you'll pay" fields.
- `client/src/components/PaymentMethodSelect.tsx` — select with inline "+ New payment method…".
- `client/src/components/FirstPaymentFields.tsx` — "Also record payment" checkbox + date + method.
- `client/src/components/SettingsPaymentMethods.tsx` — Settings page.
- Tests: `client/src/__tests__/priceEntry.test.ts`, `PriceEntry.test.tsx`, `PaymentMethodSelect.test.tsx`, `SettingsPaymentMethods.test.tsx`, `FirstPaymentFields.test.tsx`.

**Client — modify**
- `client/src/types/trip.ts` — `PayAt`, `payAt`, `PaymentMethod`, transaction `paymentMethodId/Nickname`, `FirstTransactionPayload`.
- `client/src/components/BookingTransactionList.tsx` — method column, edit.
- `client/src/utils/stayDraft.ts`, `client/src/components/LodgingStayForm.tsx`, `client/src/components/LodgingDetailsTab.tsx`, `client/src/components/AddLodgingDialog.tsx`.
- `client/src/components/BookingForm.tsx`, `client/src/components/BookingBlock.tsx`, `client/src/utils/bookingSummary.ts`, `client/src/utils/flightRows.ts`.
- `client/src/AppRoutes.tsx`, `client/src/components/SplitRailLayout.tsx`.
- `vitest.config.ts` — whitelist new client tests.
- Existing tests to update: `lodgingDrafts.test.ts`, `AddLodgingDialog.test.tsx`, `LodgingDetailsTab.test.tsx`, `BookingCard.test.tsx`, `bookingSummary.test.ts`, `flightRows.test.ts`, `BookingTransactionList.test.tsx`.

---

## Phase 1 — Payment methods (server)

### Task 1: Schema — `pay_at`, `payment_methods`, `payment_method_id`

**Files:**
- Modify: `server/migrations/migrations/20261124_01_lodging.cjs` (the `BOOKING_COLUMNS` array, lines 9–22)
- Modify: `server/db.ts` (`SCHEMAS.trips`: `bookings` table ~line 355, `booking_transactions` ~line 396, indexes ~line 514)
- Create: `server/migrations/migrations/20261127_01_payment_methods.cjs`
- Create: `server/__tests__/payment-methods-migration.test.ts`
- Modify: `server/__tests__/lodging-migration.test.ts` (one new assertion)

- [ ] **Step 1: Write the failing migration test**

Create `server/__tests__/payment-methods-migration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import migration from '../migrations/migrations/20261127_01_payment_methods.cjs';

async function baseDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE families (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, trip_id TEXT);
    CREATE TABLE booking_transactions (
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
    INSERT INTO families VALUES ('f1', 'Fam');
    INSERT INTO bookings VALUES ('b1', 't1');
    INSERT INTO booking_transactions (id, booking_id, amount_cash, transaction_date) VALUES ('x1', 'b1', 10, '2027-01-01');
  `);
  return db;
}

const cols = async (db: Database, table: string) =>
  (await db.all(`PRAGMA table_info(${table})`)).map((c: { name: string }) => c.name);

describe('20261127_01_payment_methods migration', () => {
  let db: Database;
  beforeEach(async () => { db = await baseDb(); });

  it('creates payment_methods and links transactions', async () => {
    await migration.up({ db });
    expect(await cols(db, 'payment_methods')).toEqual(['id', 'family_id', 'nickname', 'archived_at', 'created_at', 'updated_at']);
    expect(await cols(db, 'booking_transactions')).toContain('payment_method_id');
    await db.run(`INSERT INTO payment_methods (id, family_id, nickname) VALUES ('pm1', 'f1', 'Visa')`);
    await db.run(`UPDATE booking_transactions SET payment_method_id = 'pm1' WHERE id = 'x1'`);
    await expect(db.run(`UPDATE booking_transactions SET payment_method_id = 'nope' WHERE id = 'x1'`)).rejects.toThrow(/FOREIGN KEY/);
  });

  it('is idempotent', async () => {
    await migration.up({ db });
    await migration.up({ db });
    expect(await cols(db, 'booking_transactions')).toContain('payment_method_id');
  });

  it('down removes the column (keeping rows) and the table', async () => {
    await migration.up({ db });
    await migration.down({ db });
    expect(await cols(db, 'booking_transactions')).not.toContain('payment_method_id');
    expect((await db.get(`SELECT amount_cash FROM booking_transactions WHERE id = 'x1'`)).amount_cash).toBe(10);
    expect(await db.get(`SELECT name FROM sqlite_master WHERE name = 'payment_methods'`)).toBeUndefined();
    const fks = await db.all(`PRAGMA foreign_key_list(booking_transactions)`);
    expect(fks.map((f: { table: string }) => f.table)).toEqual(['bookings']);
  });
});
```

In `server/__tests__/lodging-migration.test.ts`, inside the existing `it('adds generic booking columns', …)` test, add after the existing column assertions:

```ts
    expect(await cols(db, 'bookings')).toContain('pay_at');
    await db.run(`INSERT INTO bookings (id, trip_id) VALUES ('bx', 't1')`);
    expect((await db.get(`SELECT pay_at FROM bookings WHERE id = 'bx'`)).pay_at).toBe('booking');
    await expect(db.run(`UPDATE bookings SET pay_at = 'later' WHERE id = 'bx'`)).rejects.toThrow(/CHECK/);
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/__tests__/payment-methods-migration.test.ts server/__tests__/lodging-migration.test.ts`
Expected: FAIL — cannot find `20261127_01_payment_methods.cjs`; lodging test fails on `pay_at`.

- [ ] **Step 3: Add `pay_at` to the lodging migration**

In `server/migrations/migrations/20261124_01_lodging.cjs`, add one entry at the end of `BOOKING_COLUMNS` (the `down` loop already drops every column in this list; SQLite allows dropping a column whose CHECK is a column constraint):

```js
  ['cancellation_policy', 'TEXT'],
  ['pay_at', "TEXT NOT NULL DEFAULT 'booking' CHECK (pay_at IN ('booking','checkin'))"],
];
```

- [ ] **Step 4: Create the payment methods migration**

Create `server/migrations/migrations/20261127_01_payment_methods.cjs`:

```js
/*
  Migration: payment methods. See docs/superpowers/specs/2026-11-27-price-entry-and-payment-methods-design.md.
  Idempotent: fresh databases already get this schema from server/db.ts.
*/
'use strict';

const columns = async (db, table) => (await db.all(`PRAGMA table_info(${table})`)).map(c => c.name);

async function up({ db }) {
  await db.exec('BEGIN');
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        archived_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_payment_methods_family ON payment_methods(family_id);
    `);
    if (!(await columns(db, 'booking_transactions')).includes('payment_method_id')) {
      await db.exec('ALTER TABLE booking_transactions ADD COLUMN payment_method_id TEXT REFERENCES payment_methods(id)');
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

// SQLite cannot DROP a column that is part of a foreign key, so rebuild booking_transactions.
async function down({ db }) {
  await db.exec('PRAGMA foreign_keys = OFF');
  await db.exec('BEGIN');
  try {
    if ((await columns(db, 'booking_transactions')).includes('payment_method_id')) {
      await db.exec(`
        CREATE TABLE booking_transactions_new (
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
        INSERT INTO booking_transactions_new (id, booking_id, amount_cash, amount_points, transaction_date, confirmation_number, notes, created_at)
          SELECT id, booking_id, amount_cash, amount_points, transaction_date, confirmation_number, notes, created_at FROM booking_transactions;
        DROP TABLE booking_transactions;
        ALTER TABLE booking_transactions_new RENAME TO booking_transactions;
        CREATE INDEX IF NOT EXISTS idx_booking_transactions_booking ON booking_transactions(booking_id);
      `);
    }
    await db.exec('DROP INDEX IF EXISTS idx_payment_methods_family');
    await db.exec('DROP TABLE IF EXISTS payment_methods');
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON');
  }
}

module.exports = { up, down };
```

Before writing the rebuild SQL, open `server/db.ts` and compare the `booking_transactions` CREATE statement (~line 396) with the `booking_transactions_new` columns above. If `db.ts` has any column not listed here (other than `payment_method_id`), add it to both the CREATE and the INSERT…SELECT.

- [ ] **Step 5: Update the fresh schema in `server/db.ts`**

In the `bookings` CREATE TABLE (inside `SCHEMAS.trips`), add after `cancellation_policy TEXT,`:

```sql
      pay_at TEXT NOT NULL DEFAULT 'booking' CHECK (pay_at IN ('booking','checkin')),
```

Directly **before** `CREATE TABLE IF NOT EXISTS booking_transactions`, add:

```sql
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );
```

In the `booking_transactions` CREATE TABLE, add a column before `created_at` and a foreign key after the existing `FOREIGN KEY (booking_id) …` line (remember the comma on the previous line):

```sql
      payment_method_id TEXT,
      ...
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
```

Next to `CREATE INDEX IF NOT EXISTS idx_booking_transactions_booking …` (~line 517), add:

```sql
    CREATE INDEX IF NOT EXISTS idx_payment_methods_family ON payment_methods(family_id);
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run server/__tests__/payment-methods-migration.test.ts server/__tests__/lodging-migration.test.ts`
Expected: PASS.

Then run the whole server suite once to confirm the fresh schema still builds: `npx vitest run server` → all pass.

- [ ] **Step 7: Commit**

```bash
git add server/migrations/migrations/20261127_01_payment_methods.cjs server/migrations/migrations/20261124_01_lodging.cjs server/db.ts server/__tests__/payment-methods-migration.test.ts server/__tests__/lodging-migration.test.ts
git commit -m "feat(db): add payment_methods, transaction payment method and bookings.pay_at

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Payment method repository + routes

**Files:**
- Create: `server/repositories/paymentMethodRepository.ts`
- Create: `server/routes/paymentMethodRoutes.ts`
- Modify: `server/routes.ts` (~line 2136, next to `router.use('/trips', tripRouter)`; add an import next to line 18)
- Create: `server/__tests__/paymentMethods.routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `server/__tests__/paymentMethods.routes.test.ts`. Copy the `beforeEach` auth line from `server/__tests__/lodging.routes.test.ts` (line 28) exactly — it builds `Bearer <token>` from the dad row via `generateToken`.

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { seedFamilyTrip as SeedFamilyTrip } from '../test-utils/destinationFixtures';

describe('payment method routes', () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof SeedFamilyTrip>>;
  let auth: string;
  let closeDb: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    const { default: routes } = await import('../routes');
    const { generateToken } = await import('../auth');
    const { seedFamilyTrip } = await import('../test-utils/destinationFixtures');
    ({ closeDb } = await import('../db'));
    app = express();
    app.use(express.json());
    app.use('/api', routes);
    seed = await seedFamilyTrip();
    const dadRow = await seed.db.get(`SELECT * FROM users WHERE id = ?`, [seed.dad]);
    auth = `Bearer ${generateToken(dadRow)}`;
  });

  afterEach(async () => { await closeDb(); });

  const pm = {
    list: (q = '') => request(app).get(`/api/payment-methods${q}`).set('Authorization', auth),
    create: (body: unknown) => request(app).post('/api/payment-methods').set('Authorization', auth).send(body as object),
    update: (id: string, body: unknown) => request(app).patch(`/api/payment-methods/${id}`).set('Authorization', auth).send(body as object),
    remove: (id: string) => request(app).delete(`/api/payment-methods/${id}`).set('Authorization', auth),
  };

  it('creates, lists sorted, and trims nicknames', async () => {
    const b = await pm.create({ nickname: '  Visa - 1234 ' });
    expect(b.status).toBe(201);
    expect(b.body).toMatchObject({ nickname: 'Visa - 1234', archived: false, transactionCount: 0 });
    await pm.create({ nickname: 'Amex - 9' });
    const list = await pm.list();
    expect(list.body.map((m: { nickname: string }) => m.nickname)).toEqual(['Amex - 9', 'Visa - 1234']);
  });

  it('rejects blank, long and duplicate (case-insensitive) nicknames', async () => {
    expect((await pm.create({ nickname: '  ' })).status).toBe(400);
    expect((await pm.create({ nickname: 'x'.repeat(61) })).status).toBe(400);
    await pm.create({ nickname: 'Visa' });
    const dup = await pm.create({ nickname: 'VISA' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('A payment method with that nickname already exists');
  });

  it('archives, hides archived by default, and allows reusing an archived nickname', async () => {
    const id = (await pm.create({ nickname: 'Visa' })).body.id;
    const archived = await pm.update(id, { archived: true });
    expect(archived.body.archived).toBe(true);
    expect((await pm.list()).body).toEqual([]);
    const all = await pm.list('?includeArchived=1');
    expect(all.body).toHaveLength(1);
    expect((await pm.create({ nickname: 'visa' })).status).toBe(201);
    expect((await pm.update(id, { archived: false })).status).toBe(409);
  });

  it('renames', async () => {
    const id = (await pm.create({ nickname: 'Visa' })).body.id;
    const res = await pm.update(id, { nickname: 'Visa - 4242' });
    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe('Visa - 4242');
  });

  it('deletes unused methods and refuses used ones', async () => {
    const unused = (await pm.create({ nickname: 'Old' })).body.id;
    expect((await pm.remove(unused)).status).toBe(204);

    const used = (await pm.create({ nickname: 'Visa' })).body.id;
    const tripId = seed.tripId;
    const flight = await request(app).post(`/api/trips/${tripId}/elements`).set('Authorization', auth).send({
      elementType: 'flight', name: 'F',
      typeSpecificData: { legs: [{ departureAirport: 'SEA', arrivalAirport: 'SJD', departureDatetime: '2027-01-01T08:00:00Z', arrivalDatetime: '2027-01-01T12:00:00Z' }] },
    });
    const p = await request(app).post(`/api/trips/${tripId}/participants`).set('Authorization', auth).send({ displayName: 'Dad' });
    const booking = await request(app).post(`/api/trips/${tripId}/bookings`).set('Authorization', auth)
      .send({ elementIds: [flight.body.id], travelerIds: [p.body.id] });
    await request(app).post(`/api/trips/${tripId}/bookings/${booking.body.id}/transactions`).set('Authorization', auth)
      .send({ amountCash: 10, transactionDate: '2027-01-01', paymentMethodId: used });

    expect((await pm.list()).body[0].transactionCount).toBe(1);
    const res = await pm.remove(used);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Payment method is used by 1 transaction. Archive it instead.');
  });

  it('cannot see or change another family\'s methods', async () => {
    const otherFamily = 'other-fam';
    await seed.db.run(`INSERT INTO families (id, name) VALUES (?, 'Other')`, [otherFamily]);
    await seed.db.run(`INSERT INTO payment_methods (id, family_id, nickname) VALUES ('pm-x', ?, 'Theirs')`, [otherFamily]);
    expect((await pm.list()).body).toEqual([]);
    expect((await pm.update('pm-x', { nickname: 'Mine' })).status).toBe(404);
    expect((await pm.remove('pm-x')).status).toBe(404);
  });

  it('requires auth', async () => {
    expect((await request(app).get('/api/payment-methods')).status).toBe(401);
  });
});
```

(The "deletes … refuses used ones" test depends on Task 3 for `paymentMethodId` on transactions. It's fine for that one test to keep failing until Task 3 is done; all others must pass at the end of this task.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/__tests__/paymentMethods.routes.test.ts`
Expected: FAIL — 404s, because the routes don't exist.

- [ ] **Step 3: Write the repository**

Create `server/repositories/paymentMethodRepository.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface PaymentMethod {
  id: string;
  nickname: string;
  archived: boolean;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export class PaymentMethodError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message);
    this.name = 'PaymentMethodError';
  }
}

const SELECT = `
  SELECT pm.id, pm.nickname, pm.archived_at as archivedAt, pm.created_at as createdAt, pm.updated_at as updatedAt,
         (SELECT COUNT(*) FROM booking_transactions t WHERE t.payment_method_id = pm.id) as transactionCount
  FROM payment_methods pm`;

function hydrate(row: any): PaymentMethod {
  return {
    id: row.id, nickname: row.nickname, archived: row.archivedAt != null,
    transactionCount: Number(row.transactionCount ?? 0), createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export function normalizeNickname(value: unknown): string {
  const nickname = typeof value === 'string' ? value.trim() : '';
  if (nickname.length < 1 || nickname.length > 60) throw new PaymentMethodError('Nickname must be 1–60 characters', 400);
  return nickname;
}

export class PaymentMethodRepository {
  private db = getDb();

  async list(familyId: string, includeArchived = false): Promise<PaymentMethod[]> {
    const db = await this.db;
    const rows = await db.all(
      `${SELECT} WHERE pm.family_id = ? ${includeArchived ? '' : 'AND pm.archived_at IS NULL'}
       ORDER BY (pm.archived_at IS NOT NULL), lower(pm.nickname)`,
      [familyId]
    );
    return rows.map(hydrate);
  }

  async getById(familyId: string, id: string): Promise<PaymentMethod | null> {
    const db = await this.db;
    const row = await db.get(`${SELECT} WHERE pm.family_id = ? AND pm.id = ?`, [familyId, id]);
    return row ? hydrate(row) : null;
  }

  async create(familyId: string, rawNickname: unknown): Promise<PaymentMethod> {
    const nickname = normalizeNickname(rawNickname);
    await this.assertUnique(familyId, nickname, null);
    const id = uuidv4();
    const db = await this.db;
    await db.run(`INSERT INTO payment_methods (id, family_id, nickname) VALUES (?, ?, ?)`, [id, familyId, nickname]);
    return (await this.getById(familyId, id))!;
  }

  async update(familyId: string, id: string, updates: { nickname?: unknown; archived?: unknown }): Promise<PaymentMethod> {
    const existing = await this.getById(familyId, id);
    if (!existing) throw new PaymentMethodError('Payment method not found', 404);
    const nickname = updates.nickname !== undefined ? normalizeNickname(updates.nickname) : existing.nickname;
    const archived = updates.archived !== undefined ? Boolean(updates.archived) : existing.archived;
    if (!archived) await this.assertUnique(familyId, nickname, id);
    const db = await this.db;
    await db.run(
      `UPDATE payment_methods
       SET nickname = ?, archived_at = CASE WHEN ? THEN COALESCE(archived_at, datetime('now')) ELSE NULL END,
           updated_at = datetime('now')
       WHERE id = ? AND family_id = ?`,
      [nickname, archived ? 1 : 0, id, familyId]
    );
    return (await this.getById(familyId, id))!;
  }

  async remove(familyId: string, id: string): Promise<void> {
    const existing = await this.getById(familyId, id);
    if (!existing) throw new PaymentMethodError('Payment method not found', 404);
    if (existing.transactionCount > 0) {
      const n = existing.transactionCount;
      throw new PaymentMethodError(`Payment method is used by ${n} transaction${n === 1 ? '' : 's'}. Archive it instead.`, 409);
    }
    const db = await this.db;
    await db.run(`DELETE FROM payment_methods WHERE id = ? AND family_id = ?`, [id, familyId]);
  }

  private async assertUnique(familyId: string, nickname: string, exceptId: string | null): Promise<void> {
    const db = await this.db;
    const clash = await db.get(
      `SELECT id FROM payment_methods
       WHERE family_id = ? AND archived_at IS NULL AND lower(nickname) = lower(?) AND id != ?`,
      [familyId, nickname, exceptId ?? '']
    );
    if (clash) throw new PaymentMethodError('A payment method with that nickname already exists', 409);
  }
}
```

- [ ] **Step 4: Write the router**

Create `server/routes/paymentMethodRoutes.ts`:

```ts
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware';
import { PaymentMethodError, PaymentMethodRepository } from '../repositories/paymentMethodRepository';

export const paymentMethodRouter = Router();
const repo = new PaymentMethodRepository();

function familyOf(req: Request, res: Response): string | null {
  const familyId = req.user?.familyId;
  if (!familyId) {
    res.status(403).json({ error: 'Payment methods belong to a family' });
    return null;
  }
  return familyId;
}

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof PaymentMethodError) return res.status(error.status).json({ error: error.message });
  return res.status(500).json({ error: fallback });
}

paymentMethodRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  const familyId = familyOf(req, res);
  if (!familyId) return;
  try {
    const includeArchived = req.query.includeArchived === '1' || req.query.includeArchived === 'true';
    res.json(await repo.list(familyId, includeArchived));
  } catch (error) {
    sendError(res, error, 'Failed to list payment methods');
  }
});

paymentMethodRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  const familyId = familyOf(req, res);
  if (!familyId) return;
  try {
    res.status(201).json(await repo.create(familyId, req.body?.nickname));
  } catch (error) {
    sendError(res, error, 'Failed to create payment method');
  }
});

paymentMethodRouter.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const familyId = familyOf(req, res);
  if (!familyId) return;
  try {
    const { nickname, archived } = req.body ?? {};
    res.json(await repo.update(familyId, req.params.id, { nickname, archived }));
  } catch (error) {
    sendError(res, error, 'Failed to update payment method');
  }
});

paymentMethodRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const familyId = familyOf(req, res);
  if (!familyId) return;
  try {
    await repo.remove(familyId, req.params.id);
    res.status(204).send();
  } catch (error) {
    sendError(res, error, 'Failed to delete payment method');
  }
});
```

If `req.user` is not typed on `Request` in this file (tsc error), use `(req as any).user?.familyId` — `server/routes.ts` already uses `req.user` on plain `Request`, so it should type-check.

- [ ] **Step 5: Mount the router**

In `server/routes.ts` add the import next to `import { tripRouter } from './routes/tripRoutes';`:

```ts
import { paymentMethodRouter } from './routes/paymentMethodRoutes';
```

and next to `router.use('/trips', tripRouter);`:

```ts
router.use('/payment-methods', paymentMethodRouter);
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run server/__tests__/paymentMethods.routes.test.ts`
Expected: all PASS except "deletes unused methods and refuses used ones" (needs Task 3).

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc -p tsconfig.build.json --noEmit` → no output.

```bash
git add server/repositories/paymentMethodRepository.ts server/routes/paymentMethodRoutes.ts server/routes.ts server/__tests__/paymentMethods.routes.test.ts
git commit -m "feat(api): family payment methods CRUD

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Payment method on transactions (server)

**Files:**
- Modify: `server/repositories/bookingTransactionRepository.ts`
- Modify: `server/routes/tripRoutes.ts` (transactions routes ~lines 770–839; imports at top)
- Modify: `server/__tests__/paymentMethods.routes.test.ts` (add tests)

- [ ] **Step 1: Add failing tests**

Append inside the `describe` in `server/__tests__/paymentMethods.routes.test.ts`:

```ts
  async function flightBooking() {
    const tripId = seed.tripId;
    const flight = await request(app).post(`/api/trips/${tripId}/elements`).set('Authorization', auth).send({
      elementType: 'flight', name: 'F',
      typeSpecificData: { legs: [{ departureAirport: 'SEA', arrivalAirport: 'SJD', departureDatetime: '2027-01-01T08:00:00Z', arrivalDatetime: '2027-01-01T12:00:00Z' }] },
    });
    const p = await request(app).post(`/api/trips/${tripId}/participants`).set('Authorization', auth).send({ displayName: 'Dad' });
    const booking = await request(app).post(`/api/trips/${tripId}/bookings`).set('Authorization', auth)
      .send({ elementIds: [flight.body.id], travelerIds: [p.body.id] });
    return booking.body.id as string;
  }
  const txns = (bookingId: string) => `/api/trips/${seed.tripId}/bookings/${bookingId}/transactions`;

  it('records, returns and edits the payment method on transactions', async () => {
    const visa = (await pm.create({ nickname: 'Visa - 1234' })).body.id;
    const amex = (await pm.create({ nickname: 'Amex' })).body.id;
    const bookingId = await flightBooking();
    const created = await request(app).post(txns(bookingId)).set('Authorization', auth)
      .send({ amountCash: 50, transactionDate: '2027-01-01', paymentMethodId: visa });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ paymentMethodId: visa, paymentMethodNickname: 'Visa - 1234' });

    const edited = await request(app).patch(`${txns(bookingId)}/${created.body.id}`).set('Authorization', auth)
      .send({ amountCash: 55, notes: 'fixed', paymentMethodId: amex });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ amountCash: 55, notes: 'fixed', paymentMethodId: amex, paymentMethodNickname: 'Amex' });

    const cleared = await request(app).patch(`${txns(bookingId)}/${created.body.id}`).set('Authorization', auth).send({ paymentMethodId: null });
    expect(cleared.body).toMatchObject({ paymentMethodId: null, paymentMethodNickname: null });

    const list = await request(app).get(txns(bookingId)).set('Authorization', auth);
    expect(list.body[0]).toHaveProperty('paymentMethodNickname', null);
  });

  it('rejects unknown, foreign and newly-chosen archived methods; keeps an unchanged archived one', async () => {
    const bookingId = await flightBooking();
    const bad = await request(app).post(txns(bookingId)).set('Authorization', auth)
      .send({ amountCash: 5, paymentMethodId: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Unknown payment method');

    await seed.db.run(`INSERT INTO families (id, name) VALUES ('fam-2', 'Other')`);
    await seed.db.run(`INSERT INTO payment_methods (id, family_id, nickname) VALUES ('pm-foreign', 'fam-2', 'Theirs')`);
    expect((await request(app).post(txns(bookingId)).set('Authorization', auth)
      .send({ amountCash: 5, paymentMethodId: 'pm-foreign' })).status).toBe(400);

    const visa = (await pm.create({ nickname: 'Visa' })).body.id;
    const t = (await request(app).post(txns(bookingId)).set('Authorization', auth)
      .send({ amountCash: 5, paymentMethodId: visa })).body.id;
    await pm.update(visa, { archived: true });
    const archivedNew = await request(app).post(txns(bookingId)).set('Authorization', auth).send({ amountCash: 5, paymentMethodId: visa });
    expect(archivedNew.status).toBe(400);
    expect(archivedNew.body.error).toBe('Payment method is archived');
    const keep = await request(app).patch(`${txns(bookingId)}/${t}`).set('Authorization', auth)
      .send({ notes: 'still visa', paymentMethodId: visa });
    expect(keep.status).toBe(200);
  });

  it('PATCH ignores unknown keys', async () => {
    const bookingId = await flightBooking();
    const t = (await request(app).post(txns(bookingId)).set('Authorization', auth).send({ amountCash: 5 })).body.id;
    const res = await request(app).patch(`${txns(bookingId)}/${t}`).set('Authorization', auth).send({ bookingId: 'x', notes: 'n' });
    expect(res.status).toBe(200);
    expect(res.body.bookingId).toBe(bookingId);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/__tests__/paymentMethods.routes.test.ts`
Expected: FAIL — `paymentMethodId` missing from responses, no 400 for unknown method.

- [ ] **Step 3: Update the transaction repository**

In `server/repositories/bookingTransactionRepository.ts`:

1. Add to the `BookingTransaction` interface (after `notes`):

```ts
  paymentMethodId: string | null;
  paymentMethodNickname: string | null;
```

2. Add to `AddTransactionInput`:

```ts
  paymentMethodId?: string | null;
```

3. Add a shared SELECT at module level (after `todayIsoDate`) and use it in **both** `getTransactionsForBooking` and `getTransactionById`:

```ts
const TXN_SELECT = `
  SELECT t.id, t.booking_id as bookingId, t.amount_cash as amountCash, t.amount_points as amountPoints,
         t.transaction_date as transactionDate, t.confirmation_number as confirmationNumber, t.notes,
         t.payment_method_id as paymentMethodId, pm.nickname as paymentMethodNickname, t.created_at as createdAt
  FROM booking_transactions t
  LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id`;
```

```ts
  async getTransactionsForBooking(bookingId: string): Promise<BookingTransaction[]> {
    const db = await this.db;
    const rows = await db.all(
      `${TXN_SELECT} WHERE t.booking_id = ? ORDER BY t.transaction_date ASC, t.created_at ASC`,
      [bookingId]
    );
    return rows as BookingTransaction[];
  }
```

```ts
  private async getTransactionById(id: string): Promise<BookingTransaction | null> {
    const db = await this.db;
    const row = await db.get(`${TXN_SELECT} WHERE t.id = ?`, [id]);
    return (row as BookingTransaction) || null;
  }
```

Make `getTransactionById` **public** (remove `private`) — routes use it in this task.

4. In `addTransaction`, include the column:

```ts
    await db.run(
      `INSERT INTO booking_transactions (id, booking_id, amount_cash, amount_points, transaction_date, confirmation_number, notes, payment_method_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, bookingId, amountCash, amountPoints, input.transactionDate || todayIsoDate(),
       input.confirmationNumber || null, input.notes || null, input.paymentMethodId || null]
    );
```

5. In `updateTransaction`, add `paymentMethodId?: string | null;` to the `updates` parameter type and `paymentMethodId: 'payment_method_id',` to `fieldMap`.

- [ ] **Step 4: Validate and pass `paymentMethodId` in the routes**

In `server/routes/tripRoutes.ts`:

1. Import and instantiate (next to the other repositories near the top):

```ts
import { PaymentMethodRepository } from '../repositories/paymentMethodRepository';
```
```ts
const paymentMethodRepository = new PaymentMethodRepository();
```

2. Add a helper above the `// ===== Booking transactions =====` comment:

```ts
// Returns an error message, or null when `value` is acceptable for this trip's family.
// An archived method is only accepted when it is the transaction's current method (`current`).
async function paymentMethodError(familyId: string, value: unknown, current: string | null = null): Promise<string | null> {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'Unknown payment method';
  const method = await paymentMethodRepository.getById(familyId, value);
  if (!method) return 'Unknown payment method';
  if (method.archived && value !== current) return 'Payment method is archived';
  return null;
}

const TRANSACTION_UPDATE_KEYS = ['amountCash', 'amountPoints', 'transactionDate', 'confirmationNumber', 'notes', 'paymentMethodId'] as const;
```

3. In the POST transactions route, replace the destructuring + `addTransaction` call with:

```ts
    const { amountCash, amountPoints, transactionDate, confirmationNumber, notes, paymentMethodId } = req.body;
    const methodError = await paymentMethodError(req.trip!.family_id, paymentMethodId);
    if (methodError) return res.status(400).json({ error: methodError });
    const transaction = await bookingTransactionRepository.addTransaction(req.params.bookingId, {
      amountCash,
      amountPoints,
      transactionDate,
      confirmationNumber,
      notes,
      paymentMethodId,
    });
```

4. In the PATCH transactions route, replace the `transactions.some(...)` check + `updateTransaction(req.params.id, req.body)` with:

```ts
    const existing = await bookingTransactionRepository.getTransactionById(req.params.id);
    if (!existing || existing.bookingId !== req.params.bookingId) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const methodError = await paymentMethodError(req.trip!.family_id, req.body.paymentMethodId, existing.paymentMethodId);
    if (methodError) return res.status(400).json({ error: methodError });
    const updates: Record<string, unknown> = {};
    for (const key of TRANSACTION_UPDATE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) updates[key] = req.body[key];
    }
    const updated = await bookingTransactionRepository.updateTransaction(req.params.id, updates);
    res.json(updated);
```

`req.trip` is set by `tripAccessMiddleware`; check its type in `server/middleware/tripAccessMiddleware.ts`. If `family_id` is not on the type, use `(req.trip as any).family_id`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/__tests__/paymentMethods.routes.test.ts server/__tests__/lodging.routes.test.ts`
Expected: all PASS (including the "refuses used ones" test from Task 2).

Also search for other server tests that call the transactions endpoints and run them: `grep -rl "transactions" server/__tests__` → run those files too; all pass.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc -p tsconfig.build.json --noEmit` → clean.

```bash
git add server/repositories/bookingTransactionRepository.ts server/routes/tripRoutes.ts server/__tests__/paymentMethods.routes.test.ts
git commit -m "feat(api): payment method on booking transactions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---
## Phase 3 (server part) — `payAt`, and Phase 4 (server part) — `firstTransaction`

### Task 4: `payAt` on bookings (server)

**Files:**
- Modify: `server/utils/lodgingValidation.ts` (`validateBookingFields`, line ~81)
- Modify: `server/repositories/bookingRepository.ts` (`BOOKING_SELECT` ~line 30, `Booking` ~63, `CreateBookingInput` ~93, `UpdateBookingInput` ~123, `createBooking` ~163, `updateBooking` ~299, `hydrate` return ~389, `BOOKING_INPUT_KEYS` ~404)
- Create: `server/__tests__/priceEntry.routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/priceEntry.routes.test.ts` (copy the auth line from `lodging.routes.test.ts` line 28 if it differs):

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { seedFamilyTrip as SeedFamilyTrip } from '../test-utils/destinationFixtures';

describe('price entry routes (payAt + firstTransaction)', () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof SeedFamilyTrip>>;
  let auth: string;
  let tripId: string;
  let closeDb: () => Promise<void>;

  beforeEach(async () => {
    vi.resetModules();
    const { default: routes } = await import('../routes');
    const { generateToken } = await import('../auth');
    const { seedFamilyTrip } = await import('../test-utils/destinationFixtures');
    ({ closeDb } = await import('../db'));
    app = express();
    app.use(express.json());
    app.use('/api', routes);
    seed = await seedFamilyTrip();
    tripId = seed.tripId;
    const dadRow = await seed.db.get(`SELECT * FROM users WHERE id = ?`, [seed.dad]);
    auth = `Bearer ${generateToken(dadRow)}`;
  });

  afterEach(async () => { await closeDb(); });

  const post = (path: string, body: unknown) => request(app).post(`/api/trips/${tripId}${path}`).set('Authorization', auth).send(body as object);
  const patch = (path: string, body: unknown) => request(app).patch(`/api/trips/${tripId}${path}`).set('Authorization', auth).send(body as object);
  const put = (path: string, body: unknown) => request(app).put(`/api/trips/${tripId}${path}`).set('Authorization', auth).send(body as object);
  const get = (path: string) => request(app).get(`/api/trips/${tripId}${path}`).set('Authorization', auth);

  const stayBody = (booking: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
    elementType: 'hotel', name: 'Casa',
    typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04' },
    booking, ...extra,
  });
  async function stayBooking(elementId: string) {
    const all = await get('/bookings');
    return all.body.find((b: { elementIds: string[] }) => b.elementIds.includes(elementId));
  }
  async function flightAndTraveler() {
    const flight = await post('/elements', {
      elementType: 'flight', name: 'F',
      typeSpecificData: { legs: [{ departureAirport: 'SEA', arrivalAirport: 'SJD', departureDatetime: '2027-01-01T08:00:00Z', arrivalDatetime: '2027-01-01T12:00:00Z' }] },
    });
    const p = await post('/participants', { displayName: 'Dad' });
    return { flightId: flight.body.id as string, travelerId: p.body.id as string };
  }

  describe('payAt', () => {
    it('defaults to booking and round-trips checkin on stays and flights', async () => {
      const stay = await post('/elements', stayBody({ dueLaterCash: 300 }));
      expect(stay.status).toBe(201);
      const sb = await stayBooking(stay.body.id);
      expect(sb.payAt).toBe('booking');
      const patched = await put(`/elements/${stay.body.id}`, { booking: { payAt: 'checkin' } });
      expect(patched.status).toBe(200);
      expect((await stayBooking(stay.body.id)).payAt).toBe('checkin');

      const { flightId, travelerId } = await flightAndTraveler();
      const fb = await post('/bookings', { elementIds: [flightId], travelerIds: [travelerId], payAt: 'checkin', dueLaterCash: 70 });
      expect(fb.status).toBe(201);
      expect(fb.body.payAt).toBe('checkin');
      const fp = await patch(`/bookings/${fb.body.id}`, { payAt: 'booking' });
      expect(fp.body.payAt).toBe('booking');
    });

    it('rejects unknown values', async () => {
      const res = await post('/elements', stayBody({ payAt: 'later' }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Pay at must be 'booking' or 'checkin'");
      const { flightId, travelerId } = await flightAndTraveler();
      expect((await post('/bookings', { elementIds: [flightId], travelerIds: [travelerId], payAt: null })).status).toBe(400);
    });
  });
});
```

(Stays are updated with `PUT /elements/:elementId` and a `booking` body; flight bookings with `PATCH /bookings/:id`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/__tests__/priceEntry.routes.test.ts`
Expected: FAIL — `payAt` undefined; no 400 for `'later'`.

- [ ] **Step 3: Validate `payAt`**

In `server/utils/lodgingValidation.ts`, export a constant near the other constants and add a check inside `validateBookingFields`, before `if (d.refundability …`:

```ts
export const PAY_AT = ['booking', 'checkin'] as const;
```

```ts
  if (Object.prototype.hasOwnProperty.call(d, 'payAt') && !(PAY_AT as readonly unknown[]).includes(d.payAt)) {
    return "Pay at must be 'booking' or 'checkin'";
  }
```

`validateBookingFields` is already called by the hotel element POST (line ~255) and PUT (~319), and by bookings POST (~612) and PATCH (~668), so no route changes are needed.

- [ ] **Step 4: Store and return `payAt`**

In `server/repositories/bookingRepository.ts`:

1. Add `export type PayAt = 'booking' | 'checkin';` near the top type exports.
2. In `BOOKING_SELECT`, after `${p}cancellation_policy as cancellationPolicy,` add `${p}pay_at as payAt,`.
3. Add `payAt: PayAt;` to `Booking` (after `cancellationPolicy`), and `payAt?: PayAt;` to both `CreateBookingInput` and `UpdateBookingInput`.
4. In `createBooking`, add the column next to `advertised_includes_taxes`:

```ts
      const cols = ['id', 'trip_id', 'advertised_includes_taxes', 'pay_at', ...SCALAR_FIELDS.map(([, c]) => c)];
      const vals = [id, tripId, input.advertisedIncludesTaxes ? 1 : 0, input.payAt ?? 'booking',
        ...SCALAR_FIELDS.map(([k]) => fieldValue(k, (input as unknown as Record<string, unknown>)[k]))];
```

5. In `updateBooking`, after the `advertisedIncludesTaxes` line:

```ts
    if (updates.payAt !== undefined) dbUpdates.pay_at = updates.payAt;
```

6. In `hydrate`'s returned object, after `advertisedIncludesTaxes: …`:

```ts
      payAt: row.payAt === 'checkin' ? 'checkin' : 'booking',
```

7. Add `'payAt'` to `BOOKING_INPUT_KEYS` (after `'advertisedIncludesTaxes'`).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/__tests__/priceEntry.routes.test.ts server/__tests__/lodging.routes.test.ts`
Expected: PASS. If an existing `lodging.routes.test.ts` assertion uses `toEqual` on a whole booking and now fails only because of the extra `payAt: 'booking'`, add that property to the expected object.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc -p tsconfig.build.json --noEmit` → clean.

```bash
git add server/utils/lodgingValidation.ts server/repositories/bookingRepository.ts server/__tests__/priceEntry.routes.test.ts server/__tests__/lodging.routes.test.ts
git commit -m "feat(api): bookings.payAt (booking | checkin)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Atomic `firstTransaction` on create (server)

**Files:**
- Create: `server/utils/firstTransaction.ts`
- Create: `server/services/bookingService.ts`
- Modify: `server/services/stayService.ts`
- Modify: `server/routes/tripRoutes.ts` (hotel branch of POST `/:tripId/elements` ~line 249; POST `/:tripId/bookings` ~line 587)
- Modify: `server/__tests__/priceEntry.routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a second `describe` inside the outer `describe` of `server/__tests__/priceEntry.routes.test.ts`:

```ts
  describe('firstTransaction', () => {
    const today = '2027-01-01';

    it('creates a stay with its first transaction (cash + points due at booking)', async () => {
      const method = await request(app).post('/api/payment-methods').set('Authorization', auth).send({ nickname: 'Visa - 1234' });
      const res = await post('/elements', stayBody(
        { dueAtBookingCash: 1250, dueAtBookingPoints: 9000, dueLaterCash: 39.6 },
        { firstTransaction: { transactionDate: today, paymentMethodId: method.body.id } },
      ));
      expect(res.status).toBe(201);
      const b = await stayBooking(res.body.id);
      expect(b).toMatchObject({ actualTotalCash: 1250, actualTotalPoints: 9000 });
      const txns = await get(`/bookings/${b.id}/transactions`);
      expect(txns.body).toHaveLength(1);
      expect(txns.body[0]).toMatchObject({
        amountCash: 1250, amountPoints: 9000, transactionDate: today, paymentMethodNickname: 'Visa - 1234',
      });
    });

    it('creates a flight booking with its first transaction', async () => {
      const { flightId, travelerId } = await flightAndTraveler();
      const res = await post('/bookings', {
        elementIds: [flightId], travelerIds: [travelerId], dueAtBookingCash: 412.2,
        firstTransaction: { transactionDate: today },
      });
      expect(res.status).toBe(201);
      expect(res.body.actualTotalCash).toBe(412.2);
      const txns = await get(`/bookings/${res.body.id}/transactions`);
      expect(txns.body[0]).toMatchObject({ amountCash: 412.2, amountPoints: 0, paymentMethodId: null });
    });

    it('rejects when nothing is due at booking, bad dates and unknown methods — creating nothing', async () => {
      const nothing = await post('/elements', stayBody({ dueLaterCash: 300 }, { firstTransaction: { transactionDate: today } }));
      expect(nothing.status).toBe(400);
      expect(nothing.body.error).toBe('Nothing is due at booking');
      const badDate = await post('/elements', stayBody({ dueAtBookingCash: 10 }, { firstTransaction: { transactionDate: '01/01/2027' } }));
      expect(badDate.status).toBe(400);
      expect(badDate.body.error).toBe('Payment date must be YYYY-MM-DD');
      const badMethod = await post('/elements', stayBody({ dueAtBookingCash: 10 }, { firstTransaction: { transactionDate: today, paymentMethodId: 'nope' } }));
      expect(badMethod.status).toBe(400);
      expect(badMethod.body.error).toBe('Unknown payment method');
      expect((await get('/bookings')).body).toHaveLength(0);
    });

    it('rolls back the stay when the transaction insert fails', async () => {
      const { BookingTransactionRepository } = await import('../repositories/bookingTransactionRepository');
      const spy = vi.spyOn(BookingTransactionRepository.prototype, 'addTransaction').mockRejectedValueOnce(new Error('boom'));
      const res = await post('/elements', stayBody({ dueAtBookingCash: 10 }, { firstTransaction: { transactionDate: today } }));
      expect(res.status).toBe(500);
      spy.mockRestore();
      expect((await get('/bookings')).body).toHaveLength(0);
      const elements = await get('/elements');
      expect(elements.body.filter((e: { elementType: string }) => e.elementType === 'hotel')).toHaveLength(0);
    });

    it('ignores firstTransaction on updates', async () => {
      const stay = await post('/elements', stayBody({ dueAtBookingCash: 10 }));
      await put(`/elements/${stay.body.id}`, { booking: { dueAtBookingCash: 20 }, firstTransaction: { transactionDate: today } });
      const b = await stayBooking(stay.body.id);
      expect((await get(`/bookings/${b.id}/transactions`)).body).toHaveLength(0);
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/__tests__/priceEntry.routes.test.ts`
Expected: FAIL — no transaction created; no 400 for nothing-due.

- [ ] **Step 3: Write the parser**

Create `server/utils/firstTransaction.ts`:

```ts
export interface FirstTransaction {
  transactionDate: string;
  paymentMethodId: string | null;
  amountCash: number;
  amountPoints: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// `body` is the request's `firstTransaction`; `dues` is the booking body it belongs to.
// Returns { value: null } when no first transaction was requested.
export function parseFirstTransaction(
  body: unknown,
  dues: { dueAtBookingCash?: unknown; dueAtBookingPoints?: unknown },
): { value: FirstTransaction | null; error?: string } {
  if (body === undefined || body === null) return { value: null };
  if (typeof body !== 'object') return { value: null, error: 'firstTransaction must be an object' };
  const { transactionDate, paymentMethodId } = body as Record<string, unknown>;
  if (typeof transactionDate !== 'string' || !DATE_RE.test(transactionDate)) {
    return { value: null, error: 'Payment date must be YYYY-MM-DD' };
  }
  if (paymentMethodId !== undefined && paymentMethodId !== null && typeof paymentMethodId !== 'string') {
    return { value: null, error: 'Unknown payment method' };
  }
  const amountCash = typeof dues.dueAtBookingCash === 'number' ? dues.dueAtBookingCash : 0;
  const amountPoints = typeof dues.dueAtBookingPoints === 'number' ? dues.dueAtBookingPoints : 0;
  if (amountCash === 0 && amountPoints === 0) return { value: null, error: 'Nothing is due at booking' };
  return { value: { transactionDate, paymentMethodId: (paymentMethodId as string | null | undefined) ?? null, amountCash, amountPoints } };
}
```

- [ ] **Step 4: Write the booking service**

Create `server/services/bookingService.ts`:

```ts
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { Booking, BookingRepository, CreateBookingInput } from '../repositories/bookingRepository';
import { BookingTransactionRepository } from '../repositories/bookingTransactionRepository';
import { FirstTransaction } from '../utils/firstTransaction';

// Creates a booking and, optionally, its first payment in one DB transaction.
export class BookingService {
  private bookings = new BookingRepository();
  private transactions = new BookingTransactionRepository();

  async createBooking(tripId: string, input: CreateBookingInput, first: FirstTransaction | null = null): Promise<Booking> {
    const db = await getDb();
    const id = await withTransaction(db, async () => {
      const booking = await this.bookings.createBooking(tripId, input);
      if (first) {
        await this.transactions.addTransaction(booking.id, {
          amountCash: first.amountCash,
          amountPoints: first.amountPoints,
          transactionDate: first.transactionDate,
          paymentMethodId: first.paymentMethodId,
        });
      }
      return booking.id;
    });
    return (await this.bookings.getBookingById(id))!;
  }
}
```

- [ ] **Step 5: Use it from the stay service**

Replace `server/services/stayService.ts` `createStay` and the `StayInput` interface; add the service field and import:

```ts
import { BookingService } from './bookingService';
import { FirstTransaction } from '../utils/firstTransaction';

export interface StayInput {
  name?: string;
  notes?: string | null;
  typeSpecificData?: Record<string, unknown>;
  booking?: UpdateBookingInput;
  firstTransaction?: FirstTransaction | null;
}
```

```ts
  private bookingService = new BookingService();

  async createStay(tripId: string, input: StayInput): Promise<TripElement> {
    const db = await getDb();
    const id = await withTransaction(db, async () => {
      const element = await this.elements.createElement(tripId, {
        elementType: 'hotel', name: input.name, notes: input.notes ?? undefined, typeSpecificData: input.typeSpecificData,
      } as any);
      await this.bookingService.createBooking(
        tripId, { ...(input.booking ?? {}), elementIds: [element.id], travelerIds: [] } as any, input.firstTransaction ?? null,
      );
      return element.id;
    });
    return (await this.elements.getElementById(id))!;
  }
```

(`updateStay` is unchanged — and it destructures only `booking`, so add `firstTransaction` to the destructure to keep it out of `elementUpdates`: `const { booking, firstTransaction: _ignored, ...elementUpdates } = input;`.)

- [ ] **Step 6: Wire the routes**

In `server/routes/tripRoutes.ts`:

1. Imports + instance (near the other services):

```ts
import { BookingService } from '../services/bookingService';
import { parseFirstTransaction } from '../utils/firstTransaction';
```
```ts
const bookingService = new BookingService();
```

2. Hotel branch of POST `/:tripId/elements` — after the `bookingError` check, replace the `createStay` call:

```ts
      const first = parseFirstTransaction(req.body.firstTransaction, req.body.booking ?? {});
      if (first.error) return res.status(400).json({ error: first.error });
      if (first.value) {
        const methodError = await paymentMethodError(req.trip!.family_id, first.value.paymentMethodId);
        if (methodError) return res.status(400).json({ error: methodError });
      }
      const stay = await stayService.createStay(req.trip!.id, {
        name, notes, typeSpecificData, booking: pickBookingInput(req.body.booking ?? {}), firstTransaction: first.value,
      });
```

`paymentMethodError` is defined lower in the file (Task 3) as a function declaration, so it is hoisted — no need to move it.

3. POST `/:tripId/bookings` — after the `fieldsError` check, replace the `bookingRepository.createBooking` call:

```ts
    const first = parseFirstTransaction(req.body.firstTransaction, req.body);
    if (first.error) return res.status(400).json({ error: first.error });
    if (first.value) {
      const methodError = await paymentMethodError(req.trip!.family_id, first.value.paymentMethodId);
      if (methodError) return res.status(400).json({ error: methodError });
    }
    const booking = await bookingService.createBooking(req.trip!.id, {
      ...pickBookingInput(req.body), elementIds, travelerIds: travelerIds ?? [],
    } as any, first.value);
```

4. Hotel branch of PUT `/:tripId/elements/:elementId` (~line 322): `firstTransaction` must never reach the element update. Change

```ts
      const { booking: _ignored, ...elementUpdates } = req.body ?? {};
```
to
```ts
      const { booking: _ignored, firstTransaction: _notOnUpdate, ...elementUpdates } = req.body ?? {};
```

The bookings PATCH route only passes `pickBookingInput(...)`, which already ignores `firstTransaction`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run server/__tests__/priceEntry.routes.test.ts server/__tests__/lodging.routes.test.ts server/__tests__/paymentMethods.routes.test.ts`
Expected: PASS.

Then the whole server suite: `npx vitest run server` → PASS.

- [ ] **Step 8: Type-check and commit**

Run: `npx tsc -p tsconfig.build.json --noEmit` → clean.

```bash
git add server/utils/firstTransaction.ts server/services/bookingService.ts server/services/stayService.ts server/routes/tripRoutes.ts server/__tests__/priceEntry.routes.test.ts
git commit -m "feat(api): record the first payment atomically when creating a booking

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---
## Phase 1–2 (client) — payment methods UI and transaction editing

### Task 6: Client types, payment method API, price helpers

**Files:**
- Modify: `client/src/types/trip.ts` (`BookingMoneyFields` ~line 181, `CreateBookingPayload` ~214, `StayBookingPayload` ~225, `BookingTransaction` ~227, `AddBookingTransactionPayload` ~238)
- Modify: `client/src/api/tripApi.ts` (`TripElementWritePayload`, top of file)
- Create: `client/src/api/paymentMethodApi.ts`
- Create: `client/src/utils/dues.ts`
- Create: `client/src/utils/priceEntry.ts`
- Create: `client/src/__tests__/priceEntry.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Types**

In `client/src/types/trip.ts`:

```ts
export type PayAt = 'booking' | 'checkin';
```
(put it directly above `BookingMoneyFields`), then add `payAt?: PayAt;` as the last field of `BookingMoneyFields`.

Add after `BookingTransaction`'s `notes` field:

```ts
  paymentMethodId?: string | null;
  paymentMethodNickname?: string | null;
```

Replace `AddBookingTransactionPayload` with:

```ts
export interface AddBookingTransactionPayload {
  amountCash?: number;
  amountPoints?: number;
  transactionDate?: string;
  confirmationNumber?: string | null;
  notes?: string | null;
  paymentMethodId?: string | null;
}

export interface FirstTransactionPayload {
  transactionDate: string;
  paymentMethodId?: string | null;
}

export interface PaymentMethod {
  id: string;
  nickname: string;
  archived: boolean;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}
```

Add `firstTransaction?: FirstTransactionPayload;` to `CreateBookingPayload`, and change `StayBookingPayload` to:

```ts
export type StayBookingPayload = Omit<CreateBookingPayload, 'elementIds' | 'travelerIds' | 'firstTransaction'>;
```

In `client/src/api/tripApi.ts`, add `FirstTransactionPayload` to the type import list and extend `TripElementWritePayload`:

```ts
export type TripElementWritePayload = Omit<Partial<TripElement>, 'notes'> & {
  notes?: string | null;
  typeSpecificData?: Record<string, unknown>;
  booking?: StayBookingPayload;
  firstTransaction?: FirstTransactionPayload;
};
```

- [ ] **Step 2: Payment method API**

Create `client/src/api/paymentMethodApi.ts`:

```ts
import { PaymentMethod } from '../types/trip';
import { getAuthToken } from '../api';

const API_BASE = '/api/payment-methods';

function headers(json = false): Record<string, string> {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `API Error: ${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const paymentMethodApi = {
  list: async (includeArchived = false): Promise<PaymentMethod[]> =>
    handle(await fetch(`${API_BASE}${includeArchived ? '?includeArchived=1' : ''}`, { headers: headers() })),

  create: async (nickname: string): Promise<PaymentMethod> =>
    handle(await fetch(API_BASE, { method: 'POST', headers: headers(true), body: JSON.stringify({ nickname }) })),

  update: async (id: string, updates: { nickname?: string; archived?: boolean }): Promise<PaymentMethod> =>
    handle(await fetch(`${API_BASE}/${id}`, { method: 'PATCH', headers: headers(true), body: JSON.stringify(updates) })),

  remove: async (id: string): Promise<void> =>
    handle(await fetch(`${API_BASE}/${id}`, { method: 'DELETE', headers: headers() })),
};
```

- [ ] **Step 3: Write the failing helper tests**

Create `client/src/__tests__/priceEntry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  emptyPriceEntry, toDues, fromDues, validatePriceEntry, duesLine, hasDueAtBooking, dueAtBookingLabel,
  todayLocal, emptyFirstPayment, firstTransactionPayload, PriceEntryValue,
} from '../utils/priceEntry';
import { dueTotals } from '../utils/dues';

const entry = (extra: Partial<PriceEntryValue>): PriceEntryValue => ({ ...emptyPriceEntry(), ...extra });

describe('toDues', () => {
  it('pay at booking: the other amount is due at check-in', () => {
    expect(toDues(entry({ totalCash: '1612.40', otherCash: '182.40', notes: ' Resort fee ' }))).toEqual({
      dueAtBookingCash: 1430, dueAtBookingPoints: null, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee', payAt: 'booking',
    });
  });

  it('pay at check-in: the other amount is a deposit due at booking', () => {
    expect(toDues(entry({ totalCash: '500', otherCash: '100', payAt: 'checkin' }))).toMatchObject({
      dueAtBookingCash: 100, dueLaterCash: 400, payAt: 'checkin',
    });
    expect(toDues(entry({ totalCash: '500', payAt: 'checkin' }))).toMatchObject({ dueAtBookingCash: null, dueLaterCash: 500 });
  });

  it('points are always due at booking; blank cash stays null', () => {
    expect(toDues(entry({ totalPoints: '9000', payAt: 'checkin' }))).toEqual({
      dueAtBookingCash: null, dueAtBookingPoints: 9000, dueLaterCash: null, dueLaterNotes: null, payAt: 'checkin',
    });
  });

  it('rounds to cents and drops a zero other amount', () => {
    expect(toDues(entry({ totalCash: '100.10', otherCash: '0.30' }))).toMatchObject({ dueAtBookingCash: 99.8, dueLaterCash: 0.3 });
    expect(toDues(entry({ totalCash: '50', otherCash: '0' }))).toMatchObject({ dueAtBookingCash: 50, dueLaterCash: null });
  });
});

describe('fromDues', () => {
  it('rebuilds the entry (legacy rows default to pay at booking)', () => {
    expect(fromDues({ dueAtBookingCash: 1430, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee' })).toEqual({
      totalCash: '1612.4', totalPoints: '', payAt: 'booking', otherCash: '182.4', notes: 'Resort fee',
    });
    expect(fromDues({ dueAtBookingCash: 100, dueLaterCash: 400, payAt: 'checkin' })).toMatchObject({ totalCash: '500', otherCash: '100' });
    expect(fromDues({})).toEqual(emptyPriceEntry());
  });

  it('round-trips', () => {
    const v = entry({ totalCash: '1250', totalPoints: '9000', otherCash: '39.6', notes: 'Resort fee' });
    expect(fromDues(toDues(v))).toEqual(v);
  });
});

describe('validatePriceEntry', () => {
  it('accepts blank and valid values', () => {
    expect(validatePriceEntry(emptyPriceEntry())).toBeNull();
    expect(validatePriceEntry(entry({ totalCash: '10', otherCash: '10' }))).toBeNull();
  });
  it('rejects bad values', () => {
    expect(validatePriceEntry(entry({ totalCash: '-1' }))).toBe('Amounts must be 0 or more');
    expect(validatePriceEntry(entry({ otherCash: 'abc' }))).toBe('Amounts must be 0 or more');
    expect(validatePriceEntry(entry({ totalPoints: '1.5' }))).toBe('Points must be a whole number, 0 or more');
    expect(validatePriceEntry(entry({ otherCash: '5' }))).toBe('Enter the total price (cash) first');
    expect(validatePriceEntry(entry({ totalCash: '5', otherCash: '6' }))).toBe("Due at check-in can't be more than the total price");
    expect(validatePriceEntry(entry({ totalCash: '5', otherCash: '6', payAt: 'checkin' })))
      .toBe("Due at booking (deposit) can't be more than the total price");
  });
});

describe('summaries', () => {
  it('dueTotals is null until a due field is set', () => {
    expect(dueTotals({})).toBeNull();
    expect(dueTotals({ dueAtBookingCash: 0.1, dueLaterCash: 0.2, dueAtBookingPoints: 5 })).toEqual({ cash: 0.3, points: 5 });
  });

  it('duesLine', () => {
    const d = { dueAtBookingCash: 1250, dueAtBookingPoints: 9000, dueLaterCash: 39.6, dueLaterNotes: 'Resort fee' };
    expect(duesLine(d)).toBe('At booking 9,000 pts + $1,250.00 · At check-in $39.60 (Resort fee)');
    expect(duesLine(d, { withTotal: true })).toBe('Total 9,000 pts + $1,289.60 · At booking 9,000 pts + $1,250.00 · At check-in $39.60 (Resort fee)');
    expect(duesLine({})).toBe('');
  });

  it('hasDueAtBooking / dueAtBookingLabel', () => {
    expect(hasDueAtBooking(entry({ totalCash: '500', payAt: 'checkin' }))).toBe(false);
    expect(hasDueAtBooking(entry({ totalPoints: '9000', payAt: 'checkin' }))).toBe(true);
    expect(hasDueAtBooking(entry({ totalCash: '5', otherCash: '6' }))).toBe(false);
    expect(dueAtBookingLabel(entry({ totalCash: '1289.60', totalPoints: '9000', otherCash: '39.60' }))).toBe('9,000 pts + $1,250.00');
  });
});

describe('first payment', () => {
  it('todayLocal formats the local date', () => {
    expect(todayLocal(new Date(2027, 0, 5, 23, 30))).toBe('2027-01-05');
  });

  it('builds the payload only when enabled and something is due at booking', () => {
    const first = { ...emptyFirstPayment(new Date(2027, 0, 5)), paymentMethodId: 'pm1' };
    expect(first).toMatchObject({ enabled: true, transactionDate: '2027-01-05' });
    const due = entry({ totalCash: '100' });
    expect(firstTransactionPayload(first, due)).toEqual({ transactionDate: '2027-01-05', paymentMethodId: 'pm1' });
    expect(firstTransactionPayload({ ...first, enabled: false }, due)).toBeUndefined();
    expect(firstTransactionPayload(first, entry({ totalCash: '100', payAt: 'checkin' }))).toBeUndefined();
  });
});
```

Add to the `include` list in `vitest.config.ts` (next to the other `client/src/__tests__/...` entries):

```ts
      'client/src/__tests__/priceEntry.test.ts', // Total price + pay-at helpers
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run client/src/__tests__/priceEntry.test.ts`
Expected: FAIL — cannot resolve `../utils/priceEntry`.

- [ ] **Step 5: Write the helpers**

Create `client/src/utils/dues.ts`:

```ts
import { BookingMoneyFields } from '../types/trip';

type DueFields = Pick<BookingMoneyFields, 'dueAtBookingCash' | 'dueAtBookingPoints' | 'dueLaterCash'>;

// The booking's total price, derived from its dues. Null when no due field is set.
export function dueTotals(d: DueFields): { cash: number; points: number } | null {
  if (d.dueAtBookingCash == null && d.dueAtBookingPoints == null && d.dueLaterCash == null) return null;
  return {
    cash: Math.round(((d.dueAtBookingCash ?? 0) + (d.dueLaterCash ?? 0)) * 100) / 100,
    points: d.dueAtBookingPoints ?? 0,
  };
}
```

Create `client/src/utils/priceEntry.ts`:

```ts
import { BookingMoneyFields, FirstTransactionPayload, PayAt } from '../types/trip';
import { dueTotals } from './dues';
import { formatPrice } from './flightRows';
import { formatMoney } from './money';

// What the user types: a total, when most of it is paid, and the amount paid at the other time.
export interface PriceEntryValue {
  totalCash: string;
  totalPoints: string;
  payAt: PayAt;
  otherCash: string;
  notes: string;
}

export interface Dues {
  dueAtBookingCash: number | null;
  dueAtBookingPoints: number | null;
  dueLaterCash: number | null;
  dueLaterNotes: string | null;
  payAt: PayAt;
}

export const OTHER_AMOUNT_LABEL: Record<PayAt, string> = {
  booking: 'Due at check-in',
  checkin: 'Due at booking (deposit)',
};

export function emptyPriceEntry(): PriceEntryValue {
  return { totalCash: '', totalPoints: '', payAt: 'booking', otherCash: '', notes: '' };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (n: number | null | undefined) => (n == null ? '' : String(n));

function parse(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function toDues(v: PriceEntryValue): Dues {
  const total = parse(v.totalCash);
  const other = round2(parse(v.otherCash) ?? 0);
  let atBooking: number | null = null;
  let later: number | null = null;
  if (total != null) {
    const main = round2(total - other);
    if (v.payAt === 'booking') {
      atBooking = main;
      later = other || null;
    } else {
      atBooking = other || null;
      later = main;
    }
  }
  return {
    dueAtBookingCash: atBooking,
    dueAtBookingPoints: parse(v.totalPoints),
    dueLaterCash: later,
    dueLaterNotes: v.notes.trim() || null,
    payAt: v.payAt,
  };
}

export function fromDues(b: BookingMoneyFields): PriceEntryValue {
  const payAt = b.payAt ?? 'booking';
  const totals = dueTotals(b);
  const hasCash = b.dueAtBookingCash != null || b.dueLaterCash != null;
  return {
    totalCash: hasCash && totals ? String(totals.cash) : '',
    totalPoints: str(b.dueAtBookingPoints),
    payAt,
    otherCash: str(payAt === 'booking' ? b.dueLaterCash : b.dueAtBookingCash),
    notes: b.dueLaterNotes ?? '',
  };
}

export function validatePriceEntry(v: PriceEntryValue): string | null {
  for (const s of [v.totalCash, v.otherCash]) {
    if (s.trim()) {
      const n = Number(s);
      if (!Number.isFinite(n) || n < 0) return 'Amounts must be 0 or more';
    }
  }
  if (v.totalPoints.trim()) {
    const n = Number(v.totalPoints);
    if (!Number.isInteger(n) || n < 0) return 'Points must be a whole number, 0 or more';
  }
  const total = parse(v.totalCash);
  const other = parse(v.otherCash);
  if (other && total == null) return 'Enter the total price (cash) first';
  if (other != null && total != null && other > total) return `${OTHER_AMOUNT_LABEL[v.payAt]} can't be more than the total price`;
  return null;
}

type DueLineFields = Pick<BookingMoneyFields, 'dueAtBookingCash' | 'dueAtBookingPoints' | 'dueLaterCash' | 'dueLaterNotes'>;

// "Total … · At booking … · At check-in … (note)"; empty when no due field is set.
export function duesLine(d: DueLineFields, { withTotal = false }: { withTotal?: boolean } = {}): string {
  const totals = dueTotals(d);
  if (!totals) return '';
  const atBooking = formatPrice(d.dueAtBookingCash, d.dueAtBookingPoints);
  return [
    withTotal ? `Total ${formatPrice(totals.cash, totals.points) || formatMoney(0)}` : '',
    atBooking ? `At booking ${atBooking}` : '',
    d.dueLaterCash ? `At check-in ${formatMoney(d.dueLaterCash)}${d.dueLaterNotes ? ` (${d.dueLaterNotes})` : ''}` : '',
  ].filter(Boolean).join(' · ');
}

export function hasDueAtBooking(v: PriceEntryValue): boolean {
  if (validatePriceEntry(v)) return false;
  const d = toDues(v);
  return (d.dueAtBookingCash ?? 0) > 0 || (d.dueAtBookingPoints ?? 0) > 0;
}

export function dueAtBookingLabel(v: PriceEntryValue): string {
  const d = toDues(v);
  return formatPrice(d.dueAtBookingCash, d.dueAtBookingPoints);
}

export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "Also record payment" state used while creating a booking.
export interface FirstPaymentDraft {
  enabled: boolean;
  transactionDate: string;
  paymentMethodId: string | null;
}

export function emptyFirstPayment(now: Date = new Date()): FirstPaymentDraft {
  return { enabled: true, transactionDate: todayLocal(now), paymentMethodId: null };
}

export function firstTransactionPayload(first: FirstPaymentDraft, price: PriceEntryValue): FirstTransactionPayload | undefined {
  if (!first.enabled || !hasDueAtBooking(price)) return undefined;
  return { transactionDate: first.transactionDate || todayLocal(), paymentMethodId: first.paymentMethodId };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run client/src/__tests__/priceEntry.test.ts`
Expected: PASS.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` → `93` or less.

```bash
git add client/src/types/trip.ts client/src/api/tripApi.ts client/src/api/paymentMethodApi.ts client/src/utils/dues.ts client/src/utils/priceEntry.ts client/src/__tests__/priceEntry.test.ts vitest.config.ts
git commit -m "feat(client): payment method API, price entry helpers and types

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: `PaymentMethodSelect` component

**Files:**
- Create: `client/src/components/PaymentMethodSelect.tsx`
- Create: `client/src/__tests__/PaymentMethodSelect.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/PaymentMethodSelect.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

import { paymentMethodApi } from '../api/paymentMethodApi';
import { PaymentMethodSelect } from '../components/PaymentMethodSelect';

const method = (id: string, nickname: string, archived = false) =>
  ({ id, nickname, archived, transactionCount: 0, createdAt: '', updatedAt: '' });

describe('PaymentMethodSelect', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentMethodApi.list).mockResolvedValue([method('pm1', 'Visa - 1234'), method('pm2', 'Old Amex', true)]);
  });

  it('lists active methods and picks one', async () => {
    const onChange = vi.fn();
    renderWithMantine(<PaymentMethodSelect value={null} onChange={onChange} />);
    await waitFor(() => expect(paymentMethodApi.list).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByRole('textbox', { name: 'Payment method' }));
    expect(await screen.findByRole('option', { name: 'Visa - 1234' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /Old Amex/ })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'Visa - 1234' }));
    expect(onChange).toHaveBeenCalledWith('pm1');
  });

  it('shows the current archived method as (archived)', async () => {
    renderWithMantine(<PaymentMethodSelect value="pm2" onChange={() => {}} />);
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Payment method' }) as HTMLInputElement).value).toBe('Old Amex (archived)'));
  });

  it('adds a new method inline and selects it', async () => {
    vi.mocked(paymentMethodApi.create).mockResolvedValue(method('pm3', 'Southwest CC - 9876'));
    const onChange = vi.fn();
    renderWithMantine(<PaymentMethodSelect value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('textbox', { name: 'Payment method' }));
    fireEvent.click(await screen.findByRole('option', { name: '+ New payment method…' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('New payment method'), 'Southwest CC - 9876');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('pm3'));
    expect(paymentMethodApi.create).toHaveBeenCalledWith('Southwest CC - 9876');
    expect(screen.queryByLabelText('New payment method')).toBeNull();
  });

  it('shows create errors and can cancel', async () => {
    vi.mocked(paymentMethodApi.create).mockRejectedValue(new Error('A payment method with that nickname already exists'));
    renderWithMantine(<PaymentMethodSelect value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('textbox', { name: 'Payment method' }));
    fireEvent.click(await screen.findByRole('option', { name: '+ New payment method…' }));
    await userEvent.type(screen.getByLabelText('New payment method'), 'Visa - 1234');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('A payment method with that nickname already exists')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('New payment method')).toBeNull();
  });
});
```

Add to `vitest.config.ts` include:

```ts
      'client/src/__tests__/PaymentMethodSelect.test.tsx', // Payment method picker with inline add
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/PaymentMethodSelect.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `client/src/components/PaymentMethodSelect.tsx`:

```tsx
import { useEffect, useId, useState } from 'react';
import { Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { PaymentMethod } from '../types/trip';
import { paymentMethodApi } from '../api/paymentMethodApi';

const NEW_OPTION = '__new__';

interface PaymentMethodSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}

// Family payment methods by nickname, with a "+ New payment method…" option that adds one inline.
export function PaymentMethodSelect({ value, onChange, label = 'Payment method' }: PaymentMethodSelectProps) {
  const uid = useId();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [adding, setAdding] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    paymentMethodApi.list(true)
      .then(list => { if (alive) setMethods(list); })
      .catch(() => { if (alive) setMethods([]); });
    return () => { alive = false; };
  }, []);

  const data = [
    ...methods
      .filter(m => !m.archived || m.id === value)
      .map(m => ({ value: m.id, label: m.archived ? `${m.nickname} (archived)` : m.nickname })),
    { value: NEW_OPTION, label: '+ New payment method…' },
  ];

  const pick = (next: string | null) => {
    if (next === NEW_OPTION) {
      setAdding(true);
      setError(null);
      return;
    }
    onChange(next);
  };

  const add = async () => {
    try {
      setSaving(true);
      setError(null);
      const created = await paymentMethodApi.create(nickname);
      setMethods(prev => [...prev, created]);
      onChange(created.id);
      setAdding(false);
      setNickname('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment method');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setAdding(false);
    setNickname('');
    setError(null);
  };

  return (
    <Stack gap={4}>
      <Select id={`${uid}-select`} label={label} placeholder="Optional" data={data} value={value} onChange={pick} searchable clearable />
      {adding && (
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <TextInput
            id={`${uid}-new`}
            style={{ flex: 1 }}
            label="New payment method"
            placeholder="e.g. Southwest CC - 1234"
            description="A nickname only — never a full card number"
            value={nickname}
            onChange={e => setNickname(e.currentTarget.value)}
          />
          <Button size="xs" onClick={add} loading={saving} disabled={!nickname.trim()}>Add</Button>
          <Button size="xs" variant="default" onClick={cancel}>Cancel</Button>
        </Group>
      )}
      {error && <Text size="xs" c="red">{error}</Text>}
    </Stack>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run client/src/__tests__/PaymentMethodSelect.test.tsx`
Expected: PASS. If the `findByRole('option', …)` queries fail because the dropdown doesn't open on click, use `fireEvent.focus(input)` followed by `fireEvent.click(input)` (see `HourPicker.test.tsx` for the working pattern).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/PaymentMethodSelect.tsx client/src/__tests__/PaymentMethodSelect.test.tsx vitest.config.ts
git commit -m "feat(client): PaymentMethodSelect with inline add

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Settings → Payment methods page

**Files:**
- Create: `client/src/components/SettingsPaymentMethods.tsx`
- Create: `client/src/__tests__/SettingsPaymentMethods.test.tsx`
- Modify: `client/src/AppRoutes.tsx` (import ~line 11; route after `/settings/security` ~line 165)
- Modify: `client/src/components/SplitRailLayout.tsx` (icon import ~line 19–32; `settingsTabs` ~line 60; `getActiveSettingsTab` ~line 112)
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/SettingsPaymentMethods.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

import { paymentMethodApi } from '../api/paymentMethodApi';
import SettingsPaymentMethods from '../components/SettingsPaymentMethods';

const api = vi.mocked(paymentMethodApi);
const method = (id: string, nickname: string, extra: Partial<{ archived: boolean; transactionCount: number }> = {}) =>
  ({ id, nickname, archived: false, transactionCount: 0, createdAt: '', updatedAt: '', ...extra });

describe('SettingsPaymentMethods', () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue([
      method('pm1', 'Visa - 1234', { transactionCount: 2 }),
      method('pm2', 'Unused'),
      method('pm3', 'Old Amex', { archived: true, transactionCount: 1 }),
    ]);
  });

  it('lists methods with usage and archived state', async () => {
    renderWithMantine(<SettingsPaymentMethods />);
    expect(await screen.findByText('Visa - 1234')).toBeTruthy();
    expect(api.list).toHaveBeenCalledWith(true);
    expect(screen.getByText('2 transactions')).toBeTruthy();
    expect(screen.getByText('Archived')).toBeTruthy();
  });

  it('adds a method', async () => {
    api.create.mockResolvedValue(method('pm4', 'Southwest CC - 9876'));
    renderWithMantine(<SettingsPaymentMethods />);
    await screen.findByText('Visa - 1234');
    await userEvent.type(screen.getByLabelText('New payment method'), 'Southwest CC - 9876');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('Southwest CC - 9876'));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it('renames, archives, unarchives', async () => {
    api.update.mockResolvedValue(method('pm1', 'x'));
    renderWithMantine(<SettingsPaymentMethods />);
    await screen.findByText('Visa - 1234');
    await userEvent.click(screen.getByRole('button', { name: 'Rename Visa - 1234' }));
    const input = screen.getByLabelText('Nickname for Visa - 1234');
    await userEvent.clear(input);
    await userEvent.type(input, 'Visa - 4242');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('pm1', { nickname: 'Visa - 4242' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archive Visa - 1234' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('pm1', { archived: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Old Amex' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('pm3', { archived: false }));
  });

  it('only offers delete for unused methods, with confirmation', async () => {
    api.remove.mockResolvedValue(undefined);
    renderWithMantine(<SettingsPaymentMethods />);
    await screen.findByText('Visa - 1234');
    expect(screen.queryByRole('button', { name: 'Delete Visa - 1234' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Delete Unused' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('pm2'));
  });

  it('shows API errors', async () => {
    api.create.mockRejectedValue(new Error('A payment method with that nickname already exists'));
    renderWithMantine(<SettingsPaymentMethods />);
    await screen.findByText('Visa - 1234');
    await userEvent.type(screen.getByLabelText('New payment method'), 'visa - 1234');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('A payment method with that nickname already exists')).toBeTruthy();
  });
});
```

Add to `vitest.config.ts` include:

```ts
      'client/src/__tests__/SettingsPaymentMethods.test.tsx', // Settings page for payment methods
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/SettingsPaymentMethods.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the page**

Create `client/src/components/SettingsPaymentMethods.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Card, Group, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconArchive, IconArchiveOff, IconPencil, IconTrash } from '@tabler/icons-react';
import { PaymentMethod } from '../types/trip';
import { paymentMethodApi } from '../api/paymentMethodApi';

const countLabel = (n: number) => `${n} transaction${n === 1 ? '' : 's'}`;

export default function SettingsPaymentMethods(): React.ReactElement {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [nickname, setNickname] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMethods(await paymentMethodApi.list(true));
  }, []);

  useEffect(() => {
    load().catch(err => setError(err instanceof Error ? err.message : 'Failed to load payment methods'));
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    }
  };

  const add = async () => {
    if (await run(() => paymentMethodApi.create(nickname))) setNickname('');
  };

  const saveRename = async (id: string) => {
    if (await run(() => paymentMethodApi.update(id, { nickname: renameValue }))) setRenamingId(null);
  };

  return (
    <Card>
      <Stack gap="sm">
        <div>
          <Text fw={600}>Payment methods</Text>
          <Text size="sm" c="dimmed">
            Nicknames for the cards and accounts your family pays with, e.g. "Southwest CC - 1234". Never enter a full card number.
          </Text>
        </div>
        {error && <Alert color="red">{error}</Alert>}

        <Group gap="xs" align="flex-end">
          <TextInput
            style={{ flex: 1 }}
            label="New payment method"
            placeholder="e.g. Southwest CC - 1234"
            value={nickname}
            onChange={e => setNickname(e.currentTarget.value)}
          />
          <Button onClick={add} disabled={!nickname.trim()}>Add</Button>
        </Group>

        {methods.length === 0 ? (
          <Text size="sm" c="dimmed">No payment methods yet</Text>
        ) : (
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {methods.map(m => (
                <Table.Tr key={m.id} style={m.archived ? { opacity: 0.6 } : undefined}>
                  <Table.Td>
                    {renamingId === m.id ? (
                      <Group gap="xs" wrap="nowrap">
                        <TextInput
                          size="xs"
                          aria-label={`Nickname for ${m.nickname}`}
                          value={renameValue}
                          onChange={e => setRenameValue(e.currentTarget.value)}
                        />
                        <Button size="compact-xs" onClick={() => saveRename(m.id)}>Save</Button>
                        <Button size="compact-xs" variant="default" onClick={() => setRenamingId(null)}>Cancel</Button>
                      </Group>
                    ) : (
                      <Group gap="xs">
                        <Text size="sm">{m.nickname}</Text>
                        {m.archived && <Badge size="xs" color="gray">Archived</Badge>}
                      </Group>
                    )}
                  </Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{countLabel(m.transactionCount)}</Text></Table.Td>
                  <Table.Td ta="right">
                    {confirmingId === m.id ? (
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Text size="xs">Delete?</Text>
                        <Button size="compact-xs" color="red" onClick={async () => { await run(() => paymentMethodApi.remove(m.id)); setConfirmingId(null); }}>Confirm</Button>
                        <Button size="compact-xs" variant="default" onClick={() => setConfirmingId(null)}>Cancel</Button>
                      </Group>
                    ) : (
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <ActionIcon variant="subtle" size="sm" aria-label={`Rename ${m.nickname}`}
                          onClick={() => { setRenamingId(m.id); setRenameValue(m.nickname); }}>
                          <IconPencil size={14} />
                        </ActionIcon>
                        {m.archived ? (
                          <ActionIcon variant="subtle" size="sm" aria-label={`Unarchive ${m.nickname}`}
                            onClick={() => run(() => paymentMethodApi.update(m.id, { archived: false }))}>
                            <IconArchiveOff size={14} />
                          </ActionIcon>
                        ) : (
                          <ActionIcon variant="subtle" size="sm" aria-label={`Archive ${m.nickname}`}
                            onClick={() => run(() => paymentMethodApi.update(m.id, { archived: true }))}>
                            <IconArchive size={14} />
                          </ActionIcon>
                        )}
                        {m.transactionCount === 0 && (
                          <ActionIcon variant="subtle" color="red" size="sm" aria-label={`Delete ${m.nickname}`}
                            onClick={() => setConfirmingId(m.id)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        )}
                      </Group>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
```

- [ ] **Step 4: Route + nav**

`client/src/AppRoutes.tsx` — import next to `SettingsSecurity`:

```tsx
import SettingsPaymentMethods from './components/SettingsPaymentMethods';
```

and add after the `/settings/security` `<Route … />` (any signed-in family member may manage payment methods, so no role check):

```tsx
        <Route path="/settings/payment-methods" element={<SettingsPaymentMethods />} />
```

`client/src/components/SplitRailLayout.tsx` — add `IconCreditCard,` to the `@tabler/icons-react` import list, then:

```tsx
const settingsTabs = [
  { id: 'profile', label: 'Profile', icon: IconUser, path: '/settings/profile' },
  { id: 'family', label: 'Family', icon: IconUsers, path: '/settings/family' },
  { id: 'security', label: 'Security', icon: IconShield, path: '/settings/security' },
  { id: 'payment-methods', label: 'Payment methods', icon: IconCreditCard, path: '/settings/payment-methods' },
];
```

and in `getActiveSettingsTab`, before `return 'profile';`:

```tsx
    if (path.startsWith('/settings/payment-methods')) return 'payment-methods';
```

(`client/src/components/Layout.tsx` is not used by `AppRoutes` — leave it alone.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run client/src/__tests__/SettingsPaymentMethods.test.tsx`
Expected: PASS.

Run: `npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` → `93` or less.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/SettingsPaymentMethods.tsx client/src/__tests__/SettingsPaymentMethods.test.tsx client/src/AppRoutes.tsx client/src/components/SplitRailLayout.tsx vitest.config.ts
git commit -m "feat(client): Settings > Payment methods

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Transactions — payment method column and editing

**Files:**
- Modify: `client/src/components/BookingTransactionList.tsx` (full replacement below)
- Modify: `client/src/__tests__/BookingTransactionList.test.tsx`
- Modify: `client/src/__tests__/BookingCard.test.tsx` (mock `paymentMethodApi`)

- [ ] **Step 1: Write the failing tests**

In `client/src/__tests__/BookingTransactionList.test.tsx`:

1. Add `updateBookingTransaction: vi.fn(),` to the `tripApi` mock object, and add a payment method mock below it:

```tsx
vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: {
    list: vi.fn().mockResolvedValue([{ id: 'pm1', nickname: 'Visa - 1234', archived: false, transactionCount: 1, createdAt: '', updatedAt: '' }]),
    create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  },
}));
```

2. Change the `beforeEach` fixture row to include `paymentMethodId: 'pm1', paymentMethodNickname: 'Visa - 1234'`.

3. Append these tests:

```tsx
  it('shows the payment method on each row', async () => {
    renderList();
    expect(await screen.findByText('Visa - 1234')).toBeTruthy();
  });

  it('edits a transaction with the form prefilled', async () => {
    (tripApi.updateBookingTransaction as any).mockResolvedValue({});
    const onChanged = vi.fn();
    renderList({ onChanged });
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    const cash = screen.getByLabelText('Amount (cash)') as HTMLInputElement;
    expect(cash.value).toBe('78.98');
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2026-01-15');
    expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Fee breakdown');
    fireEvent.change(cash, { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(tripApi.updateBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', 't1', {
      amountCash: 80, amountPoints: 0, transactionDate: '2026-01-15', confirmationNumber: null, notes: null, paymentMethodId: 'pm1',
    }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByLabelText('Amount (cash)')).toBeNull();
  });

  it('keeps only one form open and reports editing', async () => {
    const onEditingChange = vi.fn();
    renderList({ onEditingChange });
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: 'Edit transaction' }));
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole('button', { name: /\+ transaction/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: /\+ transaction/i })).toBeTruthy();
  });

  it('sends the chosen payment method when adding', async () => {
    (tripApi.addBookingTransaction as any).mockResolvedValue({});
    renderList();
    await screen.findByText('$78.98');
    fireEvent.click(screen.getByRole('button', { name: /\+ transaction/i }));
    fireEvent.change(screen.getByLabelText('Amount (cash)'), { target: { value: '25' } });
    const select = screen.getByRole('textbox', { name: 'Payment method' });
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'Visa - 1234' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    await waitFor(() => expect(tripApi.addBookingTransaction).toHaveBeenCalledWith('trip-1', 'b1', expect.objectContaining({
      amountCash: 25, paymentMethodId: 'pm1',
    })));
  });
```

4. In `client/src/__tests__/BookingCard.test.tsx`, add the same `vi.mock('../api/paymentMethodApi', …)` block (with `list` resolving `[]`) and `updateBookingTransaction: vi.fn(),` to its `tripApi` mock, so any rendered transaction form doesn't call the real API.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx`
Expected: FAIL — no "Visa - 1234", no "Edit transaction" button.

- [ ] **Step 3: Replace the component**

Replace the whole of `client/src/components/BookingTransactionList.tsx`:

```tsx
import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { ActionIcon, Alert, Button, Group, SimpleGrid, Table, Text, TextInput, Textarea } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { BookingTransaction } from '../types/trip';
import { tripApi } from '../api/tripApi';
import { formatMoney } from '../utils/money';
import { PaymentMethodSelect } from './PaymentMethodSelect';

interface BookingTransactionListProps {
  tripId: string;
  bookingId: string;
  originalConfirmationNumber?: string | null;
  refreshKey?: number;
  onChanged: () => void;
  onCountChange?: (count: number) => void;
  onEditingChange?: (editing: boolean) => void;
}

interface TransactionForm {
  amountCash: string;
  amountPoints: string;
  transactionDate: string;
  confirmationNumber: string;
  notes: string;
  paymentMethodId: string | null;
}

const EMPTY_FORM: TransactionForm = {
  amountCash: '', amountPoints: '', transactionDate: '', confirmationNumber: '', notes: '', paymentMethodId: null,
};

function formFromTransaction(t: BookingTransaction): TransactionForm {
  return {
    amountCash: t.amountCash !== 0 ? String(t.amountCash) : '',
    amountPoints: t.amountPoints !== 0 ? String(t.amountPoints) : '',
    transactionDate: t.transactionDate,
    confirmationNumber: t.confirmationNumber ?? '',
    notes: t.notes ?? '',
    paymentMethodId: t.paymentMethodId ?? null,
  };
}

function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// `mode` is null (closed), 'add', or the id of the transaction being edited. Only one form is open at a time.
export function BookingTransactionList({ tripId, bookingId, originalConfirmationNumber = null, refreshKey = 0, onChanged, onCountChange, onEditingChange }: BookingTransactionListProps) {
  const [transactions, setTransactions] = useState<BookingTransaction[]>([]);
  const [mode, setMode] = useState<string | null>(null);
  const [form, setForm] = useState<TransactionForm>(EMPTY_FORM);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  const load = useCallback(async () => {
    const data = await tripApi.listBookingTransactions(tripId, bookingId);
    setTransactions(data);
  }, [tripId, bookingId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const onCountChangeRef = useRef(onCountChange);
  onCountChangeRef.current = onCountChange;
  useEffect(() => {
    onCountChangeRef.current?.(transactions.length);
  }, [transactions.length]);

  const onEditingChangeRef = useRef(onEditingChange);
  onEditingChangeRef.current = onEditingChange;
  useEffect(() => {
    onEditingChangeRef.current?.(mode !== null);
  }, [mode]);
  useEffect(() => () => onEditingChangeRef.current?.(false), []);

  let carriedConfirmation = originalConfirmationNumber;
  const rows = transactions.map(t => {
    if (t.confirmationNumber) carriedConfirmation = t.confirmationNumber;
    return { transaction: t, confirmation: carriedConfirmation };
  });

  const set = <K extends keyof TransactionForm>(key: K, value: TransactionForm[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setError(null);
    setMode('add');
  };

  const openEdit = (t: BookingTransaction) => {
    setForm(formFromTransaction(t));
    setError(null);
    setConfirmingId(null);
    setMode(t.id);
  };

  const close = () => {
    setMode(null);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    const cash = parseAmount(form.amountCash);
    const points = parseAmount(form.amountPoints);
    if ((cash === undefined || cash === 0) && (points === undefined || points === 0)) {
      setError('Please enter a cash or points amount');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      if (mode === 'add') {
        await tripApi.addBookingTransaction(tripId, bookingId, {
          amountCash: cash,
          amountPoints: points,
          transactionDate: form.transactionDate || undefined,
          confirmationNumber: form.confirmationNumber.trim() || undefined,
          notes: form.notes.trim() || undefined,
          paymentMethodId: form.paymentMethodId,
        });
      } else if (mode) {
        await tripApi.updateBookingTransaction(tripId, bookingId, mode, {
          amountCash: cash ?? 0,
          amountPoints: points ?? 0,
          ...(form.transactionDate ? { transactionDate: form.transactionDate } : {}),
          confirmationNumber: form.confirmationNumber.trim() || null,
          notes: form.notes.trim() || null,
          paymentMethodId: form.paymentMethodId,
        });
      }
      close();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  const removeTransaction = async (id: string) => {
    try {
      setError(null);
      await tripApi.deleteBookingTransaction(tripId, bookingId, id);
      setConfirmingId(null);
      await load();
      onChanged();
    } catch (err) {
      setConfirmingId(null);
      setError(err instanceof Error ? err.message : 'Failed to remove transaction');
    }
  };

  return (
    <div>
      <Group justify="space-between" mt="xs" mb={4}>
        <Text size="sm" fw={600}>Transactions</Text>
        {mode === null && (
          <Button size="compact-xs" variant="subtle" onClick={openAdd}>+ Transaction</Button>
        )}
      </Group>

      {error && <Alert color="red" mb="xs">{error}</Alert>}

      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">No transactions yet</Text>
      ) : (
        <Table fz="sm" verticalSpacing={2} horizontalSpacing="xs" withRowBorders={false}>
          <Table.Tbody>
            {rows.map(({ transaction: t, confirmation }) => (
              <Table.Tr key={t.id} bg={mode === t.id ? 'var(--mantine-color-blue-light)' : undefined}>
                <Table.Td>
                  <span>{t.transactionDate}</span>
                  {t.notes && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>{t.notes}</Text>}
                </Table.Td>
                <Table.Td>
                  {t.amountCash !== 0 && <span>{formatMoney(t.amountCash)}</span>}{' '}
                  {t.amountPoints !== 0 && <span>{`${t.amountPoints} pts`}</span>}
                </Table.Td>
                <Table.Td c="dimmed">{t.paymentMethodNickname ?? ''}</Table.Td>
                <Table.Td c="dimmed">{confirmation}</Table.Td>
                <Table.Td ta="right">
                  {confirmingId === t.id ? (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Text size="xs">Remove?</Text>
                      <Button size="compact-xs" color="red" onClick={() => removeTransaction(t.id)}>Confirm</Button>
                      <Button size="compact-xs" variant="default" onClick={() => setConfirmingId(null)}>Cancel</Button>
                    </Group>
                  ) : (
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      <ActionIcon variant="subtle" size="sm" aria-label="Edit transaction" disabled={mode !== null} onClick={() => openEdit(t)}>
                        <IconPencil size={14} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" size="sm" aria-label="Remove transaction" disabled={mode !== null} onClick={() => setConfirmingId(t.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      {mode !== null && (
        <div>
          {mode !== 'add' && <Text size="sm" fw={600} mt="xs">Edit transaction</Text>}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt="xs">
            <TextInput id={`${uid}-cash`} label="Amount (cash)" type="number" step="0.01" value={form.amountCash} onChange={e => set('amountCash', e.currentTarget.value)} />
            <TextInput id={`${uid}-points`} label="Amount (points)" type="number" step="1" value={form.amountPoints} onChange={e => set('amountPoints', e.currentTarget.value)} />
            <TextInput id={`${uid}-date`} label="Date" type="date" value={form.transactionDate} onChange={e => set('transactionDate', e.currentTarget.value)} />
            <PaymentMethodSelect value={form.paymentMethodId} onChange={id => set('paymentMethodId', id)} />
            <TextInput id={`${uid}-conf`} label="New confirmation number" placeholder="Optional, e.g. for rebooking" value={form.confirmationNumber} onChange={e => set('confirmationNumber', e.currentTarget.value)} />
          </SimpleGrid>
          <Textarea id={`${uid}-notes`} mt="xs" label="Notes" rows={3} placeholder="Optional, e.g. paste the fee/tax breakdown" value={form.notes} onChange={e => set('notes', e.currentTarget.value)} />
          <Group mt="xs" gap="xs">
            <Button size="xs" onClick={submit} loading={saving}>{mode === 'add' ? 'Add transaction' : 'Save'}</Button>
            <Button size="xs" variant="default" onClick={close}>Cancel</Button>
          </Group>
        </div>
      )}
    </div>
  );
}
```

Note: the header "+ Transaction" button no longer toggles to "Cancel" — the form has its own Cancel. If an existing test clicked the header button a second time to close the form, change it to click the `Cancel` button.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run client/src/__tests__/BookingTransactionList.test.tsx client/src/__tests__/BookingCard.test.tsx client/src/__tests__/LodgingPaymentsTab.test.tsx`
Expected: PASS. (`LodgingPaymentsTab` renders this list; if it fails because `paymentMethodApi` is unmocked, add the same mock block there.)

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` → `93` or less.

```bash
git add client/src/components/BookingTransactionList.tsx client/src/__tests__/BookingTransactionList.test.tsx client/src/__tests__/BookingCard.test.tsx client/src/__tests__/LodgingPaymentsTab.test.tsx
git commit -m "feat(client): edit transactions and record their payment method

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---
## Phase 3 (client) — Price entry for stays and flights

### Task 10: `PriceEntry` component

**Files:**
- Create: `client/src/components/PriceEntry.tsx`
- Create: `client/src/__tests__/PriceEntry.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/__tests__/PriceEntry.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { useState } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import { PriceEntry } from '../components/PriceEntry';
import { PriceEntryValue, emptyPriceEntry } from '../utils/priceEntry';

function Harness({ initial = emptyPriceEntry(), onValue }: { initial?: PriceEntryValue; onValue?: (v: PriceEntryValue) => void }) {
  const [value, setValue] = useState(initial);
  return <PriceEntry value={value} onChange={next => { setValue(next); onValue?.(next); }} />;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('PriceEntry', () => {
  afterEach(() => cleanup());

  it('splits the total between booking and check-in', () => {
    renderWithMantine(<Harness />);
    expect(screen.getByText("What you'll pay")).toBeTruthy();
    type('Total price (cash)', '1612.40');
    type('Due at check-in', '182.40');
    type('Check-in note', 'Resort fee');
    expect(screen.getByText('At booking $1,430.00 · At check-in $182.40 (Resort fee)')).toBeTruthy();
  });

  it('pay at check-in turns the other amount into a deposit', () => {
    const onValue = vi.fn();
    renderWithMantine(<Harness onValue={onValue} />);
    type('Total price (cash)', '1612.40');
    fireEvent.click(screen.getByRole('radio', { name: 'Check-in' }));
    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ payAt: 'checkin' }));
    expect((screen.getByLabelText('Total price (cash)') as HTMLInputElement).value).toBe('1612.40');
    type('Due at booking (deposit)', '100');
    expect(screen.queryByLabelText('Due at check-in')).toBeNull();
    expect(screen.getByText('At booking $100.00 · At check-in $1,512.40')).toBeTruthy();
  });

  it('shows points with cash taxes', () => {
    renderWithMantine(<Harness />);
    type('Total price (points)', '9000');
    type('Total price (cash)', '1289.60');
    type('Due at check-in', '39.60');
    expect(screen.getByText('At booking 9,000 pts + $1,250.00 · At check-in $39.60')).toBeTruthy();
  });

  it('shows a problem instead of the preview', () => {
    renderWithMantine(<Harness />);
    type('Total price (cash)', '10');
    type('Due at check-in', '20');
    expect(screen.getByText("Due at check-in can't be more than the total price")).toBeTruthy();
  });
});
```

If `getByRole('radio', { name: 'Check-in' })` doesn't find Mantine's SegmentedControl input, use `fireEvent.click(screen.getByText('Check-in'))` instead.

Add to `vitest.config.ts` include:

```ts
      'client/src/__tests__/PriceEntry.test.tsx', // Total price + pay-at fields
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/PriceEntry.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

Create `client/src/components/PriceEntry.tsx`:

```tsx
import { useId } from 'react';
import { Group, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { PayAt } from '../types/trip';
import { OTHER_AMOUNT_LABEL, PriceEntryValue, duesLine, toDues, validatePriceEntry } from '../utils/priceEntry';

interface PriceEntryProps {
  value: PriceEntryValue;
  onChange: (value: PriceEntryValue) => void;
}

const PAY_AT_OPTIONS = [
  { label: 'Booking', value: 'booking' },
  { label: 'Check-in', value: 'checkin' },
];

// "What you'll pay": the total (after coupons), when most of it is paid, and the amount paid at the other time.
export function PriceEntry({ value, onChange }: PriceEntryProps) {
  const uid = useId();
  const set = <K extends keyof PriceEntryValue>(key: K, next: PriceEntryValue[K]) => onChange({ ...value, [key]: next });
  const problem = validatePriceEntry(value);
  const preview = problem ? '' : duesLine(toDues(value));

  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>What you'll pay</Text>
      <Group grow gap="xs" align="flex-start">
        <TextInput id={`${uid}-total-cash`} label="Total price (cash)" description="After coupons, incl. taxes" type="number" step="0.01"
          value={value.totalCash} onChange={e => set('totalCash', e.currentTarget.value)} />
        <TextInput id={`${uid}-total-points`} label="Total price (points)" description="Always paid at booking" type="number" step="1"
          value={value.totalPoints} onChange={e => set('totalPoints', e.currentTarget.value)} />
      </Group>
      <div>
        <Text size="sm" fw={500} mb={2} id={`${uid}-pay-at`}>Pay at</Text>
        <SegmentedControl fullWidth size="xs" aria-labelledby={`${uid}-pay-at`} data={PAY_AT_OPTIONS}
          value={value.payAt} onChange={next => set('payAt', next as PayAt)} />
      </div>
      <Group grow gap="xs" align="flex-start">
        <TextInput id={`${uid}-other`} label={OTHER_AMOUNT_LABEL[value.payAt]} type="number" step="0.01"
          value={value.otherCash} onChange={e => set('otherCash', e.currentTarget.value)} />
        <TextInput id={`${uid}-notes`} label="Check-in note" placeholder="e.g. Resort fee, bags"
          value={value.notes} onChange={e => set('notes', e.currentTarget.value)} />
      </Group>
      {problem
        ? <Text size="xs" c="red">{problem}</Text>
        : preview && <Text size="xs" c="dimmed">{preview}</Text>}
    </Stack>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run client/src/__tests__/PriceEntry.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/PriceEntry.tsx client/src/__tests__/PriceEntry.test.tsx vitest.config.ts
git commit -m "feat(client): PriceEntry total + pay-at fields

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 11: Stays use `PriceEntry`

**Files:**
- Modify: `client/src/utils/stayDraft.ts`
- Modify: `client/src/components/LodgingStayForm.tsx` (Price section lines ~69–88, Coupons section ~115–117)
- Modify: `client/src/components/LodgingDetailsTab.tsx` (`paymentLine` ~line 62, usage ~166 and ~218, imports)
- Modify tests: `client/src/__tests__/lodgingDrafts.test.ts`, `client/src/__tests__/LodgingDetailsTab.test.tsx`, `client/src/__tests__/AddLodgingDialog.test.tsx`

- [ ] **Step 1: Update the tests first**

`client/src/__tests__/lodgingDrafts.test.ts`:

1. In "round-trips element + booking through the draft", in the `toMatchObject` draft expectation replace
`dueAtBookingCash: '1430', dueLaterCash: '182.4',` and `dueLaterNotes: 'Resort fee',` with:

```ts
      price: { totalCash: '1612.4', totalPoints: '', payAt: 'booking', otherCash: '182.4', notes: 'Resort fee' },
```

and in the payload `booking` expectation add `payAt: 'booking',` (keep `dueAtBookingCash: 1430, dueAtBookingPoints: null, dueLaterCash: 182.4, dueLaterNotes: 'Resort fee'`).

2. In "validates", replace the two due-field lines with:

```ts
    expect(validateStayDraft({ ...ok, price: { ...ok.price, otherCash: '-1' } })).toBe('Amounts must be 0 or more');
    expect(validateStayDraft({ ...ok, price: { ...ok.price, totalPoints: '1.5' } })).toBe('Points must be a whole number, 0 or more');
    expect(validateStayDraft({ ...ok, price: { ...ok.price, totalCash: '5', otherCash: '6' } }))
      .toBe("Due at check-in can't be more than the total price");
```

3. Add a test:

```ts
  it('keeps pay at check-in from the booking', () => {
    const draft = stayDraftFromElement(element, { ...booking, payAt: 'checkin', dueAtBookingCash: 100, dueLaterCash: 400 });
    expect(draft.price).toMatchObject({ totalCash: '500', payAt: 'checkin', otherCash: '100' });
    expect(stayPayload(draft).booking).toMatchObject({ dueAtBookingCash: 100, dueLaterCash: 400, payAt: 'checkin' });
  });
```

`client/src/__tests__/LodgingDetailsTab.test.tsx`:

- Line ~82: expect `'Total $1,612.40 · At booking $1,430.00 · At check-in $182.40 (Resort fee)'` and also `expect(screen.getByText("What you'll pay")).toBeTruthy();`
- Line ~92: change `/Due at booking/` to `/At booking/`.
- In "saves the booking with the stay": use `screen.getByLabelText('Due at check-in')` (no "(cash)") and expect
  `payload.booking` `toMatchObject({ dueAtBookingCash: 1412.4, dueLaterCash: 200, payAt: 'booking', siteItineraryNumber: '7231004' })`.

`client/src/__tests__/AddLodgingDialog.test.tsx`, in "sends the booking fields with the stay": replace the three `Due at …` typing lines with

```ts
    await userEvent.type(screen.getByLabelText('Total price (cash)'), '1612.40');
    await userEvent.type(screen.getByLabelText('Due at check-in'), '182.40');
    await userEvent.type(screen.getByLabelText('Check-in note'), 'Resort fee');
```

and add `payAt: 'booking'` to the `payload.booking` `toMatchObject`.

Also run `grep -rn "Due at booking (cash)\|Due at check-in (cash)\|Due at check-in note\|Payment schedule" client/src` and update any other test that still uses those labels the same way.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/lodgingDrafts.test.ts client/src/__tests__/LodgingDetailsTab.test.tsx client/src/__tests__/AddLodgingDialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `stayDraft.ts`**

1. Import: `import { PriceEntryValue, emptyPriceEntry, fromDues, toDues, validatePriceEntry } from './priceEntry';`
2. In `StayDraft`, delete `dueAtBookingCash`, `dueAtBookingPoints`, `dueLaterCash`, `dueLaterNotes` and add `price: PriceEntryValue;` in their place.
3. In `emptyStayDraft`, replace the line `dueAtBookingCash: '', dueAtBookingPoints: '', dueLaterCash: '', dueLaterNotes: '',` with `price: emptyPriceEntry(),`.
4. In `stayDraftFromElement`, replace the two `dueAtBooking…`/`dueLater…` lines with:

```ts
    price: b ? fromDues(b) : emptyPriceEntry(),
```

5. In `validateStayDraft`, change the loops and add the price check:

```ts
  for (const v of [draft.rateCash, draft.priceCash]) {
    if (num(v) === 'invalid') return 'Amounts must be 0 or more';
  }
  for (const v of [draft.ratePoints, draft.pricePoints]) {
    if (badPoints(v)) return 'Points must be a whole number, 0 or more';
  }
  const priceProblem = validatePriceEntry(draft.price);
  if (priceProblem) return priceProblem;
```

6. In `stayPayload`, replace the four `dueAtBooking…`/`dueLater…` lines with:

```ts
    ...toDues(draft.price),
```

- [ ] **Step 4: Update `LodgingStayForm.tsx`**

Add `import { PriceEntry } from './PriceEntry';`. Replace the `Price` section **and** the `Payment schedule` section (lines ~69–88) with:

```tsx
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
            <Text size="sm" fw={600} mt={4}>Coupons</Text>
            <CouponsEditor coupons={draft.coupons} onChange={coupons => set('coupons', coupons)} />
            <PriceEntry value={draft.price} onChange={price => set('price', price)} />
          </Section>
```

(Keep whatever the existing nightly/total `TextInput` lines look like if they differ slightly — the point is: advertised fields, taxes checkbox, Coupons, then `PriceEntry`.) Delete the old bottom `<Section title="Coupons">…</Section>` block (lines ~115–117).

- [ ] **Step 5: Update `LodgingDetailsTab.tsx`**

1. Delete the `paymentLine` function.
2. Add `import { duesLine } from '../utils/priceEntry';` and remove the `formatMoney` import (it was only used by `paymentLine`; keep `formatPrice`, which `priceLine` uses).
3. Replace `const payment = booking ? paymentLine(booking) : '';` with:

```tsx
  const payment = booking ? duesLine(booking, { withTotal: true }) : '';
```

4. Replace `<Section title="Payment schedule">` with `<Section title="What you'll pay">`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run client/src/__tests__/lodgingDrafts.test.ts client/src/__tests__/LodgingDetailsTab.test.tsx client/src/__tests__/AddLodgingDialog.test.tsx client/src/__tests__/TripDetailPage.test.tsx client/src/__tests__/LodgingPaymentsTab.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` → `93` or less.

```bash
git add client/src/utils/stayDraft.ts client/src/components/LodgingStayForm.tsx client/src/components/LodgingDetailsTab.tsx client/src/__tests__/lodgingDrafts.test.ts client/src/__tests__/LodgingDetailsTab.test.tsx client/src/__tests__/AddLodgingDialog.test.tsx
git commit -m "feat(client): stays use total price + pay-at entry

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 12: Flights use `PriceEntry`; totals and money line

**Files:**
- Modify: `client/src/components/BookingForm.tsx`
- Modify: `client/src/utils/bookingSummary.ts`
- Modify: `client/src/components/BookingBlock.tsx` (~line 123)
- Modify: `client/src/utils/flightRows.ts` (`flightTotals` ~line 109)
- Modify tests: `client/src/__tests__/BookingCard.test.tsx`, `client/src/__tests__/bookingSummary.test.ts`, `client/src/__tests__/flightRows.test.ts`

- [ ] **Step 1: Write the failing tests**

`client/src/__tests__/bookingSummary.test.ts` — append inside the `describe`:

```ts
  it('shows the total price between advertised and paid', () => {
    const line = bookingMoneyLine(booking({ advertisedPriceCash: 200, dueAtBookingCash: 380, dueLaterCash: 70, actualTotalCash: 380 }));
    expect(line).toBe('Advertised $200.00/person · Total $450.00 · Paid $380.00 ($380.00/person)');
  });

  it('shows a points total with cash taxes', () => {
    expect(bookingMoneyLine(booking({ dueAtBookingPoints: 30000, dueAtBookingCash: 11.2 })))
      .toBe('Total 30,000 pts + $11.20 · Paid $0.00');
  });
```

`client/src/__tests__/flightRows.test.ts` — append inside `describe('flightTotals', …)`:

```ts
  it('uses the booking total when dues are set', () => {
    const a = flight('el-1', 'A', []);
    const b = booking('b1', ['el-1'], { travelerIds: ['p1', 'p2'], advertisedPriceCash: 200, dueAtBookingCash: 380, dueLaterCash: 70, dueAtBookingPoints: 1000 });
    expect(flightTotals([a], [b])).toMatchObject({ cash: 450, points: 1000 });
  });

  it('falls back to advertised per person × travelers', () => {
    const a = flight('el-1', 'A', []);
    const b = booking('b1', ['el-1'], { travelerIds: ['p1', 'p2', 'p3'], advertisedPriceCash: 100.1, advertisedPricePoints: 5000 });
    expect(flightTotals([a], [b])).toMatchObject({ cash: 300.3, points: 15000 });
  });
```

`client/src/__tests__/BookingCard.test.tsx`:

1. In "creates a booking with smart defaults…", the `createBooking` expectation gains the dues:

```ts
    await waitFor(() => expect(api.createBooking).toHaveBeenCalledWith('trip-1', {
      confirmationNumber: 'NEW1', loyaltyProgram: null, advertisedPriceCash: null, advertisedPricePoints: null, notes: null,
      dueAtBookingCash: null, dueAtBookingPoints: null, dueLaterCash: null, dueLaterNotes: null, payAt: 'booking',
      elementIds: ['el-1'], travelerIds: ['p2', 'p3'],
    }));
```

2. Add tests (reuse the file's `renderCard`, `makeBooking`, `api`):

```tsx
  it('saves the total price and pay-at with the booking', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: '+ Booking' }));
    await user.type(screen.getByLabelText('Total price (cash)'), '824.40');
    await user.type(screen.getByLabelText('Due at check-in'), '70');
    await user.type(screen.getByLabelText('Check-in note'), 'Bags');
    await user.click(screen.getByLabelText('Also record payment'));
    await user.click(screen.getByRole('button', { name: 'Save booking' }));
    await waitFor(() => expect(api.createBooking).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      dueAtBookingCash: 754.4, dueLaterCash: 70, dueLaterNotes: 'Bags', payAt: 'booking',
    })));
  }, 15000);

  it('prefills the total when editing and shows what is still owed', async () => {
    const user = userEvent.setup();
    renderCard({ bookings: [makeBooking({ dueAtBookingCash: 754.4, dueLaterCash: 70 }), b2] });
    expect(screen.getByText('Remaining $824.40 (incl. $754.40 due at booking)')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: /edit booking/i })[0]);
    expect((screen.getByLabelText('Total price (cash)') as HTMLInputElement).value).toBe('824.4');
    expect((screen.getByLabelText('Due at check-in') as HTMLInputElement).value).toBe('70');
  }, 15000);
```

(The "Also record payment" click in the first test un-checks the box added in Task 13; until Task 13 is done that `click` will fail — so in this task, **leave that line out** and add it in Task 13, Step 1. Check the real aria-label of the edit button in `BookingBlock.tsx` — `grep -n "aria-label" client/src/components/BookingBlock.tsx` — and use it in place of `/edit booking/i` if different.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/bookingSummary.test.ts client/src/__tests__/flightRows.test.ts client/src/__tests__/BookingCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: `flightTotals`**

In `client/src/utils/flightRows.ts` add `import { dueTotals } from './dues';` and replace `flightTotals`:

```ts
// Per booking: its total price when dues are set, otherwise advertised per person × travelers.
export function flightTotals(elements: TripElement[], bookings: Booking[]): FlightTotals {
  const flightIds = new Set(elements.filter(e => e.elementType === 'flight').map(e => e.id));
  let cash = 0;
  let points = 0;
  for (const booking of bookings) {
    if (!booking.elementIds.some(id => flightIds.has(id))) continue;
    const totals = dueTotals(booking);
    if (totals) {
      cash += totals.cash;
      points += totals.points;
    } else {
      const travelers = Math.max(1, booking.travelerIds.length);
      cash += (booking.advertisedPriceCash ?? 0) * travelers;
      points += (booking.advertisedPricePoints ?? 0) * travelers;
    }
  }
  cash = Math.round(cash * 100) / 100;
  return { cash, points, label: formatPrice(cash, points) };
}
```

- [ ] **Step 4: `bookingMoneyLine`**

In `client/src/utils/bookingSummary.ts` add `import { dueTotals } from './dues';` and, right after the `advertised` push:

```ts
  const totals = dueTotals(booking);
  if (totals) parts.push(`Total ${formatPrice(totals.cash, totals.points) || formatMoney(0)}`);
```

- [ ] **Step 5: `BookingBlock` remaining label**

In `client/src/components/BookingBlock.tsx` add `import { paymentSummary } from '../utils/lodging';` and replace the money line:

```tsx
      <Text size="sm" c="dimmed">{bookingMoneyLine(booking)}</Text>
      {(() => {
        const summary = paymentSummary(booking);
        return summary && (summary.remainingCash > 0 || summary.remainingPoints > 0)
          ? <Text size="sm" fw={600}>{summary.label}</Text>
          : null;
      })()}
```

(If you prefer, compute `const summary = paymentSummary(booking);` near the top of the component body and render `{summary && (summary.remainingCash > 0 || summary.remainingPoints > 0) && <Text size="sm" fw={600}>{summary.label}</Text>}`.)

- [ ] **Step 6: `BookingForm` price entry**

In `client/src/components/BookingForm.tsx`:

1. Imports:

```tsx
import { Alert, Box, Button, Checkbox, Group, Paper, SimpleGrid, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { PriceEntry } from './PriceEntry';
import { PriceEntryValue, emptyPriceEntry, fromDues, toDues, validatePriceEntry } from '../utils/priceEntry';
```

2. State, after `pricePoints`:

```tsx
  const [price, setPrice] = useState<PriceEntryValue>(() => (booking ? fromDues(booking) : emptyPriceEntry()));
```

3. In `save`, after the travelers check:

```tsx
    const priceProblem = validatePriceEntry(price);
    if (priceProblem) {
      setError(priceProblem);
      return;
    }
```

4. In `payload`, after `notes: …`:

```tsx
        ...toDues(price),
```

5. JSX — between the advertised `SimpleGrid` and the Notes `Textarea`:

```tsx
      <Box mt="sm">
        <PriceEntry value={price} onChange={setPrice} />
      </Box>
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run client/src/__tests__/bookingSummary.test.ts client/src/__tests__/flightRows.test.ts client/src/__tests__/BookingCard.test.tsx client/src/__tests__/TripDetailPage.test.tsx`
Expected: PASS.

`flightTotals` now multiplies the advertised per-person price by the number of travelers (an intended bug fix — it used to count one person per booking). If a `TripDetailPage`/`FlightSection` test asserted the old, smaller total for a multi-traveler booking, update the expected number and note it in the commit message.

- [ ] **Step 8: Type-check and commit**

Run: `npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` → `93` or less.

```bash
git add client/src/components/BookingForm.tsx client/src/components/BookingBlock.tsx client/src/utils/bookingSummary.ts client/src/utils/flightRows.ts client/src/__tests__/BookingCard.test.tsx client/src/__tests__/bookingSummary.test.ts client/src/__tests__/flightRows.test.ts
git commit -m "feat(client): flights use total price + pay-at; fix flight totals

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Phase 4 (client) — "Also record payment"

### Task 13: `FirstPaymentFields` in AddLodgingDialog and BookingForm

**Files:**
- Create: `client/src/components/FirstPaymentFields.tsx`
- Create: `client/src/__tests__/FirstPaymentFields.test.tsx`
- Modify: `client/src/components/AddLodgingDialog.tsx`
- Modify: `client/src/components/BookingForm.tsx`
- Modify tests: `client/src/__tests__/AddLodgingDialog.test.tsx`, `client/src/__tests__/BookingCard.test.tsx`, and any test that renders `AddLodgingDialog` (check `TripDetailPage.test.tsx`)
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/__tests__/FirstPaymentFields.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api/paymentMethodApi', () => ({
  paymentMethodApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

import { FirstPaymentFields } from '../components/FirstPaymentFields';

const draft = { enabled: true, transactionDate: '2027-01-05', paymentMethodId: null };

describe('FirstPaymentFields', () => {
  afterEach(() => cleanup());

  it('shows the amount, date and method when enabled', () => {
    renderWithMantine(<FirstPaymentFields value={draft} onChange={() => {}} amountLabel="9,000 pts + $1,250.00" />);
    expect((screen.getByLabelText('Also record payment') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Records a payment of 9,000 pts + $1,250.00')).toBeTruthy();
    expect((screen.getByLabelText('Payment date') as HTMLInputElement).value).toBe('2027-01-05');
    expect(screen.getByRole('textbox', { name: 'Payment method' })).toBeTruthy();
  });

  it('hides the fields when unchecked and reports changes', () => {
    const onChange = vi.fn();
    const { rerender } = renderWithMantine(<FirstPaymentFields value={draft} onChange={onChange} amountLabel="$10.00" />);
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2027-01-06' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...draft, transactionDate: '2027-01-06' });
    fireEvent.click(screen.getByLabelText('Also record payment'));
    expect(onChange).toHaveBeenLastCalledWith({ ...draft, enabled: false });
    rerender(<FirstPaymentFields value={{ ...draft, enabled: false }} onChange={onChange} amountLabel="$10.00" />);
    expect(screen.queryByLabelText('Payment date')).toBeNull();
  });
});
```

If `renderWithMantine` doesn't return `rerender` with the Mantine wrapper, render twice in two separate tests instead.

Add to `vitest.config.ts` include:

```ts
      'client/src/__tests__/FirstPaymentFields.test.tsx', // "Also record payment" on create
```

`client/src/__tests__/AddLodgingDialog.test.tsx`:

1. Add the `paymentMethodApi` mock (same block as above) at the top, after the `tripApi` mock.
2. Append tests:

```tsx
  it('records the first payment by default when something is due at booking', async () => {
    vi.mocked(tripApi.createElement).mockResolvedValue({ id: 'h1' } as any);
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Casa');
    fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value: '2027-03-01' } });
    expect(screen.queryByLabelText('Also record payment')).toBeNull();
    fireEvent.change(screen.getByLabelText('Total price (cash)'), { target: { value: '500' } });
    expect((screen.getByLabelText('Also record payment') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Payment date'), { target: { value: '2027-01-05' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    await waitFor(() => expect(tripApi.createElement).toHaveBeenCalled());
    const payload = vi.mocked(tripApi.createElement).mock.calls[0][1] as any;
    expect(payload.firstTransaction).toEqual({ transactionDate: '2027-01-05', paymentMethodId: null });
  }, 30000);

  it('skips the first payment when unchecked or when everything is paid at check-in', async () => {
    vi.mocked(tripApi.createElement).mockResolvedValue({ id: 'h1' } as any);
    renderWithMantine(<AddLodgingDialog tripId="t1" opened destinations={[]} onClose={() => {}} onCreated={() => {}} />);
    await userEvent.type(screen.getByLabelText('Hotel name'), 'Casa');
    fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value: '2027-03-01' } });
    fireEvent.change(screen.getByLabelText('Total price (cash)'), { target: { value: '500' } });
    fireEvent.click(screen.getByLabelText('Also record payment'));
    await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
    await waitFor(() => expect(tripApi.createElement).toHaveBeenCalled());
    expect((vi.mocked(tripApi.createElement).mock.calls[0][1] as any).firstTransaction).toBeUndefined();
  }, 30000);
```

3. In "sends the booking fields with the stay", nothing changes (it doesn't assert on `firstTransaction`).

`client/src/__tests__/BookingCard.test.tsx`:

1. Put back the line removed in Task 12 into "saves the total price and pay-at with the booking", right before clicking Save:

```tsx
    await user.click(screen.getByLabelText('Also record payment'));
```

and after the existing `toHaveBeenCalledWith` assertion add:

```tsx
    expect(api.createBooking.mock.calls[0][1]).not.toHaveProperty('firstTransaction');
```

2. Add:

```tsx
  it('records the first payment with a new flight booking', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: '+ Booking' }));
    await user.type(screen.getByLabelText('Total price (cash)'), '412.20');
    await user.click(screen.getByRole('button', { name: 'Save booking' }));
    await waitFor(() => expect(api.createBooking).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      dueAtBookingCash: 412.2,
      firstTransaction: expect.objectContaining({ paymentMethodId: null }),
    })));
  }, 15000);

  it('does not offer to record a payment when editing', async () => {
    const user = userEvent.setup();
    renderCard({ bookings: [makeBooking({ dueAtBookingCash: 100 }), b2] });
    await user.click(screen.getAllByRole('button', { name: /edit booking/i })[0]);
    expect(screen.queryByLabelText('Also record payment')).toBeNull();
  }, 15000);
```

(Use the same edit-button name you used in Task 12.)

`client/src/__tests__/TripDetailPage.test.tsx`: if it renders `AddLodgingDialog` or `BookingForm` and types a total price, add the `paymentMethodApi` mock block to it.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run client/src/__tests__/FirstPaymentFields.test.tsx client/src/__tests__/AddLodgingDialog.test.tsx client/src/__tests__/BookingCard.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the component**

Create `client/src/components/FirstPaymentFields.tsx`:

```tsx
import { useId } from 'react';
import { Checkbox, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { FirstPaymentDraft } from '../utils/priceEntry';
import { PaymentMethodSelect } from './PaymentMethodSelect';

interface FirstPaymentFieldsProps {
  value: FirstPaymentDraft;
  onChange: (value: FirstPaymentDraft) => void;
  amountLabel: string;
}

// Shown while creating a booking when something is due at booking.
export function FirstPaymentFields({ value, onChange, amountLabel }: FirstPaymentFieldsProps) {
  const uid = useId();
  return (
    <Paper withBorder p="xs">
      <Stack gap="xs">
        <Checkbox id={`${uid}-enabled`} label="Also record payment" checked={value.enabled}
          onChange={e => onChange({ ...value, enabled: e.currentTarget.checked })} />
        {value.enabled && (
          <>
            <Text size="xs" c="dimmed">{`Records a payment of ${amountLabel}`}</Text>
            <Group grow gap="xs" align="flex-start">
              <TextInput id={`${uid}-date`} label="Payment date" type="date" value={value.transactionDate}
                onChange={e => onChange({ ...value, transactionDate: e.currentTarget.value })} />
              <PaymentMethodSelect value={value.paymentMethodId} onChange={id => onChange({ ...value, paymentMethodId: id })} />
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 4: Wire into `AddLodgingDialog`**

In `client/src/components/AddLodgingDialog.tsx`:

1. Imports:

```tsx
import { FirstPaymentFields } from './FirstPaymentFields';
import { dueAtBookingLabel, emptyFirstPayment, firstTransactionPayload, hasDueAtBooking } from '../utils/priceEntry';
```

2. State after `draft`:

```tsx
  const [firstPayment, setFirstPayment] = useState(() => emptyFirstPayment());
```

3. In `reset`, add `setFirstPayment(emptyFirstPayment());`.
4. In `save`, replace the `createElement` call:

```tsx
      const firstTransaction = firstTransactionPayload(firstPayment, draft.price);
      const created = await tripApi.createElement(tripId, {
        ...stayPayload(draft),
        ...(firstTransaction ? { firstTransaction } : {}),
      });
```

5. JSX, right after `<LodgingStayForm … />`:

```tsx
        {hasDueAtBooking(draft.price) && (
          <Stack mt="sm">
            <FirstPaymentFields value={firstPayment} onChange={setFirstPayment} amountLabel={dueAtBookingLabel(draft.price)} />
          </Stack>
        )}
```

(add `Stack` to the `@mantine/core` import).

- [ ] **Step 5: Wire into `BookingForm` (create mode only)**

In `client/src/components/BookingForm.tsx`:

1. Imports: add `FirstPaymentFields` and `dueAtBookingLabel, emptyFirstPayment, firstTransactionPayload, hasDueAtBooking` from `../utils/priceEntry`.
2. State: `const [firstPayment, setFirstPayment] = useState(() => emptyFirstPayment());`
3. Replace the create branch in `save`:

```tsx
      if (booking) {
        await tripApi.updateBooking(tripId, booking.id, payload);
      } else {
        const firstTransaction = firstTransactionPayload(firstPayment, price);
        await tripApi.createBooking(tripId, { ...payload, ...(firstTransaction ? { firstTransaction } : {}) });
      }
```

4. JSX, inside the `<Box mt="sm">` after `<PriceEntry … />`:

```tsx
        {!booking && hasDueAtBooking(price) && (
          <Box mt="xs">
            <FirstPaymentFields value={firstPayment} onChange={setFirstPayment} amountLabel={dueAtBookingLabel(price)} />
          </Box>
        )}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run client/src/__tests__/FirstPaymentFields.test.tsx client/src/__tests__/AddLodgingDialog.test.tsx client/src/__tests__/BookingCard.test.tsx client/src/__tests__/TripDetailPage.test.tsx`
Expected: PASS.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"` → `93` or less.

```bash
git add client/src/components/FirstPaymentFields.tsx client/src/components/AddLodgingDialog.tsx client/src/components/BookingForm.tsx client/src/__tests__/FirstPaymentFields.test.tsx client/src/__tests__/AddLodgingDialog.test.tsx client/src/__tests__/BookingCard.test.tsx client/src/__tests__/TripDetailPage.test.tsx vitest.config.ts
git commit -m "feat(client): also record the first payment when creating a booking

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Wrap-up

### Task 14: Documentation maps

**Files:**
- Modify: `client/src/APIUsage.md`
- Modify: `client/src/components/ComponentUsage.md`
- Modify: `docs/ServerAPIUsage.md`

- [ ] **Step 1: `client/src/APIUsage.md`** — add a `paymentMethodApi` section following the file's existing format:
  - `paymentMethodApi.list` → `PaymentMethodSelect.tsx`, `SettingsPaymentMethods.tsx`
  - `paymentMethodApi.create` → `PaymentMethodSelect.tsx`, `SettingsPaymentMethods.tsx`
  - `paymentMethodApi.update`, `paymentMethodApi.remove` → `SettingsPaymentMethods.tsx`
  - `tripApi.updateBookingTransaction` → now used by `BookingTransactionList.tsx` (update its row if it says unused).

- [ ] **Step 2: `client/src/components/ComponentUsage.md`** — add rows:
  - `PriceEntry` → `LodgingStayForm.tsx`, `BookingForm.tsx`
  - `PaymentMethodSelect` → `BookingTransactionList.tsx`, `FirstPaymentFields.tsx`
  - `FirstPaymentFields` → `AddLodgingDialog.tsx`, `BookingForm.tsx`
  - `SettingsPaymentMethods` → `AppRoutes.tsx` (`/settings/payment-methods`)

- [ ] **Step 3: `docs/ServerAPIUsage.md`** — document:
  - `GET /api/payment-methods?includeArchived=1`, `POST /api/payment-methods {nickname}`, `PATCH /api/payment-methods/:id {nickname?, archived?}`, `DELETE /api/payment-methods/:id` (409 when used) — client: `paymentMethodApi`.
  - Bookings: `payAt` (`'booking' | 'checkin'`) on `POST/PATCH /trips/:tripId/bookings` and on the hotel `booking` body of `POST/PUT /trips/:tripId/elements`.
  - `firstTransaction {transactionDate, paymentMethodId?}` on `POST /trips/:tripId/bookings` and hotel `POST /trips/:tripId/elements` (create only; amount = due at booking; atomic).
  - Transactions: `paymentMethodId` on POST/PATCH, `paymentMethodId` + `paymentMethodNickname` in responses.

- [ ] **Step 4: Commit**

```bash
git add client/src/APIUsage.md client/src/components/ComponentUsage.md docs/ServerAPIUsage.md
git commit -m "docs: payment methods, payAt and firstTransaction usage maps

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 15: Full verification + UI smoke

- [ ] **Step 1: Type checks**

```bash
npx tsc -p tsconfig.build.json --noEmit
npx tsc -p client/tsconfig.json --noEmit 2>&1 | grep -c "error TS"
```
Expected: server prints nothing; client prints `93` or less.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all test files pass. If a test times out only under the full run, give it an explicit timeout (15000–30000) rather than changing behavior.

- [ ] **Step 3: Migration on a copy of the real DB**

```bash
rm -rf /tmp/pm-smoke && mkdir -p /tmp/pm-smoke
cp /config/localData/travel-list/data/travel-list.sqlite /tmp/pm-smoke/
cp server/migrations/migrations.json /tmp/pm-smoke/migrations.json.bak
DB_FILE=/tmp/pm-smoke/travel-list.sqlite node server/migrations/run-migrations.cjs up
sqlite3 /tmp/pm-smoke/travel-list.sqlite "PRAGMA table_info(payment_methods);" "SELECT pay_at, COUNT(*) FROM bookings GROUP BY pay_at;" "PRAGMA foreign_key_list(booking_transactions);"
git checkout server/migrations/migrations.json
```
Expected: both pending migrations (lodging + payment methods) apply; `payment_methods` exists; every booking has `pay_at = booking`; `booking_transactions` has an FK to `payment_methods`. `migrations.json` restored afterwards. (If `sqlite3` CLI is missing, use a short `node -e` script with the `sqlite3` package.)

Then test `down` on the same copy:

```bash
DB_FILE=/tmp/pm-smoke/travel-list.sqlite node server/migrations/run-migrations.cjs down 1
git checkout server/migrations/migrations.json
```
Expected: payment methods migration rolls back without errors.

- [ ] **Step 4: UI smoke with screenshots**

Adapt `/config/workspace/shots/rework-smoke.cjs` into `/config/workspace/shots/pm-smoke.cjs`:
- Build the client: `npm --prefix client run build`.
- Start the server on port 3101 against a fresh copy of the real DB in `/tmp/pm-smoke2/` (copy `travel-list.sqlite` and put a copy of `server/migrations/migrations.json` next to it, as the rework smoke did), log in as `uitester` / `UiTest123!`.
- Capture every screen at **1440×900 and 390×844** (into `/config/workspace/shots/pm-*.png`) and check there is no horizontal overflow on mobile:
  1. Add lodging dialog: total $1,289.60, Pay at = Booking, Due at check-in $39.60, note "Resort fee". "Also record payment" is visible and checked with today's date; create a **new** payment method "Southwest CC - 1234" inline from the picker and keep it selected → Save stay.
  2. The stay's Details tab shows "What you'll pay" → `Total $1,289.60 · At booking $1,250.00 · At check-in $39.60 (Resort fee)`; its Payments tab shows the auto-created $1,250.00 transaction with "Southwest CC - 1234" and `Remaining $39.60 at check-in`.
  3. Edit that transaction (pencil) → change its payment method / notes → Save.
  4. Flight booking form: Total price (points) 60000 + Total price (cash) 11.20, "Also record payment" checked → save; the booking block shows `Total 60,000 pts + $11.20` and the transaction exists.
  5. Pay at = Check-in on a stay form: the other field is labelled "Due at booking (deposit)".
  6. Settings → Payment methods: rename one method, archive another; archived shows the "Archived" badge.
- Stop the smoke server by PID afterwards. Do not leave anything running on 3101.

- [ ] **Step 5: Final commit (if smoke found fixes)**

Commit any fixes with a descriptive message and the Co-authored-by trailer. Do **not** commit screenshots or smoke scripts.
