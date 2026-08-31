import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { TripElementConfirmationRepository, TripElementConfirmation } from './tripElementConfirmationRepository';
import { v4 as uuidv4 } from 'uuid';

describe('TripElementConfirmationRepository', () => {
  let repo: TripElementConfirmationRepository;
  let elementId: string;
  let legId: string;
  let participantId: string;
  let tripId: string;
  let familyId: string;

  beforeEach(async () => {
    await getDb(); // Initialize database
    repo = new TripElementConfirmationRepository();
    
    const db = await getDb();
    familyId = uuidv4();
    tripId = uuidv4();
    elementId = uuidv4();
    legId = uuidv4();
    participantId = uuidv4();

    // Create test data
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
      `INSERT INTO trip_elements (id, trip_id, element_type, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [elementId, tripId, 'flight']
    );
    await db.run(
      `INSERT INTO flight_legs (id, trip_id, leg_order, departure_airport, departure_datetime, arrival_airport, arrival_datetime, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [legId, tripId, 1, 'JFK', '2026-06-01T08:00:00Z', 'LAX', '2026-06-01T11:00:00Z']
    );
    await db.run(
      `INSERT INTO trip_participants (id, trip_id, name, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [participantId, tripId, 'John Doe']
    );
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('addConfirmation', () => {
    it('should create a confirmation with confirmation number', async () => {
      const confirmation = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
      });

      expect(confirmation).toBeDefined();
      expect(confirmation.id).toBeDefined();
      expect(confirmation.elementId).toBe(elementId);
      expect(confirmation.confirmationNumber).toBe('CONF123');
      expect(confirmation.label).toBeNull();
      expect(confirmation.legId).toBeNull();
      expect(confirmation.participantId).toBeNull();
      expect(confirmation.createdAt).toBeDefined();
    });

    it('should create a confirmation with custom label', async () => {
      const confirmation = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
        label: 'Expedia Itinerary #',
      });

      expect(confirmation.confirmationNumber).toBe('CONF123');
      expect(confirmation.label).toBe('Expedia Itinerary #');
    });

    it('should create a confirmation with leg_id for per-leg scoping', async () => {
      const confirmation = await repo.addConfirmation(elementId, {
        confirmationNumber: 'FLIGHT_CONF_OUTBOUND',
        legId: legId,
        label: 'Outbound Flight',
      });

      expect(confirmation.confirmationNumber).toBe('FLIGHT_CONF_OUTBOUND');
      expect(confirmation.legId).toBe(legId);
      expect(confirmation.label).toBe('Outbound Flight');
    });

    it('should create a confirmation with participant_id for per-passenger scoping', async () => {
      const confirmation = await repo.addConfirmation(elementId, {
        confirmationNumber: 'SEAT_12A',
        participantId: participantId,
        label: "John's Seat Assignment",
      });

      expect(confirmation.confirmationNumber).toBe('SEAT_12A');
      expect(confirmation.participantId).toBe(participantId);
      expect(confirmation.label).toBe("John's Seat Assignment");
    });

    it('should create a confirmation with both leg_id and participant_id', async () => {
      const confirmation = await repo.addConfirmation(elementId, {
        confirmationNumber: 'LEG_PASS_COMBO',
        legId: legId,
        participantId: participantId,
        label: 'Return Flight - John',
      });

      expect(confirmation.legId).toBe(legId);
      expect(confirmation.participantId).toBe(participantId);
      expect(confirmation.label).toBe('Return Flight - John');
    });
  });

  describe('getConfirmationsForElement', () => {
    it('should return empty array for element with no confirmations', async () => {
      const confirmations = await repo.getConfirmationsForElement(elementId);
      expect(confirmations).toEqual([]);
    });

    it('should return single confirmation for element', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
        label: 'Primary',
      });

      const confirmations = await repo.getConfirmationsForElement(elementId);
      expect(confirmations).toHaveLength(1);
      expect(confirmations[0].id).toBe(added.id);
      expect(confirmations[0].confirmationNumber).toBe('CONF123');
    });

    it('should return multiple confirmations ordered by created_at DESC', async () => {
      const first = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF001',
        label: 'First',
      });

      // Add a small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const second = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF002',
        label: 'Second',
      });

      const confirmations = await repo.getConfirmationsForElement(elementId);
      expect(confirmations).toHaveLength(2);
      // Most recent first
      expect(confirmations[0].id).toBe(second.id);
      expect(confirmations[1].id).toBe(first.id);
    });

    it('should return confirmations with different scopes for same element', async () => {
      const elementConf = await repo.addConfirmation(elementId, {
        confirmationNumber: 'ELEMENT_CONF',
        label: 'Hotel Confirmation',
      });

      const legConf = await repo.addConfirmation(elementId, {
        confirmationNumber: 'LEG_CONF',
        legId: legId,
        label: 'Outbound Flight',
      });

      const participantConf = await repo.addConfirmation(elementId, {
        confirmationNumber: 'PASS_CONF',
        participantId: participantId,
        label: 'Seat Assignment',
      });

      const confirmations = await repo.getConfirmationsForElement(elementId);
      expect(confirmations).toHaveLength(3);
      expect(confirmations.map(c => c.confirmationNumber)).toEqual(
        expect.arrayContaining(['ELEMENT_CONF', 'LEG_CONF', 'PASS_CONF'])
      );
    });

    it('should not return confirmations for different elements', async () => {
      const otherElementId = uuidv4();
      await getDb().then(db => db.run(
        `INSERT INTO trip_elements (id, trip_id, element_type, created_at, updated_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
        [otherElementId, tripId, 'hotel']
      ));

      await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
      });

      await repo.addConfirmation(otherElementId, {
        confirmationNumber: 'OTHER_CONF',
      });

      const elementConfirmations = await repo.getConfirmationsForElement(elementId);
      expect(elementConfirmations).toHaveLength(1);
      expect(elementConfirmations[0].confirmationNumber).toBe('CONF123');
    });
  });

  describe('updateConfirmation', () => {
    it('should update confirmation number', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'OLD_CONF',
      });

      const updated = await repo.updateConfirmation(added.id, {
        confirmationNumber: 'NEW_CONF',
      });

      expect(updated.confirmationNumber).toBe('NEW_CONF');
      expect(updated.id).toBe(added.id);
    });

    it('should update label', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
        label: 'Old Label',
      });

      const updated = await repo.updateConfirmation(added.id, {
        label: 'New Label',
      });

      expect(updated.label).toBe('New Label');
      expect(updated.confirmationNumber).toBe('CONF123');
    });

    it('should update leg_id for per-leg scoping', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
      });

      const updated = await repo.updateConfirmation(added.id, {
        legId: legId,
      });

      expect(updated.legId).toBe(legId);
    });

    it('should update participant_id for per-passenger scoping', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
      });

      const updated = await repo.updateConfirmation(added.id, {
        participantId: participantId,
      });

      expect(updated.participantId).toBe(participantId);
    });

    it('should update multiple fields at once', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'OLD_CONF',
        label: 'Old Label',
      });

      const updated = await repo.updateConfirmation(added.id, {
        confirmationNumber: 'NEW_CONF',
        label: 'New Label',
        legId: legId,
        participantId: participantId,
      });

      expect(updated.confirmationNumber).toBe('NEW_CONF');
      expect(updated.label).toBe('New Label');
      expect(updated.legId).toBe(legId);
      expect(updated.participantId).toBe(participantId);
    });

    it('should clear optional fields when set to null', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
        label: 'Some Label',
        legId: legId,
        participantId: participantId,
      });

      const updated = await repo.updateConfirmation(added.id, {
        label: null,
        legId: null,
        participantId: null,
      });

      expect(updated.label).toBeNull();
      expect(updated.legId).toBeNull();
      expect(updated.participantId).toBeNull();
    });

    it('should return existing confirmation when no updates provided', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
        label: 'Original Label',
      });

      const updated = await repo.updateConfirmation(added.id, {});

      expect(updated.confirmationNumber).toBe('CONF123');
      expect(updated.label).toBe('Original Label');
    });
  });

  describe('deleteConfirmation', () => {
    it('should delete a confirmation', async () => {
      const added = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF123',
      });

      await repo.deleteConfirmation(added.id);

      const confirmations = await repo.getConfirmationsForElement(elementId);
      expect(confirmations).toHaveLength(0);
    });

    it('should not affect other confirmations when deleting', async () => {
      const conf1 = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF001',
      });

      const conf2 = await repo.addConfirmation(elementId, {
        confirmationNumber: 'CONF002',
      });

      await repo.deleteConfirmation(conf1.id);

      const confirmations = await repo.getConfirmationsForElement(elementId);
      expect(confirmations).toHaveLength(1);
      expect(confirmations[0].id).toBe(conf2.id);
    });

    it('should handle deleting non-existent confirmation gracefully', async () => {
      const fakeId = uuidv4();
      await expect(repo.deleteConfirmation(fakeId)).resolves.not.toThrow();
    });
  });
});
