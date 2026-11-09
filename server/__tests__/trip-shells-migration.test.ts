import { describe, it, expect, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import migration from '../migrations/migrations/20261109_01_trip_shells_for_lists.cjs';

type Db = Awaited<ReturnType<typeof getDb>>;

async function seedFamily(db: Db) {
  const familyId = uuidv4();
  await db.run(`INSERT INTO families (id, name) VALUES (?, 'Fam')`, [familyId]);
  const user = async (name: string, deleted = false) => {
    const id = uuidv4();
    await db.run(
      `INSERT INTO users (id, name, username, role, familyId, deleted_at) VALUES (?, ?, ?, 'FamilyMember', ?, ?)`,
      [id, name, `${name}-${id}`, familyId, deleted ? new Date().toISOString() : null]
    );
    return id;
  };
  return { familyId, dad: await user('Dad'), mom: await user('Mom'), ava: await user('Ava'), gone: await user('Gone', true) };
}

async function makeList(db: Db, familyId: string, name: string, memberIds: string[], deleted = false) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, familyId, name, now, now, deleted ? now : null]
  );
  for (const m of memberIds) await db.run(`INSERT INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [id, m]);
  return id;
}

async function makeTrip(db: Db, familyId: string, name: string, deleted = false) {
  const id = uuidv4();
  await db.run(
    `INSERT INTO trips (id, family_id, name, start_date, end_date, status, deleted_at) VALUES (?, ?, ?, '2027-03-01', '2027-03-08', 'booked', ?)`,
    [id, familyId, name, deleted ? new Date().toISOString() : null]
  );
  return id;
}

const link = (db: Db, tripId: string, listId: string) =>
  db.run(`INSERT INTO trip_packing_lists (trip_id, packing_list_id) VALUES (?, ?)`, [tripId, listId]);

async function makeDestination(db: Db, tripId: string, name: string, listId: string, position = 0, color = 'blue') {
  const id = uuidv4();
  await db.run(
    `INSERT INTO trip_destinations (id, trip_id, name, color, position, packing_list_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, tripId, name, color, position, listId]
  );
  await link(db, tripId, listId);
  return id;
}

const placeOf = (db: Db, listId: string) =>
  db.get(
    `SELECT t.id AS tripId, t.name AS tripName, t.start_date AS startDate, t.end_date AS endDate, t.status, t.family_id AS familyId,
            d.id AS destinationId, d.name AS destinationName, d.position, d.color
     FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
     WHERE d.packing_list_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
    [listId]
  );
const destinationsOf = (db: Db, tripId: string) =>
  db.all(`SELECT name, position, color, packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL ORDER BY position`, [tripId]);
const nameOf = async (db: Db, listId: string) => (await db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId]))?.name;
const membersOf = async (db: Db, listId: string) =>
  (await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ? ORDER BY member_id`, [listId])).map((r: any) => r.member_id);
const linked = async (db: Db, tripId: string, listId: string) =>
  !!(await db.get(`SELECT 1 AS yes FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [tripId, listId]));

describe('20261109_01_trip_shells_for_lists', () => {
  afterEach(async () => {
    await closeDb();
  });

  it('turns a linked list into a destination named after its trip', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Spring Break');
    const listId = await makeList(db, f.familyId, 'Spring list', [f.dad, f.mom]);
    await link(db, tripId, listId);

    await migration.up({ db });

    const place = await placeOf(db, listId);
    expect(place).toMatchObject({ tripId, destinationName: 'Spring Break', position: 0, color: 'blue' });
    expect(await membersOf(db, listId)).toEqual([f.dad, f.mom].sort());
    expect(await nameOf(db, listId)).toBe('Spring Break');
  });

  it('adds a second linked list to a trip that already has a destination, under the list name', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Spring Break');
    const paris = await makeList(db, f.familyId, 'Spring Break – Paris', [f.dad]);
    await makeDestination(db, tripId, 'Paris', paris);
    const kids = await makeList(db, f.familyId, 'Kids', [f.ava]);
    await link(db, tripId, kids);

    await migration.up({ db });

    expect((await destinationsOf(db, tripId)).map((d: any) => [d.name, d.position, d.color])).toEqual([
      ['Paris', 0, 'blue'],
      ['Kids', 1, 'green'],
    ]);
    expect(await nameOf(db, kids)).toBe('Spring Break · Kids');
    expect(await nameOf(db, paris)).toBe('Spring Break · Paris');
  });

  it('gives a linked list its own trip when one of its members is already at another destination', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Spring Break');
    const paris = await makeList(db, f.familyId, 'Paris list', [f.dad]);
    await makeDestination(db, tripId, 'Paris', paris);
    const again = await makeList(db, f.familyId, 'Dad again', [f.dad, f.ava]);
    await link(db, tripId, again);

    await migration.up({ db });

    const place = await placeOf(db, again);
    expect(place.tripId).not.toBe(tripId);
    expect(place).toMatchObject({ tripName: 'Dad again', destinationName: 'Dad again', startDate: null, endDate: null, status: 'planning' });
    expect(await destinationsOf(db, tripId)).toHaveLength(1);
  });

  it('wraps an unlinked list in a dateless shell trip', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const listId = await makeList(db, f.familyId, 'Beach', [f.dad]);

    await migration.up({ db });

    const place = await placeOf(db, listId);
    expect(place).toMatchObject({
      tripName: 'Beach', destinationName: 'Beach', startDate: null, endDate: null, status: 'planning',
      familyId: f.familyId, position: 0, color: 'blue',
    });
    expect(await linked(db, place.tripId, listId)).toBe(true);
    expect(await membersOf(db, listId)).toEqual([f.dad]);
    expect(await nameOf(db, listId)).toBe('Beach');
  });

  it('allows lists with no members', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const listId = await makeList(db, f.familyId, 'Empty', []);

    await migration.up({ db });

    expect((await placeOf(db, listId)).tripName).toBe('Empty');
    expect(await membersOf(db, listId)).toEqual([]);
  });

  it('gives a trip without destinations a new list with every live family member', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Ski');

    await migration.up({ db });

    const destinations = await destinationsOf(db, tripId);
    expect(destinations.map((d: any) => d.name)).toEqual(['Ski']);
    expect(await nameOf(db, destinations[0].listId)).toBe('Ski');
    expect(await membersOf(db, destinations[0].listId)).toEqual([f.dad, f.mom, f.ava].sort());
  });

  it('leaves deleted lists and deleted trips alone', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const deletedList = await makeList(db, f.familyId, 'Old', [f.dad], true);
    const deletedTrip = await makeTrip(db, f.familyId, 'Gone trip', true);

    await migration.up({ db });

    expect(await placeOf(db, deletedList)).toBeUndefined();
    expect(await destinationsOf(db, deletedTrip)).toEqual([]);
  });

  it('renames existing destination lists to their labels', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Cabo');
    const mexico = await makeList(db, f.familyId, 'Mexico', [f.dad]);
    const lucas = await makeList(db, f.familyId, 'Cabo – San Lucas', [f.ava]);
    await makeDestination(db, tripId, 'Cabo', mexico, 0, 'blue');
    await makeDestination(db, tripId, 'San Lucas', lucas, 1, 'green');

    await migration.up({ db });

    expect(await nameOf(db, mexico)).toBe('Cabo');
    expect(await nameOf(db, lucas)).toBe('Cabo · San Lucas');
  });

  it('does nothing more when run twice', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    await makeList(db, f.familyId, 'Beach', [f.dad]);

    await migration.up({ db });
    const trips = (await db.get(`SELECT COUNT(*) AS n FROM trips`)).n;
    await migration.up({ db });

    expect((await db.get(`SELECT COUNT(*) AS n FROM trips`)).n).toBe(trips);
  });

  it('rolls back everything when a step fails', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const listId = await makeList(db, f.familyId, 'Beach', [f.dad]);
    await makeTrip(db, f.familyId, 'Ski');
    const realRun = db.run.bind(db);
    let calls = 0;
    (db as any).run = (sql: string, ...args: unknown[]) => {
      if (typeof sql === 'string' && sql.startsWith('INSERT INTO packing_lists') && ++calls === 1) {
        return Promise.reject(new Error('boom'));
      }
      return (realRun as any)(sql, ...args);
    };
    try {
      await expect(migration.up({ db })).rejects.toThrow('boom');
    } finally {
      (db as any).run = realRun;
    }

    expect(await placeOf(db, listId)).toBeUndefined();
    expect((await db.get(`SELECT COUNT(*) AS n FROM trips`)).n).toBe(1);
  });

  it('down removes what up created and keeps the original lists and links', async () => {
    const db = await getDb();
    const f = await seedFamily(db);
    const tripId = await makeTrip(db, f.familyId, 'Spring Break');
    const linkedList = await makeList(db, f.familyId, 'Spring list', [f.dad]);
    await link(db, tripId, linkedList);
    const loose = await makeList(db, f.familyId, 'Beach', [f.mom]);
    const emptyTrip = await makeTrip(db, f.familyId, 'Ski');

    await migration.up({ db });
    const created = await db.all(`SELECT kind, id FROM migration_trip_shells`);
    expect(created.map((r: any) => r.kind).sort()).toEqual(['destination', 'destination', 'destination', 'link', 'link', 'list', 'trip']);
    const skiList = (await destinationsOf(db, emptyTrip))[0].listId;

    await migration.down({ db });

    expect(await destinationsOf(db, tripId)).toEqual([]);
    expect(await linked(db, tripId, linkedList)).toBe(true);
    expect(await placeOf(db, loose)).toBeUndefined();
    expect((await db.get(`SELECT COUNT(*) AS n FROM trips WHERE name = 'Beach'`)).n).toBe(0);
    expect((await db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [loose])).deleted_at).toBeNull();
    expect(await db.get(`SELECT id FROM packing_lists WHERE id = ?`, [skiList])).toBeUndefined();
    expect(await db.get(`SELECT id FROM trips WHERE id = ?`, [emptyTrip])).toBeTruthy();
    expect(await db.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_trip_shells'`)).toBeUndefined();
  });
});
