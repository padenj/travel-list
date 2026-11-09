import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { TripRepository, Trip } from './tripRepository';
import { v4 as uuidv4 } from 'uuid';

describe('TripRepository', () => {
  let tripRepository: TripRepository;
  let familyId: string;

  beforeEach(async () => {
    await getDb(); // Initialize database
    tripRepository = new TripRepository();
    familyId = uuidv4();

    // Create a test family
    const db = await getDb();
    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('createTrip', () => {
    it('should create a trip with all required fields', async () => {
      const tripData = {
        name: 'Summer Vacation',
        description: 'A trip to the beach',
        tripType: 'vacation',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        status: 'planned'
      };

      const trip = await tripRepository.createTrip(familyId, tripData);

      expect(trip.id).toBeTruthy();
      expect(trip.familyId).toBe(familyId);
      expect(trip.name).toBe('Summer Vacation');
      expect(trip.description).toBe('A trip to the beach');
      expect(trip.tripType).toBe('vacation');
      expect(trip.startDate).toBe('2026-06-01');
      expect(trip.endDate).toBe('2026-06-10');
      expect(trip.status).toBe('planned');
      expect(trip.createdAt).toBeTruthy();
      expect(trip.updatedAt).toBeTruthy();
      expect(trip.deletedAt).toBeNull();
    });

    it('should create a trip with optional fields as null', async () => {
      const tripData = {
        name: 'Quick Trip',
        startDate: '2026-07-01',
        endDate: '2026-07-03'
      };

      const trip = await tripRepository.createTrip(familyId, tripData);

      expect(trip.id).toBeTruthy();
      expect(trip.familyId).toBe(familyId);
      expect(trip.name).toBe('Quick Trip');
      expect(trip.description).toBeNull();
      expect(trip.tripType).toBeNull();
      expect(trip.status).toBeNull();
    });
  });

  describe('getTripById', () => {
    it('should retrieve a trip by id', async () => {
      const tripData = {
        name: 'Beach Trip',
        startDate: '2026-06-01',
        endDate: '2026-06-10'
      };

      const createdTrip = await tripRepository.createTrip(familyId, tripData);
      const retrievedTrip = await tripRepository.getTripById(createdTrip.id);

      expect(retrievedTrip).toBeTruthy();
      expect(retrievedTrip?.id).toBe(createdTrip.id);
      expect(retrievedTrip?.name).toBe('Beach Trip');
    });

    it('should return null if trip does not exist', async () => {
      const trip = await tripRepository.getTripById(uuidv4());
      expect(trip).toBeUndefined();
    });

    it('should return null if trip is soft-deleted', async () => {
      const tripData = {
        name: 'Deleted Trip',
        startDate: '2026-06-01',
        endDate: '2026-06-10'
      };

      const createdTrip = await tripRepository.createTrip(familyId, tripData);
      await tripRepository.deleteTrip(createdTrip.id);

      const retrievedTrip = await tripRepository.getTripById(createdTrip.id);
      expect(retrievedTrip).toBeUndefined();
    });
  });

  describe('getTripsByFamily', () => {
    it('should return all trips for a family ordered by start_date DESC', async () => {
      const trip1 = await tripRepository.createTrip(familyId, {
        name: 'First Trip',
        startDate: '2026-06-01',
        endDate: '2026-06-10'
      });

      const trip2 = await tripRepository.createTrip(familyId, {
        name: 'Second Trip',
        startDate: '2026-07-01',
        endDate: '2026-07-10'
      });

      const trip3 = await tripRepository.createTrip(familyId, {
        name: 'Third Trip',
        startDate: '2026-05-01',
        endDate: '2026-05-10'
      });

      const trips = await tripRepository.getTripsByFamily(familyId);

      expect(trips.length).toBe(3);
      expect(trips[0].name).toBe('Second Trip'); // Latest start date
      expect(trips[1].name).toBe('First Trip');
      expect(trips[2].name).toBe('Third Trip'); // Earliest start date
    });

    it('should return empty array if no trips exist for family', async () => {
      const trips = await tripRepository.getTripsByFamily(uuidv4());
      expect(trips).toEqual([]);
    });

    it('should exclude soft-deleted trips', async () => {
      const trip1 = await tripRepository.createTrip(familyId, {
        name: 'Active Trip',
        startDate: '2026-06-01',
        endDate: '2026-06-10'
      });

      const trip2 = await tripRepository.createTrip(familyId, {
        name: 'Deleted Trip',
        startDate: '2026-07-01',
        endDate: '2026-07-10'
      });

      await tripRepository.deleteTrip(trip2.id);

      const trips = await tripRepository.getTripsByFamily(familyId);

      expect(trips.length).toBe(1);
      expect(trips[0].name).toBe('Active Trip');
    });
  });

  describe('updateTrip', () => {
    it('should update specified fields and return updated trip', async () => {
      const tripData = {
        name: 'Original Name',
        description: 'Original Description',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        status: 'planned'
      };

      const createdTrip = await tripRepository.createTrip(familyId, tripData);

      const updates = {
        name: 'Updated Name',
        status: 'in-progress'
      };

      const updatedTrip = await tripRepository.updateTrip(createdTrip.id, updates);

      expect(updatedTrip.id).toBe(createdTrip.id);
      expect(updatedTrip.name).toBe('Updated Name');
      expect(updatedTrip.description).toBe('Original Description'); // Unchanged
      expect(updatedTrip.status).toBe('in-progress');
      expect(updatedTrip.updatedAt).toBeTruthy();
    });

    it('should return trip unchanged if no updates provided', async () => {
      const tripData = {
        name: 'Test Trip',
        startDate: '2026-06-01',
        endDate: '2026-06-10'
      };

      const createdTrip = await tripRepository.createTrip(familyId, tripData);
      const updatedTrip = await tripRepository.updateTrip(createdTrip.id, {});

      expect(updatedTrip.id).toBe(createdTrip.id);
      expect(updatedTrip.name).toBe('Test Trip');
    });
  });

  describe('deleteTrip', () => {
    it('should soft-delete a trip (set deleted_at)', async () => {
      const tripData = {
        name: 'Trip to Delete',
        startDate: '2026-06-01',
        endDate: '2026-06-10'
      };

      const createdTrip = await tripRepository.createTrip(familyId, tripData);
      expect(createdTrip.deletedAt).toBeNull();

      await tripRepository.deleteTrip(createdTrip.id);

      // Direct database query to verify soft delete
      const db = await getDb();
      const row = await db.get(
        'SELECT deleted_at FROM trips WHERE id = ?',
        [createdTrip.id]
      );

      expect(row.deleted_at).toBeTruthy();
    });

    it('should exclude soft-deleted trip from getTripsByFamily results', async () => {
      const tripData = {
        name: 'Trip to Delete',
        startDate: '2026-06-01',
        endDate: '2026-06-10'
      };

      const createdTrip = await tripRepository.createTrip(familyId, tripData);
      const trips1 = await tripRepository.getTripsByFamily(familyId);
      expect(trips1.length).toBe(1);

      await tripRepository.deleteTrip(createdTrip.id);

      const trips2 = await tripRepository.getTripsByFamily(familyId);
      expect(trips2.length).toBe(0);
    });
  });
});
