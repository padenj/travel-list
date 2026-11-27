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
  const del = (path: string) => request(app).delete(`/api/trips/${tripId}${path}`).set('Authorization', auth);
  const get = (path: string) => request(app).get(`/api/trips/${tripId}${path}`).set('Authorization', auth);

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

  describe('stay booking', () => {
    it('creates the stay with its booking in one request', async () => {
      const res = await post('/elements', {
        elementType: 'hotel', name: 'Casa Azul',
        typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04', amenities: ['pool'] },
        booking: {
          bookingSite: 'expedia', siteItineraryNumber: '7301', confirmationNumber: 'H-1',
          advertisedPriceCash: 612.4, advertisedRateCash: 189, dueAtBookingCash: 430, dueLaterCash: 182.4,
          refundability: 'free', cancelBy: '2026-12-30', coupons: [{ code: 'SAVE10', savingsCash: 10 }],
        },
      });
      expect(res.status).toBe(201);
      expect(res.body.hotelDetails.amenities).toEqual(['pool']);
      expect(res.body.rooms).toEqual([]);
      const booking = (await get(`/bookings/${res.body.bookingId}`)).body;
      expect(booking).toMatchObject({
        elementIds: [res.body.id], travelerIds: [], bookingSite: 'expedia', siteItineraryNumber: '7301',
        advertisedRateCash: 189, dueAtBookingCash: 430, dueLaterCash: 182.4, refundability: 'free',
        coupons: [{ code: 'SAVE10' }],
      });
      expect(booking).not.toHaveProperty('room');
    });

    it('creates an empty booking when none is sent', async () => {
      const res = await addStay();
      expect(res.status).toBe(201);
      expect(res.body.bookingId).toBeTruthy();
    });

    it('rejects invalid booking fields and property amenities on create', async () => {
      const base = { elementType: 'hotel', name: 'Casa', typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04' } };
      expect((await post('/elements', { ...base, booking: { dueLaterCash: -5 } })).status).toBe(400);
      expect((await post('/elements', { ...base, booking: { refundability: 'maybe' } })).status).toBe(400);
      expect((await post('/elements', { ...base, booking: { coupons: [{ code: '' }] } })).status).toBe(400);
      expect((await post('/elements', { ...base, typeSpecificData: { ...base.typeSpecificData, amenities: ['microwave'] } })).status).toBe(400);
    });

    it('PUT updates stay and booking together', async () => {
      const stay = (await addStay()).body;
      const res = await put(`/elements/${stay.id}`, {
        name: 'Casa Roja', typeSpecificData: { amenities: ['gym'] },
        booking: { confirmationNumber: 'H-9', dueLaterCash: 50, coupons: [{ code: 'B' }] },
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Casa Roja', bookingId: stay.bookingId });
      expect(res.body.hotelDetails.amenities).toEqual(['gym']);
      expect((await get(`/bookings/${stay.bookingId}`)).body).toMatchObject({ confirmationNumber: 'H-9', dueLaterCash: 50, coupons: [{ code: 'B' }] });
      expect((await put(`/elements/${stay.id}`, { booking: { cancelBy: 'soon' } })).status).toBe(400);
    });

    it('allows only one booking per stay', async () => {
      const stay = (await addStay()).body;
      const res = await post('/bookings', { elementIds: [stay.id], travelerIds: [] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('This stay already has a booking');
    });

    it('rejects travelers on a stay booking', async () => {
      const stay = (await addStay()).body;
      expect((await patch(`/bookings/${stay.bookingId}`, { travelerIds: [dadP] })).status).toBe(400);
    });

    it('rejects mixing a stay with flights, or two stays', async () => {
      const stayId = (await addStay()).body.id;
      const stay2 = (await addStay()).body.id;
      const flightId = await addFlight();
      expect((await post('/bookings', { elementIds: [stayId, flightId], travelerIds: [dadP] })).status).toBe(400);
      expect((await post('/bookings', { elementIds: [stayId, stay2], travelerIds: [] })).status).toBe(400);
    });

    it('PATCH on a stay booking accepts the new fields; adding a flight is rejected', async () => {
      const stay = (await addStay()).body;
      const flightId = await addFlight();
      const patched = await patch(`/bookings/${stay.bookingId}`, { dueAtBookingPoints: 9000, dueLaterNotes: 'resort fee' });
      expect(patched.status).toBe(200);
      expect(patched.body).toMatchObject({ dueAtBookingPoints: 9000, dueLaterNotes: 'resort fee' });
      expect((await patch(`/bookings/${stay.bookingId}`, { dueAtBookingPoints: 1.5 })).status).toBe(400);
      expect((await post(`/bookings/${stay.bookingId}/elements`, { elementId: flightId })).status).toBe(400);
    });

    it('flight bookings still require travelers and accept the generic fields', async () => {
      const flightId = await addFlight();
      expect((await post('/bookings', { elementIds: [flightId], travelerIds: [] })).status).toBe(400);
      const res = await post('/bookings', { elementIds: [flightId], travelerIds: [dadP], refundability: 'nonrefundable' });
      expect(res.status).toBe(201);
      expect(res.body.refundability).toBe('nonrefundable');
    });

    it('PATCH still edits notes on a booking whose flight was deleted', async () => {
      const flightId = await addFlight();
      const id = (await post('/bookings', { elementIds: [flightId], travelerIds: [dadP] })).body.id;
      await del(`/elements/${flightId}`).expect(204);
      expect((await patch(`/bookings/${id}`, { notes: 'still editable' })).status).toBe(200);
    });
  });

  describe('rooms', () => {
    it('adds, updates and deletes rooms on a stay', async () => {
      const stay = (await addStay()).body;
      const created = await post(`/elements/${stay.id}/rooms`, {
        roomType: 'suite', beds: [{ type: 'king', count: 1 }], amenities: ['jetted_tub'], travelerIds: [dadP],
      });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ elementId: stay.id, roomType: 'suite', amenities: ['jetted_tub'], travelerIds: [dadP] });
      const roomId = created.body.id;
      const updated = await put(`/rooms/${roomId}`, { description: 'Ocean view', travelerIds: [dadP, momP] });
      expect(updated.status).toBe(200);
      expect(updated.body.description).toBe('Ocean view');
      const el = (await get(`/elements/${stay.id}`)).body;
      expect(el.rooms).toHaveLength(1);
      expect(el.rooms[0].travelerIds.sort()).toEqual([dadP, momP].sort());
      expect((await del(`/rooms/${roomId}`)).status).toBe(204);
      expect((await get(`/elements/${stay.id}`)).body.rooms).toEqual([]);
    });

    it('validates rooms', async () => {
      const stay = (await addStay()).body;
      expect((await post(`/elements/${stay.id}/rooms`, { roomType: 'castle' })).status).toBe(400);
      expect((await post(`/elements/${stay.id}/rooms`, { amenities: ['pool'] })).status).toBe(400);
      expect((await post(`/elements/${stay.id}/rooms`, { travelerIds: ['nope'] })).status).toBe(404);
    });

    it('rejects rooms on non-hotel elements and unknown ids', async () => {
      const flightId = await addFlight();
      expect((await post(`/elements/${flightId}/rooms`, {})).status).toBe(400);
      expect((await post(`/elements/nope/rooms`, {})).status).toBe(404);
      expect((await put(`/rooms/nope`, {})).status).toBe(404);
      expect((await del(`/rooms/nope`)).status).toBe(404);
    });

    it('returns 409 when a traveler is already in another room of the stay', async () => {
      const stay = (await addStay()).body;
      expect((await post(`/elements/${stay.id}/rooms`, { travelerIds: [dadP] })).status).toBe(201);
      const conflict = await post(`/elements/${stay.id}/rooms`, { travelerIds: [dadP] });
      expect(conflict.status).toBe(409);
      expect(conflict.body.error).toBe('Dad is already in another room of this stay');
      expect((await post(`/elements/${stay.id}/rooms`, { travelerIds: [momP] })).status).toBe(201);
    });
  });
});
