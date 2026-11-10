# Multi-Destination Trips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one trip contain several destinations, each with its own packing list and shared items, and show the whole trip on the dashboard with a person-first view that is easy to use on a phone.

**Architecture:** A new `trip_destinations` table links a trip to one packing list per destination. Who is at each destination comes from the existing `packing_list_members`. Server services split an existing list into destinations and move shared items between them, each inside one SQLite transaction. The dashboard loads every destination list of the active trip into `DestinationGroup`s and renders them with either a new `PersonView` or the existing columns, grouped by destination.

**Tech Stack:** Express + sqlite (`sqlite`/`sqlite3`), Vitest + supertest, React 18 + Mantine 8, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-08-multi-destination-trips-design.md`

---

## Conventions for every task

- Run commands from the repo root.
- Server tests use an in-memory DB (`getDb()` under Vitest). Every server test file calls `await closeDb()` in `afterEach`.
- **Client test files must be added to the `include` list in `vitest.config.ts`**, or Vitest won't run them. Server `*.test.ts` files are picked up by the `server/**/*.test.ts` glob.
- Use `renderWithMantine` / `setMobileViewport` from `client/src/test-utils/renderWithMantine.tsx` for component tests that render real Mantine.
- Type-check after client work with `npx tsc -p client/tsconfig.json --noEmit`, and after server work with `npx tsc -p tsconfig.build.json --noEmit`.
- Commit messages end with the trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## File map

**Server (create)**
- `server/utils/transaction.ts`: `withTransaction(db, fn)`.
- `server/repositories/tripDestinationRepository.ts`: destination CRUD, the one-destination rule, member and participant writes, list-to-trip lookups.
- `server/services/tripSplitService.ts`: `splitListIntoTrip`, `moveSharedItem`, `moveAllSharedItems`.
- `server/test-utils/destinationFixtures.ts`: seed helpers shared by the server tests.
- `server/migrations/migrations/20261108_02_add_trip_destinations.cjs`
- Tests: `server/repositories/tripDestinationRepository.test.ts`, `server/services/tripSplitService.test.ts`, `server/__tests__/trip-destinations.routes.test.ts`

**Server (modify)**
- `server/db.ts`: table and indexes.
- `server/repositories/tripRepository.ts`: `deleteTrip` also soft-deletes destinations.
- `server/routes/tripRoutes.ts`: destination and split routes.
- `server/routes.ts`: move route, plus `trip_destination` on the list detail and family list responses.

**Client (create)**
- `client/src/utils/dashboardGroups.ts`: `DestinationGroup` builder, optimistic-update helpers, person ordering, progress.
- `client/src/utils/listOptions.ts`: selector options that collapse a trip into one entry.
- `client/src/components/DestinationColumns.tsx`: columns view with a colored band per destination.
- `client/src/components/PersonView.tsx`: person-first view.
- `client/src/components/DashboardViewToggle.tsx`: Person / Columns toggle and the `useDashboardViewMode` hook.
- `client/src/components/NotesDestinationPicker.tsx`
- `client/src/components/SplitListDialog.tsx`
- `client/src/components/TripPackingSection.tsx`, `client/src/components/AddDestinationDialog.tsx`
- Tests in `client/src/__tests__/`: `dashboardGroups.test.ts`, `listOptions.test.ts`, `DestinationColumns.test.tsx`, `PersonView.test.tsx`, `DashboardViewToggle.test.tsx`, `SplitListDialog.test.tsx`, `TripPackingSection.test.tsx`

**Client (modify)**
- `client/src/types/trip.ts`, `client/src/api/tripApi.ts`, `client/src/api.ts`
- `client/src/components/PackingListsSideBySide.tsx`: new `wholeTitle` prop.
- `client/src/components/Dashboard.tsx` and `client/src/__tests__/Dashboard.test.tsx`
- `client/src/components/ActivePackingListSelector.tsx`
- `client/src/components/ManagePackingLists.tsx` and `client/src/__tests__/ManagePackingLists.test.tsx`
- `client/src/pages/TripDetailPage.tsx` and `client/src/__tests__/TripDetailPage.test.tsx`
- `vitest.config.ts`
- Docs: `client/src/APIUsage.md`, `client/src/components/ComponentUsage.md`, `docs/ServerAPIUsage.md`

**Known limitation (accepted, out of scope):** template (item group) assignments stay on the source list after a split. If an item group is edited later, template propagation adds new group items only to that list.

---

## Task 0: Workspace setup and baseline

- [ ] **Step 1: Install dependencies**

```bash
npm ci && npm --prefix client ci
```

- [ ] **Step 2: Run the baseline tests that this work touches**

```bash
npx vitest run server/repositories/tripRepository.test.ts server/__tests__/packing-list.integration.test.ts client/src/__tests__/Dashboard.test.tsx client/src/__tests__/ManagePackingLists.test.tsx client/src/__tests__/TripDetailPage.test.tsx
```

Expected: all pass. If any fail before you change anything, stop and report it. Don't fix unrelated failures.

---

## Task 1: Transaction helper, schema, migration, fixtures

**Files:**
- Create: `server/utils/transaction.ts`
- Create: `server/test-utils/destinationFixtures.ts`
- Create: `server/migrations/migrations/20261108_02_add_trip_destinations.cjs`
- Modify: `server/db.ts` (inside `SCHEMAS.trips`, after the `trip_packing_lists` table, and inside `SCHEMAS.indexes`)
- Test: `server/repositories/tripDestinationRepository.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `server/repositories/tripDestinationRepository.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';

describe('trip_destinations schema', () => {
  afterEach(async () => {
    await closeDb();
  });

  it('creates the trip_destinations table', async () => {
    const db = await getDb();
    const cols = await db.all(`PRAGMA table_info(trip_destinations)`);
    expect(cols.map((c: any) => c.name)).toEqual(
      expect.arrayContaining(['id', 'trip_id', 'name', 'color', 'position', 'packing_list_id', 'created_at', 'updated_at', 'deleted_at'])
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run server/repositories/tripDestinationRepository.test.ts`
Expected: FAIL. The column list is empty.

- [ ] **Step 3: Add the table to `server/db.ts`**

In `SCHEMAS.trips`, directly after the `CREATE TABLE IF NOT EXISTS trip_packing_lists (...);` block, add:

```sql
    CREATE TABLE IF NOT EXISTS trip_destinations (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      packing_list_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id)
    );
```

In `SCHEMAS.indexes`, after `idx_trip_packing_lists_packing_list`, add:

```sql
    CREATE INDEX IF NOT EXISTS idx_trip_destinations_trip ON trip_destinations(trip_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_destinations_list_active ON trip_destinations(packing_list_id) WHERE deleted_at IS NULL;
```

- [ ] **Step 4: Add the migration**

Create `server/migrations/migrations/20261108_02_add_trip_destinations.cjs`:

```js
/*
  Migration: add trip_destinations (one packing list per destination of a trip).
  See docs/superpowers/specs/2026-11-08-multi-destination-trips-design.md.
*/

module.exports.up = async function up({ db }) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trip_destinations (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      packing_list_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id)
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_destinations_trip ON trip_destinations(trip_id);`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_destinations_list_active ON trip_destinations(packing_list_id) WHERE deleted_at IS NULL;`);
};

module.exports.down = async function down({ db }) {
  await db.exec(`DROP TABLE IF EXISTS trip_destinations;`);
};
```

- [ ] **Step 5: Add the transaction helper**

Create `server/utils/transaction.ts`:

```ts
import type { Database } from 'sqlite';

// The app shares one SQLite connection; callers must not nest transactions.
export async function withTransaction<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  await db.run('BEGIN TRANSACTION');
  try {
    const result = await fn();
    await db.run('COMMIT');
    return result;
  } catch (err) {
    try {
      await db.run('ROLLBACK');
    } catch {
      // already rolled back
    }
    throw err;
  }
}
```

- [ ] **Step 6: Add shared test fixtures**

Create `server/test-utils/destinationFixtures.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { TripRepository } from '../repositories/tripRepository';

export async function seedFamilyTrip() {
  const db = await getDb();
  const familyId = uuidv4();
  await db.run(`INSERT INTO families (id, name) VALUES (?, ?)`, [familyId, 'Test Family']);
  const user = async (name: string) => {
    const id = uuidv4();
    await db.run(
      `INSERT INTO users (id, name, username, role, familyId) VALUES (?, ?, ?, 'FamilyAdmin', ?)`,
      [id, name, `${name.toLowerCase()}-${id}`, familyId]
    );
    return id;
  };
  const dad = await user('Dad');
  const mom = await user('Mom');
  const ava = await user('Ava');
  const leo = await user('Leo');
  const trip = await new TripRepository().createTrip(familyId, {
    name: 'Spring Break',
    startDate: '2027-03-01',
    endDate: '2027-03-08',
  });
  return { db, familyId, dad, mom, ava, leo, tripId: trip.id };
}

export async function createList(familyId: string, name: string, memberIds: string[]) {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, familyId, name, now, now]
  );
  for (const m of memberIds) {
    await db.run(`INSERT INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [id, m]);
  }
  return id;
}

export async function createMasterItem(
  familyId: string,
  name: string,
  opts: { memberIds?: string[]; wholeFamily?: boolean } = {}
) {
  const db = await getDb();
  const id = uuidv4();
  await db.run(`INSERT INTO items (id, familyId, name) VALUES (?, ?, ?)`, [id, familyId, name]);
  for (const m of opts.memberIds || []) {
    await db.run(`INSERT INTO item_members (item_id, member_id) VALUES (?, ?)`, [id, m]);
  }
  if (opts.wholeFamily) {
    await db.run(`INSERT INTO item_whole_family (item_id, family_id) VALUES (?, ?)`, [id, familyId]);
  }
  return id;
}

export async function addToList(listId: string, itemId: string) {
  const db = await getDb();
  const id = uuidv4();
  await db.run(
    `INSERT INTO packing_list_items (id, packing_list_id, item_id, created_at) VALUES (?, ?, ?, ?)`,
    [id, listId, itemId, new Date().toISOString()]
  );
  return id;
}

export async function setCheck(pliId: string, memberId: string | null, checked = true) {
  const db = await getDb();
  await db.run(
    `INSERT INTO packing_list_item_checks (id, packing_list_item_id, member_id, checked, checked_at) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), pliId, memberId, checked ? 1 : 0, new Date().toISOString()]
  );
}

export async function listRows(listId: string): Promise<{ id: string; item_id: string }[]> {
  const db = await getDb();
  return db.all(`SELECT id, item_id FROM packing_list_items WHERE packing_list_id = ? ORDER BY created_at`, [listId]);
}

export async function checksFor(pliId: string): Promise<{ member_id: string | null; checked: number }[]> {
  const db = await getDb();
  return db.all(`SELECT member_id, checked FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [pliId]);
}
```

- [ ] **Step 7: Run the test and confirm it passes**

Run: `npx vitest run server/repositories/tripDestinationRepository.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/utils/transaction.ts server/test-utils/destinationFixtures.ts server/migrations/migrations/20261108_02_add_trip_destinations.cjs server/db.ts server/repositories/tripDestinationRepository.test.ts
git commit -m "feat(server): trip_destinations table, migration and test fixtures

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: TripDestinationRepository

**Files:**
- Create: `server/repositories/tripDestinationRepository.ts`
- Test: `server/repositories/tripDestinationRepository.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Replace the contents of `server/repositories/tripDestinationRepository.test.ts` with:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import {
  TripDestinationRepository,
  DestinationConflictError,
  DestinationValidationError,
} from './tripDestinationRepository';
import { seedFamilyTrip, createList } from '../test-utils/destinationFixtures';

describe('trip_destinations schema', () => {
  afterEach(async () => {
    await closeDb();
  });

  it('creates the trip_destinations table', async () => {
    const db = await getDb();
    const cols = await db.all(`PRAGMA table_info(trip_destinations)`);
    expect(cols.map((c: any) => c.name)).toEqual(
      expect.arrayContaining(['id', 'trip_id', 'name', 'color', 'position', 'packing_list_id', 'created_at', 'updated_at', 'deleted_at'])
    );
  });
});

describe('TripDestinationRepository', () => {
  let repo: TripDestinationRepository;
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;

  beforeEach(async () => {
    seed = await seedFamilyTrip();
    repo = new TripDestinationRepository();
  });

  afterEach(async () => {
    await closeDb();
  });

  const createParis = () =>
    repo.create({
      tripId: seed.tripId,
      familyId: seed.familyId,
      name: 'Paris',
      memberIds: [seed.dad, seed.mom],
      listName: 'Spring Break – Paris',
    });

  it('creates a destination with a new list, members, trip link and participants', async () => {
    const dest = await createParis();

    expect(dest.name).toBe('Paris');
    expect(dest.color).toBe('blue');
    expect(dest.position).toBe(0);
    expect(dest.memberIds.sort()).toEqual([seed.dad, seed.mom].sort());

    const list = await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [dest.packingListId]);
    expect(list.name).toBe('Spring Break – Paris');
    const link = await seed.db.get(
      `SELECT 1 AS ok FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`,
      [seed.tripId, dest.packingListId]
    );
    expect(link.ok).toBe(1);
    const participants = await seed.db.all(`SELECT user_id, display_name FROM trip_participants WHERE trip_id = ?`, [seed.tripId]);
    expect(participants.map((p: any) => p.display_name).sort()).toEqual(['Dad', 'Mom']);
  });

  it('assigns the next color and position to the second destination', async () => {
    await createParis();
    const second = await repo.create({
      tripId: seed.tripId,
      familyId: seed.familyId,
      name: "Grandma's",
      memberIds: [seed.ava],
      listName: "Spring Break – Grandma's",
    });
    expect(second.color).toBe('green');
    expect(second.position).toBe(1);
    expect((await repo.listForTrip(seed.tripId)).map(d => d.name)).toEqual(['Paris', "Grandma's"]);
  });

  it('rejects a person who is already in another destination of the trip', async () => {
    const paris = await createParis();
    const attempt = repo.create({
      tripId: seed.tripId,
      familyId: seed.familyId,
      name: "Grandma's",
      memberIds: [seed.ava, seed.dad],
      listName: 'x',
    });
    await expect(attempt).rejects.toBeInstanceOf(DestinationConflictError);
    await attempt.catch((err: DestinationConflictError) => {
      expect(err.memberId).toBe(seed.dad);
      expect(err.destinationId).toBe(paris.id);
    });
  });

  it('rejects members from another family', async () => {
    await expect(
      repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'X', memberIds: ['not-a-user'], listName: 'x' })
    ).rejects.toBeInstanceOf(DestinationValidationError);
  });

  it('adopts an existing list and keeps its name', async () => {
    const listId = await createList(seed.familyId, 'Our big list', [seed.dad]);
    const dest = await repo.create({
      tripId: seed.tripId,
      familyId: seed.familyId,
      name: 'Paris',
      memberIds: [seed.dad, seed.mom],
      listName: 'ignored',
      packingListId: listId,
    });
    expect(dest.packingListId).toBe(listId);
    const list = await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId]);
    expect(list.name).toBe('Our big list');
  });

  it('does not duplicate existing trip participants', async () => {
    await seed.db.run(
      `INSERT INTO trip_participants (id, trip_id, user_id, display_name) VALUES ('p1', ?, ?, 'Daddy')`,
      [seed.tripId, seed.dad]
    );
    await createParis();
    const rows = await seed.db.all(`SELECT display_name FROM trip_participants WHERE trip_id = ? AND user_id = ?`, [seed.tripId, seed.dad]);
    expect(rows).toEqual([{ display_name: 'Daddy' }]);
  });

  it('updates members and ignores its own members when checking conflicts', async () => {
    const paris = await createParis();
    const updated = await repo.update(paris.id, seed.familyId, { name: 'Lyon', memberIds: [seed.dad] });
    expect(updated.name).toBe('Lyon');
    expect(updated.memberIds).toEqual([seed.dad]);
  });

  it('finds the trip context for a destination list', async () => {
    const paris = await createParis();
    const ctx = await repo.getTripContextForList(paris.packingListId);
    expect(ctx?.tripName).toBe('Spring Break');
    expect(ctx?.destinations.map(d => d.id)).toEqual([paris.id]);
    expect(await repo.getTripContextForList('unknown')).toBeNull();
  });

  it('summarizes destination lists for a family', async () => {
    const paris = await createParis();
    const summaries = await repo.getListSummariesForFamily(seed.familyId);
    expect(summaries.get(paris.packingListId)).toEqual({
      tripId: seed.tripId,
      tripName: 'Spring Break',
      destinationId: paris.id,
      destinationName: 'Paris',
      position: 0,
      destinationCount: 1,
    });
  });

  it('soft-deletes a destination', async () => {
    const paris = await createParis();
    await repo.softDelete(paris.id);
    expect(await repo.getById(paris.id)).toBeNull();
    expect(await repo.findByPackingListId(paris.packingListId)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/repositories/tripDestinationRepository.test.ts`
Expected: FAIL with "Cannot find module './tripDestinationRepository'".

- [ ] **Step 3: Implement the repository**

Create `server/repositories/tripDestinationRepository.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';

export const DESTINATION_COLORS = ['blue', 'green', 'orange', 'grape', 'teal', 'red'];

export interface TripDestination {
  id: string;
  tripId: string;
  name: string;
  color: string;
  position: number;
  packingListId: string;
  memberIds: string[];
}

export interface ListTripContext {
  tripId: string;
  tripName: string;
  destinations: TripDestination[];
}

export interface ListTripSummary {
  tripId: string;
  tripName: string;
  destinationId: string;
  destinationName: string;
  position: number;
  destinationCount: number;
}

export interface InsertDestinationInput {
  tripId: string;
  familyId: string;
  name: string;
  memberIds: string[];
  listName: string;
  packingListId?: string;
}

export class DestinationConflictError extends Error {
  constructor(public memberId: string, public destinationId: string) {
    super('member_in_other_destination');
  }
}

export class DestinationValidationError extends Error {}

const SELECT_DESTINATION = `SELECT id, trip_id AS tripId, name, color, position, packing_list_id AS packingListId FROM trip_destinations`;

export class TripDestinationRepository {
  async listForTrip(tripId: string): Promise<TripDestination[]> {
    const db = await getDb();
    const rows = await db.all(
      `${SELECT_DESTINATION} WHERE trip_id = ? AND deleted_at IS NULL ORDER BY position, created_at`,
      [tripId]
    );
    return Promise.all(rows.map((row: any) => this.withMembers(db, row)));
  }

  async getById(id: string): Promise<TripDestination | null> {
    const db = await getDb();
    const row = await db.get(`${SELECT_DESTINATION} WHERE id = ? AND deleted_at IS NULL`, [id]);
    return row ? this.withMembers(db, row) : null;
  }

  async findByPackingListId(listId: string): Promise<TripDestination | null> {
    const db = await getDb();
    const row = await db.get(
      `SELECT d.id, d.trip_id AS tripId, d.name, d.color, d.position, d.packing_list_id AS packingListId
       FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
       WHERE d.packing_list_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
      [listId]
    );
    return row ? this.withMembers(db, row) : null;
  }

  async getTripContextForList(listId: string): Promise<ListTripContext | null> {
    const destination = await this.findByPackingListId(listId);
    if (!destination) return null;
    const db = await getDb();
    const trip = await db.get(`SELECT name FROM trips WHERE id = ?`, [destination.tripId]);
    return {
      tripId: destination.tripId,
      tripName: trip?.name ?? '',
      destinations: await this.listForTrip(destination.tripId),
    };
  }

  async getListSummariesForFamily(familyId: string): Promise<Map<string, ListTripSummary>> {
    const db = await getDb();
    const rows = await db.all(
      `SELECT d.packing_list_id AS listId, d.trip_id AS tripId, t.name AS tripName, d.id AS destinationId,
              d.name AS destinationName, d.position,
              (SELECT COUNT(*) FROM trip_destinations d2 WHERE d2.trip_id = d.trip_id AND d2.deleted_at IS NULL) AS destinationCount
       FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
       WHERE t.family_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
      [familyId]
    );
    const result = new Map<string, ListTripSummary>();
    for (const { listId, ...summary } of rows as any[]) result.set(listId, summary);
    return result;
  }

  async findConflict(
    db: Database,
    tripId: string,
    memberIds: string[],
    exceptDestinationId: string | null = null
  ): Promise<DestinationConflictError | null> {
    if (memberIds.length === 0) return null;
    const placeholders = memberIds.map(() => '?').join(',');
    const row = await db.get(
      `SELECT d.id AS destinationId, plm.member_id AS memberId
       FROM trip_destinations d JOIN packing_list_members plm ON plm.packing_list_id = d.packing_list_id
       WHERE d.trip_id = ? AND d.deleted_at IS NULL AND d.id != ? AND plm.member_id IN (${placeholders})
       LIMIT 1`,
      [tripId, exceptDestinationId ?? '', ...memberIds]
    );
    return row ? new DestinationConflictError(row.memberId, row.destinationId) : null;
  }

  async create(input: InsertDestinationInput): Promise<TripDestination> {
    const db = await getDb();
    const conflict = await this.findConflict(db, input.tripId, input.memberIds);
    if (conflict) throw conflict;
    const id = await withTransaction(db, () => this.insertDestinationTx(db, input));
    return (await this.getById(id))!;
  }

  // Caller owns the transaction.
  async insertDestinationTx(db: Database, input: InsertDestinationInput): Promise<string> {
    await this.assertFamilyMembers(db, input.familyId, input.memberIds);
    const now = new Date().toISOString();
    let listId = input.packingListId;
    if (listId) {
      const list = await db.get(
        `SELECT id FROM packing_lists WHERE id = ? AND family_id = ? AND deleted_at IS NULL`,
        [listId, input.familyId]
      );
      if (!list) throw new DestinationValidationError('list_not_found');
      const taken = await db.get(
        `SELECT id FROM trip_destinations WHERE packing_list_id = ? AND deleted_at IS NULL`,
        [listId]
      );
      if (taken) throw new DestinationValidationError('list_already_destination');
    } else {
      listId = uuidv4();
      await db.run(
        `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [listId, input.familyId, input.listName, now, now]
      );
    }
    await this.writeMembersTx(db, listId, input.memberIds);
    await db.run(`INSERT OR IGNORE INTO trip_packing_lists (trip_id, packing_list_id) VALUES (?, ?)`, [input.tripId, listId]);
    const stats = await db.get(
      `SELECT COUNT(*) AS count, COALESCE(MAX(position), -1) AS maxPosition
       FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
      [input.tripId]
    );
    const id = uuidv4();
    await db.run(
      `INSERT INTO trip_destinations (id, trip_id, name, color, position, packing_list_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.tripId, input.name, DESTINATION_COLORS[stats.count % DESTINATION_COLORS.length], stats.maxPosition + 1, listId, now, now]
    );
    await this.ensureParticipantsTx(db, input.tripId, input.memberIds);
    return id;
  }

  async update(
    id: string,
    familyId: string,
    updates: { name?: string; color?: string; position?: number; memberIds?: string[] }
  ): Promise<TripDestination> {
    const db = await getDb();
    const existing = await this.getById(id);
    if (!existing) throw new DestinationValidationError('not_found');
    if (updates.memberIds) {
      const conflict = await this.findConflict(db, existing.tripId, updates.memberIds, id);
      if (conflict) throw conflict;
      await this.assertFamilyMembers(db, familyId, updates.memberIds);
    }
    await withTransaction(db, async () => {
      const fields: string[] = [];
      const values: unknown[] = [];
      if (typeof updates.name === 'string') { fields.push('name = ?'); values.push(updates.name); }
      if (typeof updates.color === 'string') { fields.push('color = ?'); values.push(updates.color); }
      if (typeof updates.position === 'number') { fields.push('position = ?'); values.push(updates.position); }
      if (fields.length > 0) {
        await db.run(
          `UPDATE trip_destinations SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`,
          [...values, new Date().toISOString(), id]
        );
      }
      if (updates.memberIds) {
        await this.writeMembersTx(db, existing.packingListId, updates.memberIds);
        await this.ensureParticipantsTx(db, existing.tripId, updates.memberIds);
      }
    });
    return (await this.getById(id))!;
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.run(`UPDATE trip_destinations SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
  }

  private async withMembers(db: Database, row: any): Promise<TripDestination> {
    const members = await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [row.packingListId]);
    return { ...row, memberIds: members.map((m: any) => m.member_id) };
  }

  private async assertFamilyMembers(db: Database, familyId: string, memberIds: string[]): Promise<void> {
    if (!Array.isArray(memberIds) || memberIds.length === 0) throw new DestinationValidationError('members_required');
    const unique = Array.from(new Set(memberIds));
    const placeholders = unique.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT id FROM users WHERE familyId = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      [familyId, ...unique]
    );
    if (rows.length !== unique.length) throw new DestinationValidationError('invalid_members');
  }

  private async writeMembersTx(db: Database, listId: string, memberIds: string[]): Promise<void> {
    await db.run(`DELETE FROM packing_list_members WHERE packing_list_id = ?`, [listId]);
    for (const memberId of memberIds) {
      await db.run(`INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [listId, memberId]);
    }
  }

  private async ensureParticipantsTx(db: Database, tripId: string, memberIds: string[]): Promise<void> {
    for (const userId of memberIds) {
      const existing = await db.get(`SELECT id FROM trip_participants WHERE trip_id = ? AND user_id = ?`, [tripId, userId]);
      if (existing) continue;
      const user = await db.get(`SELECT name, username FROM users WHERE id = ?`, [userId]);
      await db.run(
        `INSERT INTO trip_participants (id, trip_id, user_id, display_name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), tripId, userId, user?.name || user?.username || 'Traveler']
      );
    }
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/repositories/tripDestinationRepository.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add server/repositories/tripDestinationRepository.ts server/repositories/tripDestinationRepository.test.ts
git commit -m "feat(server): TripDestinationRepository with one-destination-per-person rule

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Deleting a trip soft-deletes its destinations

**Files:**
- Modify: `server/repositories/tripRepository.ts` (`deleteTrip`, around line 90)
- Test: `server/repositories/tripDestinationRepository.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside `describe('TripDestinationRepository', ...)`, and add `import { TripRepository } from './tripRepository';` at the top:

```ts
  it('drops destinations but keeps their lists when the trip is deleted', async () => {
    const paris = await createParis();
    await new TripRepository().deleteTrip(seed.tripId);
    expect(await repo.listForTrip(seed.tripId)).toEqual([]);
    const row = await seed.db.get(`SELECT deleted_at FROM trip_destinations WHERE id = ?`, [paris.id]);
    expect(row.deleted_at).not.toBeNull();
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [paris.packingListId]);
    expect(list.deleted_at).toBeNull();
  });
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run server/repositories/tripDestinationRepository.test.ts -t "trip is deleted"`
Expected: FAIL. `listForTrip` still returns Paris.

- [ ] **Step 3: Implement**

In `server/repositories/tripRepository.ts`, change `deleteTrip` to:

```ts
  async deleteTrip(tripId: string): Promise<void> {
    const db = await this.db;
    await db.run(
      `UPDATE trips SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [tripId]
    );
    // Destination lists are kept as ordinary packing lists.
    await db.run(
      `UPDATE trip_destinations SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE trip_id = ? AND deleted_at IS NULL`,
      [tripId]
    );
  }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/repositories/tripDestinationRepository.test.ts server/repositories/tripRepository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/repositories/tripRepository.ts server/repositories/tripDestinationRepository.test.ts
git commit -m "feat(server): deleting a trip retires its destinations

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Split service

**Files:**
- Create: `server/services/tripSplitService.ts`
- Test: `server/services/tripSplitService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/services/tripSplitService.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb } from '../db';
import { splitListIntoTrip } from './tripSplitService';
import { DestinationValidationError, TripDestinationRepository } from '../repositories/tripDestinationRepository';
import {
  seedFamilyTrip, createList, createMasterItem, addToList, setCheck, listRows, checksFor,
} from '../test-utils/destinationFixtures';

describe('splitListIntoTrip', () => {
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  let sourceListId: string;

  beforeEach(async () => {
    seed = await seedFamilyTrip();
    sourceListId = await createList(seed.familyId, 'Spring list', [seed.dad, seed.mom, seed.ava, seed.leo]);
  });

  afterEach(async () => {
    await closeDb();
  });

  const split = (sharedItemsDestinationIndex = 0) =>
    splitListIntoTrip({
      tripId: seed.tripId,
      tripName: 'Spring Break',
      familyId: seed.familyId,
      sourceListId,
      destinations: [
        { name: 'Paris', memberIds: [seed.dad, seed.mom] },
        { name: "Grandma's", memberIds: [seed.ava, seed.leo] },
      ],
      sharedItemsDestinationIndex,
    });

  it('keeps the source list as the first destination and creates the others', async () => {
    const result = await split();
    expect(result.destinations.map(d => d.name)).toEqual(['Paris', "Grandma's"]);
    expect(result.destinations[0].packingListId).toBe(sourceListId);
    expect(result.destinations[0].memberIds.sort()).toEqual([seed.dad, seed.mom].sort());
    expect(result.destinations[1].memberIds.sort()).toEqual([seed.ava, seed.leo].sort());
  });

  it('moves personal items to the owner destination and copies shared-owner items with their checks', async () => {
    const passport = await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] });
    const teddy = await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] });
    const toothbrush = await createMasterItem(seed.familyId, 'Toothbrush', { memberIds: [seed.dad, seed.ava] });
    const passportRow = await addToList(sourceListId, passport);
    const teddyRow = await addToList(sourceListId, teddy);
    const toothbrushRow = await addToList(sourceListId, toothbrush);
    await setCheck(toothbrushRow, seed.dad, true);
    await setCheck(toothbrushRow, seed.ava, true);

    const result = await split();
    const grandmaList = result.destinations[1].packingListId;

    expect((await listRows(sourceListId)).map(r => r.id).sort()).toEqual([passportRow, toothbrushRow].sort());
    const grandmaRows = await listRows(grandmaList);
    expect(grandmaRows.map(r => r.item_id).sort()).toEqual([teddy, toothbrush].sort());
    expect(grandmaRows.find(r => r.item_id === teddy)!.id).toBe(teddyRow);

    expect(await checksFor(toothbrushRow)).toEqual([{ member_id: seed.dad, checked: 1 }]);
    const copy = grandmaRows.find(r => r.item_id === toothbrush)!;
    expect(await checksFor(copy.id)).toEqual([{ member_id: seed.ava, checked: 1 }]);
  });

  it('sends shared items to the chosen destination with their checks', async () => {
    const sunscreen = await createMasterItem(seed.familyId, 'Sunscreen', { wholeFamily: true });
    const row = await addToList(sourceListId, sunscreen);
    await setCheck(row, null, true);

    const result = await split(1);

    expect(await listRows(sourceListId)).toEqual([]);
    expect((await listRows(result.destinations[1].packingListId)).map(r => r.id)).toEqual([row]);
    expect(await checksFor(row)).toEqual([{ member_id: null, checked: 1 }]);
  });

  it('counts items that belong to no one at any destination', async () => {
    const orphan = await createMasterItem(seed.familyId, 'Mystery box');
    const row = await addToList(sourceListId, orphan);
    const result = await split();
    expect(result.skippedCount).toBe(1);
    expect((await listRows(sourceListId)).map(r => r.id)).toEqual([row]);
  });

  it('rejects fewer than two destinations', async () => {
    await expect(
      splitListIntoTrip({
        tripId: seed.tripId, tripName: 'Spring Break', familyId: seed.familyId, sourceListId,
        destinations: [{ name: 'Paris', memberIds: [seed.dad] }], sharedItemsDestinationIndex: 0,
      })
    ).rejects.toThrow('need_two_destinations');
  });

  it('rejects one person in two destinations', async () => {
    await expect(
      splitListIntoTrip({
        tripId: seed.tripId, tripName: 'Spring Break', familyId: seed.familyId, sourceListId,
        destinations: [{ name: 'Paris', memberIds: [seed.dad] }, { name: 'Rome', memberIds: [seed.dad] }],
        sharedItemsDestinationIndex: 0,
      })
    ).rejects.toThrow('member_in_two_destinations');
  });

  it('rolls everything back when a later destination is invalid', async () => {
    const before = await seed.db.get(`SELECT COUNT(*) AS n FROM packing_lists`);
    await expect(
      splitListIntoTrip({
        tripId: seed.tripId, tripName: 'Spring Break', familyId: seed.familyId, sourceListId,
        destinations: [{ name: 'Paris', memberIds: [seed.dad] }, { name: 'Rome', memberIds: ['not-a-user'] }],
        sharedItemsDestinationIndex: 0,
      })
    ).rejects.toBeInstanceOf(DestinationValidationError);
    expect(await new TripDestinationRepository().listForTrip(seed.tripId)).toEqual([]);
    const after = await seed.db.get(`SELECT COUNT(*) AS n FROM packing_lists`);
    expect(after.n).toBe(before.n);
    const members = await seed.db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [sourceListId]);
    expect(members).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/services/tripSplitService.test.ts`
Expected: FAIL with "Cannot find module './tripSplitService'".

- [ ] **Step 3: Implement the split service**

Create `server/services/tripSplitService.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { broadcastEvent } from '../sse';
import { withTransaction } from '../utils/transaction';
import {
  TripDestination,
  TripDestinationRepository,
  DestinationValidationError,
} from '../repositories/tripDestinationRepository';

export interface SplitInput {
  tripId: string;
  tripName: string;
  familyId: string;
  sourceListId: string;
  destinations: { name: string; memberIds: string[] }[];
  sharedItemsDestinationIndex: number;
}

export interface SplitResult {
  destinations: TripDestination[];
  skippedCount: number;
}

export class MoveValidationError extends Error {}

const destinationRepo = new TripDestinationRepository();

function notify(listIds: string[], change: 'split' | 'move') {
  for (const listId of listIds) {
    try {
      broadcastEvent({ type: 'packing_list_changed', listId, data: { change } });
    } catch {
      // best effort
    }
  }
}

function validateSplitInput(input: SplitInput) {
  if (!Array.isArray(input.destinations) || input.destinations.length < 2) {
    throw new DestinationValidationError('need_two_destinations');
  }
  const seen = new Set<string>();
  for (const dest of input.destinations) {
    if (!dest || typeof dest.name !== 'string' || !dest.name.trim()) {
      throw new DestinationValidationError('destination_name_required');
    }
    if (!Array.isArray(dest.memberIds) || dest.memberIds.length === 0) {
      throw new DestinationValidationError('members_required');
    }
    for (const memberId of dest.memberIds) {
      if (seen.has(memberId)) throw new DestinationValidationError('member_in_two_destinations');
      seen.add(memberId);
    }
  }
  const index = input.sharedItemsDestinationIndex;
  if (!Number.isInteger(index) || index < 0 || index >= input.destinations.length) {
    throw new DestinationValidationError('invalid_shared_destination');
  }
}

async function moveRowTx(db: Database, pliId: string, listId: string) {
  await db.run(`UPDATE packing_list_items SET packing_list_id = ? WHERE id = ?`, [listId, pliId]);
}

async function copyRowForMembersTx(db: Database, pliId: string, listId: string, memberIds: string[]) {
  const newId = uuidv4();
  await db.run(
    `INSERT INTO packing_list_items (id, packing_list_id, item_id, display_name, checked, added_during_packing, not_needed, created_at)
     SELECT ?, ?, item_id, display_name, 0, added_during_packing, 0, created_at FROM packing_list_items WHERE id = ?`,
    [newId, listId, pliId]
  );
  await db.run(
    `INSERT INTO packing_list_item_templates (packing_list_item_id, template_id, created_at)
     SELECT ?, template_id, created_at FROM packing_list_item_templates WHERE packing_list_item_id = ?`,
    [newId, pliId]
  );
  const placeholders = memberIds.map(() => '?').join(',');
  await db.run(
    `UPDATE packing_list_item_checks SET packing_list_item_id = ? WHERE packing_list_item_id = ? AND member_id IN (${placeholders})`,
    [newId, pliId, ...memberIds]
  );
  await db.run(
    `UPDATE packing_list_item_not_needed SET packing_list_item_id = ? WHERE packing_list_item_id = ? AND member_id IN (${placeholders})`,
    [newId, pliId, ...memberIds]
  );
}

async function distributeItemsTx(db: Database, input: SplitInput, listIds: string[]): Promise<number> {
  const destinationOf = new Map<string, number>();
  input.destinations.forEach((dest, index) => dest.memberIds.forEach(m => destinationOf.set(m, index)));

  const rows = await db.all(
    `SELECT pli.id, pli.item_id AS itemId, CASE WHEN iwf.item_id IS NULL THEN 0 ELSE 1 END AS whole
     FROM packing_list_items pli LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
     WHERE pli.packing_list_id = ?`,
    [input.sourceListId]
  );

  let skipped = 0;
  for (const row of rows as { id: string; itemId: string | null; whole: number }[]) {
    if (row.whole) {
      if (input.sharedItemsDestinationIndex !== 0) {
        await moveRowTx(db, row.id, listIds[input.sharedItemsDestinationIndex]);
      }
      continue;
    }
    const owners = row.itemId
      ? await db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [row.itemId])
      : [];
    const membersByDestination = new Map<number, string[]>();
    for (const { member_id } of owners as { member_id: string }[]) {
      const index = destinationOf.get(member_id);
      if (index === undefined) continue;
      membersByDestination.set(index, [...(membersByDestination.get(index) || []), member_id]);
    }
    if (membersByDestination.size === 0) {
      skipped++;
      continue;
    }
    // Sorted, so the original row stays in destination 0 whenever one of its owners is there.
    const indexes = Array.from(membersByDestination.keys()).sort((a, b) => a - b);
    if (indexes[0] !== 0) await moveRowTx(db, row.id, listIds[indexes[0]]);
    for (const index of indexes.slice(1)) {
      await copyRowForMembersTx(db, row.id, listIds[index], membersByDestination.get(index)!);
    }
  }
  return skipped;
}

export async function splitListIntoTrip(input: SplitInput): Promise<SplitResult> {
  validateSplitInput(input);
  const db = await getDb();
  const conflict = await destinationRepo.findConflict(db, input.tripId, input.destinations.flatMap(d => d.memberIds));
  if (conflict) throw conflict;

  const listIds: string[] = [];
  const skippedCount = await withTransaction(db, async () => {
    for (const [index, dest] of input.destinations.entries()) {
      const name = dest.name.trim();
      const destinationId = await destinationRepo.insertDestinationTx(db, {
        tripId: input.tripId,
        familyId: input.familyId,
        name,
        memberIds: dest.memberIds,
        listName: `${input.tripName} – ${name}`,
        packingListId: index === 0 ? input.sourceListId : undefined,
      });
      const row = await db.get(`SELECT packing_list_id AS listId FROM trip_destinations WHERE id = ?`, [destinationId]);
      listIds.push(row.listId);
    }
    return distributeItemsTx(db, input, listIds);
  });

  notify(listIds, 'split');
  return { destinations: await destinationRepo.listForTrip(input.tripId), skippedCount };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/services/tripSplitService.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/tripSplitService.ts server/services/tripSplitService.test.ts
git commit -m "feat(server): split a packing list into trip destinations

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Move shared items between destinations

**Files:**
- Modify: `server/services/tripSplitService.ts`
- Test: `server/services/tripSplitService.test.ts`

- [ ] **Step 1: Write the failing tests**

In `server/services/tripSplitService.test.ts`, change the service import to `import { splitListIntoTrip, moveSharedItem, moveAllSharedItems, MoveValidationError } from './tripSplitService';` and append:

```ts
describe('moveSharedItem', () => {
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  let parisList: string;
  let grandmaList: string;

  beforeEach(async () => {
    seed = await seedFamilyTrip();
    const source = await createList(seed.familyId, 'Spring list', [seed.dad, seed.mom, seed.ava, seed.leo]);
    const result = await splitListIntoTrip({
      tripId: seed.tripId, tripName: 'Spring Break', familyId: seed.familyId, sourceListId: source,
      destinations: [{ name: 'Paris', memberIds: [seed.dad, seed.mom] }, { name: "Grandma's", memberIds: [seed.ava, seed.leo] }],
      sharedItemsDestinationIndex: 0,
    });
    parisList = result.destinations[0].packingListId;
    grandmaList = result.destinations[1].packingListId;
  });

  afterEach(async () => {
    await closeDb();
  });

  it('moves a shared item with its checks', async () => {
    const item = await createMasterItem(seed.familyId, 'Car seat', { wholeFamily: true });
    const row = await addToList(parisList, item);
    await setCheck(row, null, true);

    const moved = await moveSharedItem({ fromListId: parisList, pliId: row, toListId: grandmaList });

    expect(moved).toEqual({ id: row, listId: grandmaList });
    expect(await listRows(parisList)).toEqual([]);
    expect((await listRows(grandmaList)).map(r => r.id)).toEqual([row]);
    expect(await checksFor(row)).toEqual([{ member_id: null, checked: 1 }]);
  });

  it('merges into an existing row and keeps it checked if either was checked', async () => {
    const item = await createMasterItem(seed.familyId, 'Sunscreen', { wholeFamily: true });
    const source = await addToList(parisList, item);
    const target = await addToList(grandmaList, item);
    await setCheck(source, null, true);

    const moved = await moveSharedItem({ fromListId: parisList, pliId: source, toListId: grandmaList });

    expect(moved.id).toBe(target);
    expect(await listRows(parisList)).toEqual([]);
    expect(await checksFor(target)).toEqual([{ member_id: null, checked: 1 }]);
    expect(await checksFor(source)).toEqual([]);
  });

  it('refuses to move personal items', async () => {
    const item = await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] });
    const row = await addToList(parisList, item);
    await expect(moveSharedItem({ fromListId: parisList, pliId: row, toListId: grandmaList }))
      .rejects.toThrow('personal_item');
  });

  it('refuses lists that are not destinations of the same trip', async () => {
    const other = await createList(seed.familyId, 'Other', [seed.dad]);
    const item = await createMasterItem(seed.familyId, 'Umbrella', { wholeFamily: true });
    const row = await addToList(parisList, item);
    await expect(moveSharedItem({ fromListId: parisList, pliId: row, toListId: other }))
      .rejects.toBeInstanceOf(MoveValidationError);
  });

  it('moves all shared items at once', async () => {
    const a = await addToList(parisList, await createMasterItem(seed.familyId, 'A', { wholeFamily: true }));
    const b = await addToList(parisList, await createMasterItem(seed.familyId, 'B', { wholeFamily: true }));
    await addToList(parisList, await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] }));

    expect(await moveAllSharedItems(parisList, grandmaList)).toBe(2);
    expect((await listRows(grandmaList)).map(r => r.id).sort()).toEqual([a, b].sort());
    expect(await listRows(parisList)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/services/tripSplitService.test.ts -t moveSharedItem`
Expected: FAIL. `moveSharedItem` is not exported.

- [ ] **Step 3: Implement**

Append to `server/services/tripSplitService.ts`:

```ts
async function moveSharedRowTx(db: Database, row: { id: string; itemId: string | null }, toListId: string): Promise<string> {
  const existing = row.itemId
    ? await db.get(`SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [toListId, row.itemId])
    : null;
  if (!existing) {
    await moveRowTx(db, row.id, toListId);
    return row.id;
  }
  const sourceChecked = await db.get(
    `SELECT 1 AS yes FROM packing_list_item_checks WHERE packing_list_item_id = ? AND checked = 1 LIMIT 1`,
    [row.id]
  );
  const targetChecked = await db.get(
    `SELECT 1 AS yes FROM packing_list_item_checks WHERE packing_list_item_id = ? AND checked = 1 LIMIT 1`,
    [existing.id]
  );
  if (sourceChecked && !targetChecked) {
    await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [existing.id]);
    await db.run(
      `INSERT INTO packing_list_item_checks (id, packing_list_item_id, member_id, checked, checked_at) VALUES (?, ?, NULL, 1, ?)`,
      [uuidv4(), existing.id, new Date().toISOString()]
    );
  }
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed', 'packing_list_item_templates']) {
    await db.run(`DELETE FROM ${table} WHERE packing_list_item_id = ?`, [row.id]);
  }
  await db.run(`DELETE FROM packing_list_items WHERE id = ?`, [row.id]);
  return existing.id;
}

export async function moveSharedItem(input: { fromListId: string; pliId: string; toListId: string }): Promise<{ id: string; listId: string }> {
  const from = await destinationRepo.findByPackingListId(input.fromListId);
  const to = await destinationRepo.findByPackingListId(input.toListId);
  if (!from || !to || from.tripId !== to.tripId || from.id === to.id) {
    throw new MoveValidationError('not_same_trip');
  }
  const db = await getDb();
  const row = await db.get(
    `SELECT pli.id, pli.item_id AS itemId, CASE WHEN iwf.item_id IS NULL THEN 0 ELSE 1 END AS whole
     FROM packing_list_items pli LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
     WHERE pli.id = ? AND pli.packing_list_id = ?`,
    [input.pliId, input.fromListId]
  );
  if (!row) throw new MoveValidationError('item_not_found');
  if (!row.whole) throw new MoveValidationError('personal_item');

  const id = await withTransaction(db, () => moveSharedRowTx(db, row, input.toListId));
  notify([input.fromListId, input.toListId], 'move');
  return { id, listId: input.toListId };
}

export async function moveAllSharedItems(fromListId: string, toListId: string): Promise<number> {
  const db = await getDb();
  const rows = await db.all(
    `SELECT pli.id FROM packing_list_items pli JOIN item_whole_family iwf ON iwf.item_id = pli.item_id WHERE pli.packing_list_id = ?`,
    [fromListId]
  );
  for (const { id } of rows as { id: string }[]) {
    await moveSharedItem({ fromListId, pliId: id, toListId });
  }
  return rows.length;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run server/services/tripSplitService.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/tripSplitService.ts server/services/tripSplitService.test.ts
git commit -m "feat(server): move shared items between trip destinations

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: HTTP routes

**Files:**
- Modify: `server/routes/tripRoutes.ts` (imports at the top; new routes appended at the end of the file)
- Modify: `server/routes.ts` (imports near line 17; `GET /families/:familyId/packing-lists` around line 699; `GET /packing-lists/:id` around line 751; new move route after the `not-needed` route around line 1122)
- Test: `server/__tests__/trip-destinations.routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `server/__tests__/trip-destinations.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import routes from '../routes';
import { closeDb } from '../db';
import { generateToken } from '../auth';
import { seedFamilyTrip, createList, createMasterItem, addToList, listRows } from '../test-utils/destinationFixtures';

describe('trip destination routes', () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  let auth: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);
    seed = await seedFamilyTrip();
    const dadRow = await seed.db.get(`SELECT * FROM users WHERE id = ?`, [seed.dad]);
    auth = `Bearer ${generateToken(dadRow)}`;
  });

  afterEach(async () => {
    await closeDb();
  });

  const splitSource = async () => {
    const source = await createList(seed.familyId, 'Spring list', [seed.dad, seed.mom, seed.ava, seed.leo]);
    const res = await request(app)
      .post(`/api/trips/${seed.tripId}/split`)
      .set('Authorization', auth)
      .send({
        sourceListId: source,
        destinations: [
          { name: 'Paris', memberIds: [seed.dad, seed.mom] },
          { name: "Grandma's", memberIds: [seed.ava, seed.leo] },
        ],
        sharedItemsDestinationIndex: 0,
      });
    return { source, res };
  };

  it('creates and lists destinations', async () => {
    const created = await request(app)
      .post(`/api/trips/${seed.tripId}/destinations`)
      .set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad, seed.mom] });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Paris');

    const listed = await request(app).get(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth);
    expect(listed.status).toBe(200);
    expect(listed.body.map((d: any) => d.name)).toEqual(['Paris']);
  });

  it('returns 409 when a person is already in another destination', async () => {
    await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad] });
    const res = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.dad] });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'member_in_other_destination', memberId: seed.dad });
  });

  it('returns 400 for missing name or members', async () => {
    const res = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: '', memberIds: [] });
    expect(res.status).toBe(400);
  });

  it('splits a list and exposes the trip on list responses', async () => {
    const { source, res } = await splitSource();
    expect(res.status).toBe(201);
    expect(res.body.skippedCount).toBe(0);
    expect(res.body.destinations).toHaveLength(2);

    const detail = await request(app).get(`/api/packing-lists/${source}`).set('Authorization', auth);
    expect(detail.body.trip_destination.tripName).toBe('Spring Break');
    expect(detail.body.trip_destination.destinations.map((d: any) => d.name)).toEqual(['Paris', "Grandma's"]);

    const lists = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const sourceSummary = lists.body.lists.find((l: any) => l.id === source);
    expect(sourceSummary.trip_destination).toMatchObject({ tripName: 'Spring Break', destinationName: 'Paris', position: 0, destinationCount: 2 });
  });

  it('returns trip_destination null for ordinary lists', async () => {
    const listId = await createList(seed.familyId, 'Plain', [seed.dad]);
    const detail = await request(app).get(`/api/packing-lists/${listId}`).set('Authorization', auth);
    expect(detail.body.trip_destination).toBeNull();
  });

  it('moves a shared item between destinations', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const row = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Car seat', { wholeFamily: true }));

    const moved = await request(app)
      .post(`/api/packing-lists/${paris.packingListId}/items/${row}/move`)
      .set('Authorization', auth)
      .send({ toListId: grandma.packingListId });
    expect(moved.status).toBe(200);
    expect(moved.body.item).toEqual({ id: row, listId: grandma.packingListId });
    expect((await listRows(grandma.packingListId)).map(r => r.id)).toEqual([row]);
  });

  it('returns 400 when moving a personal item', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const row = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] }));
    const moved = await request(app)
      .post(`/api/packing-lists/${paris.packingListId}/items/${row}/move`)
      .set('Authorization', auth)
      .send({ toListId: grandma.packingListId });
    expect(moved.status).toBe(400);
    expect(moved.body.error).toBe('personal_item');
  });

  it('refuses to delete a destination with items unless told what to do', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    await addToList(grandma.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));

    const refused = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth).send({});
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('destination_has_items');

    const deleted = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ deleteList: true });
    expect(deleted.status).toBe(204);
    const listed = await request(app).get(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth);
    expect(listed.body.map((d: any) => d.id)).toEqual([paris.id]);
  });

  it('updates a destination', async () => {
    const { res } = await splitSource();
    const paris = res.body.destinations[0];
    const updated = await request(app).put(`/api/trips/${seed.tripId}/destinations/${paris.id}`).set('Authorization', auth)
      .send({ name: 'Lyon' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Lyon');
  });

  it('denies access to another family', async () => {
    const other = await seedFamilyTrip();
    const otherDad = await other.db.get(`SELECT * FROM users WHERE id = ?`, [other.dad]);
    const res = await request(app).get(`/api/trips/${seed.tripId}/destinations`)
      .set('Authorization', `Bearer ${generateToken(otherDad)}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run server/__tests__/trip-destinations.routes.test.ts`
Expected: FAIL with 404s from the missing routes.

- [ ] **Step 3: Add the trip routes**

In `server/routes/tripRoutes.ts`, add these imports below the existing ones:

```ts
import { getDb } from '../db';
import { PackingListRepository } from '../repositories';
import {
  TripDestinationRepository,
  DestinationConflictError,
  DestinationValidationError,
} from '../repositories/tripDestinationRepository';
import { splitListIntoTrip, moveAllSharedItems } from '../services/tripSplitService';
```

Below the existing repository instances, add:

```ts
const tripDestinationRepository = new TripDestinationRepository();
const packingListRepository = new PackingListRepository();

function sendDestinationError(res: Response, error: unknown, fallback: string) {
  if (error instanceof DestinationConflictError) {
    return res.status(409).json({ error: 'member_in_other_destination', memberId: error.memberId, destinationId: error.destinationId });
  }
  if (error instanceof DestinationValidationError) {
    return res.status(error.message === 'not_found' ? 404 : 400).json({ error: error.message });
  }
  return res.status(500).json({ error: fallback });
}
```

Append these routes at the end of the file:

```ts
// Destinations: one packing list per group of travelers
tripRouter.get('/:tripId/destinations', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    res.json(await tripDestinationRepository.listForTrip(req.trip!.id));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch destinations' });
  }
});

tripRouter.post('/:tripId/destinations', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const { name, memberIds, itemGroupIds, packingListId } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!Array.isArray(memberIds) || memberIds.length === 0) return res.status(400).json({ error: 'memberIds is required' });
  const groupIds: string[] = Array.isArray(itemGroupIds) ? itemGroupIds : [];
  try {
    if (groupIds.length > 0) {
      const db = await getDb();
      const placeholders = groupIds.map(() => '?').join(',');
      const found = await db.all(
        `SELECT id FROM templates WHERE family_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
        [req.trip!.family_id, ...groupIds]
      );
      if (found.length !== new Set(groupIds).size) return res.status(400).json({ error: 'invalid_item_groups' });
    }
    const destination = await tripDestinationRepository.create({
      tripId: req.trip!.id,
      familyId: req.trip!.family_id,
      name: name.trim(),
      memberIds,
      listName: `${req.trip!.name} – ${name.trim()}`,
      packingListId: typeof packingListId === 'string' && packingListId ? packingListId : undefined,
    });
    if (groupIds.length > 0) {
      const current = await packingListRepository.getTemplatesForPackingList(destination.packingListId);
      await packingListRepository.setTemplatesForPackingList(destination.packingListId, Array.from(new Set([...current, ...groupIds])));
      for (const groupId of groupIds) {
        await packingListRepository.reconcilePackingListAgainstTemplate(destination.packingListId, groupId);
      }
    }
    return res.status(201).json(destination);
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to create destination');
  }
});

tripRouter.put('/:tripId/destinations/:destinationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const existing = await tripDestinationRepository.getById(req.params.destinationId);
    if (!existing || existing.tripId !== req.trip!.id) return res.status(404).json({ error: 'Destination not found' });
    const { name, color, position, memberIds } = req.body || {};
    if (memberIds !== undefined && (!Array.isArray(memberIds) || memberIds.length === 0)) {
      return res.status(400).json({ error: 'memberIds must be a non-empty array' });
    }
    const updated = await tripDestinationRepository.update(existing.id, req.trip!.family_id, {
      name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
      color: typeof color === 'string' ? color : undefined,
      position: typeof position === 'number' ? position : undefined,
      memberIds,
    });
    return res.json(updated);
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to update destination');
  }
});

tripRouter.delete('/:tripId/destinations/:destinationId', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  try {
    const existing = await tripDestinationRepository.getById(req.params.destinationId);
    if (!existing || existing.tripId !== req.trip!.id) return res.status(404).json({ error: 'Destination not found' });
    const { moveSharedItemsTo, deleteList } = req.body || {};
    const db = await getDb();
    const { count } = await db.get(`SELECT COUNT(*) AS count FROM packing_list_items WHERE packing_list_id = ?`, [existing.packingListId]);
    if (count > 0 && !moveSharedItemsTo && !deleteList) {
      return res.status(409).json({ error: 'destination_has_items', itemCount: count });
    }
    if (moveSharedItemsTo) {
      const target = await tripDestinationRepository.getById(moveSharedItemsTo);
      if (!target || target.tripId !== existing.tripId || target.id === existing.id) {
        return res.status(400).json({ error: 'invalid_target_destination' });
      }
      await moveAllSharedItems(existing.packingListId, target.packingListId);
    }
    await tripDestinationRepository.softDelete(existing.id);
    if (deleteList) {
      await packingListRepository.softDelete(existing.packingListId);
      await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [existing.tripId, existing.packingListId]);
    }
    return res.status(204).send();
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to delete destination');
  }
});

tripRouter.post('/:tripId/split', authMiddleware, tripAccessMiddleware, async (req: Request, res: Response) => {
  const { sourceListId, destinations, sharedItemsDestinationIndex } = req.body || {};
  if (typeof sourceListId !== 'string' || !sourceListId) return res.status(400).json({ error: 'sourceListId is required' });
  try {
    const result = await splitListIntoTrip({
      tripId: req.trip!.id,
      tripName: req.trip!.name,
      familyId: req.trip!.family_id,
      sourceListId,
      destinations,
      sharedItemsDestinationIndex: Number(sharedItemsDestinationIndex ?? 0),
    });
    return res.status(201).json(result);
  } catch (error) {
    return sendDestinationError(res, error, 'Failed to split list');
  }
});
```

- [ ] **Step 4: Update `server/routes.ts`**

Add these imports next to `import { tripRouter } from './routes/tripRoutes';`:

```ts
import { TripDestinationRepository } from './repositories/tripDestinationRepository';
import { moveSharedItem, MoveValidationError } from './services/tripSplitService';
```

Next to the other repository instances (search for `const packingListRepo = new PackingListRepository()`), add:

```ts
const tripDestinationRepo = new TripDestinationRepository();
```

In `GET /families/:familyId/packing-lists`, replace the loop body so that each list gets a summary:

```ts
    const lists = await packingListRepo.findAll(familyId);
    const summaries = await tripDestinationRepo.getListSummariesForFamily(familyId);
    // Attach member_ids for each list to keep responses lightweight
    const listsWithMembers = [] as any[];
    for (const l of lists) {
      const memberIds = await packingListRepo.getMemberIdsForPackingList(l.id);
      const { notes: _notes, ...listSummary } = l as any;
      listsWithMembers.push({ ...listSummary, member_ids: memberIds, trip_destination: summaries.get(l.id) ?? null });
    }
```

In `GET /packing-lists/:id`, replace the final `return res.json(...)` with:

```ts
  const tripDestination = await tripDestinationRepo.getTripContextForList(id);
  return res.json({ list: listWithNotes, items: sanitizedItems, checks, not_needed_rows: notNeededRows, template_ids: templateIds, trip_destination: tripDestination });
```

After the `router.patch('/packing-lists/:listId/items/:itemId/not-needed', ...)` handler, add:

```ts
// Move a shared (whole-family) item to another destination of the same trip
router.post('/packing-lists/:listId/items/:pliId/move', authMiddleware, async (req: Request, res: Response) => {
  const { listId, pliId } = req.params;
  const { toListId } = req.body || {};
  if (typeof toListId !== 'string' || !toListId) return res.status(400).json({ error: 'toListId is required' });
  try {
    const list = await packingListRepo.findById(listId);
    if (!list) return res.status(404).json({ error: 'Packing list not found' });
    if (req.user?.role !== 'SystemAdmin' && req.user?.familyId !== list.family_id) return res.status(403).json({ error: 'Forbidden' });
    const item = await moveSharedItem({ fromListId: listId, pliId, toListId });
    return res.json({ item });
  } catch (error) {
    if (error instanceof MoveValidationError) {
      return res.status(error.message === 'item_not_found' ? 404 : 400).json({ error: error.message });
    }
    console.error('Error moving packing list item:', error);
    return res.status(500).json({ error: 'Failed to move item' });
  }
});
```

- [ ] **Step 5: Run the route tests and the related suites**

Run: `npx vitest run server/__tests__/trip-destinations.routes.test.ts server/__tests__/packing-list.integration.test.ts server/__tests__/active-packing-list.events.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check the server**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes/tripRoutes.ts server/routes.ts server/__tests__/trip-destinations.routes.test.ts
git commit -m "feat(server): destination, split and move routes; trip context on list responses

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Addendum (from Task 2 review): keep the one-destination rule on the plain list-edit route

`PUT /packing-lists/:id` in `server/routes.ts` (the `// Persist memberIds if provided` block, about line 881) calls `packingListRepo.setMemberIdsForPackingList` directly. On a destination list, that skips the one-destination rule and doesn't add new people as trip participants. Fix it inside this task:

- [ ] **Addendum step A: Write a failing supertest** in `server/__tests__/trip-destinations.routes.test.ts`. Set up a trip with two destinations, where person P is in destination 1. Then `PUT /api/packing-lists/<destination 2 list id>` with `{ memberIds: [P] }` should return **409** with `{ error: 'member_in_other_destination', memberId, destinationId }`. Add a second test: putting a new family member Q (not in any destination) into destination 2's list returns 200, and Q is now a `trip_participants` row of the trip.

- [ ] **Addendum step B: Implement.** In the `Array.isArray(updates.memberIds)` block, first call `tripDestinationRepo.findByPackingListId(id)`. Use the same `TripDestinationRepository` instance or import as the trip routes do, and create one at module level in `routes.ts` if needed.
  - If the list belongs to a destination, call `tripDestinationRepo.update(destination.id, existing.family_id, { memberIds: updates.memberIds })`.
    - Map `DestinationConflictError` to 409 `{ error: 'member_in_other_destination', memberId: err.memberId, destinationId: err.destinationId }`.
    - Map `DestinationValidationError` to 400 `{ error: 'Invalid memberIds for this packing list' }`.
  - Otherwise, keep the existing `setMemberIdsForPackingList` path unchanged.
  - Use whatever variable the route already has for the list it loaded (check its name), not necessarily `existing`.

- [ ] **Addendum step C:** Run the route tests and `npx tsc -p tsconfig.build.json --noEmit`, then commit.

---

## Task 7: Client types and API helpers

**Files:**
- Modify: `client/src/types/trip.ts` (append)
- Modify: `client/src/api/tripApi.ts` (`handleResponse`, new error class, new methods at the end of `tripApi`)
- Modify: `client/src/api.ts` (after `setPackingListItemNotNeededForMember`)
- Test: `client/src/__tests__/tripApi.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `client/src/__tests__/tripApi.test.ts`. Change the import to `import { tripApi, ApiConflictError } from '../api/tripApi';`:

```ts
describe('tripApi destinations', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('throws ApiConflictError carrying the body on 409', async () => {
    stubFetch(409, { error: 'member_in_other_destination', memberId: 'u1', destinationId: 'd1' });
    const error = await tripApi.createDestination('t1', { name: 'Paris', memberIds: ['u1'] }).catch(e => e);
    expect(error).toBeInstanceOf(ApiConflictError);
    expect(error.message).toBe('member_in_other_destination');
    expect(error.body).toEqual({ error: 'member_in_other_destination', memberId: 'u1', destinationId: 'd1' });
  });

  it('posts the split payload', async () => {
    stubFetch(201, { destinations: [], skippedCount: 0 });
    const payload = { sourceListId: 'l1', destinations: [{ name: 'A', memberIds: ['u1'] }, { name: 'B', memberIds: ['u2'] }], sharedItemsDestinationIndex: 1 };
    await expect(tripApi.splitList('t1', payload)).resolves.toEqual({ destinations: [], skippedCount: 0 });
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('/api/trips/t1/split');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(payload);
  });

  it('deletes a destination without parsing an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) }));
    await expect(tripApi.deleteDestination('t1', 'd1', { deleteList: true })).resolves.toBeUndefined();
    expect(JSON.parse((fetch as any).mock.calls[0][1].body)).toEqual({ deleteList: true });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run client/src/__tests__/tripApi.test.ts`
Expected: FAIL. `ApiConflictError` and `createDestination` don't exist.

- [ ] **Step 3: Add the types**

Append to `client/src/types/trip.ts`:

```ts
export interface TripDestination {
  id: string;
  tripId: string;
  name: string;
  color: string | null;
  position: number;
  packingListId: string;
  memberIds: string[];
}

/** `trip_destination` on GET /packing-lists/:id */
export interface ListTripContext {
  tripId: string;
  tripName: string;
  destinations: TripDestination[];
}

/** `trip_destination` on each list from GET /families/:familyId/packing-lists */
export interface ListTripSummary {
  tripId: string;
  tripName: string;
  destinationId: string;
  destinationName: string;
  position: number;
  destinationCount: number;
}

export interface DestinationWritePayload {
  name?: string;
  memberIds?: string[];
  itemGroupIds?: string[];
  packingListId?: string;
  color?: string;
  position?: number;
}

export interface SplitListPayload {
  sourceListId: string;
  destinations: { name: string; memberIds: string[] }[];
  sharedItemsDestinationIndex: number;
}

export interface SplitResult {
  destinations: TripDestination[];
  skippedCount: number;
}
```

- [ ] **Step 4: Add the API helpers**

In `client/src/api/tripApi.ts`, add `TripDestination, DestinationWritePayload, SplitListPayload, SplitResult` to the type import. Then replace `handleResponse` with:

```ts
export class ApiConflictError extends Error {
  constructor(message: string, public body: any) {
    super(message);
    this.name = 'ApiConflictError';
  }
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body?.error || `API Error: ${response.status}`;
    if (response.status === 409) throw new ApiConflictError(message, body);
    throw new Error(message);
  }
  return response.json();
}
```

Add these methods at the end of the `tripApi` object, after `removeSeat`:

```ts
  // Destinations (multi-destination packing)
  listDestinations: async (tripId: string): Promise<TripDestination[]> => {
    const response = await fetch(`${API_BASE}/${tripId}/destinations`, { headers: authHeaders() });
    return handleResponse(response);
  },

  createDestination: async (tripId: string, payload: DestinationWritePayload): Promise<TripDestination> => {
    const response = await fetch(`${API_BASE}/${tripId}/destinations`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  updateDestination: async (tripId: string, destinationId: string, payload: DestinationWritePayload): Promise<TripDestination> => {
    const response = await fetch(`${API_BASE}/${tripId}/destinations/${destinationId}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  deleteDestination: async (
    tripId: string,
    destinationId: string,
    options: { moveSharedItemsTo?: string; deleteList?: boolean } = {}
  ): Promise<void> => {
    const response = await fetch(`${API_BASE}/${tripId}/destinations/${destinationId}`, {
      method: 'DELETE',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(options),
    });
    if (!response.ok) await handleResponse(response);
  },

  splitList: async (tripId: string, payload: SplitListPayload): Promise<SplitResult> => {
    const response = await fetch(`${API_BASE}/${tripId}/split`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },
```

In `client/src/api.ts`, add this after `setPackingListItemNotNeededForMember`:

```ts
  export const movePackingListItem = async (listId: string, packingListItemId: string, toListId: string): Promise<ApiResponse> => {
    return authenticatedApiCall(`/packing-lists/${listId}/items/${packingListItemId}/move`, {
      method: 'POST',
      body: JSON.stringify({ toListId }),
    });
  };
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run client/src/__tests__/tripApi.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/types/trip.ts client/src/api/tripApi.ts client/src/api.ts client/src/__tests__/tripApi.test.ts
git commit -m "feat(client): destination, split and move API helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Dashboard group helpers

**Files:**
- Create: `client/src/utils/dashboardGroups.ts`
- Test: `client/src/__tests__/dashboardGroups.test.ts`
- Modify: `vitest.config.ts` (add the test to `include`)

- [ ] **Step 1: Register the test file**

In `vitest.config.ts`, add this line to `include`, after the `bookingCoverage.test.ts` entry:

```ts
      'client/src/__tests__/dashboardGroups.test.ts', // Destination group builder and Person view helpers
```

- [ ] **Step 2: Write the failing tests**

Create `client/src/__tests__/dashboardGroups.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildDestinationGroup, applyCheck, toggleNotNeededIn, isNotNeeded, orderPeople,
  remainingFor, partitionItems, groupProgress, DestinationGroup,
} from '../utils/dashboardGroups';

const family = [
  { id: 'dad', name: 'Dad' },
  { id: 'mom', name: 'Mom' },
  { id: 'ava', name: 'Ava' },
];

const parisData = {
  list: { name: 'Spring – Paris', notes: 'Bring adapters', member_ids: ['dad', 'mom'] },
  items: [
    { id: 'p1', item_id: 'i1', members: [{ id: 'dad' }], whole_family: 0 },
    { id: 'p2', item_id: 'i2', members: [{ id: 'mom' }], whole_family: 0, display_name: 'Mom scarf' },
    { id: 'p3', item_id: 'i3', members: [], whole_family: 1 },
  ],
  checks: [
    { packing_list_item_id: 'p1', member_id: 'dad', checked: 1 },
    { packing_list_item_id: 'p3', member_id: null, checked: 1 },
  ],
  not_needed_rows: [{ packing_list_item_id: 'p2', member_id: 'mom', not_needed: 1 }],
};

const master = [
  { id: 'i1', name: 'Passport' },
  { id: 'i2', name: 'Scarf' },
  { id: 'i3', name: 'Sunscreen' },
];

const paris = () =>
  buildDestinationGroup({
    listId: 'list-paris',
    listData: parisData,
    masterItems: master,
    familyMembers: family,
    currentUserId: 'mom',
    destination: { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-paris', memberIds: ['dad', 'mom'] },
  });

const grandma = (): DestinationGroup =>
  buildDestinationGroup({
    listId: 'list-grandma',
    listData: { list: { notes: '', member_ids: ['ava'] }, items: [{ id: 'g1', item_id: 'i9', members: [{ id: 'ava' }], whole_family: 0, master_name: 'Teddy' }], checks: [] },
    masterItems: master,
    familyMembers: family,
    currentUserId: 'mom',
    destination: { id: 'd2', tripId: 't1', name: "Grandma's", color: 'green', position: 1, packingListId: 'list-grandma', memberIds: ['ava'] },
  });

describe('buildDestinationGroup', () => {
  it('builds per-person and shared items for the list members only', () => {
    const g = paris();
    expect(g).toMatchObject({ destinationId: 'd1', name: 'Paris', color: 'blue', listId: 'list-paris', notes: 'Bring adapters' });
    expect(g.members).toEqual([{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }]);
    expect(g.userLists.map(l => [l.userName, l.items.map(i => `${i.name}:${i.checked}`)])).toEqual([
      ['Dad', ['Passport:true']],
      ['Mom', ['Mom scarf:false']],
    ]);
    expect(g.wholeFamilyItems.map(i => `${i.name}:${i.checked}`)).toEqual(['Sunscreen:true']);
    expect(g.notNeededByUser).toEqual({ mom: ['p2'] });
    expect(g.excludedItemIds).toEqual(['i1', 'i2', 'i3']);
  });

  it('describes an ordinary list with no destination', () => {
    const g = buildDestinationGroup({ listId: 'l1', listData: { list: { name: 'Beach' }, items: [], checks: [] }, masterItems: [], familyMembers: family, currentUserId: null, destination: null });
    expect(g).toMatchObject({ destinationId: null, name: 'Beach', color: null, notes: '' });
    expect(g.members).toHaveLength(3);
  });
});

describe('optimistic helpers', () => {
  it('applyCheck updates only the matching list', () => {
    const [p, g] = applyCheck([paris(), grandma()], 'list-paris', 'mom', 'p2', true);
    expect(p.userLists[1].items[0].checked).toBe(true);
    expect(g).toEqual(grandma());
  });

  it('applyCheck on a shared item updates the shared column', () => {
    const [p] = applyCheck([paris()], 'list-paris', null, 'p3', false);
    expect(p.wholeFamilyItems[0].checked).toBe(false);
  });

  it('toggleNotNeededIn flips per-person and shared state', () => {
    let groups = toggleNotNeededIn([paris()], 'list-paris', 'mom', 'p2');
    expect(isNotNeeded(groups[0], 'mom', 'p2')).toBe(false);
    groups = toggleNotNeededIn(groups, 'list-paris', null, 'p3');
    expect(isNotNeeded(groups[0], null, 'p3')).toBe(true);
  });
});

describe('Person view helpers', () => {
  it('orders people with the current user first, then by group and member order', () => {
    expect(orderPeople([paris(), grandma()], 'mom').map(p => `${p.userName}@${p.listId}`)).toEqual([
      'Mom@list-paris', 'Dad@list-paris', 'Ava@list-grandma',
    ]);
    expect(orderPeople([paris(), grandma()], 'nobody').map(p => p.userName)).toEqual(['Dad', 'Mom', 'Ava']);
  });

  it('counts remaining items, ignoring packed and not-needed ones', () => {
    const g = paris();
    expect(remainingFor(g, 'dad')).toBe(0);
    expect(remainingFor(g, 'mom')).toBe(0);
    expect(remainingFor(grandma(), 'ava')).toBe(1);
  });

  it('partitions items into to-do, packed and not needed', () => {
    const items = paris().userLists[1].items.concat(paris().userLists[0].items);
    const parts = partitionItems(items, ['p2']);
    expect(parts.todo).toEqual([]);
    expect(parts.packed.map(i => i.id)).toEqual(['p1']);
    expect(parts.notNeeded.map(i => i.id)).toEqual(['p2']);
  });

  it('reports group progress excluding not-needed items', () => {
    expect(groupProgress(paris())).toEqual({ total: 2, done: 2, percent: 100 });
    expect(groupProgress(grandma())).toEqual({ total: 1, done: 0, percent: 0 });
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run client/src/__tests__/dashboardGroups.test.ts`
Expected: FAIL with "Cannot find module '../utils/dashboardGroups'".

- [ ] **Step 4: Implement the helpers**

Create `client/src/utils/dashboardGroups.ts`. The grouping logic is ported from the load effect in `Dashboard.tsx` (current lines 219–365):

```ts
import type { TripDestination } from '../types/trip';

export interface DashboardItem {
  id: string;
  name: string;
  checked: boolean;
  masterId: string | null;
  added_during_packing: boolean;
  display_name: string | null;
  masterIsOneOff: boolean;
  category: any;
  members: any[];
  whole_family: boolean;
}

export interface DashboardUserList {
  userId: string;
  userName: string;
  items: DashboardItem[];
}

export interface DashboardMember {
  id: string;
  name: string;
}

export interface DestinationGroup {
  destinationId: string | null;
  name: string;
  color: string | null;
  listId: string;
  members: DashboardMember[];
  userLists: DashboardUserList[];
  wholeFamilyItems: DashboardItem[];
  notNeededByUser: Record<string, string[]>;
  notNeededWhole: string[];
  notes: string;
  excludedItemIds: string[];
}

export interface BuildGroupInput {
  listId: string;
  listData: any;
  masterItems: any[];
  familyMembers: any[];
  currentUserId: string | null;
  destination: TripDestination | null;
}

function toItem(pli: any, name: string, checked: boolean): DashboardItem {
  return {
    id: pli.id,
    name,
    checked,
    masterId: pli.item_id || null,
    added_during_packing: !!pli.added_during_packing,
    display_name: pli.display_name || null,
    masterIsOneOff: !!pli.master_is_one_off,
    category: pli.category || null,
    members: pli.members || [],
    whole_family: !!pli.whole_family,
  };
}

export function buildDestinationGroup({ listId, listData, masterItems, familyMembers, currentUserId, destination }: BuildGroupInput): DestinationGroup {
  const listItems: any[] = listData?.items || [];
  const checks: any[] = listData?.checks || [];
  const rawNotes = listData?.list?.notes ?? listData?.notes;
  const listMemberIds: string[] = Array.isArray(listData?.list?.member_ids)
    ? listData.list.member_ids
    : Array.isArray(listData?.member_ids) ? listData.member_ids : [];

  // Without family members (e.g. impersonation races), derive them from the item assignments.
  let members: any[] = familyMembers || [];
  if (members.length === 0) {
    const found = new Map<string, any>();
    for (const pli of listItems) for (const m of pli.members || []) if (m && m.id) found.set(m.id, m);
    members = Array.from(found.values());
  }
  if (listMemberIds.length > 0) {
    const selected = new Set(listMemberIds);
    members = members.filter(m => selected.has(m.id));
  }

  const nameFor = (pli: any) => {
    const master = pli.item_id ? masterItems.find((it: any) => it.id === pli.item_id) : null;
    return pli.display_name || pli.master_name || (master ? master.name : '') || 'Item';
  };

  const userLists = members.map(member => ({
    userId: member.id,
    userName: member.name || member.username,
    items: listItems
      .filter(pli => !pli.whole_family && (pli.members || []).some((m: any) => m.id === member.id))
      .map(pli => {
        const row = checks.find(c => c.packing_list_item_id === pli.id && c.member_id === member.id);
        return toItem(pli, nameFor(pli), !!row?.checked);
      }),
  }));

  // Whole-family checks: the NULL-member row is canonical; fall back to the current user's row.
  const wholeFamilyItems = listItems.filter(pli => pli.whole_family).map(pli => {
    const nullCheck = checks.find(c => c.packing_list_item_id === pli.id && (c.member_id === null || c.member_id === undefined));
    const personalCheck = checks.find(c => c.packing_list_item_id === pli.id && c.member_id === currentUserId);
    return toItem(pli, nameFor(pli), !!(nullCheck ?? personalCheck)?.checked);
  });

  const notNeededByUser: Record<string, string[]> = {};
  for (const r of listData?.not_needed_rows || []) {
    if (!r || !r.packing_list_item_id || !r.member_id || !r.not_needed) continue;
    (notNeededByUser[r.member_id] ||= []).push(r.packing_list_item_id);
  }

  return {
    destinationId: destination?.id ?? null,
    name: destination?.name ?? (listData?.list?.name || ''),
    color: destination?.color ?? null,
    listId,
    members: members.map(m => ({ id: m.id, name: m.name || m.username })),
    userLists,
    wholeFamilyItems,
    notNeededByUser,
    notNeededWhole: listItems.filter(pli => !!pli.not_needed).map(pli => pli.id),
    notes: typeof rawNotes === 'string' ? rawNotes : '',
    excludedItemIds: listItems
      .map(pli => pli.item_id || pli.master_id || pli.itemId || pli.masterId)
      .filter(Boolean)
      .map(String),
  };
}

export function applyCheck(groups: DestinationGroup[], listId: string, userId: string | null, itemId: string, checked: boolean): DestinationGroup[] {
  const setChecked = (items: DashboardItem[]) => items.map(it => (it.id === itemId ? { ...it, checked } : it));
  return groups.map(g => {
    if (g.listId !== listId) return g;
    if (userId) {
      return { ...g, userLists: g.userLists.map(l => (l.userId === userId ? { ...l, items: setChecked(l.items) } : l)) };
    }
    return {
      ...g,
      wholeFamilyItems: setChecked(g.wholeFamilyItems),
      userLists: g.userLists.map(l => (l.items.some(it => it.id === itemId) ? { ...l, items: setChecked(l.items) } : l)),
    };
  });
}

export function isNotNeeded(group: DestinationGroup, userId: string | null, itemId: string): boolean {
  return userId ? (group.notNeededByUser[userId] || []).includes(itemId) : group.notNeededWhole.includes(itemId);
}

export function toggleNotNeededIn(groups: DestinationGroup[], listId: string, userId: string | null, itemId: string): DestinationGroup[] {
  const flip = (ids: string[]) => (ids.includes(itemId) ? ids.filter(id => id !== itemId) : [...ids, itemId]);
  return groups.map(g => {
    if (g.listId !== listId) return g;
    if (userId) return { ...g, notNeededByUser: { ...g.notNeededByUser, [userId]: flip(g.notNeededByUser[userId] || []) } };
    return { ...g, notNeededWhole: flip(g.notNeededWhole) };
  });
}

export interface PersonEntry {
  userId: string;
  userName: string;
  listId: string;
  groupIndex: number;
}

export function orderPeople(groups: DestinationGroup[], currentUserId: string | null): PersonEntry[] {
  const people = groups.flatMap((g, groupIndex) =>
    g.userLists.map(l => ({ userId: l.userId, userName: l.userName, listId: g.listId, groupIndex }))
  );
  const meIndex = people.findIndex(p => p.userId === currentUserId);
  if (meIndex > 0) people.unshift(...people.splice(meIndex, 1));
  return people;
}

export function remainingFor(group: DestinationGroup, userId: string): number {
  const items = group.userLists.find(l => l.userId === userId)?.items || [];
  const notNeeded = group.notNeededByUser[userId] || [];
  return items.filter(it => !it.checked && !notNeeded.includes(it.id)).length;
}

export function partitionItems(items: DashboardItem[], notNeededIds: string[]) {
  return {
    todo: items.filter(it => !it.checked && !notNeededIds.includes(it.id)),
    packed: items.filter(it => it.checked),
    notNeeded: items.filter(it => !it.checked && notNeededIds.includes(it.id)),
  };
}

export function groupProgress(group: DestinationGroup): { total: number; done: number; percent: number } {
  let total = 0;
  let done = 0;
  for (const l of group.userLists) {
    const notNeeded = group.notNeededByUser[l.userId] || [];
    for (const it of l.items) {
      if (notNeeded.includes(it.id)) continue;
      total++;
      if (it.checked) done++;
    }
  }
  for (const it of group.wholeFamilyItems) {
    if (group.notNeededWhole.includes(it.id)) continue;
    total++;
    if (it.checked) done++;
  }
  return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run client/src/__tests__/dashboardGroups.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/dashboardGroups.ts client/src/__tests__/dashboardGroups.test.ts vitest.config.ts
git commit -m "feat(client): destination group builder and Person view helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Columns view grouped by destination

**Files:**
- Modify: `client/src/components/PackingListsSideBySide.tsx` (props at lines 7–22, signature at line 86, titles at ~142, ~233, ~556)
- Create: `client/src/components/DestinationColumns.tsx`
- Test: `client/src/__tests__/DestinationColumns.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Register the test file**

Add this to the `include` list in `vitest.config.ts`:

```ts
      'client/src/__tests__/DestinationColumns.test.tsx', // Columns view destination bands
```

- [ ] **Step 2: Write the failing test**

Create `client/src/__tests__/DestinationColumns.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import type { DestinationGroup } from '../utils/dashboardGroups';

const { sideBySideCalls } = vi.hoisted(() => ({ sideBySideCalls: [] as any[] }));
vi.mock('../components/PackingListsSideBySide', () => ({
  PackingListsSideBySide: (props: any) => {
    sideBySideCalls.push(props);
    return <div>{`columns for ${props.activeListId} (${props.wholeTitle})`}</div>;
  },
}));

import DestinationColumns from '../components/DestinationColumns';

const group = (overrides: Partial<DestinationGroup>): DestinationGroup => ({
  destinationId: null, name: '', color: null, listId: 'l1', members: [], userLists: [], wholeFamilyItems: [],
  notNeededByUser: {}, notNeededWhole: [], notes: '', excludedItemIds: [], ...overrides,
});

const handlers = {
  onCheckItem: vi.fn(), onItemNameClick: vi.fn(), onToggleNotNeeded: vi.fn(), onOpenAddDrawer: vi.fn(), onRefresh: vi.fn(),
};

describe('DestinationColumns', () => {
  afterEach(() => {
    cleanup();
    sideBySideCalls.length = 0;
  });

  it('renders a colored band per destination and titles the shared column "Shared"', () => {
    renderWithMantine(
      <DestinationColumns
        isTrip
        currentUserId="dad"
        familyId="f1"
        groups={[
          group({ destinationId: 'd1', name: 'Paris', color: 'blue', listId: 'list-paris', members: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }] }),
          group({ destinationId: 'd2', name: "Grandma's", color: 'green', listId: 'list-grandma', members: [{ id: 'ava', name: 'Ava' }] }),
        ]}
        {...handlers}
      />
    );
    expect(screen.getByRole('heading', { name: 'Paris · Dad, Mom' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: "Grandma's · Ava" })).toBeTruthy();
    expect(screen.getByText('columns for list-grandma (Shared)')).toBeTruthy();
  });

  it('routes callbacks with the group list id', () => {
    renderWithMantine(
      <DestinationColumns isTrip currentUserId={null} familyId="f1" groups={[group({ listId: 'list-paris', name: 'Paris' })]} {...handlers} />
    );
    sideBySideCalls[0].onCheckItem('dad', 'p1', true);
    sideBySideCalls[0].onOpenAddDrawer(null);
    expect(handlers.onCheckItem).toHaveBeenCalledWith('list-paris', 'dad', 'p1', true);
    expect(handlers.onOpenAddDrawer).toHaveBeenCalledWith('list-paris', null);
  });

  it('renders an ordinary list without a band', () => {
    renderWithMantine(
      <DestinationColumns isTrip={false} currentUserId={null} familyId="f1" groups={[group({ listId: 'l1', name: 'Beach' })]} {...handlers} />
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('columns for l1 (Whole Family)')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run client/src/__tests__/DestinationColumns.test.tsx`
Expected: FAIL with "Cannot find module '../components/DestinationColumns'".

- [ ] **Step 4: Add `wholeTitle` to `PackingListsSideBySide`**

In `client/src/components/PackingListsSideBySide.tsx`:
- Add `wholeTitle?: string;` to `PackingListProps`, after `showWhole?: boolean;`.
- Add `wholeTitle = 'Whole Family'` to the destructured parameters in the function signature (line 86).
- Replace each of the three `'Whole Family'` literals (around lines 142, 233 and 556) with `wholeTitle`:
  - Line ~142: `if (showWhole) titles.push(wholeTitle);`, and add `wholeTitle` to that `useMemo` dependency array.
  - Line ~233: `>{wholeTitle}</div>`
  - Line ~556: `renderColumn('whole', wholeTitle, wholeContent, true, ...)`

Leave the collapsed short label `Whole` (line ~231) as it is.

- [ ] **Step 5: Create the component**

Create `client/src/components/DestinationColumns.tsx`:

```tsx
import { Stack } from '@mantine/core';
import { PackingListsSideBySide } from './PackingListsSideBySide';
import type { DestinationGroup } from '../utils/dashboardGroups';

export interface DestinationColumnsProps {
  groups: DestinationGroup[];
  isTrip: boolean;
  currentUserId: string | null;
  familyId: string | null;
  onCheckItem: (listId: string, userId: string | null, itemId: string, checked: boolean) => void;
  onItemNameClick: (listId: string, packingListItemId: string, name: string) => void;
  onToggleNotNeeded: (listId: string, userId: string | null, itemId: string) => void;
  onOpenAddDrawer: (listId: string, userId: string | null) => void;
  onRefresh: () => void;
}

export default function DestinationColumns({
  groups, isTrip, currentUserId, familyId, onCheckItem, onItemNameClick, onToggleNotNeeded, onOpenAddDrawer, onRefresh,
}: DestinationColumnsProps) {
  return (
    <Stack gap="lg">
      {groups.map(g => (
        <div key={g.listId}>
          {isTrip && (
            <h3
              style={{
                margin: '0 0 8px',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 16,
                color: 'white',
                background: `var(--mantine-color-${g.color || 'blue'}-6)`,
              }}
            >
              {[g.name, g.members.map(m => m.name).join(', ')].filter(Boolean).join(' · ')}
            </h3>
          )}
          <PackingListsSideBySide
            userLists={g.userLists}
            wholeFamilyItems={g.wholeFamilyItems}
            wholeTitle={isTrip ? 'Shared' : 'Whole Family'}
            onCheckItem={(userId, itemId, checked) => onCheckItem(g.listId, userId, itemId, checked)}
            onItemNameClick={(pliId, name) => onItemNameClick(g.listId, pliId, name)}
            notNeededByUser={g.notNeededByUser}
            notNeededWhole={g.notNeededWhole}
            onToggleNotNeeded={(userId, itemId) => onToggleNotNeeded(g.listId, userId, itemId)}
            onOpenAddDrawer={userId => onOpenAddDrawer(g.listId, userId)}
            showWhole
            activeListId={g.listId}
            familyId={familyId}
            onRefresh={onRefresh}
            currentUserId={currentUserId}
          />
        </div>
      ))}
    </Stack>
  );
}
```

- [ ] **Step 6: Run the tests and type-check**

Run: `npx vitest run client/src/__tests__/DestinationColumns.test.tsx && npx tsc -p client/tsconfig.json --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/PackingListsSideBySide.tsx client/src/components/DestinationColumns.tsx client/src/__tests__/DestinationColumns.test.tsx vitest.config.ts
git commit -m "feat(client): columns view grouped by destination

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Person view

**Files:**
- Create: `client/src/components/PersonView.tsx`
- Test: `client/src/__tests__/PersonView.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Register the test file**

Add this to the `include` list in `vitest.config.ts`:

```ts
      'client/src/__tests__/PersonView.test.tsx', // Person-first dashboard view
```

- [ ] **Step 2: Write the failing tests**

Create `client/src/__tests__/PersonView.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';
import PersonView from '../components/PersonView';
import type { DashboardItem, DestinationGroup } from '../utils/dashboardGroups';

const item = (id: string, name: string, checked = false): DashboardItem => ({
  id, name, checked, masterId: id, added_during_packing: false, display_name: null, masterIsOneOff: false,
  category: null, members: [], whole_family: false,
});

const groups = (): DestinationGroup[] => [
  {
    destinationId: 'd1', name: 'Paris', color: 'blue', listId: 'list-paris',
    members: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }],
    userLists: [
      { userId: 'dad', userName: 'Dad', items: [item('p1', 'Passport'), item('p2', 'Camera', true)] },
      { userId: 'mom', userName: 'Mom', items: [item('p3', 'Scarf', true)] },
    ],
    wholeFamilyItems: [{ ...item('p4', 'Sunscreen'), whole_family: true }],
    notNeededByUser: {}, notNeededWhole: [], notes: '', excludedItemIds: [],
  },
  {
    destinationId: 'd2', name: "Grandma's", color: 'green', listId: 'list-grandma',
    members: [{ id: 'ava', name: 'Ava' }],
    userLists: [{ userId: 'ava', userName: 'Ava', items: [item('g1', 'Teddy'), item('g2', 'Pajamas')] }],
    wholeFamilyItems: [], notNeededByUser: { ava: ['g2'] }, notNeededWhole: [], notes: '', excludedItemIds: [],
  },
];

const handlers = () => ({
  onCheckItem: vi.fn(), onToggleNotNeeded: vi.fn(), onOpenAddDrawer: vi.fn(), onItemHistory: vi.fn(),
  onMoveSharedItem: vi.fn(), onSelectedGroupChange: vi.fn(),
});

describe('PersonView', () => {
  afterEach(cleanup);

  it('shows chips with remaining counts, current user first', () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="mom" {...handlers()} />);
    const chips = within(screen.getByRole('toolbar', { name: 'Travelers' })).getAllByRole('button');
    expect(chips.map(c => c.textContent)).toEqual(['Mom ✓', 'Dad 1', 'Ava 1']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');
  });

  it("shows the selected person's items and their destination's shared items", () => {
    const h = handlers();
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...h} />);
    expect(screen.getByRole('region', { name: 'Dad · Paris' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Paris shared' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Passport' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Camera' })).toBeNull();
    expect(screen.getByText('▸ 1 packed')).toBeTruthy();
    expect(h.onSelectedGroupChange).toHaveBeenCalledWith('list-paris');
  });

  it('expands packed and not-needed items', async () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="ava" {...handlers()} />);
    await userEvent.click(screen.getByText('▸ 1 not needed'));
    expect(screen.getByRole('checkbox', { name: 'Pajamas' })).toBeTruthy();
  });

  it('checks an item for the selected person', async () => {
    const h = handlers();
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...h} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Passport' }));
    expect(h.onCheckItem).toHaveBeenCalledWith('list-paris', 'dad', 'p1', true);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sunscreen' }));
    expect(h.onCheckItem).toHaveBeenCalledWith('list-paris', null, 'p4', true);
  });

  it('offers moving a shared item to the other destination', async () => {
    const h = handlers();
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...h} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Sunscreen' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: "Move to Grandma's" }));
    expect(h.onMoveSharedItem).toHaveBeenCalledWith('list-paris', 'p4', 'list-grandma');
  });

  it('does not offer moving personal items', async () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...handlers()} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Passport' }));
    expect(await screen.findByRole('menuitem', { name: 'Not needed' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Move to/ })).toBeNull();
  });

  it('opens the add drawer for the person and for the shared list', async () => {
    const h = handlers();
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...h} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add item to Dad · Paris' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add item to Paris shared' }));
    expect(h.onOpenAddDrawer).toHaveBeenNthCalledWith(1, 'list-paris', 'dad');
    expect(h.onOpenAddDrawer).toHaveBeenNthCalledWith(2, 'list-paris', null);
  });

  it('swipes left to the next person', () => {
    renderWithMantine(<PersonView groups={groups()} isTrip currentUserId="dad" {...handlers()} />);
    const area = screen.getByTestId('person-view');
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 120, clientY: 110 }] });
    expect(screen.getByRole('region', { name: 'Mom · Paris' })).toBeTruthy();
  });

  it('uses plain titles for an ordinary list', () => {
    const [paris] = groups();
    renderWithMantine(<PersonView groups={[paris]} isTrip={false} currentUserId="dad" {...handlers()} />);
    expect(screen.getByRole('region', { name: 'Dad' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Shared' })).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run client/src/__tests__/PersonView.test.tsx`
Expected: FAIL with "Cannot find module '../components/PersonView'".

- [ ] **Step 4: Implement**

Create `client/src/components/PersonView.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button, Checkbox, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { DashboardItem, DestinationGroup, orderPeople, partitionItems, remainingFor } from '../utils/dashboardGroups';
import { getSwipeDirection, isSwipeBlocked } from '../utils/swipe';

export interface PersonViewProps {
  groups: DestinationGroup[];
  isTrip: boolean;
  currentUserId: string | null;
  onCheckItem: (listId: string, userId: string | null, itemId: string, checked: boolean) => void;
  onToggleNotNeeded: (listId: string, userId: string | null, itemId: string) => void;
  onOpenAddDrawer: (listId: string, userId: string | null) => void;
  onItemHistory: (listId: string, packingListItemId: string, name: string) => void;
  onMoveSharedItem: (fromListId: string, itemId: string, toListId: string) => void;
  onSelectedGroupChange?: (listId: string) => void;
}

interface MoveTarget {
  listId: string;
  name: string;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

interface RowActions {
  onCheck: (itemId: string, checked: boolean) => void;
  onToggleNotNeeded: (itemId: string) => void;
  onHistory: (item: DashboardItem) => void;
  moveTargets: MoveTarget[];
  onMove: (itemId: string, toListId: string) => void;
  online: boolean;
}

function ItemRow({ item, notNeeded, actions }: { item: DashboardItem; notNeeded: boolean; actions: RowActions }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs" style={{ minHeight: 44 }}>
      <Checkbox
        size="md"
        checked={item.checked}
        onChange={e => actions.onCheck(item.id, e.currentTarget.checked)}
        label={
          <span style={notNeeded ? { textDecoration: 'line-through', color: 'var(--mantine-color-dimmed)' } : undefined}>
            {item.name}
          </span>
        }
        style={{ flex: 1 }}
      />
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`More actions for ${item.name}`}>
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => actions.onToggleNotNeeded(item.id)}>{notNeeded ? 'Needed after all' : 'Not needed'}</Menu.Item>
          {actions.moveTargets.map(target => (
            <Menu.Item key={target.listId} disabled={!actions.online} onClick={() => actions.onMove(item.id, target.listId)}>
              {actions.online ? `Move to ${target.name}` : `Move to ${target.name} (needs a connection)`}
            </Menu.Item>
          ))}
          <Menu.Item onClick={() => actions.onHistory(item)}>History</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

function ItemSection({ title, color, items, notNeededIds, onAdd, actions }: {
  title: string;
  color: string | null;
  items: DashboardItem[];
  notNeededIds: string[];
  onAdd: () => void;
  actions: RowActions;
}) {
  const [expanded, setExpanded] = useState(false);
  const { todo, packed, notNeeded } = partitionItems(items, notNeededIds);
  const summary = [
    packed.length > 0 ? `${packed.length} packed` : null,
    notNeeded.length > 0 ? `${notNeeded.length} not needed` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section
      aria-label={title}
      style={{
        border: '1px solid var(--mantine-color-gray-3)',
        borderLeft: `4px solid var(--mantine-color-${color || 'gray'}-6)`,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text fw={600}>{title}</Text>
        <ActionIcon variant="light" size="lg" aria-label={`Add item to ${title}`} onClick={onAdd}>
          <IconPlus size={18} />
        </ActionIcon>
      </Group>
      {items.length === 0 && <Text size="sm" c="dimmed">No items yet</Text>}
      {todo.map(it => <ItemRow key={it.id} item={it} notNeeded={false} actions={actions} />)}
      {summary && (
        <UnstyledButton onClick={() => setExpanded(v => !v)} aria-expanded={expanded} style={{ minHeight: 44, width: '100%' }}>
          <Text size="sm" c="dimmed">{`${expanded ? '▾' : '▸'} ${summary}`}</Text>
        </UnstyledButton>
      )}
      {expanded && [...packed, ...notNeeded].map(it => (
        <ItemRow key={it.id} item={it} notNeeded={notNeededIds.includes(it.id)} actions={actions} />
      ))}
    </section>
  );
}

export default function PersonView({
  groups, isTrip, currentUserId, onCheckItem, onToggleNotNeeded, onOpenAddDrawer, onItemHistory, onMoveSharedItem, onSelectedGroupChange,
}: PersonViewProps) {
  const people = useMemo(() => orderPeople(groups, currentUserId), [groups, currentUserId]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const online = useOnline();
  const areaRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchBlocked = useRef(false);

  // orderPeople puts the current user first, so the default is "me" when I'm on this trip.
  const selected = people.find(p => p.userId === selectedId) ?? people[0] ?? null;
  const selectedListId = selected?.listId ?? null;

  useEffect(() => {
    if (selectedListId && onSelectedGroupChange) onSelectedGroupChange(selectedListId);
  }, [selectedListId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected) return <Text c="dimmed">No travelers on this list yet.</Text>;

  const group = groups[selected.groupIndex];
  const personalItems = group.userLists.find(l => l.userId === selected.userId)?.items ?? [];
  const moveTargets = isTrip ? groups.filter(g => g.listId !== group.listId).map(g => ({ listId: g.listId, name: g.name })) : [];

  const step = (delta: 1 | -1) => {
    const next = people[people.findIndex(p => p.userId === selected.userId) + delta];
    if (next) setSelectedId(next.userId);
  };

  const baseActions = {
    onHistory: (it: DashboardItem) => onItemHistory(group.listId, it.id, it.name),
    online,
    onMove: (itemId: string, toListId: string) => onMoveSharedItem(group.listId, itemId, toListId),
  };
  const personalActions: RowActions = {
    ...baseActions,
    onCheck: (itemId, checked) => onCheckItem(group.listId, selected.userId, itemId, checked),
    onToggleNotNeeded: itemId => onToggleNotNeeded(group.listId, selected.userId, itemId),
    moveTargets: [],
  };
  const sharedActions: RowActions = {
    ...baseActions,
    onCheck: (itemId, checked) => onCheckItem(group.listId, null, itemId, checked),
    onToggleNotNeeded: itemId => onToggleNotNeeded(group.listId, null, itemId),
    moveTargets,
  };

  return (
    <div
      ref={areaRef}
      data-testid="person-view"
      onTouchStart={e => {
        const t = e.touches[0];
        touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
        touchBlocked.current = isSwipeBlocked(e.target, areaRef.current);
      }}
      onTouchEnd={e => {
        const start = touchStart.current;
        const t = e.changedTouches[0];
        touchStart.current = null;
        if (!start || !t || touchBlocked.current) return;
        const direction = getSwipeDirection(start, { x: t.clientX, y: t.clientY });
        if (direction === 'left') step(1);
        if (direction === 'right') step(-1);
      }}
    >
      <div
        role="toolbar"
        aria-label="Travelers"
        data-no-swipe
        style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--mantine-color-body)', overflowX: 'auto', padding: '8px 0' }}
      >
        <Group wrap="nowrap" gap="xs">
          {people.map(p => {
            const g = groups[p.groupIndex];
            const remaining = remainingFor(g, p.userId);
            const isSelected = p.userId === selected.userId;
            return (
              <Button
                key={p.userId}
                radius="xl"
                size="compact-md"
                color={g.color || 'blue'}
                variant={isSelected ? 'filled' : 'light'}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(p.userId)}
                style={{ flexShrink: 0 }}
              >
                {`${p.userName} ${remaining === 0 ? '✓' : remaining}`}
              </Button>
            );
          })}
        </Group>
      </div>
      <Stack gap="md" mt="sm">
        <ItemSection
          title={isTrip ? `${selected.userName} · ${group.name}` : selected.userName}
          color={group.color}
          items={personalItems}
          notNeededIds={group.notNeededByUser[selected.userId] || []}
          onAdd={() => onOpenAddDrawer(group.listId, selected.userId)}
          actions={personalActions}
        />
        <ItemSection
          title={isTrip ? `${group.name} shared` : 'Shared'}
          color={group.color}
          items={group.wholeFamilyItems}
          notNeededIds={group.notNeededWhole}
          onAdd={() => onOpenAddDrawer(group.listId, null)}
          actions={sharedActions}
        />
      </Stack>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run client/src/__tests__/PersonView.test.tsx`
Expected: PASS (9 tests).

If the "swipes left" test fails because jsdom doesn't copy `touches` from the event init, change the test to create the event with `createEvent.touchStart(area, {...})` and set `Object.defineProperty(event, 'touches', { value: [...] })` before `fireEvent(area, event)`. Do the same for `changedTouches`.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/PersonView.tsx client/src/__tests__/PersonView.test.tsx vitest.config.ts
git commit -m "feat(client): person-first dashboard view

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: View toggle and notes destination picker

**Files:**
- Create: `client/src/components/DashboardViewToggle.tsx`
- Create: `client/src/components/NotesDestinationPicker.tsx`
- Test: `client/src/__tests__/DashboardViewToggle.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Register the test file**

Add this to the `include` list in `vitest.config.ts`:

```ts
      'client/src/__tests__/DashboardViewToggle.test.tsx', // Person/Columns toggle persistence
```

- [ ] **Step 2: Write the failing tests**

Create `client/src/__tests__/DashboardViewToggle.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine, setMobileViewport } from '../test-utils/renderWithMantine';
import DashboardViewToggle, { useDashboardViewMode } from '../components/DashboardViewToggle';
import NotesDestinationPicker from '../components/NotesDestinationPicker';

function Harness() {
  const [mode, setMode] = useDashboardViewMode();
  return (
    <>
      <DashboardViewToggle value={mode} onChange={setMode} />
      <div>{`mode:${mode}`}</div>
    </>
  );
}

describe('useDashboardViewMode', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    setMobileViewport(false);
  });

  it('defaults to Person on phones', () => {
    setMobileViewport(true);
    renderWithMantine(<Harness />);
    expect(screen.getByText('mode:person')).toBeTruthy();
  });

  it('defaults to Columns on wider screens', () => {
    renderWithMantine(<Harness />);
    expect(screen.getByText('mode:columns')).toBeTruthy();
  });

  it('remembers the choice on this device', async () => {
    setMobileViewport(true);
    renderWithMantine(<Harness />);
    await userEvent.click(screen.getByText('Columns'));
    expect(screen.getByText('mode:columns')).toBeTruthy();
    expect(localStorage.getItem('dashboardView')).toBe('columns');
  });
});

describe('NotesDestinationPicker', () => {
  afterEach(cleanup);

  it('renders nothing for a single group', () => {
    const { container } = renderWithMantine(
      <NotesDestinationPicker groups={[{ listId: 'l1', name: 'Beach' }]} value="l1" onChange={() => {}} />
    );
    expect(container.querySelector('input')).toBeNull();
  });

  it('shows the selected destination', () => {
    renderWithMantine(
      <NotesDestinationPicker groups={[{ listId: 'l1', name: 'Paris' }, { listId: 'l2', name: "Grandma's" }]} value="l2" onChange={() => {}} />
    );
    expect((screen.getByRole('textbox', { name: 'Notes destination' }) as HTMLInputElement).value).toBe("Grandma's");
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run client/src/__tests__/DashboardViewToggle.test.tsx`
Expected: FAIL. The modules are missing.

- [ ] **Step 4: Implement**

Create `client/src/components/DashboardViewToggle.tsx`:

```tsx
import { useState } from 'react';
import { SegmentedControl } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

export type DashboardViewMode = 'person' | 'columns';

const STORAGE_KEY = 'dashboardView';

function readStoredMode(): DashboardViewMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'person' || value === 'columns' ? value : null;
  } catch {
    return null;
  }
}

export function useDashboardViewMode(): [DashboardViewMode, (mode: DashboardViewMode) => void] {
  const isMobile = useMediaQuery('(max-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [stored, setStored] = useState<DashboardViewMode | null>(readStoredMode);
  const setMode = (mode: DashboardViewMode) => {
    setStored(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };
  return [stored ?? (isMobile ? 'person' : 'columns'), setMode];
}

export default function DashboardViewToggle({ value, onChange }: { value: DashboardViewMode; onChange: (mode: DashboardViewMode) => void }) {
  return (
    <SegmentedControl
      size="xs"
      aria-label="Dashboard view"
      value={value}
      onChange={v => onChange(v as DashboardViewMode)}
      data={[
        { label: 'Person', value: 'person' },
        { label: 'Columns', value: 'columns' },
      ]}
    />
  );
}
```

Create `client/src/components/NotesDestinationPicker.tsx`:

```tsx
import { Select } from '@mantine/core';

export interface NotesDestinationPickerProps {
  groups: { listId: string; name: string }[];
  value: string | null;
  onChange: (listId: string) => void;
}

export default function NotesDestinationPicker({ groups, value, onChange }: NotesDestinationPickerProps) {
  if (groups.length < 2) return null;
  return (
    <Select
      size="xs"
      aria-label="Notes destination"
      data={groups.map(g => ({ value: g.listId, label: g.name }))}
      value={value}
      onChange={v => v && onChange(v)}
      allowDeselect={false}
      style={{ maxWidth: 200 }}
    />
  );
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run client/src/__tests__/DashboardViewToggle.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/DashboardViewToggle.tsx client/src/components/NotesDestinationPicker.tsx client/src/__tests__/DashboardViewToggle.test.tsx vitest.config.ts
git commit -m "feat(client): dashboard view toggle and notes destination picker

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Split dialog

**Files:**
- Create: `client/src/components/SplitListDialog.tsx`
- Test: `client/src/__tests__/SplitListDialog.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Register the test file**

Add this to the `include` list in `vitest.config.ts`:

```ts
      'client/src/__tests__/SplitListDialog.test.tsx', // Split-by-destination dialog
```

- [ ] **Step 2: Write the failing tests**

Create `client/src/__tests__/SplitListDialog.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api', () => ({ getPackingList: vi.fn(), getFamily: vi.fn() }));
vi.mock('../api/tripApi', () => ({
  tripApi: { listTrips: vi.fn(), createTrip: vi.fn(), splitList: vi.fn() },
  ApiConflictError: class ApiConflictError extends Error {
    constructor(message: string, public body: any) { super(message); }
  },
}));
vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

import { getFamily, getPackingList } from '../api';
import { tripApi } from '../api/tripApi';
import SplitListDialog from '../components/SplitListDialog';

const assign = async (person: string, destination: string) => {
  const group = screen.getByRole('group', { name: `Destination for ${person}` });
  await userEvent.click(within(group).getByRole('button', { name: destination }));
};

describe('SplitListDialog', () => {
  beforeEach(() => {
    (getPackingList as any).mockResolvedValue({
      response: { ok: true },
      data: { list: { member_ids: ['dad', 'mom', 'ava'] }, items: [{ id: 'x', whole_family: 1 }, { id: 'y', whole_family: 0 }] },
    });
    (getFamily as any).mockResolvedValue({
      response: { ok: true },
      data: { family: { members: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }, { id: 'ava', name: 'Ava' }, { id: 'leo', name: 'Leo' }] } },
    });
    (tripApi.listTrips as any).mockResolvedValue([]);
    (tripApi.createTrip as any).mockResolvedValue({ id: 'trip-1' });
    (tripApi.splitList as any).mockResolvedValue({ destinations: [], skippedCount: 0 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const open = (onSplit = vi.fn()) =>
    renderWithMantine(<SplitListDialog opened onClose={vi.fn()} familyId="f1" listId="list-1" listName="Spring list" onSplit={onSplit} />);

  const finishTripStep = async () => {
    fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: '2027-03-01' } });
    fireEvent.change(screen.getByLabelText(/End date/), { target: { value: '2027-03-08' } });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  };

  it('requires dates before leaving the trip step', async () => {
    open();
    expect((screen.getByLabelText(/Trip name/) as HTMLInputElement).value).toBe('Spring list');
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    await finishTripStep();
    expect(await screen.findByText('Who goes where?')).toBeTruthy();
  });

  it('only lists the members of the list and requires everyone to be placed', async () => {
    open();
    await finishTripStep();
    await screen.findByRole('group', { name: 'Destination for Ava' });
    expect(screen.queryByRole('group', { name: 'Destination for Leo' })).toBeNull();

    const next = () => screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    await assign('Dad', 'Destination 1');
    await assign('Mom', 'Destination 1');
    expect(next().disabled).toBe(true);
    await assign('Ava', 'Destination 1');
    expect(next().disabled).toBe(true);
    await assign('Ava', 'Destination 2');
    expect(next().disabled).toBe(false);
  });

  it('creates the trip and splits the list', async () => {
    const onSplit = vi.fn();
    open(onSplit);
    await finishTripStep();
    await screen.findByRole('group', { name: 'Destination for Ava' });
    const firstName = screen.getByRole('textbox', { name: 'Destination 1 name' });
    await userEvent.clear(firstName);
    await userEvent.type(firstName, 'Paris');
    await assign('Dad', 'Paris');
    await assign('Mom', 'Paris');
    await assign('Ava', 'Destination 2');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Where should the 1 shared items go?')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Destination 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Split list' }));

    await waitFor(() => expect(onSplit).toHaveBeenCalled());
    expect(tripApi.createTrip).toHaveBeenCalledWith({ name: 'Spring list', startDate: '2027-03-01', endDate: '2027-03-08' });
    expect(tripApi.splitList).toHaveBeenCalledWith('trip-1', {
      sourceListId: 'list-1',
      destinations: [
        { name: 'Paris', memberIds: ['dad', 'mom'] },
        { name: 'Destination 2', memberIds: ['ava'] },
      ],
      sharedItemsDestinationIndex: 1,
    });
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run client/src/__tests__/SplitListDialog.test.tsx`
Expected: FAIL. The module is missing.

- [ ] **Step 4: Implement**

Create `client/src/components/SplitListDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Button, Group, Modal, Radio, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getFamily, getPackingList } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
import type { SplitResult, Trip } from '../types/trip';

export interface SplitListDialogProps {
  opened: boolean;
  onClose: () => void;
  familyId: string | null;
  listId: string | null;
  listName: string;
  onSplit?: (result: SplitResult, tripId: string) => void;
}

interface Person {
  id: string;
  name: string;
}

export function canLeaveWhoGoesWhere(people: Person[], destinationNames: string[], assignment: Record<string, number | undefined>): boolean {
  if (people.length === 0) return false;
  if (destinationNames.some(n => !n.trim())) return false;
  if (people.some(p => assignment[p.id] === undefined)) return false;
  return destinationNames.every((_, index) => people.some(p => assignment[p.id] === index));
}

const DEFAULT_DESTINATIONS = ['Destination 1', 'Destination 2'];

export default function SplitListDialog({ opened, onClose, familyId, listId, listName, onSplit }: SplitListDialogProps) {
  const isMobile = useMediaQuery('(max-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [step, setStep] = useState(0);
  const [tripMode, setTripMode] = useState<'new' | 'existing'>('new');
  const [tripName, setTripName] = useState(listName);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [existingTripId, setExistingTripId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [sharedCount, setSharedCount] = useState(0);
  const [destinationNames, setDestinationNames] = useState<string[]>(DEFAULT_DESTINATIONS);
  const [assignment, setAssignment] = useState<Record<string, number | undefined>>({});
  const [sharedIndex, setSharedIndex] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!opened || !listId || !familyId) return;
    let cancelled = false;
    setStep(0);
    setTripMode('new');
    setTripName(listName);
    setStartDate('');
    setEndDate('');
    setExistingTripId(null);
    setDestinationNames(DEFAULT_DESTINATIONS);
    setAssignment({});
    setSharedIndex('0');
    (async () => {
      try {
        const [listRes, familyRes, tripList] = await Promise.all([
          getPackingList(listId),
          getFamily(familyId),
          tripApi.listTrips().catch(() => [] as Trip[]),
        ]);
        if (cancelled) return;
        const familyMembers: any[] = familyRes.response.ok ? familyRes.data.family?.members || [] : [];
        const memberIds: string[] = listRes.response.ok ? listRes.data.list?.member_ids || [] : [];
        const onList = memberIds.length > 0 ? familyMembers.filter(m => memberIds.includes(m.id)) : familyMembers;
        setPeople(onList.map(m => ({ id: m.id, name: m.name || m.username })));
        setSharedCount(listRes.response.ok ? (listRes.data.items || []).filter((i: any) => i.whole_family).length : 0);
        setTrips(tripList);
      } catch {
        if (!cancelled) showNotification({ title: 'Error', message: 'Could not load the list', color: 'red' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, listId, familyId, listName]);

  const tripStepValid = tripMode === 'new'
    ? !!tripName.trim() && !!startDate && !!endDate && endDate >= startDate
    : !!existingTripId;
  const whoValid = canLeaveWhoGoesWhere(people, destinationNames, assignment);
  // Splitting changes several lists at once, so it needs the server (spec: Offline).
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const labelFor = (index: number) => destinationNames[index].trim() || `Destination ${index + 1}`;

  const submit = async () => {
    if (!listId) return;
    setSubmitting(true);
    try {
      const tripId = tripMode === 'new'
        ? (await tripApi.createTrip({ name: tripName.trim(), startDate, endDate })).id
        : existingTripId!;
      const result = await tripApi.splitList(tripId, {
        sourceListId: listId,
        destinations: destinationNames.map((name, index) => ({
          name: name.trim(),
          memberIds: people.filter(p => assignment[p.id] === index).map(p => p.id),
        })),
        sharedItemsDestinationIndex: Number(sharedIndex),
      });
      showNotification({
        title: 'List split',
        message: result.skippedCount > 0
          ? `${result.skippedCount} item(s) didn't belong to anyone here and stayed in ${labelFor(0)}`
          : `Created ${destinationNames.length} destinations`,
        color: 'green',
      });
      onSplit?.(result, tripId);
      onClose();
    } catch (err) {
      const message = err instanceof ApiConflictError && err.body?.error === 'member_in_other_destination'
        ? `${people.find(p => p.id === err.body.memberId)?.name ?? 'Someone'} is already in another destination of this trip`
        : (err as Error)?.message || 'Split failed';
      showNotification({ title: 'Could not split list', message, color: 'red' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={`Split "${listName}" by destination`} fullScreen={!!isMobile} size="lg">
      {step === 0 && (
        <Stack>
          <Text fw={600}>Which trip is this for?</Text>
          <SegmentedControl
            fullWidth
            value={tripMode}
            onChange={v => setTripMode(v as 'new' | 'existing')}
            data={[
              { label: 'New trip', value: 'new' },
              { label: 'Existing trip', value: 'existing', disabled: trips.length === 0 },
            ]}
          />
          {tripMode === 'new' ? (
            <>
              <TextInput label="Trip name" value={tripName} onChange={e => setTripName(e.currentTarget.value)} />
              <Group grow>
                <TextInput type="date" label="Start date" value={startDate} onChange={e => setStartDate(e.currentTarget.value)} />
                <TextInput type="date" label="End date" value={endDate} onChange={e => setEndDate(e.currentTarget.value)} />
              </Group>
            </>
          ) : (
            <Select
              label="Trip"
              placeholder="Choose a trip"
              data={trips.map(t => ({ value: t.id, label: t.name }))}
              value={existingTripId}
              onChange={setExistingTripId}
            />
          )}
          <Group justify="flex-end">
            <Button onClick={() => setStep(1)} disabled={!tripStepValid}>Next</Button>
          </Group>
        </Stack>
      )}

      {step === 1 && (
        <Stack>
          <Text fw={600}>Who goes where?</Text>
          {destinationNames.map((name, index) => (
            <TextInput
              key={index}
              aria-label={`Destination ${index + 1} name`}
              value={name}
              onChange={e => {
                const value = e.currentTarget.value;
                setDestinationNames(names => names.map((n, i) => (i === index ? value : n)));
              }}
            />
          ))}
          <Button
            variant="subtle"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setDestinationNames(names => [...names, `Destination ${names.length + 1}`])}
          >
            + Add destination
          </Button>
          {people.map(person => (
            <Stack key={person.id} gap={4}>
              <Text size="sm" fw={500}>{person.name}</Text>
              <Group gap={4} role="group" aria-label={`Destination for ${person.name}`}>
                {destinationNames.map((_, index) => (
                  <Button
                    key={index}
                    size="compact-md"
                    variant={assignment[person.id] === index ? 'filled' : 'default'}
                    aria-pressed={assignment[person.id] === index}
                    onClick={() => setAssignment(a => ({ ...a, [person.id]: index }))}
                  >
                    {labelFor(index)}
                  </Button>
                ))}
              </Group>
            </Stack>
          ))}
          <Group justify="space-between">
            <Button variant="default" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(2)} disabled={!whoValid}>Next</Button>
          </Group>
        </Stack>
      )}

      {step === 2 && (
        <Stack>
          <Radio.Group label={`Where should the ${sharedCount} shared items go?`} value={sharedIndex} onChange={setSharedIndex}>
            <Stack gap="xs" mt="xs">
              {destinationNames.map((_, index) => (
                <Radio key={index} value={String(index)} label={labelFor(index)} />
              ))}
            </Stack>
          </Radio.Group>
          <Text size="sm" c="dimmed">Personal items follow each person, and anything already packed stays checked.</Text>
          <Group justify="space-between">
            <Button variant="default" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={submit} loading={submitting} disabled={!online}>{online ? 'Split list' : 'Needs a connection'}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run client/src/__tests__/SplitListDialog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/SplitListDialog.tsx client/src/__tests__/SplitListDialog.test.tsx vitest.config.ts
git commit -m "feat(client): split-by-destination dialog

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---
## Task 13: Dashboard shows the whole trip

`Dashboard.tsx` becomes a container. It loads one group per destination, then renders the toggle, the chosen view, notes and the panels. The notes debouncing and stale-response protections stay the same, but they now follow `notesListId` (the focused destination) instead of `activeListId`.

The unused `ItemEditDrawer` path is removed: nothing ever set `showItemDrawer` to true. The same goes for the unused `openAddItemsOneOff`, `showEditListDrawer` and `editListNameState`.

**Files:**
- Modify: `client/src/components/Dashboard.tsx` (full rewrite below)
- Modify: `client/src/__tests__/Dashboard.test.tsx`

- [ ] **Step 1: Update the Dashboard test mocks and add trip tests**

In `client/src/__tests__/Dashboard.test.tsx`:

1. Extend the `vi.hoisted` block so it also returns `columnsProps: { last: null as any }`:

```ts
  const { requestOpenEdit, openForList, showNotification, activeListState, columnsProps } = vi.hoisted(() => ({
    requestOpenEdit: vi.fn(),
    openForList: vi.fn(),
    showNotification: vi.fn(),
    activeListState: { id: 'list-1' as string },
    columnsProps: { last: null as any },
  }));
```

2. After the `PackingListItemAuditModal` mock, add:

```ts
  vi.mock('../components/PersonView', () => ({ default: () => null }));
  vi.mock('../components/DestinationColumns', () => ({
    default: (props: any) => {
      columnsProps.last = props;
      return null;
    },
  }));
  vi.mock('../components/DashboardViewToggle', () => ({
    default: () => null,
    useDashboardViewMode: () => ['columns', () => {}],
  }));
  vi.mock('../components/NotesDestinationPicker', () => ({ default: () => null }));
  vi.mock('../components/SplitListDialog', () => ({ default: () => null }));
```

3. In `beforeEach`, add `columnsProps.last = null;`.

4. Add these tests at the end of `describe('Dashboard', ...)`:

```tsx
    const tripContext = {
      tripId: 't1',
      tripName: 'Spring Break',
      destinations: [
        { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-1', memberIds: [] },
        { id: 'd2', tripId: 't1', name: "Grandma's", color: 'green', position: 1, packingListId: 'list-2', memberIds: [] },
      ],
    };

    it('loads every destination of the trip as a group', async () => {
      (apiModule.getPackingList as any).mockImplementation((listId: string) => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: tripContext },
      }));

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );

      await waitFor(() => expect(columnsProps.last?.groups.map((g: any) => g.name)).toEqual(['Paris', "Grandma's"]));
      expect(apiModule.getPackingList).toHaveBeenCalledWith('list-2');
      expect(columnsProps.last.isTrip).toBe(true);
      expect(screen.getByText('Spring Break · 2 destinations')).toBeTruthy();
    });

    it('refreshes when another destination of the trip changes', async () => {
      (apiModule.getPackingList as any).mockImplementation(() => Promise.resolve({
        response: { ok: true },
        data: { items: [], checks: [], list: { notes: '' }, trip_destination: tripContext },
      }));
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      await waitFor(() => expect(columnsProps.last?.groups).toHaveLength(2));
      const before = (apiModule.getPackingList as any).mock.calls.length;

      window.dispatchEvent(new CustomEvent('server-event', { detail: { type: 'packing_list_changed', listId: 'list-2', data: {} } }));

      await waitFor(() => expect((apiModule.getPackingList as any).mock.calls.length).toBeGreaterThan(before));
    });

    it('offers splitting an ordinary list', async () => {
      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      );
      expect(await screen.findByRole('button', { name: 'Split by destination' })).toBeTruthy();
    });
```

- [ ] **Step 2: Run the Dashboard tests and confirm the new ones fail**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx`
Expected: the 5 existing notes and edit tests PASS. The 3 new tests FAIL.

- [ ] **Step 3: Rewrite `client/src/components/Dashboard.tsx`**

Replace the whole file with:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Container, Group, Stack, Text, Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import ActivePackingListSelector from './ActivePackingListSelector';
import AddItemsDrawer from './AddItemsDrawer';
import PackingListAuditPanel from './PackingListAuditPanel';
import PackingListItemAuditModal from './PackingListItemAuditModal';
import PersonView from './PersonView';
import DestinationColumns from './DestinationColumns';
import DashboardViewToggle, { useDashboardViewMode } from './DashboardViewToggle';
import NotesDestinationPicker from './NotesDestinationPicker';
import SplitListDialog from './SplitListDialog';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { useListEditDrawer } from '../contexts/ListEditDrawerContext';
import { useImpersonation } from '../contexts/ImpersonationContext';
import {
  getCurrentUserProfile, getFamily, getItems, getPackingList, togglePackingListItemCheck, addItemToPackingList,
  setPackingListItemNotNeeded, setPackingListItemNotNeededForMember, updatePackingList, movePackingListItem,
} from '../api';
import { applyCheck, buildDestinationGroup, DestinationGroup, isNotNeeded, toggleNotNeededIn } from '../utils/dashboardGroups';
import type { ListTripContext, TripDestination } from '../types/trip';

type AddTarget = { listId: string; members?: string[]; whole?: boolean };

export default function Dashboard(): React.ReactElement {
  const { activeListId, requestOpenEdit, availableLists, refreshLists } = useActivePackingList();
  const { openForList } = useListEditDrawer();
  const { impersonatingFamilyId } = useImpersonation();
  const [viewMode, setViewMode] = useDashboardViewMode();
  const [groups, setGroups] = useState<DestinationGroup[]>([]);
  const [tripInfo, setTripInfo] = useState<{ id: string; name: string } | null>(null);
  const [listSelectionCount, setListSelectionCount] = useState(0);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [itemAudit, setItemAudit] = useState<{ listId: string; pliId: string; name: string } | null>(null);
  const [itemAuditOpened, setItemAuditOpened] = useState(false);
  // Which destination the notes editor and audit panel follow; reset whenever the active list changes.
  const [notesSelection, setNotesSelection] = useState<{ activeId: string | null; listId: string } | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [loadedNotes, setLoadedNotes] = useState('');
  const notesListId = notesSelection && notesSelection.activeId === activeListId ? notesSelection.listId : activeListId;

  // Track recent local check updates to avoid reacting to our own SSEs
  const recentLocalChecksRef = useRef<Map<string, number>>(new Map());
  const activeListIdRef = useRef<string | null>(activeListId);
  const notesListIdRef = useRef<string | null>(notesListId);
  const groupsRef = useRef<DestinationGroup[]>([]);
  const loadTokenRef = useRef(0);
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesGenerationByListRef = useRef<Map<string, number>>(new Map());
  const notesLatestDispatchedSequenceByListRef = useRef<Map<string, number>>(new Map());
  const notesEditingRef = useRef(false);

  useEffect(() => {
    activeListIdRef.current = activeListId;
  }, [activeListId]);

  useEffect(() => {
    notesListIdRef.current = notesListId;
  }, [notesListId]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  const getNotesGeneration = useCallback((listId: string) => {
    return notesGenerationByListRef.current.get(listId) ?? 0;
  }, []);

  const clearNotesSaveTimer = useCallback(() => {
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
      notesSaveTimerRef.current = null;
    }
  }, []);

  const saveNotes = useCallback(async (listId: string, notes: string, generation: number) => {
    if (generation !== getNotesGeneration(listId)) return;
    const requestSequence = (notesLatestDispatchedSequenceByListRef.current.get(listId) ?? 0) + 1;
    notesLatestDispatchedSequenceByListRef.current.set(listId, requestSequence);
    try {
      const result = await updatePackingList(listId, { notes });
      if (!result.response.ok) {
        showNotification({ title: 'Save failed', message: 'Could not save trip notes', color: 'yellow' });
        return;
      }
      setGroups(prev => prev.map(g => (g.listId === listId ? { ...g, notes } : g)));
      if (notesListIdRef.current !== listId) return;
      if (generation !== getNotesGeneration(listId)) return;
      const latestDispatchedSequenceForList = notesLatestDispatchedSequenceByListRef.current.get(listId) ?? 0;
      if (requestSequence !== latestDispatchedSequenceForList) return;
      setLoadedNotes(notes);
      if (!notesEditingRef.current) setNotesDraft(notes);
    } catch (err) {
      showNotification({ title: 'Save failed', message: 'Could not save trip notes', color: 'yellow' });
    }
  }, [getNotesGeneration]);

  const queueNotesSave = useCallback((nextNotes: string) => {
    if (!notesListId) return;
    const generation = getNotesGeneration(notesListId);
    clearNotesSaveTimer();
    notesSaveTimerRef.current = setTimeout(() => {
      notesSaveTimerRef.current = null;
      void saveNotes(notesListId, nextNotes, generation);
    }, 500);
  }, [notesListId, clearNotesSaveTimer, getNotesGeneration, saveNotes]);

  useEffect(() => {
    clearNotesSaveTimer();
    notesEditingRef.current = false;
    if (notesListId) {
      const nextGeneration = getNotesGeneration(notesListId) + 1;
      notesGenerationByListRef.current.set(notesListId, nextGeneration);
      notesLatestDispatchedSequenceByListRef.current.set(notesListId, 0);
    }
    setNotesExpanded(false);
    // Switching destinations within a loaded trip shows that destination's notes right away.
    const known = groupsRef.current.find(g => g.listId === notesListId);
    setNotesDraft(known?.notes ?? '');
    setLoadedNotes(known?.notes ?? '');
  }, [notesListId, clearNotesSaveTimer, getNotesGeneration]);

  useEffect(() => {
    return () => {
      clearNotesSaveTimer();
    };
  }, [clearNotesSaveTimer]);

  // Increment counter whenever activeListId changes to force refresh
  useEffect(() => {
    if (activeListId) {
      setListSelectionCount(prev => prev + 1);
    }
  }, [activeListId]);

  // Refresh when any list of the active trip changes on the server
  useEffect(() => {
    const handler = (ev: any) => {
      try {
        const event = ev.detail || ev;
        if (!event || event.type !== 'packing_list_changed') return;
        if (!activeListId) return;
        const data = event.data || {};
        if (data.change === 'check' && data.itemId) {
          const when = recentLocalChecksRef.current.get(data.itemId);
          if (when && Date.now() - when < 5000) {
            setAuditRefreshKey(prev => prev + 1);
            return;
          }
        }
        const watched = event.listId === activeListId || groupsRef.current.some(g => g.listId === event.listId);
        if (watched) {
          setListSelectionCount(prev => prev + 1);
          setAuditRefreshKey(prev => prev + 1);
        }
      } catch (e) {}
    };
    window.addEventListener('server-event', handler as EventListener);
    return () => window.removeEventListener('server-event', handler as EventListener);
  }, [activeListId]);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    const requestedListId = activeListId;
    const isCurrent = () => token === loadTokenRef.current && activeListIdRef.current === requestedListId;
    const clear = () => {
      groupsRef.current = [];
      setGroups([]);
      setTripInfo(null);
      setNotesDraft('');
      setLoadedNotes('');
    };

    (async () => {
      try {
        // prefer impersonation when present
        let fid = impersonatingFamilyId || null;
        let familyMembers: any[] = [];
        let profileUserId: string | null = null;
        if (!fid) {
          const profile = await getCurrentUserProfile();
          fid = profile.response.ok && profile.data.family ? profile.data.family.id : null;
          familyMembers = profile.response.ok && profile.data.family ? profile.data.family.members || [] : [];
          profileUserId = profile.response.ok && profile.data.user ? profile.data.user.id : null;
        } else {
          try {
            const famRes = await getFamily(fid);
            if (famRes.response.ok && famRes.data.family) familyMembers = famRes.data.family.members || [];
          } catch (e) {
            familyMembers = [];
          }
        }
        if (!isCurrent()) return;
        if (!fid || !requestedListId) {
          clear();
          return;
        }

        const itemsRes = await getItems(fid);
        const masterItems = itemsRes.response.ok ? itemsRes.data.items || [] : [];
        const listRes = await getPackingList(requestedListId);
        if (!isCurrent()) return;
        if (!listRes.response.ok) {
          clear();
          return;
        }

        // A destination list brings its whole trip: load the sibling lists too.
        const trip: ListTripContext | null = listRes.data.trip_destination || null;
        const destinations: TripDestination[] = trip ? trip.destinations : [];
        const listDataById = new Map<string, any>([[requestedListId, listRes.data]]);
        const siblings = destinations.filter(d => d.packingListId !== requestedListId);
        const siblingResults = await Promise.all(siblings.map(d => getPackingList(d.packingListId).catch(() => null)));
        if (!isCurrent()) return;
        siblings.forEach((d, i) => {
          const res = siblingResults[i];
          if (res && res.response.ok) listDataById.set(d.packingListId, res.data);
        });

        const build = (listId: string, destination: TripDestination | null) => buildDestinationGroup({
          listId,
          listData: listDataById.get(listId),
          masterItems,
          familyMembers,
          currentUserId: profileUserId,
          destination,
        });
        const nextGroups = trip
          ? destinations.filter(d => listDataById.has(d.packingListId)).map(d => build(d.packingListId, d))
          : [build(requestedListId, null)];

        groupsRef.current = nextGroups;
        setGroups(nextGroups);
        setTripInfo(trip ? { id: trip.tripId, name: trip.tripName } : null);
        setFamilyId(fid);
        setCurrentUserId(profileUserId);
        const notesGroup = nextGroups.find(g => g.listId === notesListIdRef.current);
        if (notesGroup) {
          setLoadedNotes(notesGroup.notes);
          if (!notesEditingRef.current) setNotesDraft(notesGroup.notes);
        }
      } catch (err) {
        console.error('Failed to load dashboard packing lists', err);
        if (isCurrent()) clear();
      }
    })();
  }, [activeListId, listSelectionCount]);

  const handleNotesChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextNotes = event.target.value;
    notesEditingRef.current = true;
    setNotesDraft(nextNotes);
    queueNotesSave(nextNotes);
  }, [queueNotesSave]);

  const handleNotesBlur = useCallback(() => {
    notesEditingRef.current = false;
    if (!notesListId) return;
    const generation = getNotesGeneration(notesListId);
    if (notesSaveTimerRef.current) {
      clearNotesSaveTimer();
      void saveNotes(notesListId, notesDraft, generation);
      return;
    }
    if (notesDraft !== loadedNotes) {
      void saveNotes(notesListId, notesDraft, generation);
    }
  }, [notesListId, clearNotesSaveTimer, getNotesGeneration, loadedNotes, notesDraft, saveNotes]);

  const selectNotesGroup = useCallback((listId: string) => {
    setNotesSelection({ activeId: activeListIdRef.current, listId });
  }, []);

  const handleItemNameClick = useCallback((listId: string, pliId: string, name: string) => {
    setItemAudit({ listId, pliId, name: name || 'Item history' });
    setItemAuditOpened(true);
  }, []);

  const handleCheckItem = useCallback(async (listId: string, userId: string | null, itemId: string, checked: boolean) => {
    setGroups(prev => applyCheck(prev, listId, userId, itemId, checked));
    recentLocalChecksRef.current.set(itemId, Date.now());
    setTimeout(() => { recentLocalChecksRef.current.delete(itemId); }, 6000);
    try {
      const result = await togglePackingListItemCheck(listId, itemId, userId, checked);
      if (!result.response.ok) {
        showNotification({ title: 'Sync failed', message: 'Server rejected check update', color: 'yellow' });
      }
    } catch (err) {
      showNotification({ title: 'Offline', message: 'Failed to sync check - please try again when online', color: 'yellow' });
    }
  }, []);

  const toggleNotNeeded = useCallback(async (listId: string, userId: string | null, itemId: string) => {
    const group = groupsRef.current.find(g => g.listId === listId);
    if (!group) return;
    const newValue = !isNotNeeded(group, userId, itemId);
    const flip = () => setGroups(prev => toggleNotNeededIn(prev, listId, userId, itemId));
    flip();
    try {
      const result = userId
        ? await setPackingListItemNotNeededForMember(listId, itemId, userId, newValue)
        : await setPackingListItemNotNeeded(listId, itemId, newValue);
      if (result?.response?.ok) {
        setListSelectionCount(prev => prev + 1);
      } else {
        flip();
        showNotification({ title: 'Sync failed', message: 'Server rejected not-needed update', color: 'yellow' });
      }
    } catch (err) {
      flip();
      showNotification({ title: 'Offline', message: 'Not-needed update failed - try again when online', color: 'yellow' });
    }
  }, []);

  const handleMoveSharedItem = useCallback(async (fromListId: string, itemId: string, toListId: string) => {
    try {
      const result = await movePackingListItem(fromListId, itemId, toListId);
      if (result.response.ok) {
        const target = groupsRef.current.find(g => g.listId === toListId);
        showNotification({ title: 'Moved', message: `Moved to ${target?.name ?? 'the other destination'}`, color: 'green' });
        setListSelectionCount(prev => prev + 1);
      } else {
        showNotification({ title: 'Move failed', message: result.data?.error || 'Server rejected the move', color: 'red' });
      }
    } catch (err) {
      showNotification({ title: 'Move failed', message: 'Moving items needs a connection', color: 'yellow' });
    }
  }, []);

  const openAddDrawerFor = useCallback((listId: string, userId: string | null) => {
    setAddTarget(userId === null ? { listId, whole: true } : { listId, members: [userId], whole: false });
  }, []);

  const handleAddItemsApply = useCallback(async (selectedIds: string[], keepOpen?: boolean) => {
    const listId = addTarget?.listId ?? activeListId;
    if (!listId) {
      showNotification({ title: 'No list selected', message: 'Select a list before adding', color: 'yellow' });
      return;
    }
    try {
      await Promise.all(selectedIds.map(id => addItemToPackingList(listId, id)));
      setListSelectionCount(prev => prev + 1);
    } catch (err) {
      console.error('Failed to add items to packing list', err);
      showNotification({ title: 'Failed', message: 'Failed to add items to packing list', color: 'red' });
    } finally {
      if (!keepOpen) setAddTarget(null);
    }
  }, [addTarget, activeListId]);

  const isTrip = !!tripInfo;
  const refresh = () => setListSelectionCount(prev => prev + 1);
  const addTargetGroup = groups.find(g => g.listId === addTarget?.listId);
  const listNameFor = (id: string | null) => (availableLists || []).find((list: any) => list.id === id)?.name;

  return (
    <Container size="lg">
      <div style={{ marginTop: 16 }}>
        <Stack>
          <Group justify="space-between" gap="sm">
            <Group justify="flex-start" gap="sm">
              <ActivePackingListSelector />
              <Button size="xs" onClick={() => {
                if (!notesListId) {
                  showNotification({ title: 'No list selected', message: 'Select a list before editing', color: 'yellow' });
                  return;
                }
                if (requestOpenEdit) requestOpenEdit(notesListId);
                openForList(notesListId, listNameFor(notesListId));
              }}>Edit list</Button>
              {activeListId && !isTrip && groups.length > 0 && (
                <Button size="xs" variant="light" onClick={() => setSplitOpen(true)}>Split by destination</Button>
              )}
            </Group>
            {activeListId && <DashboardViewToggle value={viewMode} onChange={setViewMode} />}
          </Group>
          {tripInfo && (
            <Text size="sm" c="dimmed">{`${tripInfo.name} · ${groups.length} ${groups.length === 1 ? 'destination' : 'destinations'}`}</Text>
          )}
          {!activeListId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, padding: 24 }}>
              <div style={{ textAlign: 'center' }}>
                <Text size="lg" fw={600}>Select a list above</Text>
                <Text c="dimmed" size="sm" style={{ marginTop: 8 }}>No list selected. Use the selector above to choose a packing list.</Text>
              </div>
            </div>
          ) : (
            <>
              <div style={{ border: '1px solid #dee2e6', borderRadius: 8, padding: 12 }}>
                <Group justify="space-between" gap="sm">
                  <Group gap="sm">
                    <Text fw={600}>Trip Notes</Text>
                    {isTrip && viewMode === 'columns' && (
                      <NotesDestinationPicker groups={groups} value={notesListId} onChange={selectNotesGroup} />
                    )}
                  </Group>
                  <Button
                    size="xs"
                    variant="subtle"
                    aria-label={notesExpanded ? 'Collapse notes' : 'Expand notes'}
                    onClick={() => setNotesExpanded(prev => !prev)}
                  >
                    {notesExpanded ? 'Collapse' : 'Expand'}
                  </Button>
                </Group>
                {notesExpanded ? (
                  <textarea
                    aria-label="Trip notes editor"
                    value={notesDraft}
                    onChange={handleNotesChange}
                    onBlur={handleNotesBlur}
                    rows={6}
                    style={{ width: '100%', marginTop: 8, resize: 'vertical' }}
                  />
                ) : (
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>
                    {notesDraft.trim()
                      ? notesDraft.split(/\r?\n/).slice(0, 3).join('\n')
                      : 'Add reminders for future trips…'}
                  </div>
                )}
              </div>
              {viewMode === 'person' ? (
                <PersonView
                  groups={groups}
                  isTrip={isTrip}
                  currentUserId={currentUserId}
                  onCheckItem={handleCheckItem}
                  onToggleNotNeeded={toggleNotNeeded}
                  onOpenAddDrawer={openAddDrawerFor}
                  onItemHistory={handleItemNameClick}
                  onMoveSharedItem={handleMoveSharedItem}
                  onSelectedGroupChange={selectNotesGroup}
                />
              ) : (
                <DestinationColumns
                  groups={groups}
                  isTrip={isTrip}
                  currentUserId={currentUserId}
                  familyId={familyId}
                  onCheckItem={handleCheckItem}
                  onItemNameClick={handleItemNameClick}
                  onToggleNotNeeded={toggleNotNeeded}
                  onOpenAddDrawer={openAddDrawerFor}
                  onRefresh={refresh}
                />
              )}
            </>
          )}

          <PackingListAuditPanel
            packingListId={notesListId}
            refreshKey={auditRefreshKey}
            onItemClick={(pliId, display) => notesListId && handleItemNameClick(notesListId, pliId, display)}
          />

          <PackingListItemAuditModal
            opened={itemAuditOpened}
            onClose={() => setItemAuditOpened(false)}
            packingListId={itemAudit?.listId ?? null}
            packingListItemId={itemAudit?.pliId ?? null}
            itemName={itemAudit?.name ?? ''}
            refreshKey={auditRefreshKey}
          />
          <AddItemsDrawer
            opened={!!addTarget}
            onClose={() => setAddTarget(null)}
            familyId={familyId}
            excludedItemIds={addTargetGroup?.excludedItemIds ?? []}
            onApply={handleAddItemsApply}
            title="Add Items"
            showIsOneOffCheckbox={true}
            initialMembers={addTarget?.members}
            initialWhole={addTarget?.whole}
            promoteContext={addTarget ? { listId: addTarget.listId, packingListItemId: '' } : null}
          />
          <SplitListDialog
            opened={splitOpen}
            onClose={() => setSplitOpen(false)}
            familyId={familyId}
            listId={activeListId}
            listName={listNameFor(activeListId) || ''}
            onSplit={() => {
              void refreshLists?.();
              refresh();
            }}
          />
        </Stack>
      </div>
    </Container>
  );
}
```

If `PackingListAuditPanel`, `PackingListItemAuditModal` or `AddItemsDrawer` declare narrower prop types than the values above (for example `packingListId: string | null`), adjust the call site to match. Don't change those components.

- [ ] **Step 4: Run the Dashboard tests and type-check**

Run: `npx vitest run client/src/__tests__/Dashboard.test.tsx && npx tsc -p client/tsconfig.json --noEmit`
Expected: all 8 tests PASS, and no type errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Dashboard.tsx client/src/__tests__/Dashboard.test.tsx
git commit -m "feat(client): dashboard shows every destination of the active trip

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 14: Selector and Manage Lists know about trips

**Files:**
- Create: `client/src/utils/listOptions.ts`
- Test: `client/src/__tests__/listOptions.test.ts`
- Modify: `client/src/components/ActivePackingListSelector.tsx`
- Modify: `client/src/components/ManagePackingLists.tsx` (imports, state, list rows around lines 362–397, dialog at the end of the card)
- Modify: `client/src/__tests__/ManagePackingLists.test.tsx`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Register the test file**

Add this to the `include` list in `vitest.config.ts`:

```ts
      'client/src/__tests__/listOptions.test.ts', // Selector grouping of trip destination lists
```

- [ ] **Step 2: Write the failing tests**

Create `client/src/__tests__/listOptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildListOptions, selectedOptionValue } from '../utils/listOptions';

const summary = (destinationId: string, destinationName: string, position: number) => ({
  tripId: 't1', tripName: 'Spring Break', destinationId, destinationName, position, destinationCount: 2,
});

const lists = [
  { id: 'beach', name: 'Beach' },
  { id: 'grandma', name: "Spring – Grandma's", trip_destination: summary('d2', "Grandma's", 1) },
  { id: 'paris', name: 'Spring – Paris', trip_destination: summary('d1', 'Paris', 0) },
];

describe('buildListOptions', () => {
  it('collapses a trip into one option that opens its first destination', () => {
    expect(buildListOptions(lists)).toEqual([
      { value: 'beach', label: 'Beach', listIds: ['beach'] },
      { value: 'paris', label: 'Spring Break · 2 destinations', listIds: ['grandma', 'paris'] },
    ]);
  });

  it('selects the trip option for any of its destination lists', () => {
    const options = buildListOptions(lists);
    expect(selectedOptionValue(options, 'grandma')).toBe('paris');
    expect(selectedOptionValue(options, 'beach')).toBe('beach');
    expect(selectedOptionValue(options, null)).toBe('');
    expect(selectedOptionValue(options, 'unknown')).toBe('');
  });
});
```

Add this mock to `client/src/__tests__/ManagePackingLists.test.tsx`, after the `ItemEditDrawer` mock:

```ts
vi.mock('../components/SplitListDialog', () => {
  const React = require('react');
  return { default: (props: any) => (props.opened ? React.createElement('div', null, `split dialog for ${props.listId}`) : null) };
});
```

Then add this `describe` block inside the `else` branch, after `describe('ManagePackingLists active list actions', ...)`:

```tsx
  describe('ManagePackingLists trip destinations', () => {
    const trip = (destinationId: string, destinationName: string, position: number) => ({
      tripId: 't1', tripName: 'Spring Break', destinationId, destinationName, position, destinationCount: 2,
    });

    beforeEach(() => {
      availableListsMock = [
        { id: 'list1', name: 'Spring – Paris', trip_destination: trip('d1', 'Paris', 0) },
        { id: 'list2', name: "Spring – Grandma's", trip_destination: trip('d2', "Grandma's", 1) },
        { id: 'list3', name: 'Ski' },
      ];
      refreshListsMock = vi.fn().mockResolvedValue(availableListsMock);
    });

    it('labels destination lists and marks every destination of the active trip as active', async () => {
      renderPage();
      expect(await screen.findByText('Spring Break · Paris')).toBeTruthy();
      expect(screen.getByText("Spring Break · Grandma's")).toBeTruthy();
      await waitFor(() => expect(screen.getAllByText('Active')).toHaveLength(2));
      expect(screen.getAllByRole('button', { name: 'Set as active' })).toHaveLength(1);
    });

    it('offers Split only for lists that are not part of a trip', async () => {
      const u = await user.setup();
      renderPage();
      await screen.findByText('Spring Break · Paris');
      const splitButtons = screen.getAllByRole('button', { name: 'Split' });
      expect(splitButtons).toHaveLength(1);
      await u.click(splitButtons[0]);
      expect(screen.getByText('split dialog for list3')).toBeTruthy();
    });
  });
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run client/src/__tests__/listOptions.test.ts client/src/__tests__/ManagePackingLists.test.tsx`
Expected: `listOptions` FAILS because the module is missing. The new ManagePackingLists tests FAIL because there are no badges or Split button. The existing ManagePackingLists tests PASS.

- [ ] **Step 4: Implement `listOptions`**

Create `client/src/utils/listOptions.ts`:

```ts
import type { ListTripSummary } from '../types/trip';

export interface ListOption {
  value: string;
  label: string;
  listIds: string[];
}

interface ListLike {
  id: string;
  name: string;
  trip_destination?: ListTripSummary | null;
}

// One entry per ordinary list, and one per trip whose value is its lowest-position destination list.
export function buildListOptions(lists: ListLike[]): ListOption[] {
  const options: ListOption[] = [];
  const trips = new Map<string, { option: ListOption; position: number }>();
  for (const list of lists) {
    const trip = list.trip_destination;
    if (!trip) {
      options.push({ value: list.id, label: list.name, listIds: [list.id] });
      continue;
    }
    const existing = trips.get(trip.tripId);
    if (existing) {
      existing.option.listIds.push(list.id);
      if (trip.position < existing.position) {
        existing.position = trip.position;
        existing.option.value = list.id;
      }
      continue;
    }
    const count = trip.destinationCount;
    const option = { value: list.id, label: `${trip.tripName} · ${count} ${count === 1 ? 'destination' : 'destinations'}`, listIds: [list.id] };
    trips.set(trip.tripId, { option, position: trip.position });
    options.push(option);
  }
  return options;
}

export function selectedOptionValue(options: ListOption[], activeListId: string | null): string {
  if (!activeListId) return '';
  return options.find(o => o.listIds.includes(activeListId))?.value ?? '';
}
```

- [ ] **Step 5: Use it in the selector**

In `client/src/components/ActivePackingListSelector.tsx`, add `import { useMemo } from 'react';`, merging it into the existing `react` import, and `import { buildListOptions, selectedOptionValue } from '../utils/listOptions';`. Then replace the `<Select ... />` element with:

```tsx
        <Select
          data={[{ value: '', label: '-- select active list --' }, ...options.map(o => ({ value: o.value, label: o.label }))]}
          value={selectedOptionValue(options, activeListId)}
          onChange={(v) => handleSelect(v || null)}
          style={{ minWidth: 260 }}
        />
```

Add this inside the component, after the `useActivePackingList()` line:

```tsx
  const options = useMemo(() => buildListOptions(availableLists || []), [availableLists]);
```

- [ ] **Step 6: Update `ManagePackingLists`**

In `client/src/components/ManagePackingLists.tsx`:

1. Add the import `import SplitListDialog from './SplitListDialog';`.
2. Add this state next to the other `useState` calls: `const [splitTarget, setSplitTarget] = useState<{ id: string; name: string } | null>(null);`.
3. Just before `return (`, add:

```tsx
  const activeTripId = lists.find(l => l.id === activeFamilyListId)?.trip_destination?.tripId ?? null;
  const isActiveRow = (l: any) => l.id === activeFamilyListId || (!!activeTripId && l.trip_destination?.tripId === activeTripId);
```

4. In the row, replace `<Text>{l.name}</Text>` with:

```tsx
              <Group gap="xs">
                <Text>{l.name}</Text>
                {l.trip_destination && (
                  <Badge color="grape" variant="light">{`${l.trip_destination.tripName} · ${l.trip_destination.destinationName}`}</Badge>
                )}
              </Group>
```

5. Replace `{activeFamilyListId === l.id ? (` with `{isActiveRow(l) ? (`.
6. After the `Copy` button, add:

```tsx
                {!l.trip_destination && (
                  <Button size="xs" variant="light" onClick={() => setSplitTarget({ id: l.id, name: l.name })}>Split</Button>
                )}
```

7. Directly before the closing `</Card>`, add:

```tsx
      <SplitListDialog
        opened={!!splitTarget}
        onClose={() => setSplitTarget(null)}
        familyId={familyId}
        listId={splitTarget?.id ?? null}
        listName={splitTarget?.name ?? ''}
        onSplit={() => { void reload(); }}
      />
```

- [ ] **Step 7: Run the tests and type-check**

Run: `npx vitest run client/src/__tests__/listOptions.test.ts client/src/__tests__/ManagePackingLists.test.tsx client/src/__tests__/ActivePackingListContext.test.tsx && npx tsc -p client/tsconfig.json --noEmit`
Expected: PASS, and no type errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/utils/listOptions.ts client/src/__tests__/listOptions.test.ts client/src/components/ActivePackingListSelector.tsx client/src/components/ManagePackingLists.tsx client/src/__tests__/ManagePackingLists.test.tsx vitest.config.ts
git commit -m "feat(client): group trip destinations in the list selector and Manage Lists

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 15: Packing section on the Trip page

**Files:**
- Create: `client/src/components/AddDestinationDialog.tsx`
- Create: `client/src/components/TripPackingSection.tsx`
- Test: `client/src/__tests__/AddDestinationDialog.test.tsx`
- Test: `client/src/__tests__/TripPackingSection.test.tsx`
- Modify: `client/src/pages/TripDetailPage.tsx` (import, plus render after `<TripTravelersStrip ... />`)
- Modify: `client/src/__tests__/TripDetailPage.test.tsx` (mock the section)
- Modify: `vitest.config.ts`

- [ ] **Step 1: Register the test files**

Add these to the `include` list in `vitest.config.ts`:

```ts
      'client/src/__tests__/AddDestinationDialog.test.tsx', // Destination create/edit with member moves
      'client/src/__tests__/TripPackingSection.test.tsx', // Trip page packing cards
```

- [ ] **Step 2: Write the failing dialog tests**

Create `client/src/__tests__/AddDestinationDialog.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithMantine } from '../test-utils/renderWithMantine';

vi.mock('../api', () => ({ getItemGroups: vi.fn(), getFamilyPackingLists: vi.fn() }));
vi.mock('../api/tripApi', () => ({
  tripApi: { createDestination: vi.fn(), updateDestination: vi.fn() },
}));
vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

import { getFamilyPackingLists, getItemGroups } from '../api';
import { tripApi } from '../api/tripApi';
import { showNotification } from '@mantine/notifications';
import AddDestinationDialog from '../components/AddDestinationDialog';

const trip = { id: 't1', familyId: 'f1', name: 'Spring Break', startDate: '2027-03-01', endDate: '2027-03-08', createdAt: '', updatedAt: '' };
const familyMembers = [{ id: 'dad', name: 'Dad' }, { id: 'ava', name: 'Ava' }, { id: 'leo', name: 'Leo' }];
const grandma = { id: 'd1', tripId: 't1', name: "Grandma's", color: 'green', position: 0, packingListId: 'l1', memberIds: ['ava', 'leo'] };

describe('AddDestinationDialog', () => {
  beforeEach(() => {
    (getItemGroups as any).mockResolvedValue({ response: { ok: true }, data: { itemGroups: [{ id: 'g1', name: 'Beach' }] } });
    (getFamilyPackingLists as any).mockResolvedValue({ response: { ok: true }, data: { lists: [] } });
    (tripApi.createDestination as any).mockResolvedValue({});
    (tripApi.updateDestination as any).mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a destination with travelers and item groups', async () => {
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Dad' }));
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Beach' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', {
      name: 'Paris', memberIds: ['dad'], itemGroupIds: ['g1'], packingListId: undefined,
    });
  });

  it('moves a traveler out of another destination after confirming', async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={null} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    expect(confirm).toHaveBeenCalledWith("Move Ava from Grandma's?");
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).toHaveBeenCalledWith('t1', 'd1', { memberIds: ['leo'] });
    expect(tripApi.createDestination).toHaveBeenCalledWith('t1', expect.objectContaining({ memberIds: ['ava'] }));
  });

  it('refuses to empty another destination', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[{ ...grandma, memberIds: ['ava'] }]} familyMembers={familyMembers} editing={null} onSaved={vi.fn()} />
    );
    await userEvent.type(screen.getByLabelText(/Destination name/), 'Paris');
    await userEvent.click(screen.getByRole('checkbox', { name: "Ava (at Grandma's)" }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(showNotification).toHaveBeenCalled());
    expect(tripApi.updateDestination).not.toHaveBeenCalled();
    expect(tripApi.createDestination).not.toHaveBeenCalled();
  });

  it('renames and changes travelers when editing', async () => {
    const onSaved = vi.fn();
    renderWithMantine(
      <AddDestinationDialog opened onClose={vi.fn()} trip={trip} destinations={[grandma]} familyMembers={familyMembers} editing={grandma} onSaved={onSaved} />
    );
    const name = screen.getByLabelText(/Destination name/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Nana');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Leo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(tripApi.updateDestination).toHaveBeenCalledWith('t1', 'd1', { name: 'Nana', memberIds: ['ava'] });
  });
});
```

- [ ] **Step 3: Write the failing section tests**

Create `client/src/__tests__/TripPackingSection.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithMantine } from '../test-utils/renderWithMantine';

const { setActiveListId } = vi.hoisted(() => ({ setActiveListId: vi.fn() }));

vi.mock('../api', () => ({ getFamily: vi.fn(), getPackingList: vi.fn() }));
vi.mock('../api/tripApi', () => ({
  tripApi: { listDestinations: vi.fn(), deleteDestination: vi.fn() },
  ApiConflictError: class ApiConflictError extends Error {
    constructor(message: string, public body: any) { super(message); }
  },
}));
vi.mock('../contexts/ActivePackingListContext', () => ({ useActivePackingList: () => ({ setActiveListId }) }));
vi.mock('../components/AddDestinationDialog', () => ({ default: () => null }));
vi.mock('@mantine/notifications', () => ({ showNotification: vi.fn() }));

import { getFamily, getPackingList } from '../api';
import { tripApi } from '../api/tripApi';
import TripPackingSection from '../components/TripPackingSection';

const trip = { id: 't1', familyId: 'f1', name: 'Spring Break', startDate: '2027-03-01', endDate: '2027-03-08', createdAt: '', updatedAt: '' };

const renderSection = () =>
  renderWithMantine(
    <MemoryRouter initialEntries={['/trips/t1']}>
      <Routes>
        <Route path="/trips/t1" element={<TripPackingSection trip={trip} />} />
        <Route path="/" element={<div>dashboard page</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('TripPackingSection', () => {
  beforeEach(() => {
    (getFamily as any).mockResolvedValue({
      response: { ok: true },
      data: { family: { members: [{ id: 'dad', name: 'Dad' }, { id: 'mom', name: 'Mom' }, { id: 'ava', name: 'Ava' }] } },
    });
    (getPackingList as any).mockResolvedValue({
      response: { ok: true },
      data: {
        list: { member_ids: ['dad', 'mom'] },
        items: [
          { id: 'p1', item_id: 'i1', members: [{ id: 'dad' }], whole_family: 0 },
          { id: 'p2', item_id: 'i2', members: [], whole_family: 1 },
        ],
        checks: [{ packing_list_item_id: 'p1', member_id: 'dad', checked: 1 }],
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('offers to set up packing when the trip has no destinations', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([]);
    renderSection();
    expect(await screen.findByRole('button', { name: 'Set up packing' })).toBeTruthy();
  });

  it('shows a card per destination with travelers and progress', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([
      { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-paris', memberIds: ['dad', 'mom'] },
    ]);
    renderSection();
    expect(await screen.findByText('Paris')).toBeTruthy();
    expect(screen.getByText('Dad, Mom')).toBeTruthy();
    expect(screen.getByText('2 items · 50% packed')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add destination' })).toBeTruthy();
  });

  it('opens the dashboard on the destination list when a card is tapped', async () => {
    (tripApi.listDestinations as any).mockResolvedValue([
      { id: 'd1', tripId: 't1', name: 'Paris', color: 'blue', position: 0, packingListId: 'list-paris', memberIds: ['dad', 'mom'] },
    ]);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Open Paris packing list' }));
    expect(setActiveListId).toHaveBeenCalledWith('list-paris');
    expect(screen.getByText('dashboard page')).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run them and confirm they fail**

Run: `npx vitest run client/src/__tests__/AddDestinationDialog.test.tsx client/src/__tests__/TripPackingSection.test.tsx`
Expected: FAIL. The modules are missing.

- [ ] **Step 5: Implement `AddDestinationDialog`**

Create `client/src/components/AddDestinationDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Button, Chip, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { getFamilyPackingLists, getItemGroups } from '../api';
import { tripApi } from '../api/tripApi';
import type { Trip, TripDestination } from '../types/trip';

export interface AddDestinationDialogProps {
  opened: boolean;
  onClose: () => void;
  trip: Trip;
  destinations: TripDestination[];
  familyMembers: any[];
  editing: TripDestination | null;
  onSaved: () => void;
}

export default function AddDestinationDialog({ opened, onClose, trip, destinations, familyMembers, editing, onSaved }: AddDestinationDialogProps) {
  const isMobile = useMediaQuery('(max-width: 48em)', undefined, { getInitialValueInEffect: false });
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [itemGroupIds, setItemGroupIds] = useState<string[]>([]);
  const [existingListId, setExistingListId] = useState<string | null>(null);
  const [itemGroups, setItemGroups] = useState<{ id: string; name: string }[]>([]);
  const [freeLists, setFreeLists] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setName(editing?.name ?? '');
    setMemberIds(editing?.memberIds ?? []);
    setItemGroupIds([]);
    setExistingListId(null);
    if (editing) return;
    let cancelled = false;
    (async () => {
      try {
        const [groupsRes, listsRes] = await Promise.all([getItemGroups(trip.familyId), getFamilyPackingLists(trip.familyId)]);
        if (cancelled) return;
        setItemGroups(groupsRes.response.ok ? groupsRes.data.itemGroups || [] : []);
        setFreeLists(listsRes.response.ok ? (listsRes.data.lists || []).filter((l: any) => !l.trip_destination) : []);
      } catch {
        // optional extras; the dialog still works without them
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, editing, trip.familyId]);

  const ownerOf = (memberId: string) => destinations.find(d => d.id !== editing?.id && d.memberIds.includes(memberId));
  const memberName = (m: any) => m.name || m.username;

  const toggleMember = (member: any) => {
    if (memberIds.includes(member.id)) {
      setMemberIds(ids => ids.filter(id => id !== member.id));
      return;
    }
    const owner = ownerOf(member.id);
    if (owner && !window.confirm(`Move ${memberName(member)} from ${owner.name}?`)) return;
    setMemberIds(ids => [...ids, member.id]);
  };

  const save = async () => {
    // Fail before changing anything if a move would leave another destination empty.
    const emptied = destinations.find(d => d.id !== editing?.id && d.memberIds.length > 0 && d.memberIds.every(id => memberIds.includes(id)));
    if (emptied) {
      showNotification({ title: 'Cannot move everyone', message: `${emptied.name} needs at least one traveler`, color: 'red' });
      return;
    }
    setSaving(true);
    try {
      for (const owner of destinations) {
        if (owner.id === editing?.id || !owner.memberIds.some(id => memberIds.includes(id))) continue;
        await tripApi.updateDestination(trip.id, owner.id, { memberIds: owner.memberIds.filter(id => !memberIds.includes(id)) });
      }
      if (editing) {
        await tripApi.updateDestination(trip.id, editing.id, { name: name.trim(), memberIds });
      } else {
        await tripApi.createDestination(trip.id, { name: name.trim(), memberIds, itemGroupIds, packingListId: existingListId || undefined });
      }
      onSaved();
    } catch (err) {
      showNotification({ title: 'Could not save destination', message: (err as Error).message, color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'Add destination'} fullScreen={!!isMobile}>
      <Stack>
        <TextInput label="Destination name" placeholder="e.g. Grandma's" value={name} onChange={e => setName(e.currentTarget.value)} />
        <Text size="sm" fw={500}>Who's going?</Text>
        <Group gap="xs">
          {familyMembers.map(member => {
            const owner = ownerOf(member.id);
            const selected = memberIds.includes(member.id);
            return (
              <Chip
                key={member.id}
                checked={selected}
                onChange={() => toggleMember(member)}
                style={owner && !selected ? { opacity: 0.6 } : undefined}
              >
                {owner && !selected ? `${memberName(member)} (at ${owner.name})` : memberName(member)}
              </Chip>
            );
          })}
        </Group>
        {!editing && itemGroups.length > 0 && (
          <>
            <Text size="sm" fw={500}>Start with item groups (optional)</Text>
            <Chip.Group multiple value={itemGroupIds} onChange={setItemGroupIds}>
              <Group gap="xs">
                {itemGroups.map(g => <Chip key={g.id} value={g.id}>{g.name}</Chip>)}
              </Group>
            </Chip.Group>
          </>
        )}
        {!editing && freeLists.length > 0 && (
          <Select
            label="Use an existing list (optional)"
            placeholder="Start a new list"
            clearable
            data={freeLists.map(l => ({ value: l.id, label: l.name }))}
            value={existingListId}
            onChange={setExistingListId}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving} disabled={!name.trim() || memberIds.length === 0}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 6: Implement `TripPackingSection`**

Create `client/src/components/TripPackingSection.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { ActionIcon, Button, Card, Group, Menu, Modal, Progress, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { showNotification } from '@mantine/notifications';
import { getFamily, getPackingList } from '../api';
import { tripApi, ApiConflictError } from '../api/tripApi';
import { useActivePackingList } from '../contexts/ActivePackingListContext';
import { buildDestinationGroup, groupProgress } from '../utils/dashboardGroups';
import type { Trip, TripDestination } from '../types/trip';
import AddDestinationDialog from './AddDestinationDialog';

interface CardData {
  destination: TripDestination;
  memberNames: string[];
  total: number;
  percent: number;
}

export default function TripPackingSection({ trip }: { trip: Trip }) {
  const navigate = useNavigate();
  const { setActiveListId } = useActivePackingList();
  const [destinations, setDestinations] = useState<TripDestination[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [dialog, setDialog] = useState<{ editing: TripDestination | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TripDestination | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, familyRes] = await Promise.all([tripApi.listDestinations(trip.id), getFamily(trip.familyId)]);
      const members: any[] = familyRes.response.ok ? familyRes.data.family?.members || [] : [];
      setFamilyMembers(members);
      setDestinations(list);
      setCards(await Promise.all(list.map(async destination => {
        const res = await getPackingList(destination.packingListId);
        const group = buildDestinationGroup({
          listId: destination.packingListId,
          listData: res.response.ok ? res.data : {},
          masterItems: [],
          familyMembers: members,
          currentUserId: null,
          destination,
        });
        const { total, percent } = groupProgress(group);
        return { destination, memberNames: group.members.map(m => m.name), total, percent };
      })));
    } catch (err) {
      showNotification({ title: 'Error', message: 'Could not load packing destinations', color: 'red' });
    }
  }, [trip.id, trip.familyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openOnDashboard = (destination: TripDestination) => {
    setActiveListId(destination.packingListId);
    navigate('/');
  };

  const deleteDestination = async (destination: TripDestination, options: { moveSharedItemsTo?: string; deleteList?: boolean } = {}) => {
    try {
      await tripApi.deleteDestination(trip.id, destination.id, options);
      setPendingDelete(null);
      await load();
    } catch (err) {
      if (err instanceof ApiConflictError && err.body?.error === 'destination_has_items') {
        setPendingDelete(destination);
        return;
      }
      showNotification({ title: 'Error', message: (err as Error).message || 'Failed to delete destination', color: 'red' });
    }
  };

  return (
    <section aria-label="Packing" style={{ marginTop: 16 }}>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Packing</Title>
        <Button size="xs" variant="light" onClick={() => setDialog({ editing: null })}>
          {destinations.length === 0 ? 'Set up packing' : '+ Add destination'}
        </Button>
      </Group>
      <Stack gap="xs">
        {cards.map(({ destination, memberNames, total, percent }) => (
          <Card key={destination.id} withBorder padding="sm" style={{ borderLeft: `6px solid var(--mantine-color-${destination.color || 'blue'}-6)` }}>
            <Group justify="space-between" wrap="nowrap">
              <UnstyledButton
                aria-label={`Open ${destination.name} packing list`}
                onClick={() => openOnDashboard(destination)}
                style={{ flex: 1, textAlign: 'left', minHeight: 44 }}
              >
                <Text fw={600}>{destination.name}</Text>
                <Text size="sm" c="dimmed">{memberNames.join(', ') || 'No travelers'}</Text>
                <Text size="xs" c="dimmed">{`${total} items · ${percent}% packed`}</Text>
                <Progress value={percent} size="sm" mt={4} color={destination.color || 'blue'} />
              </UnstyledButton>
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" size="lg" aria-label={`Actions for ${destination.name}`}>
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => setDialog({ editing: destination })}>Rename or change travelers</Menu.Item>
                  <Menu.Item
                    color="red"
                    onClick={() => {
                      if (window.confirm(`Delete ${destination.name}?`)) void deleteDestination(destination);
                    }}
                  >
                    Delete
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Card>
        ))}
      </Stack>

      <AddDestinationDialog
        opened={!!dialog}
        onClose={() => setDialog(null)}
        trip={trip}
        destinations={destinations}
        familyMembers={familyMembers}
        editing={dialog?.editing ?? null}
        onSaved={() => {
          setDialog(null);
          void load();
        }}
      />

      <Modal opened={!!pendingDelete} onClose={() => setPendingDelete(null)} title={pendingDelete ? `${pendingDelete.name} still has items` : ''}>
        <Stack>
          {destinations.filter(d => d.id !== pendingDelete?.id).map(other => (
            <Button key={other.id} variant="light" onClick={() => pendingDelete && deleteDestination(pendingDelete, { moveSharedItemsTo: other.id })}>
              {`Move shared items to ${other.name} and delete`}
            </Button>
          ))}
          <Button color="red" variant="light" onClick={() => pendingDelete && deleteDestination(pendingDelete, { deleteList: true })}>
            Delete list too
          </Button>
          <Button variant="default" onClick={() => setPendingDelete(null)}>Cancel</Button>
        </Stack>
      </Modal>
    </section>
  );
}
```

- [ ] **Step 7: Wire it into the Trip page**

In `client/src/pages/TripDetailPage.tsx`, add `import TripPackingSection from '../components/TripPackingSection';` after the `TripTravelersStrip` import. Then render it directly after the `<TripTravelersStrip ... />` element:

```tsx
      <TripPackingSection trip={trip} />
```

In `client/src/__tests__/TripDetailPage.test.tsx`, add this mock after the `TripParticipantsPanel` mock:

```tsx
vi.mock('../components/TripPackingSection', () => ({
  default: () => <div>packing section</div>,
}));
```

- [ ] **Step 8: Run the tests and type-check**

Run: `npx vitest run client/src/__tests__/AddDestinationDialog.test.tsx client/src/__tests__/TripPackingSection.test.tsx client/src/__tests__/TripDetailPage.test.tsx && npx tsc -p client/tsconfig.json --noEmit`
Expected: PASS, and no type errors.

If Mantine `Chip` doesn't expose `role="checkbox"` with the label as its name in this version, query by label instead (`screen.getByLabelText('Dad')`) in `AddDestinationDialog.test.tsx`.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/AddDestinationDialog.tsx client/src/components/TripPackingSection.tsx client/src/__tests__/AddDestinationDialog.test.tsx client/src/__tests__/TripPackingSection.test.tsx client/src/pages/TripDetailPage.tsx client/src/__tests__/TripDetailPage.test.tsx vitest.config.ts
git commit -m "feat(client): packing destinations on the trip page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 16: Documentation

**Files:**
- Modify: `client/src/APIUsage.md`
- Modify: `client/src/components/ComponentUsage.md`
- Modify: `docs/ServerAPIUsage.md`

- [ ] **Step 1: Update `client/src/APIUsage.md`**

At the end of the `### Trip tracking (client/src/api/tripApi.ts)` list, append:

```markdown
- `listDestinations`, `deleteDestination` (409 `destination_has_items` → `ApiConflictError`):
  - client/src/components/TripPackingSection.tsx
- `createDestination`, `updateDestination`:
  - client/src/components/AddDestinationDialog.tsx
- `splitList` (409 `member_in_other_destination` → `ApiConflictError`):
  - client/src/components/SplitListDialog.tsx
- `listTrips`, `createTrip`:
  - client/src/components/SplitListDialog.tsx (pick or create the trip being split into)
```

In the packing list section (where `togglePackingListItemCheck` is listed), add:

```markdown
- `movePackingListItem`:
  - client/src/components/Dashboard.tsx (Person view "Move to <destination>" for shared items)
```

Under `getPackingList`, add these users: `client/src/components/SplitListDialog.tsx` and `client/src/components/TripPackingSection.tsx`. Under `getFamily`, add: `client/src/components/SplitListDialog.tsx`, `client/src/components/TripPackingSection.tsx` and `client/src/components/Dashboard.tsx`. Under `getItemGroups` and `getFamilyPackingLists`, add: `client/src/components/AddDestinationDialog.tsx`.

- [ ] **Step 2: Update `client/src/components/ComponentUsage.md`**

Before the closing `---` / `**Note:**` lines, append:

```markdown
### PersonView
**Used in:**
  - `Dashboard` (Person view)

Person-first packing: a sticky chip row (one per traveler, colored by destination, showing items left), the selected person's items and their destination's shared items, a collapsed "N packed · M not needed" row, swipe to the next or previous person, and a ⋯ menu (Not needed / Move to <destination> / History).

### DestinationColumns
**Used in:**
  - `Dashboard` (Columns view)

One `PackingListsSideBySide` per destination, under a colored "<destination> · <members>" band. The shared column is titled "Shared" for trips.

### DashboardViewToggle
**Used in:**
  - `Dashboard`

Person / Columns `SegmentedControl`. `useDashboardViewMode` stores the choice in `localStorage.dashboardView` (defaults: Person on phones, Columns otherwise).

### NotesDestinationPicker
**Used in:**
  - `Dashboard` (Columns view, trips only)

Chooses which destination's notes and history are shown.

### SplitListDialog
**Used in:**
  - `Dashboard` ("Split by destination")
  - `ManagePackingLists` ("Split")

Three steps: trip (new or existing), who goes where, and where shared items go.

### TripPackingSection
**Used in:**
  - `TripDetailPage`

Destination cards with travelers and progress. Tapping a card opens the dashboard; the menu renames, changes travelers or deletes.

### AddDestinationDialog
**Used in:**
  - `TripPackingSection`

Create or edit a destination: name, travelers (moving someone from another destination asks first), optional item groups, or an existing list.
```

- [ ] **Step 3: Update `docs/ServerAPIUsage.md`**

In `## Packing Lists`, update the `GET /families/:familyId/packing-lists` purpose to: "List packing lists for family (with member ids and `trip_destination` summary attached)." Update the `GET /packing-lists/:id` purpose to: "Fetch detailed packing list with items, checks, not_needed rows, template ids and `trip_destination` (trip context with all destinations, or null)." Then append:

```markdown
- POST /packing-lists/:listId/items/:pliId/move
  - Purpose: Move a shared (whole-family) item to another destination list of the same trip; merges with an existing row for the same master item. 400 for personal items or lists from different trips.
  - Client helper: `movePackingListItem`
```

Add a new section before `## Families & Members`:

```markdown
## Trip Destinations

- GET /trips/:tripId/destinations
  - Purpose: Destinations of a trip ordered by position, each `{ id, tripId, name, color, position, packingListId, memberIds }`.
  - Client helper: `tripApi.listDestinations`

- POST /trips/:tripId/destinations
  - Purpose: Create a destination with a new list (or adopt `packingListId`), set members, add item groups. 409 `member_in_other_destination` when a person is already in another destination.
  - Client helper: `tripApi.createDestination`

- PUT /trips/:tripId/destinations/:destinationId
  - Purpose: Rename, recolor, reorder or change members (same 409 rule).
  - Client helper: `tripApi.updateDestination`

- DELETE /trips/:tripId/destinations/:destinationId
  - Purpose: Remove a destination. Body `{ moveSharedItemsTo?, deleteList? }`; 409 `destination_has_items` when the list has items and neither is given.
  - Client helper: `tripApi.deleteDestination`

- POST /trips/:tripId/split
  - Purpose: Split a list into destinations in one transaction (personal items follow their people with their checks; shared items go to the chosen destination). Returns `{ destinations, skippedCount }`.
  - Client helper: `tripApi.splitList`
```

- [ ] **Step 4: Commit**

```bash
git add client/src/APIUsage.md client/src/components/ComponentUsage.md docs/ServerAPIUsage.md
git commit -m "docs: usage maps for multi-destination trips

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 17: Full verification

- [ ] **Step 1: Type-check both projects**

```bash
npx tsc -p client/tsconfig.json --noEmit && npx tsc -p tsconfig.build.json --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run the whole test suite**

```bash
npx vitest run
```

Expected: everything passes. Compare against the Task 0 baseline: no test that passed then may fail now.

- [ ] **Step 3: Run the migration against a scratch copy of a real database**

The runner reads `DB_FILE` (default `./data/travel-list.sqlite`). Use a copy of the main workspace database, if one exists:

```bash
cp /config/workspace/travel-list/data/travel-list.sqlite /tmp/td-migrate.sqlite
DB_FILE=/tmp/td-migrate.sqlite node server/migrations/run-migrations.cjs status
DB_FILE=/tmp/td-migrate.sqlite node server/migrations/run-migrations.cjs up
DB_FILE=/tmp/td-migrate.sqlite node server/migrations/run-migrations.cjs status
rm /tmp/td-migrate.sqlite
```

Expected: `20261108_02_add_trip_destinations` goes from pending to applied. If there is no database file to copy, skip this step and say so.

- [ ] **Step 4: Manual mobile check at 390px**

Start the app (`npm run dev`, or the project's usual dev command), sign in, and use browser devtools at 390×844 to:
1. Open a list on the dashboard and tap "Split by destination". Create a new trip, put the parents in "Paris" and the kids in "Grandma's", and send shared items to Grandma's.
2. Confirm the selector shows "<trip> · 2 destinations" and the dashboard defaults to Person view, with chips for everyone colored by destination.
3. Check an item in your own section. Swipe to the next person. Expand "N packed".
4. Open the ⋯ menu on a shared item, choose "Move to Paris", and confirm it appears under "Paris shared".
5. Switch to Columns. Confirm there are two colored bands, the shared column is titled "Shared", and the notes picker switches the notes between destinations.
6. Open the trip page. Confirm both destination cards show progress, and that tapping one returns to the dashboard.

Report anything that doesn't behave as described. Don't paper over it.

- [ ] **Step 5: Final commit, if anything changed**

```bash
git status --short
```

If verification led to fixes, commit them with a descriptive message and the Co-authored-by trailer.
