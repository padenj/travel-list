import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import { StayService } from './stayService';
import { BookingRepository } from '../repositories/bookingRepository';

describe('StayService', () => {
  let service: StayService;
  let bookings: BookingRepository;
  let tripId: string;
  const stay = { name: 'Casa', notes: null, typeSpecificData: { checkInDate: '2027-01-01', checkOutDate: '2027-01-04' } };

  beforeEach(async () => {
    const db = await getDb();
    service = new StayService();
    bookings = new BookingRepository();
    const familyId = uuidv4();
    tripId = uuidv4();
    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, 'F', datetime('now'), datetime('now'))`, [familyId]);
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, 'T', '2027-01-01', '2027-01-10', datetime('now'), datetime('now'))`, [tripId, familyId]);
  });

  afterEach(async () => {
    await closeDb();
  });

  it('creates the stay and its booking together', async () => {
    const el = await service.createStay(tripId, {
      ...stay, booking: { bookingSite: 'expedia', siteItineraryNumber: '7301', dueLaterCash: 182.4, coupons: [{ code: 'A' }] },
    });
    expect(el.elementType).toBe('hotel');
    expect(el.bookingId).toBeTruthy();
    const b = await bookings.getBookingById(el.bookingId!);
    expect(b).toMatchObject({ bookingSite: 'expedia', siteItineraryNumber: '7301', dueLaterCash: 182.4, travelerIds: [], elementIds: [el.id] });
    expect(b!.coupons.map(c => c.code)).toEqual(['A']);
  });

  it('creates an empty booking when none is given', async () => {
    const el = await service.createStay(tripId, stay);
    expect(el.bookingId).toBeTruthy();
  });

  it('rolls back the element when the booking insert fails', async () => {
    const db = await getDb();
    const before = (await db.get<{ n: number }>(`SELECT COUNT(*) n FROM trip_elements WHERE trip_id = ?`, [tripId]))!.n;
    await expect(service.createStay(tripId, { ...stay, booking: { coupons: [{ code: null as any }] } })).rejects.toThrow();
    expect(await db.get(`SELECT COUNT(*) n FROM trip_elements WHERE trip_id = ?`, [tripId])).toEqual({ n: before });
  });

  it('updates element fields and booking fields together', async () => {
    const el = await service.createStay(tripId, stay);
    const updated = await service.updateStay(tripId, el.id, {
      name: 'Casa Roja', typeSpecificData: { amenities: ['pool'] }, booking: { confirmationNumber: 'H-1', refundability: 'free' },
    });
    expect(updated.name).toBe('Casa Roja');
    expect(updated.hotelDetails!.amenities).toEqual(['pool']);
    expect(await bookings.getBookingById(el.bookingId!)).toMatchObject({ confirmationNumber: 'H-1', refundability: 'free' });
  });

  it('creates the booking on update when the stay has none', async () => {
    const el = await service.createStay(tripId, stay);
    await bookings.deleteBooking(el.bookingId!);
    const updated = await service.updateStay(tripId, el.id, { booking: { bookingSite: 'direct' } });
    expect(updated.bookingId).toBeTruthy();
    expect(updated.bookingId).not.toBe(el.bookingId);
    expect((await bookings.getBookingById(updated.bookingId!))!.bookingSite).toBe('direct');
  });
});
