import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { closeDb } from '../db';
import { TripRepository } from '../repositories/tripRepository';
import { generateToken } from '../auth';
import { seedFamilyTrip, createList, createMasterItem, addToList, listRows } from '../test-utils/destinationFixtures';
import * as sse from '../sse';

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

  it('moves a person and their items when creating a destination with moveFrom', async () => {
    const paris = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad, seed.ava] });
    const teddy = await addToList(paris.body.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));

    const rome = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.ava], moveFrom: true });

    expect(rome.status).toBe(201);
    expect(rome.body.memberIds).toEqual([seed.ava]);
    expect((await listRows(rome.body.packingListId)).map(r => r.id)).toEqual([teddy]);
    const parisNow = await request(app).get(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth);
    expect(parisNow.body.find((d: any) => d.id === paris.body.id).memberIds).toEqual([seed.dad]);
  });

  it('moves a person and their items when updating a destination with moveFrom', async () => {
    const { res } = await splitSource();
    const [paris, grandma] = res.body.destinations;
    const passport = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.mom] }));

    const put = await request(app).put(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ memberIds: [seed.ava, seed.leo, seed.mom], moveFrom: true });

    expect(put.status).toBe(200);
    expect(put.body.memberIds.sort()).toEqual([seed.ava, seed.leo, seed.mom].sort());
    expect((await listRows(grandma.packingListId)).map(r => r.id)).toEqual([passport]);
  });

  it('returns 400 would_empty_destination when moveFrom would leave a destination with nobody', async () => {
    const { res } = await splitSource();
    const grandma = res.body.destinations[1];
    const put = await request(app).put(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ memberIds: [seed.ava, seed.leo, seed.dad, seed.mom], moveFrom: true });
    expect(put.status).toBe(400);
    expect(put.body.error).toBe('would_empty_destination');
  });

  it("moves whole-family items to the new destination when sharedItemsTo is 'new'", async () => {
    const paris = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad] });
    const carSeat = await addToList(paris.body.packingListId, await createMasterItem(seed.familyId, 'Car seat', { wholeFamily: true }));
    const rome = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.mom], sharedItemsTo: 'new' });
    expect(rome.status).toBe(201);
    expect((await listRows(rome.body.packingListId)).map(r => r.id)).toEqual([carSeat]);
  });

  it('rejects an unknown sharedItemsTo value', async () => {
    const res = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.mom], sharedItemsTo: 'elsewhere' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_shared_items_to');
  });

  it('names destination lists with the label', async () => {
    const home = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Spring Break', memberIds: [seed.dad] });
    const rome = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.mom] });
    const name = async (id: string) => (await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [id])).name;
    expect(await name(home.body.packingListId)).toBe('Spring Break');
    expect(await name(rome.body.packingListId)).toBe('Spring Break · Rome');
  });

  it('renames the trip with its only destination when their names matched', async () => {
    const home = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Spring Break', memberIds: [seed.dad] });
    const put = await request(app).put(`/api/trips/${seed.tripId}/destinations/${home.body.id}`).set('Authorization', auth)
      .send({ name: 'Easter' });
    expect(put.status).toBe(200);
    expect((await new TripRepository().getTripById(seed.tripId))!.name).toBe('Easter');
  });

  it('refuses to delete the last destination of a trip', async () => {
    const paris = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Paris', memberIds: [seed.dad] });
    const res = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${paris.body.id}`).set('Authorization', auth)
      .send({ deleteList: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('last_destination');
  });

  describe('adopting the list of another trip', () => {
    const otherTrip = async (dates: { startDate?: string; endDate?: string } = {}) => {
      const trip = await new TripRepository().createTrip(seed.familyId, { name: 'Beach', ...dates });
      const dest = await request(app).post(`/api/trips/${trip.id}/destinations`).set('Authorization', auth)
        .send({ name: 'Beach', memberIds: [seed.dad] });
      expect(dest.status).toBe(201);
      return { tripId: trip.id, destinationId: dest.body.id as string, listId: dest.body.packingListId as string };
    };
    const adopt = (listId: string) =>
      request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
        .send({ name: 'Beach', memberIds: [seed.dad], packingListId: listId });
    const isLive = async (table: string, id: string) =>
      !(await seed.db.get(`SELECT deleted_at FROM ${table} WHERE id = ?`, [id])).deleted_at;

    it('refuses a list whose trip has dates and leaves that trip alone', async () => {
      const other = await otherTrip({ startDate: '2027-06-01', endDate: '2027-06-05' });
      const res = await adopt(other.listId);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('list_in_other_trip');
      expect(await isLive('trips', other.tripId)).toBe(true);
      expect(await isLive('trip_destinations', other.destinationId)).toBe(true);
      const link = await seed.db.get(`SELECT 1 AS x FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [other.tripId, other.listId]);
      expect(link).toBeTruthy();
    });

    it('refuses a list whose dateless trip has a booking', async () => {
      const other = await otherTrip();
      await seed.db.run(`INSERT INTO bookings (id, trip_id) VALUES (?, ?)`, [uuidv4(), other.tripId]);
      const res = await adopt(other.listId);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('list_in_other_trip');
      expect(await isLive('trips', other.tripId)).toBe(true);
    });

    it('refuses a list whose dateless trip has a trip element', async () => {
      const other = await otherTrip();
      await seed.db.run(`INSERT INTO trip_elements (id, trip_id, element_type, name) VALUES (?, ?, 'hotel', 'Inn')`, [uuidv4(), other.tripId]);
      const res = await adopt(other.listId);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('list_in_other_trip');
      expect(await isLive('trips', other.tripId)).toBe(true);
    });

    it('adopts a list from a dateless shell trip and retires the shell', async () => {
      const other = await otherTrip();
      const res = await adopt(other.listId);
      expect(res.status).toBe(201);
      expect(res.body.packingListId).toBe(other.listId);
      expect(await isLive('trips', other.tripId)).toBe(false);
      expect(await isLive('trip_destinations', other.destinationId)).toBe(false);
    });
  });

  it('puts a kept list with items into a trip of its own', async () => {
    const { res } = await splitSource();
    const grandma = res.body.destinations[1];
    await addToList(grandma.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));
    const deleted = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
      .send({ moveSharedItemsTo: res.body.destinations[0].id });
    expect(deleted.status).toBe(204);
    const lists = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const kept = lists.body.lists.find((l: any) => l.id === grandma.packingListId);
    expect(kept.trip_destination).toMatchObject({ tripName: "Grandma's", destinationName: "Grandma's", destinationCount: 1 });
    expect(kept.name).toBe("Grandma's");
  });

  describe('SSE notifications', () => {
    const notifiedLists = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls
        .map(([event]: any[]) => event)
        .filter((event: any) => event?.type === 'packing_list_changed')
        .map((event: any) => event.listId as string);

    it('notifies the new list and the trip\'s existing lists on create', async () => {
      const paris = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
        .send({ name: 'Paris', memberIds: [seed.dad] });
      const spy = vi.spyOn(sse, 'broadcastEvent').mockImplementation(() => undefined as never);
      try {
        const rome = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
          .send({ name: 'Rome', memberIds: [seed.mom] });
        expect(rome.status).toBe(201);
        expect(notifiedLists(spy).sort()).toEqual([paris.body.packingListId, rome.body.packingListId].sort());
      } finally {
        spy.mockRestore();
      }
    });

    it('does not notify when create fails', async () => {
      await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
        .send({ name: 'Paris', memberIds: [seed.dad] });
      const spy = vi.spyOn(sse, 'broadcastEvent').mockImplementation(() => undefined as never);
      try {
        const res = await request(app).post(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth)
          .send({ name: 'Rome', memberIds: [seed.dad] });
        expect(res.status).toBe(409);
        expect(notifiedLists(spy)).toEqual([]);
      } finally {
        spy.mockRestore();
      }
    });

    it('notifies the destination list on update', async () => {
      const { res } = await splitSource();
      const paris = res.body.destinations[0];
      const spy = vi.spyOn(sse, 'broadcastEvent').mockImplementation(() => undefined as never);
      try {
        const updated = await request(app).put(`/api/trips/${seed.tripId}/destinations/${paris.id}`).set('Authorization', auth)
          .send({ name: 'Lyon' });
        expect(updated.status).toBe(200);
        expect(notifiedLists(spy)).toEqual([paris.packingListId]);
      } finally {
        spy.mockRestore();
      }
    });

    it('notifies the deleted list and the remaining lists once on delete, even after moving items', async () => {
      const { res } = await splitSource();
      const [paris, grandma] = res.body.destinations;
      await addToList(grandma.packingListId, await createMasterItem(seed.familyId, 'Car seat', { wholeFamily: true }));
      const spy = vi.spyOn(sse, 'broadcastEvent').mockImplementation(() => undefined as never);
      try {
        const deleted = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth)
          .send({ moveSharedItemsTo: paris.id });
        expect(deleted.status).toBe(204);
        expect(notifiedLists(spy).sort()).toEqual([paris.packingListId, grandma.packingListId].sort());
      } finally {
        spy.mockRestore();
      }
    });

    it('notifies on delete of an empty destination', async () => {
      const { res } = await splitSource();
      const [paris, grandma] = res.body.destinations;
      const spy = vi.spyOn(sse, 'broadcastEvent').mockImplementation(() => undefined as never);
      try {
        const deleted = await request(app).delete(`/api/trips/${seed.tripId}/destinations/${grandma.id}`).set('Authorization', auth).send({});
        expect(deleted.status).toBe(204);
        expect(notifiedLists(spy).sort()).toEqual([paris.packingListId, grandma.packingListId].sort());
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('gives a new list its own dateless trip', async () => {
    const created = await request(app).post(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth)
      .send({ name: 'Camping', memberIds: [seed.dad, seed.ava] });
    expect(created.status).toBe(200);
    const lists = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const camping = lists.body.lists.find((l: any) => l.id === created.body.list.id);
    expect(camping.trip_destination).toMatchObject({ tripName: 'Camping', destinationName: 'Camping', position: 0, destinationCount: 1 });
    const trip = await new TripRepository().getTripById(camping.trip_destination.tripId);
    expect(trip).toMatchObject({ startDate: null, endDate: null, status: 'planning' });
    const destinations = await request(app).get(`/api/trips/${trip!.id}/destinations`).set('Authorization', auth);
    expect(destinations.body[0].memberIds.sort()).toEqual([seed.dad, seed.ava].sort());
  });

  it('rejects a foreign memberId on create without leaving a half-created list', async () => {
    const otherFamilyId = uuidv4();
    await seed.db.run(`INSERT INTO families (id, name) VALUES (?, ?)`, [otherFamilyId, 'Other Family']);
    const strangerId = uuidv4();
    await seed.db.run(
      `INSERT INTO users (id, name, username, role, familyId) VALUES (?, ?, ?, 'FamilyAdmin', ?)`,
      [strangerId, 'Stranger', `stranger-${strangerId}`, otherFamilyId]
    );
    const before = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const beforeCount = before.body.lists.length;

    const created = await request(app).post(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth)
      .send({ name: 'Camping', memberIds: [seed.dad, strangerId] });

    expect(created.status).toBe(400);
    const after = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    expect(after.body.lists.length).toBe(beforeCount);
  });

  it("deletes the whole trip when its only destination's list is deleted", async () => {
    const created = await request(app).post(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth)
      .send({ name: 'Camping' });
    const lists = await request(app).get(`/api/families/${seed.familyId}/packing-lists`).set('Authorization', auth);
    const tripId = lists.body.lists.find((l: any) => l.id === created.body.list.id).trip_destination.tripId;

    const del = await request(app).delete(`/api/packing-lists/${created.body.list.id}`).set('Authorization', auth);

    expect(del.status).toBe(200);
    expect(await new TripRepository().getTripById(tripId)).toBeUndefined();
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [created.body.list.id]);
    expect(list.deleted_at).toBeTruthy();
  });

  it('renaming a destination list through the list route renames the destination', async () => {
    const { res } = await splitSource();
    const paris = res.body.destinations[0];
    const put = await request(app).put(`/api/packing-lists/${paris.packingListId}`).set('Authorization', auth)
      .send({ name: 'Lyon' });
    expect(put.status).toBe(200);
    expect(put.body.list.name).toBe('Spring Break · Lyon');
    const destinations = await request(app).get(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth);
    expect(destinations.body[0].name).toBe('Lyon');
  });

  it('rejects a blank name for a destination list', async () => {
    const { res } = await splitSource();
    const put = await request(app).put(`/api/packing-lists/${res.body.destinations[0].packingListId}`).set('Authorization', auth)
      .send({ name: '  ' });
    expect(put.status).toBe(400);
  });

  it('rolls back the rename when memberIds conflict in the same update', async () => {
    const { res } = await splitSource();
    const paris = res.body.destinations[0];
    // Ava is already a member of Grandma's destination in the same trip.
    const put = await request(app).put(`/api/packing-lists/${paris.packingListId}`).set('Authorization', auth)
      .send({ name: 'Lyon', memberIds: [seed.ava] });
    expect(put.status).toBe(409);
    const list = await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [paris.packingListId]);
    expect(list.name).toBe('Spring Break · Paris');
    const destinations = await request(app).get(`/api/trips/${seed.tripId}/destinations`).set('Authorization', auth);
    expect(destinations.body.find((d: any) => d.packingListId === paris.packingListId).name).toBe('Paris');
  });

  it('still deletes an ordinary list', async () => {
    const listId = await createList(seed.familyId, 'Plain', [seed.dad]);
    const del = await request(app).delete(`/api/packing-lists/${listId}`).set('Authorization', auth);
    expect(del.status).toBe(200);
    const row = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [listId]);
    expect(row.deleted_at).toBeTruthy();
  });

  describe('splitting into a trip created without memberIds (legacy clients)', () => {
    // Old clients call POST /trips with no memberIds, then split a separate list into the fresh trip.
    // That create auto-fills one placeholder destination with every family member on an empty list.
    const createLegacyTrip = async () => {
      const created = await request(app).post('/api/trips').set('Authorization', auth)
        .send({ name: 'Road Trip' });
      expect(created.status).toBe(201);
      return created.body.id as string;
    };

    it('retires the empty placeholder destination so the split succeeds', async () => {
      const tripId = await createLegacyTrip();
      const source = await createList(seed.familyId, 'Spring list', [seed.dad, seed.mom, seed.ava, seed.leo]);

      const before = await request(app).get(`/api/trips/${tripId}/destinations`).set('Authorization', auth);
      expect(before.body).toHaveLength(1);
      const placeholder = before.body[0];

      const res = await request(app).post(`/api/trips/${tripId}/split`).set('Authorization', auth).send({
        sourceListId: source,
        destinations: [
          { name: 'Paris', memberIds: [seed.dad, seed.mom] },
          { name: "Grandma's", memberIds: [seed.ava, seed.leo] },
        ],
        sharedItemsDestinationIndex: 0,
      });

      expect(res.status).toBe(201);
      expect(res.body.destinations.map((d: any) => d.name)).toEqual(['Paris', "Grandma's"]);

      const after = await request(app).get(`/api/trips/${tripId}/destinations`).set('Authorization', auth);
      expect(after.body.map((d: any) => d.id)).toEqual(res.body.destinations.map((d: any) => d.id));

      const placeholderDestination = await seed.db.get(`SELECT deleted_at FROM trip_destinations WHERE id = ?`, [placeholder.id]);
      expect(placeholderDestination.deleted_at).toBeTruthy();
      const placeholderList = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [placeholder.packingListId]);
      expect(placeholderList.deleted_at).toBeTruthy();
      const link = await seed.db.get(
        `SELECT COUNT(*) AS n FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`,
        [tripId, placeholder.packingListId]
      );
      expect(link.n).toBe(0);
    });

    it('still returns 409 when the single destination list already has items', async () => {
      const tripId = await createLegacyTrip();
      const before = await request(app).get(`/api/trips/${tripId}/destinations`).set('Authorization', auth);
      const placeholder = before.body[0];
      await addToList(placeholder.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));
      const source = await createList(seed.familyId, 'Spring list', [seed.dad, seed.mom, seed.ava, seed.leo]);

      const res = await request(app).post(`/api/trips/${tripId}/split`).set('Authorization', auth).send({
        sourceListId: source,
        destinations: [
          { name: 'Paris', memberIds: [seed.dad, seed.mom] },
          { name: "Grandma's", memberIds: [seed.ava, seed.leo] },
        ],
        sharedItemsDestinationIndex: 0,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('member_in_other_destination');
      const placeholderDestination = await seed.db.get(`SELECT deleted_at FROM trip_destinations WHERE id = ?`, [placeholder.id]);
      expect(placeholderDestination.deleted_at).toBeNull();
    });

    it('leaves the placeholder intact when the split fails validation after the placeholder check', async () => {
      const tripId = await createLegacyTrip();
      const before = await request(app).get(`/api/trips/${tripId}/destinations`).set('Authorization', auth);
      const placeholder = before.body[0];
      // sourceListId includes a member not covered by either destination, so validation fails after the
      // placeholder would have been retired and the conflict check would have passed.
      const source = await createList(seed.familyId, 'Spring list', [seed.dad, seed.mom, seed.ava, seed.leo]);

      const res = await request(app).post(`/api/trips/${tripId}/split`).set('Authorization', auth).send({
        sourceListId: source,
        destinations: [
          { name: 'Paris', memberIds: [seed.dad, seed.mom] },
          { name: "Grandma's", memberIds: [seed.ava] },
        ],
        sharedItemsDestinationIndex: 0,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unassigned_member');

      const placeholderDestination = await seed.db.get(`SELECT deleted_at FROM trip_destinations WHERE id = ?`, [placeholder.id]);
      expect(placeholderDestination.deleted_at).toBeNull();
      const placeholderList = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [placeholder.packingListId]);
      expect(placeholderList.deleted_at).toBeNull();
      const link = await seed.db.get(
        `SELECT COUNT(*) AS n FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`,
        [tripId, placeholder.packingListId]
      );
      expect(link.n).toBe(1);
    });
  });
});
