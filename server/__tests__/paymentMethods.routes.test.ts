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
