import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { TripParticipantRepository } from './tripParticipantRepository';
import { v4 as uuidv4 } from 'uuid';

describe('TripParticipantRepository', () => {
  let repo: TripParticipantRepository;
  let tripId: string;
  let familyId: string;

  beforeEach(async () => {
    await getDb();
    repo = new TripParticipantRepository();

    const db = await getDb();
    familyId = uuidv4();
    tripId = uuidv4();

    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [tripId, familyId, 'Test Trip', '2026-06-01', '2026-06-10']
    );
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('createParticipant', () => {
    it('creates a participant with a display name only', async () => {
      const participant = await repo.createParticipant(tripId, { displayName: 'Jane Doe' });
      expect(participant.id).toBeDefined();
      expect(participant.tripId).toBe(tripId);
      expect(participant.displayName).toBe('Jane Doe');
      expect(participant.userId).toBeNull();
    });

    it('creates a participant linked to a user id', async () => {
      const db = await getDb();
      await db.run(
        `INSERT INTO users (id, username, password_hash, role, familyId, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        ['user-1', 'linked-user', 'hash', 'FamilyMember', familyId]
      );
      const participant = await repo.createParticipant(tripId, { displayName: 'Linked User', userId: 'user-1' });
      expect(participant.userId).toBe('user-1');
    });
  });

  describe('getParticipantsForTrip', () => {
    it('returns empty array when trip has no participants', async () => {
      const participants = await repo.getParticipantsForTrip(tripId);
      expect(participants).toEqual([]);
    });

    it('returns all participants for a trip', async () => {
      await repo.createParticipant(tripId, { displayName: 'Alice' });
      await repo.createParticipant(tripId, { displayName: 'Bob' });
      const participants = await repo.getParticipantsForTrip(tripId);
      expect(participants).toHaveLength(2);
      expect(participants.map(p => p.displayName).sort()).toEqual(['Alice', 'Bob']);
    });
  });

  describe('updateParticipant', () => {
    it('updates the display name', async () => {
      const created = await repo.createParticipant(tripId, { displayName: 'Old Name' });
      const updated = await repo.updateParticipant(created.id, { displayName: 'New Name' });
      expect(updated.displayName).toBe('New Name');
    });
  });

  describe('deleteParticipant', () => {
    it('deletes a participant with no bookings or seats', async () => {
      const created = await repo.createParticipant(tripId, { displayName: 'Removable' });
      await repo.deleteParticipant(created.id);
      const participants = await repo.getParticipantsForTrip(tripId);
      expect(participants).toEqual([]);
    });

    it('throws when the participant is attached to a booking', async () => {
      const created = await repo.createParticipant(tripId, { displayName: 'Traveler' });
      const db = await getDb();
      const elementId = uuidv4();
      const bookingId = uuidv4();
      await db.run(
        `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [elementId, tripId, 'flight', 'Test Flight']
      );
      await db.run(
        `INSERT INTO bookings (id, trip_id, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`,
        [bookingId, tripId]
      );
      await db.run(
        `INSERT INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`,
        [bookingId, created.id]
      );

      await expect(repo.deleteParticipant(created.id)).rejects.toThrow(/attached to/i);
    });
  });
});
