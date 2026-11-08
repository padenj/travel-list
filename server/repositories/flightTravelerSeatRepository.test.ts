import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { FlightTravelerSeatRepository } from './flightTravelerSeatRepository';
import { TripParticipantRepository } from './tripParticipantRepository';
import { v4 as uuidv4 } from 'uuid';

describe('FlightTravelerSeatRepository', () => {
  let repo: FlightTravelerSeatRepository;
  let legId: string;
  let participantId: string;

  beforeEach(async () => {
    await getDb();
    repo = new FlightTravelerSeatRepository();
    const participantRepo = new TripParticipantRepository();

    const db = await getDb();
    const familyId = uuidv4();
    const tripId = uuidv4();
    const elementId = uuidv4();
    legId = uuidv4();

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
      [elementId, tripId, 'flight', 'Flight']
    );
    await db.run(
      `INSERT INTO flight_legs (id, element_id, leg_order, departure_airport, departure_datetime, arrival_airport, arrival_datetime, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [legId, elementId, 1, 'DEN', '2026-06-01T08:00:00Z', 'LAX', '2026-06-01T10:00:00Z']
    );
    participantId = (await participantRepo.createParticipant(tripId, { displayName: 'A' })).id;
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('upsertSeat', () => {
    it('creates a seat assignment', async () => {
      const seat = await repo.upsertSeat(legId, participantId, '14C');
      expect(seat.legId).toBe(legId);
      expect(seat.participantId).toBe(participantId);
      expect(seat.seatNumber).toBe('14C');
    });

    it('updates an existing seat assignment for the same leg/participant', async () => {
      await repo.upsertSeat(legId, participantId, '14C');
      const updated = await repo.upsertSeat(legId, participantId, '20A');
      expect(updated.seatNumber).toBe('20A');
      const seats = await repo.getSeatsForLeg(legId);
      expect(seats).toHaveLength(1);
    });
  });

  describe('getSeatsForLeg', () => {
    it('returns empty array when no seats assigned', async () => {
      const seats = await repo.getSeatsForLeg(legId);
      expect(seats).toEqual([]);
    });
  });

  describe('deleteSeat', () => {
    it('removes a seat assignment', async () => {
      await repo.upsertSeat(legId, participantId, '14C');
      await repo.deleteSeat(legId, participantId);
      const seats = await repo.getSeatsForLeg(legId);
      expect(seats).toEqual([]);
    });
  });
});
