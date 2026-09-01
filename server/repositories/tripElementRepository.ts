import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface TripElement {
  id: string;
  tripId: string;
  elementType: 'flight' | 'hotel' | 'car_rental' | 'activity';
  name: string;
  bookingReference?: string;
  bookingUrl?: string;
  priceCash?: number;
  pricePoints?: number;
  loyaltyProgram?: string;
  totalCash?: number;
  totalPoints?: number;
  notes?: string;
  sortPosition: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface FlightLeg {
  id: string;
  elementId: string;
  legOrder: number;
  departureAirport: string;
  departureDatetime: string;
  arrivalAirport: string;
  arrivalDatetime: string;
  airline?: string;
  flightNumber?: string;
  seatNumbers?: string;
  priceCash?: number;
  pricePoints?: number;
  loyaltyProgram?: string;
  confirmationNumber?: string;
  checkPriceUrl?: string;
  layoverMinutesAfter?: number;
  createdAt: string;
  updatedAt: string;
}

export interface HotelDetails {
  elementId: string;
  address?: string;
  checkInDate: string;
  checkOutDate: string;
  roomType?: string;
  bookingSource?: string;
  advertisedPriceCash?: number;
  advertisedPricePoints?: number;
  advertisedLoyaltyProgram?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CarRentalDetails {
  elementId: string;
  rentalCompany?: string;
  carSize?: string;
  pickupLocation?: string;
  pickupDatetime?: string;
  returnLocation?: string;
  returnDatetime?: string;
  prepaidPrice?: number;
  atCounterPrice?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDetails {
  elementId: string;
  venue?: string;
  activityDatetime?: string;
  numTickets?: number;
  createdAt: string;
  updatedAt: string;
}

export class TripElementRepository {
  private db: any;

  constructor() {
    this.db = getDb();
  }

  async createElement(tripId: string, element: {
    elementType: 'flight' | 'hotel' | 'car_rental' | 'activity';
    name: string;
    bookingReference?: string;
    bookingUrl?: string;
    priceCash?: number;
    pricePoints?: number;
    loyaltyProgram?: string;
    totalCash?: number;
    totalPoints?: number;
    notes?: string;
    sortPosition?: number;
    typeSpecificData?: any;
  }): Promise<TripElement> {
    const id = uuidv4();
    const db = await this.db;
    
    // Insert base element
    const sortPos = element.sortPosition !== undefined ? element.sortPosition : 0;
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, booking_reference, booking_url, price_cash, price_points, loyalty_program, total_cash, total_points, notes, sort_position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, tripId, element.elementType, element.name, element.bookingReference || null, element.bookingUrl || null,
       element.priceCash ?? null, element.pricePoints ?? null, element.loyaltyProgram || null,
       element.totalCash ?? null, element.totalPoints ?? null, element.notes || null, sortPos]
    );

    // Insert type-specific data
    if (element.elementType === 'flight' && element.typeSpecificData?.legs) {
      for (const [index, leg] of element.typeSpecificData.legs.entries()) {
        const fallbackDate = typeof leg.flightDate === 'string' && leg.flightDate
          ? `${leg.flightDate}T00:00:00Z`
          : null;
        const departureDatetime = leg.departureDatetime || fallbackDate || new Date().toISOString();
        const arrivalDatetime = leg.arrivalDatetime || departureDatetime;
        const departureAirport = leg.departureAirport || 'TBD';
        const arrivalAirport = leg.arrivalAirport || 'TBD';
        const legId = uuidv4();
        await db.run(
          `INSERT INTO flight_legs (id, element_id, leg_order, departure_airport, departure_datetime, arrival_airport, arrival_datetime, airline, flight_number, seat_numbers, price_cash, price_points, loyalty_program, confirmation_number, check_price_url, layover_minutes_after, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [legId, id, leg.legOrder ?? index + 1, departureAirport, departureDatetime, arrivalAirport, arrivalDatetime,
           leg.airline || null, leg.flightNumber || null, leg.seatNumbers || null, leg.priceCash ?? null,
           leg.pricePoints ?? null, leg.loyaltyProgram || null, leg.confirmationNumber || null,
           leg.checkPriceUrl || null, leg.layoverMinutesAfter ?? null]
        );
      }
    } else if (element.elementType === 'hotel' && element.typeSpecificData) {
      await db.run(
        `INSERT INTO hotel_element_details (element_id, address, check_in_date, check_out_date, room_type, booking_source, advertised_price_cash, advertised_price_points, advertised_loyalty_program, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [id, element.typeSpecificData.address || null, element.typeSpecificData.checkInDate || null,
         element.typeSpecificData.checkOutDate || null, element.typeSpecificData.roomType || null,
         element.typeSpecificData.bookingSource || null, element.typeSpecificData.advertisedPriceCash || null,
         element.typeSpecificData.advertisedPricePoints || null, element.typeSpecificData.advertisedLoyaltyProgram || null]
      );
    } else if (element.elementType === 'car_rental' && element.typeSpecificData) {
      await db.run(
        `INSERT INTO car_rental_element_details (element_id, rental_company, car_size, pickup_location, pickup_datetime, dropoff_location, dropoff_datetime, prepaid_price, at_counter_price, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [id, element.typeSpecificData.rentalCompany || null, element.typeSpecificData.carSize || null,
         element.typeSpecificData.pickupLocation || null, element.typeSpecificData.pickupDatetime || null,
         element.typeSpecificData.returnLocation || null, element.typeSpecificData.returnDatetime || null,
         element.typeSpecificData.prepaidPrice || null, element.typeSpecificData.atCounterPrice || null]
      );
    } else if (element.elementType === 'activity' && element.typeSpecificData) {
      let activityDate = null;
      let activityTime = null;
      if (element.typeSpecificData.activityDatetime) {
        const parts = element.typeSpecificData.activityDatetime.split('T');
        activityDate = parts[0];
        if (parts[1]) {
          activityTime = parts[1].replace(/Z$/, ''); // Remove trailing Z if present
        }
      }
      await db.run(
        `INSERT INTO activity_element_details (element_id, venue_name, activity_date, activity_time, num_tickets, ticket_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [id, element.typeSpecificData.venue || null, activityDate, activityTime,
         element.typeSpecificData.numTickets || null,
         element.typeSpecificData.ticketType || null]
      );
    }

    return this.getElementById(id) as Promise<TripElement>;
  }

  async getElementById(elementId: string): Promise<TripElement | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, trip_id as tripId, element_type as elementType, name, booking_reference as bookingReference, booking_url as bookingUrl,
              price_cash as priceCash, price_points as pricePoints, loyalty_program as loyaltyProgram, total_cash as totalCash,
              total_points as totalPoints, notes, sort_position as sortPosition, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt
       FROM trip_elements WHERE id = ? AND deleted_at IS NULL`,
      [elementId]
    );

    if (!row) return null;

    // Hydrate with type-specific data
    if (row.elementType === 'flight') {
      const legs = await db.all(
        `SELECT id, element_id as elementId, leg_order as legOrder, departure_airport as departureAirport, departure_datetime as departureDatetime,
                arrival_airport as arrivalAirport, arrival_datetime as arrivalDatetime, airline, flight_number as flightNumber,
                seat_numbers as seatNumbers, price_cash as priceCash, price_points as pricePoints, loyalty_program as loyaltyProgram,
                confirmation_number as confirmationNumber, check_price_url as checkPriceUrl, layover_minutes_after as layoverMinutesAfter,
                created_at as createdAt, updated_at as updatedAt
         FROM flight_legs WHERE element_id = ? ORDER BY leg_order ASC`,
        [elementId]
      );
      (row as any).legs = legs;
    } else if (row.elementType === 'hotel') {
      const details = await db.get(
        `SELECT element_id as elementId, address, check_in_date as checkInDate, check_out_date as checkOutDate,
                room_type as roomType, booking_source as bookingSource, advertised_price_cash as advertisedPriceCash,
                advertised_price_points as advertisedPricePoints, advertised_loyalty_program as advertisedLoyaltyProgram,
                created_at as createdAt, updated_at as updatedAt
         FROM hotel_element_details WHERE element_id = ?`,
        [elementId]
      );
      (row as any).hotelDetails = details;
    } else if (row.elementType === 'car_rental') {
      const details = await db.get(
        `SELECT element_id as elementId, rental_company as rentalCompany, car_size as carSize,
                pickup_location as pickupLocation, pickup_datetime as pickupDatetime,
                dropoff_location as returnLocation, dropoff_datetime as returnDatetime,
                prepaid_price as prepaidPrice, at_counter_price as atCounterPrice,
                created_at as createdAt, updated_at as updatedAt
         FROM car_rental_element_details WHERE element_id = ?`,
        [elementId]
      );
      (row as any).carRentalDetails = details;
    } else if (row.elementType === 'activity') {
      const details = await db.get(
        `SELECT element_id as elementId, venue_name as venue, 
                (CASE WHEN activity_date IS NOT NULL AND activity_time IS NOT NULL THEN activity_date || 'T' || activity_time || 'Z'
                      WHEN activity_date IS NOT NULL THEN activity_date || 'T00:00:00Z'
                      ELSE NULL END) as activityDatetime,
                num_tickets as numTickets,
                created_at as createdAt, updated_at as updatedAt
         FROM activity_element_details WHERE element_id = ?`,
        [elementId]
      );
      (row as any).activityDetails = details;
    }

    return row as TripElement;
  }

  async getElementsByTrip(tripId: string): Promise<TripElement[]> {
    const db = await this.db;
    const rows = await db.all(
      `SELECT id, trip_id as tripId, element_type as elementType, name, booking_reference as bookingReference, booking_url as bookingUrl,
              price_cash as priceCash, price_points as pricePoints, loyalty_program as loyaltyProgram, total_cash as totalCash,
              total_points as totalPoints, notes, sort_position as sortPosition, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt
       FROM trip_elements WHERE trip_id = ? AND deleted_at IS NULL ORDER BY element_type ASC, sort_position ASC`,
      [tripId]
    );

    // Hydrate each element with type-specific data
    for (let i = 0; i < rows.length; i++) {
      const fullElement = await this.getElementById(rows[i].id);
      if (fullElement) {
        Object.assign(rows[i], fullElement);
      }
    }

    return rows as TripElement[];
  }

  async updateElement(elementId: string, updates: Partial<TripElement>): Promise<TripElement> {
    const db = await this.db;
    const dbUpdates: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      name: 'name',
      bookingReference: 'booking_reference',
      bookingUrl: 'booking_url',
      priceCash: 'price_cash',
      pricePoints: 'price_points',
      loyaltyProgram: 'loyalty_program',
      totalCash: 'total_cash',
      totalPoints: 'total_points',
      notes: 'notes',
      sortPosition: 'sort_position',
    };

    for (const [key, dbKey] of Object.entries(fieldMap)) {
      if (key in updates) {
        dbUpdates[dbKey] = (updates as any)[key] ?? null;
      }
    }

    if (Object.keys(dbUpdates).length > 0) {
      const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(dbUpdates), elementId];
      await db.run(
        `UPDATE trip_elements SET ${fields}, updated_at = datetime('now') WHERE id = ?`,
        values
      );
    }

    return this.getElementById(elementId) as Promise<TripElement>;
  }

  async deleteElement(elementId: string): Promise<void> {
    const db = await this.db;
    await db.run(
      `UPDATE trip_elements SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [elementId]
    );
  }
}
