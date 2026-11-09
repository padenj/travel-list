import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import routes from '../routes';
import { closeDb } from '../db';
import { TripRepository } from '../repositories/tripRepository';
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

  it('moves shared rows to the target on delete and keeps personal rows when the list is kept', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const shared = await addToList(grandma.packingListId, await createMasterItem(seed.familyId, 'Car seat', { wholeFamily: true }));
    const personal = await addToList(grandma.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));

    const deleted = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ moveSharedItemsTo: paris.id });
    expect(deleted.status).toBe(204);
    expect((await listRows(paris.packingListId)).map(r => r.id)).toEqual([shared]);
    expect((await listRows(grandma.packingListId)).map(r => r.id)).toEqual([personal]);
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [grandma.packingListId]);
    expect(list.deleted_at).toBeNull();
  });

  it('returns 400 when moveSharedItemsTo is a destination of another trip', async () => {
    const { res } = await splitSource();
    const grandma = res.body.destinations[1];
    const otherTrip = await new TripRepository().createTrip(seed.familyId, { name: 'Summer', startDate: '2027-07-01', endDate: '2027-07-08' });
    const created = await request(app).post(`/api/trips/${otherTrip.id}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.dad] });
    expect(created.status).toBe(201);
    const deleted = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ moveSharedItemsTo: created.body.id });
    expect(deleted.status).toBe(400);
    expect(deleted.body.error).toBe('invalid_target_destination');
  });

  it('leaves everything untouched when delete fails inside the transaction', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const shared = await addToList(grandma.packingListId, await createMasterItem(seed.familyId, 'Car seat', { wholeFamily: true }));
    const linksBefore = await seed.db.get(`SELECT COUNT(*) AS n FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [seed.tripId, grandma.packingListId]);
    const realRun = seed.db.run.bind(seed.db);
    const spy = vi.spyOn(seed.db, 'run').mockImplementation(((sql: any, ...args: any[]) => {
      if (typeof sql === 'string' && sql.includes('UPDATE trip_destinations SET deleted_at')) throw new Error('boom');
      return (realRun as any)(sql, ...args);
    }) as any);
    try {
      const deleted = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
        .send({ moveSharedItemsTo: paris.id, deleteList: true });
      expect(deleted.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    const dest = await seed.db.get(`SELECT deleted_at FROM trip_destinations WHERE id = ?`, [grandma.id]);
    expect(dest.deleted_at).toBeNull();
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [grandma.packingListId]);
    expect(list.deleted_at).toBeNull();
    const links = await seed.db.get(`SELECT COUNT(*) AS n FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [seed.tripId, grandma.packingListId]);
    expect(links.n).toBe(linksBefore.n);
    expect((await listRows(grandma.packingListId)).map(r => r.id)).toEqual([shared]);
    expect(await listRows(paris.packingListId)).toEqual([]);
  });

  it('forbids another family from moving items or editing members', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const row = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Car seat', { wholeFamily: true }));
    const other = await seedFamilyTrip();
    const otherDad = await other.db.get(`SELECT * FROM users WHERE id = ?`, [other.dad]);
    const otherAuth = `Bearer ${generateToken(otherDad)}`;

    const moved = await request(app).post(`/api/packing-lists/${paris.packingListId}/items/${row}/move`)
      .set('Authorization', otherAuth).send({ toListId: grandma.packingListId });
    expect(moved.status).toBe(403);
    const put = await request(app).put(`/api/packing-lists/${paris.packingListId}`)
      .set('Authorization', otherAuth).send({ memberIds: [seed.dad] });
    expect(put.status).toBe(403);
    expect((await listRows(paris.packingListId)).map(r => r.id)).toEqual([row]);
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

  it('rejects putting a person from another destination on the plain list edit route', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const put = await request(app).put(`/api/packing-lists/${grandma.packingListId}`).set('Authorization', auth)
      .send({ memberIds: [seed.dad] });
    expect(put.status).toBe(409);
    expect(put.body).toMatchObject({ error: 'member_in_other_destination', memberId: seed.dad, destinationId: paris.id });
  });

  it('returns 400 when an ordinary list gets a member from another family', async () => {
    const listId = await createList(seed.familyId, 'Plain', [seed.dad]);
    const other = await seedFamilyTrip();
    const put = await request(app).put(`/api/packing-lists/${listId}`).set('Authorization', auth)
      .send({ memberIds: [seed.dad, other.dad] });
    expect(put.status).toBe(400);
    expect(put.body).toEqual({ error: 'Invalid memberIds for this packing list' });
    const rows = await seed.db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [listId]);
    expect(rows.map((r: any) => r.member_id)).toEqual([seed.dad]);
  });

  it('adds a new member to a destination list and to the trip participants', async () => {
    const created = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad] });
    const q = await seed.db.get(`SELECT id FROM users WHERE id = ?`, [seed.leo]);
    const put = await request(app).put(`/api/packing-lists/${created.body.packingListId}`).set('Authorization', auth)
      .send({ memberIds: [seed.dad, q.id] });
    expect(put.status).toBe(200);
    const row = await seed.db.get(`SELECT id FROM trip_participants WHERE trip_id = ? AND user_id = ?`, [seed.tripId, q.id]);
    expect(row).toBeTruthy();
  });

  it('soft-deletes the destination when its list is deleted via the list route', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const del = await request(app).delete(`/api/packing-lists/${paris.packingListId}`).set('Authorization', auth);
    expect(del.status).toBe(200);

    const listed = await request(app).get(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth);
    expect(listed.body).toHaveLength(1);
    const dest = await seed.db.get(`SELECT deleted_at FROM trip_destinations WHERE id = ?`, [paris.id]);
    expect(dest.deleted_at).toBeTruthy();
    const link = await seed.db.get(`SELECT 1 AS x FROM trip_packing_lists WHERE packing_list_id = ?`, [paris.packingListId]);
    expect(link).toBeFalsy();

    const lists = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const remaining = lists.body.lists.find((l: any) => l.id === grandma.packingListId);
    expect(remaining.trip_destination.destinationCount).toBe(1);
  });

  it('still deletes an ordinary list', async () => {
    const listId = await createList(seed.familyId, 'Plain', [seed.dad]);
    const del = await request(app).delete(`/api/packing-lists/${listId}`).set('Authorization', auth);
    expect(del.status).toBe(200);
    const row = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [listId]);
    expect(row.deleted_at).toBeTruthy();
  });
});
