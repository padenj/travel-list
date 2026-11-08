import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb, closeDb } from '../db';
import { BookingRepository, BookingConflictError } from './bookingRepository';
import { TripParticipantRepository } from './tripParticipantRepository';
import { v4 as uuidv4 } from 'uuid';

describe('BookingRepository', () => {
  let repo: BookingRepository;
  let participantRepo: TripParticipantRepository;
  let tripId: string;
  let familyId: string;
  let elementId: string;
  let elementId2: string;
  let participantAId: string;
  let participantBId: string;

  beforeEach(async () => {
    await getDb();
    repo = new BookingRepository();
    participantRepo = new TripParticipantRepository();

    const db = await getDb();
    familyId = uuidv4();
    tripId = uuidv4();
    elementId = uuidv4();
    elementId2 = uuidv4();

    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [tripId, familyId, 'Test Trip', '2026-06-01', '2026-06-10']
    );
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [elementId, tripId, 'flight', 'Departure Flights']
    );
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [elementId2, tripId, 'flight', 'Return Flights']
    );
    participantAId = (await participantRepo.createParticipant(tripId, { displayName: 'A' })).id;
    participantBId = (await participantRepo.createParticipant(tripId, { displayName: 'B' })).id;
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('createBooking', () => {
    it('creates a booking with travelers and linked elements', async () => {
      const booking = await repo.createBooking(tripId, {
        confirmationNumber: 'ABC123',
        advertisedPriceCash: 79,
        elementIds: [elementId, elementId2],
        travelerIds: [participantAId, participantBId],
      });

      expect(booking.id).toBeDefined();
      expect(booking.confirmationNumber).toBe('ABC123');
      expect(booking.advertisedPriceCash).toBe(79);
      expect(booking.elementIds.sort()).toEqual([elementId, elementId2].sort());
      expect(booking.travelerIds.sort()).toEqual([participantAId, participantBId].sort());
      expect(booking.actualTotalCash).toBe(0);
      expect(booking.actualTotalPoints).toBe(0);
      expect(booking.currentConfirmationNumber).toBe('ABC123');
    });
  });

  describe('getBookingsForTrip', () => {
    it('filters by elementId when provided', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await repo.createBooking(tripId, { elementIds: [elementId2], travelerIds: [participantBId] });

      const forElement1 = await repo.getBookingsForTrip(tripId, elementId);
      expect(forElement1).toHaveLength(1);
      expect(forElement1[0].elementIds).toContain(elementId);
    });

    it('returns all bookings for the trip when no elementId given', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await repo.createBooking(tripId, { elementIds: [elementId2], travelerIds: [participantBId] });

      const all = await repo.getBookingsForTrip(tripId);
      expect(all).toHaveLength(2);
    });

    it('returns one booking linked to two elements exactly once', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId, elementId2], travelerIds: [participantAId] });
      const all = await repo.getBookingsForTrip(tripId);
      expect(all).toHaveLength(1);
      expect(all[0].elementIds.sort()).toEqual([elementId, elementId2].sort());
    });
  });

  describe('link/unlink elements and travelers', () => {
    it('links an additional element to an existing booking', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await repo.linkElement(booking.id, elementId2);
      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.elementIds.sort()).toEqual([elementId, elementId2].sort());
    });

    it('unlinks an element from a booking', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId, elementId2], travelerIds: [participantAId] });
      await repo.unlinkElement(booking.id, elementId2);
      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.elementIds).toEqual([elementId]);
    });

    it('adds and removes a traveler from a booking', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await repo.addTraveler(booking.id, participantBId);
      let reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.travelerIds.sort()).toEqual([participantAId, participantBId].sort());

      await repo.removeTraveler(booking.id, participantBId);
      reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.travelerIds).toEqual([participantAId]);
    });
  });

  describe('updateBooking', () => {
    it('updates confirmation number and advertised price', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const updated = await repo.updateBooking(booking.id, { confirmationNumber: 'NEW123', advertisedPriceCash: 69 });
      expect(updated.confirmationNumber).toBe('NEW123');
      expect(updated.advertisedPriceCash).toBe(69);
    });

    it('clears fields set to null', async () => {
      const booking = await repo.createBooking(tripId, { confirmationNumber: 'ABC', notes: 'n', elementIds: [elementId], travelerIds: [participantAId] });
      const updated = await repo.updateBooking(booking.id, { confirmationNumber: null, notes: null });
      expect(updated.confirmationNumber).toBeNull();
      expect(updated.notes).toBeNull();
    });

    it('replaces linked flights and travelers', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const updated = await repo.updateBooking(booking.id, { elementIds: [elementId2], travelerIds: [participantAId, participantBId] });
      expect(updated.elementIds).toEqual([elementId2]);
      expect(updated.travelerIds.sort()).toEqual([participantAId, participantBId].sort());
    });

    it('rejects a replacement that conflicts with another booking and changes nothing', async () => {
      await repo.createBooking(tripId, { confirmationNumber: 'OTHER', elementIds: [elementId2], travelerIds: [participantAId] });
      const booking = await repo.createBooking(tripId, { confirmationNumber: 'MINE', elementIds: [elementId], travelerIds: [participantAId] });
      await expect(
        repo.updateBooking(booking.id, { confirmationNumber: 'CHANGED', elementIds: [elementId, elementId2] })
      ).rejects.toBeInstanceOf(BookingConflictError);
      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.confirmationNumber).toBe('MINE');
      expect(reloaded!.elementIds).toEqual([elementId]);
    });

    it('does not count the booking itself as a conflict', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.updateBooking(booking.id, { elementIds: [elementId], travelerIds: [participantAId] })).resolves.toBeTruthy();
    });

    it('rejects empty replacement lists', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.updateBooking(booking.id, { elementIds: [] })).rejects.toThrow('At least one flight is required');
      await expect(repo.updateBooking(booking.id, { travelerIds: [] })).rejects.toThrow('At least one traveler is required');
    });

    it('rolls back link replacement when a write fails midway', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const db: any = await (repo as any).db;
      const realRun = db.run.bind(db);
      const spy = vi.spyOn(db, 'run').mockImplementation(async (sql: string, ...args: any[]) => {
        if (/^\s*INSERT INTO booking_travelers/i.test(sql)) throw new Error('boom');
        return realRun(sql, ...args);
      });
      await expect(repo.updateBooking(booking.id, { elementIds: [elementId2], travelerIds: [participantBId] })).rejects.toThrow('boom');
      spy.mockRestore();
      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.elementIds).toEqual([elementId]);
      expect(reloaded!.travelerIds).toEqual([participantAId]);
    });
  });

  describe('deleteBooking', () => {
    it('cascades links, travelers, and transactions', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      const db = await getDb();
      await db.run(
        `INSERT INTO booking_transactions (id, booking_id, amount_cash, transaction_date, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), booking.id, 79, '2026-01-01']
      );

      await repo.deleteBooking(booking.id);

      expect(await repo.getBookingById(booking.id)).toBeNull();
      const linkCount = await db.get(`SELECT COUNT(*) as count FROM booking_links WHERE booking_id = ?`, [booking.id]);
      const travelerCount = await db.get(`SELECT COUNT(*) as count FROM booking_travelers WHERE booking_id = ?`, [booking.id]);
      const txnCount = await db.get(`SELECT COUNT(*) as count FROM booking_transactions WHERE booking_id = ?`, [booking.id]);
      expect(linkCount.count).toBe(0);
      expect(travelerCount.count).toBe(0);
      expect(txnCount.count).toBe(0);
    });
  });

  describe('traveler conflicts', () => {
    it('rejects a second booking for the same flight and traveler with a readable message', async () => {
      await repo.createBooking(tripId, { confirmationNumber: 'ABC123', elementIds: [elementId], travelerIds: [participantAId] });
      await expect(
        repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] })
      ).rejects.toThrow(new BookingConflictError('A is already on booking ABC123 for Departure Flights'));
    });

    it('allows the same traveler on a different flight', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.createBooking(tripId, { elementIds: [elementId2], travelerIds: [participantAId] })).resolves.toBeTruthy();
    });

    it('allows a different traveler on the same flight (separate per-traveler bookings)', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantBId] })).resolves.toBeTruthy();
    });

    it('describes a conflicting booking without a confirmation number', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(
        repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] })
      ).rejects.toThrow('A is already on another booking without a confirmation number for Departure Flights');
    });

    it('findTravelerConflicts ignores the excluded booking', async () => {
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      expect(await repo.findTravelerConflicts(tripId, [elementId], [participantAId], booking.id)).toEqual([]);
      const conflicts = await repo.findTravelerConflicts(tripId, [elementId], [participantAId]);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({ bookingId: booking.id, elementId, participantId: participantAId, travelerName: 'A', elementName: 'Departure Flights' });
    });

    it('linkElement rejects linking a flight where a traveler is already booked', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId2], travelerIds: [participantAId] });
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.linkElement(booking.id, elementId2)).rejects.toBeInstanceOf(BookingConflictError);
    });

    it('addTraveler rejects adding a traveler already booked on one of the flights', async () => {
      await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantBId] });
      const booking = await repo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participantAId] });
      await expect(repo.addTraveler(booking.id, participantBId)).rejects.toBeInstanceOf(BookingConflictError);
    });
  });

  describe('computed totals', () => {
    it('sums transactions for actualTotalCash/actualTotalPoints and uses latest transaction confirmation number', async () => {
      const booking = await repo.createBooking(tripId, {
        confirmationNumber: 'ORIGINAL',
        elementIds: [elementId],
        travelerIds: [participantAId, participantBId],
      });
      const db = await getDb();
      await db.run(
        `INSERT INTO booking_transactions (id, booking_id, amount_cash, transaction_date, created_at)
         VALUES (?, ?, ?, ?, datetime('now', '-2 days'))`,
        [uuidv4(), booking.id, 158, '2026-01-01']
      );
      await db.run(
        `INSERT INTO booking_transactions (id, booking_id, amount_cash, confirmation_number, transaction_date, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), booking.id, -20, 'REBOOKED', '2026-02-01']
      );

      const reloaded = await repo.getBookingById(booking.id);
      expect(reloaded!.actualTotalCash).toBe(138);
      expect(reloaded!.currentConfirmationNumber).toBe('REBOOKED');
    });
  });
});
