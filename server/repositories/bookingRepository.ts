import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';

export type RoomType = 'standard' | 'suite' | 'studio' | '1br' | '2br' | '3br' | 'other';
export type BedType = 'king' | 'queen' | 'full' | 'twin' | 'sofa_bed' | 'bunk' | 'crib';
export type PropertyAmenity = 'breakfast' | 'pool' | 'hot_tub' | 'parking' | 'wifi' | 'laundry' | 'airport_shuttle' | 'gym';
export type RoomAmenity = 'fridge' | 'microwave' | 'kitchenette' | 'jetted_tub' | 'balcony';
export type Refundability = 'free' | 'partial' | 'nonrefundable';
export interface BedCount { type: BedType; count: number }

export interface BookingCoupon {
  id: string;
  code: string;
  savingsCash: number | null;
  savingsPoints: number | null;
  notes: string | null;
}
export type CouponInput = Partial<Omit<BookingCoupon, 'id'>> & { id?: string; code: string };

export function blankToNull(v: string | null | undefined): string | null {
  return v == null || v.trim() === '' ? null : v;
}

export function parseJsonArray<T>(v: string | null): T[] {
  if (!v) return [];
  try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

const BOOKING_SELECT = (p = '') => `
  ${p}id as id, ${p}trip_id as tripId, ${p}confirmation_number as confirmationNumber,
  ${p}advertised_price_cash as advertisedPriceCash, ${p}advertised_price_points as advertisedPricePoints,
  ${p}loyalty_program as loyaltyProgram, ${p}notes as notes, ${p}booking_site as bookingSite,
  ${p}site_itinerary_number as siteItineraryNumber, ${p}advertised_includes_taxes as advertisedIncludesTaxes,
  ${p}advertised_rate_cash as advertisedRateCash, ${p}advertised_rate_points as advertisedRatePoints,
  ${p}due_at_booking_cash as dueAtBookingCash, ${p}due_at_booking_points as dueAtBookingPoints,
  ${p}due_later_cash as dueLaterCash, ${p}due_later_notes as dueLaterNotes,
  ${p}refundability as refundability, ${p}cancel_by as cancelBy, ${p}cancellation_policy as cancellationPolicy,
  ${p}created_at as createdAt, ${p}updated_at as updatedAt`;

const SCALAR_FIELDS: Array<[keyof UpdateBookingInput, string]> = [
  ['confirmationNumber', 'confirmation_number'],
  ['advertisedPriceCash', 'advertised_price_cash'],
  ['advertisedPricePoints', 'advertised_price_points'],
  ['loyaltyProgram', 'loyalty_program'],
  ['notes', 'notes'],
  ['bookingSite', 'booking_site'],
  ['siteItineraryNumber', 'site_itinerary_number'],
  ['advertisedRateCash', 'advertised_rate_cash'],
  ['advertisedRatePoints', 'advertised_rate_points'],
  ['dueAtBookingCash', 'due_at_booking_cash'],
  ['dueAtBookingPoints', 'due_at_booking_points'],
  ['dueLaterCash', 'due_later_cash'],
  ['dueLaterNotes', 'due_later_notes'],
  ['refundability', 'refundability'],
  ['cancelBy', 'cancel_by'],
  ['cancellationPolicy', 'cancellation_policy'],
];
const TEXT_FIELDS = new Set(['confirmationNumber', 'loyaltyProgram', 'notes', 'bookingSite', 'siteItineraryNumber',
  'dueLaterNotes', 'refundability', 'cancelBy', 'cancellationPolicy']);
const fieldValue = (key: string, v: unknown) => (v === undefined ? null : TEXT_FIELDS.has(key) ? blankToNull(v as string | null) : v);

export interface Booking {
  id: string;
  tripId: string;
  confirmationNumber: string | null;
  advertisedPriceCash: number | null;
  advertisedPricePoints: number | null;
  loyaltyProgram: string | null;
  notes: string | null;
  bookingSite: string | null;
  siteItineraryNumber: string | null;
  advertisedIncludesTaxes: boolean;
  advertisedRateCash: number | null;
  advertisedRatePoints: number | null;
  dueAtBookingCash: number | null;
  dueAtBookingPoints: number | null;
  dueLaterCash: number | null;
  dueLaterNotes: string | null;
  refundability: Refundability | null;
  cancelBy: string | null;
  cancellationPolicy: string | null;
  createdAt: string;
  updatedAt: string;
  elementIds: string[];
  travelerIds: string[];
  currentConfirmationNumber: string | null;
  actualTotalCash: number;
  actualTotalPoints: number;
  coupons: BookingCoupon[];
}

export interface CreateBookingInput {
  confirmationNumber?: string;
  advertisedPriceCash?: number;
  advertisedPricePoints?: number;
  loyaltyProgram?: string;
  notes?: string;
  bookingSite?: string | null;
  siteItineraryNumber?: string | null;
  advertisedIncludesTaxes?: boolean;
  advertisedRateCash?: number | null;
  advertisedRatePoints?: number | null;
  dueAtBookingCash?: number | null;
  dueAtBookingPoints?: number | null;
  dueLaterCash?: number | null;
  dueLaterNotes?: string | null;
  refundability?: Refundability | null;
  cancelBy?: string | null;
  cancellationPolicy?: string | null;
  coupons?: CouponInput[];
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
  bookingSite?: string | null;
  siteItineraryNumber?: string | null;
  advertisedIncludesTaxes?: boolean;
  advertisedRateCash?: number | null;
  advertisedRatePoints?: number | null;
  dueAtBookingCash?: number | null;
  dueAtBookingPoints?: number | null;
  dueLaterCash?: number | null;
  dueLaterNotes?: string | null;
  refundability?: Refundability | null;
  cancelBy?: string | null;
  cancellationPolicy?: string | null;
  coupons?: CouponInput[];
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
    const id = uuidv4();
    const db = await this.db;
    await withTransaction(db, async () => {
      await this.assertNoTravelerConflicts(tripId, input.elementIds, input.travelerIds);
      const cols = ['id', 'trip_id', 'advertised_includes_taxes', ...SCALAR_FIELDS.map(([, c]) => c)];
      const vals = [id, tripId, input.advertisedIncludesTaxes ? 1 : 0,
        ...SCALAR_FIELDS.map(([k]) => fieldValue(k, (input as unknown as Record<string, unknown>)[k]))];
      await db.run(`INSERT INTO bookings (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
      for (const elementId of input.elementIds) {
        await db.run(`INSERT INTO booking_links (booking_id, element_id) VALUES (?, ?)`, [id, elementId]);
      }
      for (const participantId of input.travelerIds) {
        await db.run(`INSERT INTO booking_travelers (booking_id, participant_id) VALUES (?, ?)`, [id, participantId]);
      }
      await this.writeCoupons(db, id, input.coupons);
    });
    return this.getBookingById(id) as Promise<Booking>;
  }

  private async writeCoupons(db: any, bookingId: string, coupons: CouponInput[] | undefined): Promise<void> {
    if (coupons === undefined) return;
    await db.run('DELETE FROM booking_coupons WHERE booking_id = ?', [bookingId]);
    for (const [i, c] of coupons.entries()) {
      await db.run(
        `INSERT INTO booking_coupons (id, booking_id, code, savings_cash, savings_points, notes, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), bookingId, typeof c.code === 'string' ? c.code.trim() : c.code, c.savingsCash ?? null, c.savingsPoints ?? null, blankToNull(c.notes), i]
      );
    }
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
    const row = await db.get(`SELECT ${BOOKING_SELECT()} FROM bookings WHERE id = ?`, [id]);
    if (!row) return null;
    return this.hydrate(row);
  }

  async getBookingIdForElement(elementId: string): Promise<string | null> {
    const db = await this.db;
    const row = await db.get<{ bookingId: string }>(
      `SELECT bl.booking_id as bookingId FROM booking_links bl JOIN bookings b ON b.id = bl.booking_id
       WHERE bl.element_id = ? ORDER BY b.created_at, b.id LIMIT 1`, [elementId]);
    return row?.bookingId ?? null;
  }

  async getBookingsForTrip(tripId: string, elementId?: string): Promise<Booking[]> {
    const db = await this.db;
    const rows = elementId
      ? await db.all(
          `SELECT DISTINCT ${BOOKING_SELECT('b.')}
           FROM bookings b
           JOIN booking_links bl ON bl.booking_id = b.id
           WHERE b.trip_id = ? AND bl.element_id = ?
           ORDER BY b.created_at ASC`,
          [tripId, elementId]
        )
      : await db.all(
          `SELECT ${BOOKING_SELECT()} FROM bookings WHERE trip_id = ? ORDER BY created_at ASC`,
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

    const dbUpdates: Record<string, unknown> = {};
    for (const [key, column] of SCALAR_FIELDS) {
      if (key in updates) dbUpdates[column] = fieldValue(key, (updates as Record<string, unknown>)[key]);
    }
    if (updates.advertisedIncludesTaxes !== undefined) dbUpdates.advertised_includes_taxes = updates.advertisedIncludesTaxes ? 1 : 0;

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
      await this.writeCoupons(db, id, updates.coupons);
    });
    return this.getBookingById(id) as Promise<Booking>;
  }

  async deleteBooking(id: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_transactions WHERE booking_id = ?`, [id]);
    await db.run(`DELETE FROM booking_coupons WHERE booking_id = ?`, [id]);
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
    const couponRows = await db.all('SELECT * FROM booking_coupons WHERE booking_id = ? ORDER BY position', [row.id]);

    return {
      ...row,
      advertisedIncludesTaxes: Boolean(row.advertisedIncludesTaxes),
      coupons: couponRows.map((c: any) => ({
        id: c.id, code: c.code, savingsCash: c.savings_cash ?? null, savingsPoints: c.savings_points ?? null, notes: c.notes ?? null,
      })),
      elementIds: elementRows.map((r: any) => r.elementId),
      travelerIds: travelerRows.map((r: any) => r.participantId),
      actualTotalCash: totals?.totalCash ?? 0,
      actualTotalPoints: totals?.totalPoints ?? 0,
      currentConfirmationNumber: latestTxnConfirmation?.confirmationNumber || row.confirmationNumber || null,
    };
  }
}

export const BOOKING_INPUT_KEYS = [
  'confirmationNumber', 'advertisedPriceCash', 'advertisedPricePoints', 'loyaltyProgram', 'notes',
  'bookingSite', 'siteItineraryNumber', 'advertisedIncludesTaxes',
  'advertisedRateCash', 'advertisedRatePoints', 'dueAtBookingCash', 'dueAtBookingPoints',
  'dueLaterCash', 'dueLaterNotes', 'refundability', 'cancelBy', 'cancellationPolicy', 'coupons',
] as const;

// Copies only the booking fields present in `body` (so PATCH stays partial).
export function pickBookingInput(body: any): UpdateBookingInput {
  const out: Record<string, unknown> = {};
  for (const key of BOOKING_INPUT_KEYS) {
    if (body && Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  if ('advertisedIncludesTaxes' in out) out.advertisedIncludesTaxes = Boolean(out.advertisedIncludesTaxes);
  return out as UpdateBookingInput;
}
