import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { seedFamilyTrip as SeedFamilyTrip } from '../test-utils/destinationFixtures';

describe('lodging routes', () => {
  let app: express.Application;
  let seed: Awaited<ReturnType<typeof SeedFamilyTrip>>;
  let auth: string;
  let tripId: string;
  let dadP: string;
  let momP: string;
  let closeDb: () => Promise<void>;

  beforeEach(async () => {
    // The trip repositories cache their database handle at construction, so each test needs a fresh module graph.
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
    dadP = (await request(app).post(`/api/trips/${tripId}/participants`).set('Authorization', auth).send({ displayName: 'Dad' })).body.id;
    momP = (await request(app).post(`/api/trips/${tripId}/participants`).set('Authorization', auth).send({ displayName: 'Mom' })).body.id;
  });

  afterEach(async () => {
    await closeDb();
  });

  const post = (path: string, body: unknown) => request(app).post(`/api/trips/${tripId}${path}`).set('Authorization', auth).send(body as object);
  const patch = (path: string, body: unknown) => request(app).patch(`/api/trips/${tripId}${path}`).set('Authorization', auth).send(body as object);
  const put = (path: string, body: unknown) => request(app).put(`/api/trips/${tripId}${path}`).set('Authorization', auth).send(body as object);

  async function addDestination(name: string, memberIds: string[]) {
    const res = await post('/destinations', { name, memberIds });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }
  async function addStay(extra: Record<string, unknown> = {}) {
    return post('/elements', {
      elementType: 'hotel', name: 'Casa Azul',
      typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04', ...extra },
    });
  }
  async function addFlight(): Promise<string> {
    const res = await post('/elements', {
      elementType: 'flight', name: 'Flight',
      typeSpecificData: { legs: [{ departureAirport: 'SEA', arrivalAirport: 'SJD', departureDatetime: '2027-01-01T08:00:00Z', arrivalDatetime: '2027-01-01T12:00:00Z' }] },
    });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  describe('stay elements', () => {
    it('creates a stay', async () => {
      const res = await addStay({ checkInTime: '15:00' });
      expect(res.status).toBe(201);
      expect(res.body.hotelDetails).toMatchObject({ checkInDate: '2027-01-01', checkInTime: '15:00' });
    });
    it('rejects a stay without a name', async () => {
      const res = await post('/elements', { elementType: 'hotel', name: ' ', typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-02' } });
      expect(res.status).toBe(400);
    });
    it('rejects check-out not after check-in', async () => {
      expect((await addStay({ checkOutDate: '2027-01-01' })).status).toBe(400);
    });
    it('rejects a destination from another trip or deleted', async () => {
      expect((await addStay({ destinationId: 'nope' })).status).toBe(404);
    });
    it('accepts a live destination of the trip', async () => {
      const d1 = await addDestination('Cabo', [seed.dad]);
      const res = await addStay({ destinationId: d1 });
      expect(res.status).toBe(201);
      expect(res.body.hotelDetails.destinationName).toBe('Cabo');
    });
    it('PUT applies a partial update and validates merged dates', async () => {
      const id = (await addStay()).body.id;
      expect((await put(`/elements/${id}`, { typeSpecificData: { checkOutTime: '11:00' } })).status).toBe(200);
      expect((await put(`/elements/${id}`, { typeSpecificData: { checkOutDate: '2026-12-31' } })).status).toBe(400);
      expect((await put(`/elements/${id}`, { typeSpecificData: { destinationId: 'nope' } })).status).toBe(404);
      const renamed = await put(`/elements/${id}`, { name: 'Casa Roja', notes: 'n' });
      expect(renamed.status).toBe(200);
      expect(renamed.body).toMatchObject({ name: 'Casa Roja', notes: 'n' });
    });
    it('clears the stay destination when the destination is deleted', async () => {
      const d1 = await addDestination('Cabo', [seed.dad]);
      await addDestination('La Paz', [seed.mom]);
      const id = (await addStay({ destinationId: d1 })).body.id;
      const del = await request(app).delete(`/api/trips/${tripId}/destinations/${d1}`).set('Authorization', auth).send({ deleteList: true });
      expect(del.status).toBe(204);
      const el = await request(app).get(`/api/trips/${tripId}/elements/${id}`).set('Authorization', auth);
      expect(el.body.hotelDetails.destinationId).toBeNull();
    });
  });

  describe('room bookings', () => {
    it('creates a room booking without travelers', async () => {
      const stayId = (await addStay()).body.id;
      const res = await post('/bookings', {
        elementIds: [stayId], travelerIds: [], bookingSite: 'Expedia', siteItineraryNumber: '7300',
        advertisedPriceCash: 900, advertisedIncludesTaxes: true,
        room: { roomType: 'suite', beds: [{ type: 'king', count: 1 }] }, coupons: [{ code: 'SAVE10', savingsCash: 10 }],
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ bookingSite: 'Expedia', room: { roomType: 'suite' }, coupons: [{ code: 'SAVE10' }] });
      const list = await request(app).get(`/api/trips/${tripId}/bookings`).set('Authorization', auth);
      expect(list.body[0]).toMatchObject({ bookingSite: 'Expedia', advertisedIncludesTaxes: true, room: { roomType: 'suite' } });
    });
    it('still requires travelers for flight bookings', async () => {
      const flightId = await addFlight();
      expect((await post('/bookings', { elementIds: [flightId], travelerIds: [] })).status).toBe(400);
      expect((await post('/bookings', { elementIds: [flightId], travelerIds: [dadP] })).status).toBe(201);
    });
    it('rejects mixing a stay with flights, or two stays', async () => {
      const stayId = (await addStay()).body.id;
      const stay2 = (await addStay()).body.id;
      const flightId = await addFlight();
      expect((await post('/bookings', { elementIds: [stayId, flightId], travelerIds: [dadP] })).status).toBe(400);
      expect((await post('/bookings', { elementIds: [stayId, stay2], travelerIds: [] })).status).toBe(400);
    });
    it('rejects room or coupons on a flight booking', async () => {
      const flightId = await addFlight();
      expect((await post('/bookings', { elementIds: [flightId], travelerIds: [dadP], room: { roomType: 'suite' } })).status).toBe(400);
      expect((await post('/bookings', { elementIds: [flightId], travelerIds: [dadP], coupons: [] })).status).toBe(400);
    });
    it('rejects invalid room and coupons', async () => {
      const stayId = (await addStay()).body.id;
      expect((await post('/bookings', { elementIds: [stayId], travelerIds: [], room: { roomType: 'castle' } })).status).toBe(400);
      expect((await post('/bookings', { elementIds: [stayId], travelerIds: [], coupons: [{ code: '' }] })).status).toBe(400);
    });
    it('PATCH updates room and coupons, and adding a flight to a room booking is rejected', async () => {
      const stayId = (await addStay()).body.id;
      const flightId = await addFlight();
      const id = (await post('/bookings', { elementIds: [stayId], travelerIds: [] })).body.id;
      const patched = await patch(`/bookings/${id}`, { room: { amenities: ['pool'] }, coupons: [{ code: 'X' }], travelerIds: [] });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ room: { amenities: ['pool'] }, coupons: [{ code: 'X' }] });
      expect((await patch(`/bookings/${id}`, { room: { roomType: 'castle' } })).status).toBe(400);
      expect((await post(`/bookings/${id}/elements`, { elementId: flightId })).status).toBe(400);
    });
    it('PATCH rejects room details and empty travelers on a flight booking', async () => {
      const flightId = await addFlight();
      const id = (await post('/bookings', { elementIds: [flightId], travelerIds: [dadP] })).body.id;
      expect((await patch(`/bookings/${id}`, { room: { roomType: 'suite' } })).status).toBe(400);
      expect((await patch(`/bookings/${id}`, { travelerIds: [] })).status).toBe(400);
    });
    it('PATCH still edits notes on a booking whose flight was deleted', async () => {
      const flightId = await addFlight();
      const id = (await post('/bookings', { elementIds: [flightId], travelerIds: [dadP] })).body.id;
      await request(app).delete(`/api/trips/${tripId}/elements/${flightId}`).set('Authorization', auth).expect(204);
      expect((await patch(`/bookings/${id}`, { notes: 'still editable' })).status).toBe(200);
    });
    it('applies the traveler conflict rule (409) to rooms', async () => {
      const stayId = (await addStay()).body.id;
      expect((await post('/bookings', { elementIds: [stayId], travelerIds: [dadP] })).status).toBe(201);
      const conflict = await post('/bookings', { elementIds: [stayId], travelerIds: [dadP] });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error).toMatch(/already on/);
      expect((await post('/bookings', { elementIds: [stayId], travelerIds: [momP] })).status).toBe(201);
    });
  });
});
