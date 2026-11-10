import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import {
  TripDestinationRepository,
  DestinationConflictError,
  DestinationValidationError,
} from './tripDestinationRepository';
import { TripRepository } from './tripRepository';
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
    });

  it('creates a destination with a new list, members, trip link and participants', async () => {
    const dest = await createParis();

    expect(dest.name).toBe('Paris');
    expect(dest.color).toBe('blue');
    expect(dest.position).toBe(0);
    expect(dest.memberIds.sort()).toEqual([seed.dad, seed.mom].sort());

    const list = await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [dest.packingListId]);
    expect(list.name).toBe('Spring Break · Paris');
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
    });
    expect(second.color).toBe('green');
    expect(second.position).toBe(1);
    expect((await repo.listForTrip(seed.tripId)).map(d => d.name)).toEqual(['Paris', "Grandma's"]);
  });

  it('does not reuse the color of an active destination after a delete', async () => {
    const a = await createParis();
    const b = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'B', memberIds: [seed.ava] });
    await repo.softDelete(a.id);
    const c = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'C', memberIds: [seed.leo] });
    expect(a.color).toBe('blue');
    expect(b.color).toBe('green');
    expect(c.color).toBe('blue');
  });

  it('rejects a person who is already in another destination of the trip', async () => {
    const paris = await createParis();
    const attempt = repo.create({
      tripId: seed.tripId,
      familyId: seed.familyId,
      name: "Grandma's",
      memberIds: [seed.ava, seed.dad],
    });
    await expect(attempt).rejects.toBeInstanceOf(DestinationConflictError);
    await attempt.catch((err: DestinationConflictError) => {
      expect(err.memberId).toBe(seed.dad);
      expect(err.destinationId).toBe(paris.id);
    });
  });

  it('rejects members from another family', async () => {
    await expect(
      repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'X', memberIds: ['not-a-user'] })
    ).rejects.toBeInstanceOf(DestinationValidationError);
  });

  it('adopts an existing list and renames it to the label', async () => {
    const listId = await createList(seed.familyId, 'Our big list', [seed.dad]);
    const dest = await repo.create({
      tripId: seed.tripId,
      familyId: seed.familyId,
      name: 'Paris',
      memberIds: [seed.dad, seed.mom],
      packingListId: listId,
    });
    expect(dest.packingListId).toBe(listId);
    const list = await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId]);
    expect(list.name).toBe('Spring Break · Paris');
  });

  it('names the list after the trip alone when the destination has the trip name', async () => {
    const dest = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: ' spring break ', memberIds: [seed.dad] });
    const list = await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [dest.packingListId]);
    expect(list.name).toBe('Spring Break');
  });

  it('allows a destination with no members only when asked', async () => {
    await expect(repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'X', memberIds: [] }))
      .rejects.toThrow('members_required');
    const db = await getDb();
    const id = await repo.insertDestinationTx(db, { tripId: seed.tripId, familyId: seed.familyId, name: 'X', memberIds: [], allowNoMembers: true });
    expect((await repo.getById(id))!.memberIds).toEqual([]);
  });

  it('adopts a list from a one-destination trip and retires that trip', async () => {
    const trips = new TripRepository();
    const shell = await trips.createTrip(seed.familyId, { name: 'Beach' });
    const db = await getDb();
    const shellDestination = await repo.insertDestinationTx(db, { tripId: shell.id, familyId: seed.familyId, name: 'Beach', memberIds: [seed.dad] });
    const listId = (await repo.getById(shellDestination))!.packingListId;

    const adopted = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Beach', memberIds: [seed.dad], packingListId: listId });

    expect(adopted.packingListId).toBe(listId);
    expect(await repo.getById(shellDestination)).toBeNull();
    expect(await trips.getTripById(shell.id)).toBeUndefined();
    const oldLink = await seed.db.get(`SELECT 1 AS x FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [shell.id, listId]);
    expect(oldLink).toBeUndefined();
    expect((await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId])).name).toBe('Spring Break · Beach');
  });

  it('refuses to adopt a list from a trip with several destinations', async () => {
    const trips = new TripRepository();
    const other = await trips.createTrip(seed.familyId, { name: 'Summer' });
    const a = await repo.create({ tripId: other.id, familyId: seed.familyId, name: 'A', memberIds: [seed.dad] });
    await repo.create({ tripId: other.id, familyId: seed.familyId, name: 'B', memberIds: [seed.mom] });
    await expect(
      repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'A', memberIds: [seed.dad], packingListId: a.packingListId })
    ).rejects.toThrow('list_already_destination');
  });

  it('syncListNamesTx rewrites only the names that changed', async () => {
    const paris = await createParis();
    const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.ava] });
    await seed.db.run(`UPDATE trips SET name = 'Easter' WHERE id = ?`, [seed.tripId]);
    await seed.db.run(`UPDATE packing_lists SET name = 'Easter · Rome' WHERE id = ?`, [rome.packingListId]);
    const db = await getDb();
    const changed = await repo.syncListNamesTx(db, seed.tripId);
    expect(changed).toEqual([paris.packingListId]);
    expect((await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [paris.packingListId])).name).toBe('Easter · Paris');
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
      color: 'blue',
      tripStartDate: '2027-03-01',
      tripEndDate: '2027-03-08',
    });
  });

  it('soft-deletes a destination', async () => {
    const paris = await createParis();
    await repo.softDelete(paris.id);
    expect(await repo.getById(paris.id)).toBeNull();
    expect(await repo.findByPackingListId(paris.packingListId)).toBeNull();
  });

  it('drops destinations and their lists when the trip is deleted', async () => {
    const paris = await createParis();
    await new TripRepository().deleteTrip(seed.tripId);
    expect(await repo.listForTrip(seed.tripId)).toEqual([]);
    const row = await seed.db.get(`SELECT deleted_at FROM trip_destinations WHERE id = ?`, [paris.id]);
    expect(row.deleted_at).not.toBeNull();
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [paris.packingListId]);
    expect(list.deleted_at).not.toBeNull();
  });
});
