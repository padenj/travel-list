import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import routes from '../routes';
import { closeDb } from '../db';
import { generateToken } from '../auth';
import { seedFamilyTrip, createMasterItem, addToList, listRows } from '../test-utils/destinationFixtures';

describe('trip routes', () => {
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

  const destinationsOf = async (tripId: string) =>
    (await request(app).get(`/api/trips/${tripId}/destinations`).set('Authorization', auth)).body;
  const listName = async (listId: string) => (await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId])).name;

  it('creates a trip without dates and gives it a first destination with the whole family', async () => {
    const res = await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Beach weekend' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Beach weekend', startDate: null, endDate: null });
    const [destination] = await destinationsOf(res.body.id);
    expect(destination.memberIds.sort()).toEqual([seed.dad, seed.mom, seed.ava, seed.leo].sort());
    expect(await listName(destination.packingListId)).toBe('Beach weekend');
  });

  it('uses the given members for the first destination', async () => {
    const res = await request(app).post('/api/trips').set('Authorization', auth)
      .send({ name: 'Ski', startDate: '2027-01-02', endDate: '2027-01-09', memberIds: [seed.dad, seed.ava] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ startDate: '2027-01-02', endDate: '2027-01-09' });
    const [destination] = await destinationsOf(res.body.id);
    expect(destination.memberIds.sort()).toEqual([seed.dad, seed.ava].sort());
  });

  it('requires a name', async () => {
    const res = await request(app).post('/api/trips').set('Authorization', auth).send({ startDate: '2027-01-02' });
    expect(res.status).toBe(400);
  });

  it('lists dateless trips', async () => {
    await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Someday' });
    const res = await request(app).get('/api/trips').set('Authorization', auth);
    expect(res.body.map((t: any) => t.name)).toEqual(expect.arrayContaining(['Spring Break', 'Someday']));
  });

  it('renaming a trip renames matching destinations and relabels lists', async () => {
    const created = await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Beach', memberIds: [seed.dad] });
    const tripId = created.body.id;
    const rome = await request(app).post(`/api/trips/${tripId}/destinations`).set('Authorization', auth)
      .send({ name: 'Rome', memberIds: [seed.mom] });

    const res = await request(app).put(`/api/trips/${tripId}`).set('Authorization', auth).send({ name: 'Coast' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Coast');
    const destinations = await destinationsOf(tripId);
    expect(destinations.map((d: any) => d.name)).toEqual(['Coast', 'Rome']);
    expect(await listName(destinations[0].packingListId)).toBe('Coast');
    expect(await listName(rome.body.packingListId)).toBe('Coast · Rome');
  });

  it('rejects a blank name on update', async () => {
    const res = await request(app).put(`/api/trips/${seed.tripId}`).set('Authorization', auth).send({ name: '  ' });
    expect(res.status).toBe(400);
  });

  it('deleting a trip deletes its lists', async () => {
    const created = await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Beach', memberIds: [seed.dad] });
    const [destination] = await destinationsOf(created.body.id);
    const res = await request(app).delete(`/api/trips/${created.body.id}`).set('Authorization', auth);
    expect(res.status).toBe(204);
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [destination.packingListId]);
    expect(list.deleted_at).toBeTruthy();
  });

  it('copies a trip with its destinations and items', async () => {
    const created = await request(app).post('/api/trips').set('Authorization', auth).send({ name: 'Beach', memberIds: [seed.dad] });
    const [destination] = await destinationsOf(created.body.id);
    const towel = await createMasterItem(seed.familyId, 'Towel', { memberIds: [seed.dad] });
    await addToList(destination.packingListId, towel);

    const res = await request(app).post(`/api/trips/${created.body.id}/copy`).set('Authorization', auth)
      .send({ name: 'Beach again', includeOneOffs: false });

    expect(res.status).toBe(201);
    expect(res.body.trip).toMatchObject({ name: 'Beach again', startDate: null, endDate: null });
    expect(res.body.destinations.map((d: any) => d.name)).toEqual(['Beach again']);
    expect((await listRows(res.body.destinations[0].packingListId)).map(r => r.item_id)).toEqual([towel]);
  });

  it('requires a name to copy', async () => {
    const res = await request(app).post(`/api/trips/${seed.tripId}/copy`).set('Authorization', auth).send({});
    expect(res.status).toBe(400);
  });
});
