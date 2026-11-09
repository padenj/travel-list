import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';

export interface Booking {
  id: string;
  tripId: string;
  confirmationNumber: string | null;
  advertisedPriceCash: number | null;
  advertisedPricePoints: number | null;
  loyaltyProgram: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  elementIds: string[];
  travelerIds: string[];
  currentConfirmationNumber: string | null;
  actualTotalCash: number;
  actualTotalPoints: number;
}

export interface CreateBookingInput {
  confirmationNumber?: string;
  advertisedPriceCash?: number;
  advertisedPricePoints?: number;
  loyaltyProgram?: string;
  notes?: string;
  elementIds: string[];
  travelerIds: string[];
}

export class BookingConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookingConflictError';
  }
}

export interface UpdateBookingInput {
  confirmationNumber?: string | null;
  advertisedPriceCash?: number | null;
  advertisedPricePoints?: number | null;
  loyaltyProgram?: string | null;
  notes?: string | null;
  elementIds?: string[];
  travelerIds?: string[];
}

export interface TravelerConflict {
  bookingId: string;
  confirmationNumber: string | null;
  elementId: string;
  elementName: string;
  participantId: string;
  travelerName: string;
}

export class BookingRepository {
  private db = getDb();

  async createBooking(tripId: string, input: CreateBookingInput): Promise<Booking> {
    await this.assertNoTravelerConflicts(tripId, input.elementIds, input.travelerIds);
    const id = uuidv4();
    const db = await this.db;
    await db.run(
      `INSERT INTO bookings (id, trip_id, confirmation_number, advertised_price_cash, advertised_price_points, loyalty_program, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, tripId, input.confirmationNumber || null, input.advertisedPriceCash ?? null,
       input.advertisedPricePoints ?? null, input.loyaltyProgram || null, input.notes || null]
    );
    for (const elementId of input.elementIds) {
      await db.run(`INSERT INTO booking_links (booking_id, element_id) VALUES (?, ?)`, [id, elementId]);
    }
    for (const participantId of input.travelerIds) {
      await db.run(`INSERT INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`, [id, participantId]);
    }
    return this.getBookingById(id) as Promise<Booking>;
  }

  // Other bookings in the trip that already cover any (element, traveler) pair from the given sets.
  async findTravelerConflicts(
    tripId: string,
    elementIds: string[],
    travelerIds: string[],
    excludeBookingId?: string
  ): Promise<TravelerConflict[]> {
    if (elementIds.length === 0 || travelerIds.length === 0) return [];
    const db = await this.db;
    const elementMarks = elementIds.map(() => '?').join(', ');
    const travelerMarks = travelerIds.map(() => '?').join(', ');
    return db.all(
      `SELECT b.id AS bookingId,
              COALESCE(
                (SELECT t.confirmation_number FROM booking_transactions t
                 WHERE t.booking_id = b.id AND t.confirmation_number IS NOT NULL AND t.confirmation_number != ''
                 ORDER BY t.created_at DESC LIMIT 1),
                NULLIF(b.confirmation_number, '')
              ) AS confirmationNumber,
              bl.element_id AS elementId, e.name AS elementName,
              bt.participant_id AS participantId, p.display_name AS travelerName
       FROM bookings b
       JOIN booking_links bl ON bl.booking_id = b.id
       JOIN booking_travelers bt ON bt.booking_id = b.id
       JOIN trip_elements e ON e.id = bl.element_id
       JOIN trip_participants p ON p.id = bt.participant_id
       WHERE b.trip_id = ?
         AND b.id != ?
         AND bl.element_id IN (${elementMarks})
         AND bt.participant_id IN (${travelerMarks})
         AND e.deleted_at IS NULL
       ORDER BY b.created_at ASC, e.name ASC, p.display_name ASC`,
      [tripId, excludeBookingId ?? '', ...elementIds, ...travelerIds]
    );
  }

  async assertNoTravelerConflicts(
    tripId: string,
    elementIds: string[],
    travelerIds: string[],
    excludeBookingId?: string
  ): Promise<void> {
    const [first] = await this.findTravelerConflicts(tripId, elementIds, travelerIds, excludeBookingId);
    if (!first) return;
    const other = first.confirmationNumber
      ? `booking ${first.confirmationNumber}`
      : 'another booking without a confirmation number';
    throw new BookingConflictError(`${first.travelerName} is already on ${other} for ${first.elementName}`);
  }

  async getBookingById(id: string): Promise<Booking | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, trip_id as tripId, confirmation_number as confirmationNumber,
              advertised_price_cash as advertisedPriceCash, advertised_price_points as advertisedPricePoints,
              loyalty_program as loyaltyProgram, notes, created_at as createdAt, updated_at as updatedAt
       FROM bookings WHERE id = ?`,
      [id]
    );
    if (!row) return null;
    return this.hydrate(row);
  }

  async getBookingsForTrip(tripId: string, elementId?: string): Promise<Booking[]> {
    const db = await this.db;
    const rows = elementId
      ? await db.all(
          `SELECT DISTINCT b.id, b.trip_id as tripId, b.confirmation_number as confirmationNumber,
                  b.advertised_price_cash as advertisedPriceCash, b.advertised_price_points as advertisedPricePoints,
                  b.loyalty_program as loyaltyProgram, b.notes, b.created_at as createdAt, b.updated_at as updatedAt
           FROM bookings b
           JOIN booking_links bl ON bl.booking_id = b.id
           WHERE b.trip_id = ? AND bl.element_id = ?
           ORDER BY b.created_at ASC`,
          [tripId, elementId]
        )
      : await db.all(
          `SELECT id, trip_id as tripId, confirmation_number as confirmationNumber,
                  advertised_price_cash as advertisedPriceCash, advertised_price_points as advertisedPricePoints,
                  loyalty_program as loyaltyProgram, notes, created_at as createdAt, updated_at as updatedAt
           FROM bookings WHERE trip_id = ? ORDER BY created_at ASC`,
          [tripId]
        );

    const results: Booking[] = [];
    for (const row of rows) {
      results.push(await this.hydrate(row));
    }
    return results;
  }

  async updateBooking(id: string, updates: UpdateBookingInput): Promise<Booking> {
    const current = await this.getBookingById(id);
    if (!current) throw new Error('Booking not found');
    if (updates.elementIds !== undefined && updates.elementIds.length === 0) {
      throw new Error('At least one flight is required');
    }
    if (updates.travelerIds !== undefined && updates.travelerIds.length === 0) {
      throw new Error('At least one traveler is required');
    }
    const elementIds = updates.elementIds ? Array.from(new Set(updates.elementIds)) : undefined;
    const travelerIds = updates.travelerIds ? Array.from(new Set(updates.travelerIds)) : undefined;
    if (elementIds || travelerIds) {
      await this.assertNoTravelerConflicts(
        current.tripId,
        elementIds ?? current.elementIds,
        travelerIds ?? current.travelerIds,
        id
      );
    }

    const fieldMap: Record<string, string> = {
      confirmationNumber: 'confirmation_number',
      advertisedPriceCash: 'advertised_price_cash',
      advertisedPricePoints: 'advertised_price_points',
      loyaltyProgram: 'loyalty_program',
      notes: 'notes',
    };
    const dbUpdates: Record<string, any> = {};
    for (const [key, dbKey] of Object.entries(fieldMap)) {
      if (key in updates) dbUpdates[dbKey] = (updates as any)[key] ?? null;
    }

    const db = await this.db;
    await withTransaction(db, async () => {
      if (Object.keys(dbUpdates).length > 0) {
        const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
        await db.run(`UPDATE bookings SET ${fields}, updated_at = datetime('now') WHERE id = ?`, [...Object.values(dbUpdates), id]);
      }
      if (elementIds) {
        await db.run(`DELETE FROM booking_links WHERE booking_id = ?`, [id]);
        for (const elementId of elementIds) {
          await db.run(`INSERT INTO booking_links (booking_id, element_id) VALUES (?, ?)`, [id, elementId]);
        }
      }
      if (travelerIds) {
        await db.run(`DELETE FROM booking_travelers WHERE booking_id = ?`, [id]);
        for (const participantId of travelerIds) {
          await db.run(`INSERT INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`, [id, participantId]);
        }
      }
    });
    return this.getBookingById(id) as Promise<Booking>;
  }

  async deleteBooking(id: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_transactions WHERE booking_id = ?`, [id]);
    await db.run(`DELETE FROM booking_travelers WHERE booking_id = ?`, [id]);
    await db.run(`DELETE FROM booking_links WHERE booking_id = ?`, [id]);
    await db.run(`DELETE FROM bookings WHERE id = ?`, [id]);
  }

  async linkElement(bookingId: string, elementId: string): Promise<void> {
    const booking = await this.getBookingById(bookingId);
    if (booking) {
      await this.assertNoTravelerConflicts(booking.tripId, [elementId], booking.travelerIds, bookingId);
    }
    const db = await this.db;
    await db.run(
      `INSERT OR IGNORE INTO booking_links (booking_id, element_id) VALUES (?, ?)`,
      [bookingId, elementId]
    );
  }

  async unlinkElement(bookingId: string, elementId: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_links WHERE booking_id = ? AND element_id = ?`, [bookingId, elementId]);
  }

  async addTraveler(bookingId: string, participantId: string): Promise<void> {
    const booking = await this.getBookingById(bookingId);
    if (booking) {
      await this.assertNoTravelerConflicts(booking.tripId, booking.elementIds, [participantId], bookingId);
    }
    const db = await this.db;
    await db.run(
      `INSERT OR IGNORE INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`,
      [bookingId, participantId]
    );
  }

  async removeTraveler(bookingId: string, participantId: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_travelers WHERE booking_id = ? AND participant_id = ?`, [bookingId, participantId]);
  }

  private async hydrate(row: any): Promise<Booking> {
    const db = await this.db;
    const elementRows = await db.all(
      `SELECT bl.element_id as elementId FROM booking_links bl
       JOIN trip_elements e ON e.id = bl.element_id
       WHERE bl.booking_id = ? AND e.deleted_at IS NULL`,
      [row.id]
    );
    const travelerRows = await db.all(`SELECT participant_id as participantId FROM booking_travelers WHERE booking_id = ?`, [row.id]);
    const totals = await db.get(
      `SELECT COALESCE(SUM(amount_cash), 0) as totalCash, COALESCE(SUM(amount_points), 0) as totalPoints
       FROM booking_transactions WHERE booking_id = ?`,
      [row.id]
    );
    const latestTxnConfirmation = await db.get(
      `SELECT confirmation_number as confirmationNumber FROM booking_transactions
       WHERE booking_id = ? AND confirmation_number IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [row.id]
    );

    return {
      ...row,
      elementIds: elementRows.map((r: any) => r.elementId),
      travelerIds: travelerRows.map((r: any) => r.participantId),
      actualTotalCash: totals?.totalCash ?? 0,
      actualTotalPoints: totals?.totalPoints ?? 0,
      currentConfirmationNumber: latestTxnConfirmation?.confirmationNumber || row.confirmationNumber || null,
    };
  }
}
