import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { TripElementRepository, TripElement, FlightLeg, HotelDetails, CarRentalDetails, ActivityDetails } from './tripElementRepository';
import { v4 as uuidv4 } from 'uuid';

describe('TripElementRepository', () => {
  let repo: TripElementRepository;
  let tripId: string;
  let familyId: string;

  beforeEach(async () => {
    await getDb(); // Initialize database
    repo = new TripElementRepository();
    familyId = uuidv4();
    tripId = uuidv4();

    // Create test family and trip
    const db = await getDb();
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

  describe('createElement', () => {
    it('should create a flight element with legs', async () => {
      const legs = [
        {
          legOrder: 1,
          departureAirport: 'JFK',
          departureDatetime: '2026-06-01T08:00:00Z',
          arrivalAirport: 'LAX',
          arrivalDatetime: '2026-06-01T11:00:00Z',
          airline: 'Delta',
          flightNumber: 'DL123',
          seatNumbers: '12A',
          priceCash: 150,
          pricePoints: 5000,
          loyaltyProgram: 'SkyMiles',
          confirmationNumber: 'CONF123',
          checkPriceUrl: 'https://delta.com/check',
          layoverMinutesAfter: 120
        }
      ];

      const element = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight to LA',
        bookingReference: 'BOOK123',
        bookingUrl: 'https://booking.com/flight',
        priceCash: 150,
        pricePoints: 5000,
        loyaltyProgram: 'SkyMiles',
        totalCash: 150,
        totalPoints: 5000,
        notes: 'Early morning departure',
        sortPosition: 1,
        typeSpecificData: { legs }
      });

      expect(element.id).toBeTruthy();
      expect(element.tripId).toBe(tripId);
      expect(element.elementType).toBe('flight');
      expect(element.name).toBe('Flight to LA');
      expect(element.bookingReference).toBe('BOOK123');
      expect(element.sortPosition).toBe(1);
      expect((element as any).legs).toHaveLength(1);
      expect((element as any).legs[0].flightNumber).toBe('DL123');
    });

    it('should create a hotel element with details', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'hotel',
        name: 'Grand Hotel',
        bookingReference: 'HO123',
        bookingUrl: 'https://booking.com/hotel',
        priceCash: 200,
        pricePoints: 3000,
        totalCash: 800,
        totalPoints: 12000,
        notes: 'Ocean view room',
        sortPosition: 2,
        typeSpecificData: {
          address: '123 Main St, LA',
          checkInDate: '2026-06-01',
          checkOutDate: '2026-06-05',
          roomType: 'Deluxe Suite',
          bookingSource: 'Booking.com',
          advertisedPriceCash: 200,
          advertisedPricePoints: 3000,
          advertisedLoyaltyProgram: 'Hilton'
        }
      });

      expect(element.elementType).toBe('hotel');
      expect(element.name).toBe('Grand Hotel');
      expect((element as any).hotelDetails).toBeTruthy();
      expect((element as any).hotelDetails.address).toBe('123 Main St, LA');
      expect((element as any).hotelDetails.checkInDate).toBe('2026-06-01');
    });

    it('should create a car rental element with details', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'car_rental',
        name: 'Car Rental - Hertz',
        bookingReference: 'CAR123',
        bookingUrl: 'https://booking.com/car',
        priceCash: 50,
        pricePoints: 1000,
        totalCash: 300,
        totalPoints: 6000,
        sortPosition: 3,
        typeSpecificData: {
          rentalCompany: 'Hertz',
          carSize: 'Sedan',
          pickupLocation: 'LAX',
          pickupDatetime: '2026-06-01T12:00:00Z',
          returnLocation: 'LAX',
          returnDatetime: '2026-06-05T12:00:00Z',
          prepaidPrice: 300,
          atCounterPrice: 350
        }
      });

      expect(element.elementType).toBe('car_rental');
      expect(element.name).toBe('Car Rental - Hertz');
      expect((element as any).carRentalDetails).toBeTruthy();
      expect((element as any).carRentalDetails.rentalCompany).toBe('Hertz');
    });

    it('should create an activity element with details', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'activity',
        name: 'Disneyland',
        bookingReference: 'ACT123',
        bookingUrl: 'https://booking.com/activity',
        priceCash: 120,
        pricePoints: 2000,
        sortPosition: 4,
        typeSpecificData: {
          venue: 'Disneyland Park',
          activityDatetime: '2026-06-02T10:00:00Z',
          numTickets: 2
        }
      });

      expect(element.elementType).toBe('activity');
      expect(element.name).toBe('Disneyland');
      expect((element as any).activityDetails).toBeTruthy();
      expect((element as any).activityDetails.numTickets).toBe(2);
    });

    it('should create element with no type-specific data', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'activity',
        name: 'Generic Activity',
        sortPosition: 5
      });

      expect(element.id).toBeTruthy();
      expect(element.elementType).toBe('activity');
    });

    it('should set default sort position to 0', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight',
      });

      expect(element.sortPosition).toBe(0);
    });
  });

  describe('getElementById', () => {
    it('should return a flight element hydrated with legs', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight',
        sortPosition: 1,
        typeSpecificData: {
          legs: [
            {
              legOrder: 1,
              departureAirport: 'JFK',
              departureDatetime: '2026-06-01T08:00:00Z',
              arrivalAirport: 'LAX',
              arrivalDatetime: '2026-06-01T11:00:00Z'
            }
          ]
        }
      });

      const retrieved = await repo.getElementById(created.id);

      expect(retrieved).toBeTruthy();
      expect(retrieved!.elementType).toBe('flight');
      expect((retrieved as any).legs).toHaveLength(1);
      expect((retrieved as any).legs[0].departureAirport).toBe('JFK');
    });

    it('should return a hotel element hydrated with details', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'hotel',
        name: 'Hotel',
        typeSpecificData: {
          address: '123 Main St',
          checkInDate: '2026-06-01',
          checkOutDate: '2026-06-05'
        }
      });

      const retrieved = await repo.getElementById(created.id);

      expect(retrieved).toBeTruthy();
      expect(retrieved!.elementType).toBe('hotel');
      expect((retrieved as any).hotelDetails.address).toBe('123 Main St');
    });

    it('should return null for non-existent element', async () => {
      const retrieved = await repo.getElementById(uuidv4());
      expect(retrieved).toBeNull();
    });

    it('should return null for soft-deleted element', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight'
      });

      await repo.deleteElement(created.id);
      const retrieved = await repo.getElementById(created.id);

      expect(retrieved).toBeNull();
    });
  });

  describe('getElementsByTrip', () => {
    it('should return all elements for a trip ordered by element_type and sort_position', async () => {
      await repo.createElement(tripId, {
        elementType: 'hotel',
        name: 'Hotel 2',
        sortPosition: 2
      });

      await repo.createElement(tripId, {
        elementType: 'activity',
        name: 'Activity 1',
        sortPosition: 1
      });

      await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight 1',
        sortPosition: 1
      });

      const elements = await repo.getElementsByTrip(tripId);

      expect(elements).toHaveLength(3);
      // Should be ordered by element_type, then sort_position
      expect(elements[0].elementType).toBe('activity');
      expect(elements[1].elementType).toBe('flight');
      expect(elements[2].elementType).toBe('hotel');
    });

    it('should exclude soft-deleted elements', async () => {
      const created1 = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight 1'
      });

      await repo.createElement(tripId, {
        elementType: 'hotel',
        name: 'Hotel 1'
      });

      await repo.deleteElement(created1.id);

      const elements = await repo.getElementsByTrip(tripId);

      expect(elements).toHaveLength(1);
      expect(elements[0].name).toBe('Hotel 1');
    });

    it('should return empty array for trip with no elements', async () => {
      const newTripId = uuidv4();
      const db = await getDb();
      await db.run(
        `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [newTripId, familyId, 'Empty Trip', '2026-07-01', '2026-07-10']
      );

      const elements = await repo.getElementsByTrip(newTripId);

      expect(elements).toEqual([]);
    });
  });

  describe('updateElement', () => {
    it('should update base element fields', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Original Name',
        sortPosition: 1
      });

      const updated = await repo.updateElement(created.id, {
        name: 'Updated Name',
        notes: 'New notes',
        sortPosition: 2
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.notes).toBe('New notes');
      expect(updated.sortPosition).toBe(2);
      expect(updated.elementType).toBe('flight');
    });

    it('should handle null values in updates', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight',
        notes: 'Initial notes'
      });

      const updated = await repo.updateElement(created.id, {
        notes: undefined
      });

      expect(updated.notes).toBeNull();
    });

    it('should not update non-mapped fields', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight'
      });

      const updated = await repo.updateElement(created.id, {
        name: 'New Name'
      });

      expect(updated.id).toBe(created.id);
      expect(updated.elementType).toBe('flight');
    });

    it('should update pricing fields', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight'
      });

      const updated = await repo.updateElement(created.id, {
        priceCash: 100,
        pricePoints: 2000,
        totalCash: 500,
        totalPoints: 10000
      });

      expect(updated.priceCash).toBe(100);
      expect(updated.pricePoints).toBe(2000);
      expect(updated.totalCash).toBe(500);
      expect(updated.totalPoints).toBe(10000);
    });
  });

  describe('deleteElement', () => {
    it('should soft-delete an element', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight'
      });

      await repo.deleteElement(created.id);

      const retrieved = await repo.getElementById(created.id);
      expect(retrieved).toBeNull();
    });

    it('should not return soft-deleted elements in getElementsByTrip', async () => {
      const el1 = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight 1'
      });

      const el2 = await repo.createElement(tripId, {
        elementType: 'hotel',
        name: 'Hotel 1'
      });

      await repo.deleteElement(el1.id);

      const elements = await repo.getElementsByTrip(tripId);
      expect(elements).toHaveLength(1);
      expect(elements[0].id).toBe(el2.id);
    });

    it('should set deletedAt timestamp', async () => {
      const created = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Flight'
      });

      const beforeDelete = new Date();
      await repo.deleteElement(created.id);
      const afterDelete = new Date();

      const db = await getDb();
      const row = await db.get(
        'SELECT deleted_at FROM trip_elements WHERE id = ?',
        [created.id]
      );

      expect(row.deleted_at).toBeTruthy();
      const deletedAt = new Date(row.deleted_at);
      expect(deletedAt >= beforeDelete).toBe(true);
      expect(deletedAt <= afterDelete).toBe(true);
    });
  });

  describe('Flight elements with multiple legs', () => {
    it('should create flight with multiple legs and preserve order', async () => {
      const legs = [
        {
          legOrder: 1,
          departureAirport: 'JFK',
          departureDatetime: '2026-06-01T08:00:00Z',
          arrivalAirport: 'ORD',
          arrivalDatetime: '2026-06-01T10:00:00Z',
          flightNumber: 'AA100'
        },
        {
          legOrder: 2,
          departureAirport: 'ORD',
          departureDatetime: '2026-06-01T14:00:00Z',
          arrivalAirport: 'LAX',
          arrivalDatetime: '2026-06-01T16:00:00Z',
          flightNumber: 'AA200'
        }
      ];

      const element = await repo.createElement(tripId, {
        elementType: 'flight',
        name: 'Multi-leg Flight',
        typeSpecificData: { legs }
      });

      const retrieved = await repo.getElementById(element.id);
      const retrievedLegs = (retrieved as any).legs;

      expect(retrievedLegs).toHaveLength(2);
      expect(retrievedLegs[0].legOrder).toBe(1);
      expect(retrievedLegs[0].arrivalAirport).toBe('ORD');
      expect(retrievedLegs[1].legOrder).toBe(2);
      expect(retrievedLegs[1].arrivalAirport).toBe('LAX');
    });
  });

  describe('Edge cases and type-specific data hydration', () => {
    it('should hydrate car rental with all optional fields', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'car_rental',
        name: 'Car Rental',
        typeSpecificData: {
          rentalCompany: 'Hertz',
          carSize: 'Sedan',
          pickupLocation: 'LAX',
          pickupDatetime: '2026-06-01T12:00:00Z',
          returnLocation: 'SFO',
          returnDatetime: '2026-06-05T12:00:00Z',
          prepaidPrice: 300,
          atCounterPrice: 350
        }
      });

      const retrieved = await repo.getElementById(element.id);
      const details = (retrieved as any).carRentalDetails;

      expect(details.rentalCompany).toBe('Hertz');
      expect(details.carSize).toBe('Sedan');
      expect(details.pickupLocation).toBe('LAX');
      expect(details.returnLocation).toBe('SFO');
      expect(details.prepaidPrice).toBe(300);
    });

    it('should hydrate activity with all optional fields', async () => {
      const element = await repo.createElement(tripId, {
        elementType: 'activity',
        name: 'Activity',
        typeSpecificData: {
          venue: 'Central Park',
          activityDatetime: '2026-06-02T10:00:00Z',
          numTickets: 4
        }
      });

      const retrieved = await repo.getElementById(element.id);
      const details = (retrieved as any).activityDetails;

      expect(details.venue).toBe('Central Park');
      expect(details.activityDatetime).toBe('2026-06-02T10:00:00Z');
      expect(details.numTickets).toBe(4);
    });
  });
});
