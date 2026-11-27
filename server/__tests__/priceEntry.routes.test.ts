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
});
