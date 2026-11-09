import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';

export const DESTINATION_COLORS = ['blue', 'green', 'orange', 'grape', 'teal', 'red'];

export interface TripDestination {
  id: string;
  tripId: string;
  name: string;
  color: string;
  position: number;
  packingListId: string;
  memberIds: string[];
}

export interface ListTripContext {
  tripId: string;
  tripName: string;
  destinations: TripDestination[];
}

export interface ListTripSummary {
  tripId: string;
  tripName: string;
  destinationId: string;
  destinationName: string;
  position: number;
  destinationCount: number;
}

export interface InsertDestinationInput {
  tripId: string;
  familyId: string;
  name: string;
  memberIds: string[];
  listName: string;
  packingListId?: string;
}

export class DestinationConflictError extends Error {
  constructor(public memberId: string, public destinationId: string) {
    super('member_in_other_destination');
  }
}

export class DestinationValidationError extends Error {}

const SELECT_DESTINATION = `SELECT id, trip_id AS tripId, name, color, position, packing_list_id AS packingListId FROM trip_destinations`;

export class TripDestinationRepository {
  async listForTrip(tripId: string): Promise<TripDestination[]> {
    const db = await getDb();
    const rows = await db.all(
      `${SELECT_DESTINATION} WHERE trip_id = ? AND deleted_at IS NULL ORDER BY position, created_at`,
      [tripId]
    );
    return Promise.all(rows.map((row: any) => this.withMembers(db, row)));
  }

  async getById(id: string): Promise<TripDestination | null> {
    const db = await getDb();
    const row = await db.get(`${SELECT_DESTINATION} WHERE id = ? AND deleted_at IS NULL`, [id]);
    return row ? this.withMembers(db, row) : null;
  }

  async findByPackingListId(listId: string): Promise<TripDestination | null> {
    const db = await getDb();
    const row = await db.get(
      `SELECT d.id, d.trip_id AS tripId, d.name, d.color, d.position, d.packing_list_id AS packingListId
       FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
       WHERE d.packing_list_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
      [listId]
    );
    return row ? this.withMembers(db, row) : null;
  }

  async getTripContextForList(listId: string): Promise<ListTripContext | null> {
    const destination = await this.findByPackingListId(listId);
    if (!destination) return null;
    const db = await getDb();
    const trip = await db.get(`SELECT name FROM trips WHERE id = ?`, [destination.tripId]);
    return {
      tripId: destination.tripId,
      tripName: trip?.name ?? '',
      destinations: await this.listForTrip(destination.tripId),
    };
  }

  async getListSummariesForFamily(familyId: string): Promise<Map<string, ListTripSummary>> {
    const db = await getDb();
    const rows = await db.all(
      `SELECT d.packing_list_id AS listId, d.trip_id AS tripId, t.name AS tripName, d.id AS destinationId,
              d.name AS destinationName, d.position,
              (SELECT COUNT(*) FROM trip_destinations d2 WHERE d2.trip_id = d.trip_id AND d2.deleted_at IS NULL) AS destinationCount
       FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
       WHERE t.family_id = ? AND d.deleted_at IS NULL AND t.deleted_at IS NULL`,
      [familyId]
    );
    const result = new Map<string, ListTripSummary>();
    for (const { listId, ...summary } of rows as any[]) result.set(listId, summary);
    return result;
  }

  async findConflict(
    db: Database,
    tripId: string,
    memberIds: string[],
    exceptDestinationId: string | null = null
  ): Promise<DestinationConflictError | null> {
    if (memberIds.length === 0) return null;
    const placeholders = memberIds.map(() => '?').join(',');
    const row = await db.get(
      `SELECT d.id AS destinationId, plm.member_id AS memberId
       FROM trip_destinations d JOIN packing_list_members plm ON plm.packing_list_id = d.packing_list_id
       WHERE d.trip_id = ? AND d.deleted_at IS NULL AND d.id != ? AND plm.member_id IN (${placeholders})
       LIMIT 1`,
      [tripId, exceptDestinationId ?? '', ...memberIds]
    );
    return row ? new DestinationConflictError(row.memberId, row.destinationId) : null;
  }

  async create(input: InsertDestinationInput): Promise<TripDestination> {
    const db = await getDb();
    const conflict = await this.findConflict(db, input.tripId, input.memberIds);
    if (conflict) throw conflict;
    const id = await withTransaction(db, () => this.insertDestinationTx(db, input));
    return (await this.getById(id))!;
  }

  // Caller owns the transaction.
  async insertDestinationTx(db: Database, input: InsertDestinationInput): Promise<string> {
    await this.assertFamilyMembers(db, input.familyId, input.memberIds);
    const now = new Date().toISOString();
    let listId = input.packingListId;
    if (listId) {
      const list = await db.get(
        `SELECT id FROM packing_lists WHERE id = ? AND family_id = ? AND deleted_at IS NULL`,
        [listId, input.familyId]
      );
      if (!list) throw new DestinationValidationError('list_not_found');
      const taken = await db.get(
        `SELECT id FROM trip_destinations WHERE packing_list_id = ? AND deleted_at IS NULL`,
        [listId]
      );
      if (taken) throw new DestinationValidationError('list_already_destination');
    } else {
      listId = uuidv4();
      await db.run(
        `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [listId, input.familyId, input.listName, now, now]
      );
    }
    await this.writeMembersTx(db, listId, input.memberIds);
    await db.run(`INSERT OR IGNORE INTO trip_packing_lists (trip_id, packing_list_id) VALUES (?, ?)`, [input.tripId, listId]);
    const stats = await db.get(
      `SELECT COUNT(*) AS count, COALESCE(MAX(position), -1) AS maxPosition
       FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
      [input.tripId]
    );
    const id = uuidv4();
    await db.run(
      `INSERT INTO trip_destinations (id, trip_id, name, color, position, packing_list_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.tripId, input.name, DESTINATION_COLORS[stats.count % DESTINATION_COLORS.length], stats.maxPosition + 1, listId, now, now]
    );
    await this.ensureParticipantsTx(db, input.tripId, input.memberIds);
    return id;
  }

  async update(
    id: string,
    familyId: string,
    updates: { name?: string; color?: string; position?: number; memberIds?: string[] }
  ): Promise<TripDestination> {
    const db = await getDb();
    const existing = await this.getById(id);
    if (!existing) throw new DestinationValidationError('not_found');
    if (updates.memberIds) {
      const conflict = await this.findConflict(db, existing.tripId, updates.memberIds, id);
      if (conflict) throw conflict;
      await this.assertFamilyMembers(db, familyId, updates.memberIds);
    }
    await withTransaction(db, async () => {
      const fields: string[] = [];
      const values: unknown[] = [];
      if (typeof updates.name === 'string') { fields.push('name = ?'); values.push(updates.name); }
      if (typeof updates.color === 'string') { fields.push('color = ?'); values.push(updates.color); }
      if (typeof updates.position === 'number') { fields.push('position = ?'); values.push(updates.position); }
      if (fields.length > 0) {
        await db.run(
          `UPDATE trip_destinations SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`,
          [...values, new Date().toISOString(), id]
        );
      }
      if (updates.memberIds) {
        await this.writeMembersTx(db, existing.packingListId, updates.memberIds);
        await this.ensureParticipantsTx(db, existing.tripId, updates.memberIds);
      }
    });
    return (await this.getById(id))!;
  }

  async softDelete(id: string): Promise<void> {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.run(`UPDATE trip_destinations SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
  }

  private async withMembers(db: Database, row: any): Promise<TripDestination> {
    const members = await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [row.packingListId]);
    return { ...row, memberIds: members.map((m: any) => m.member_id) };
  }

  private async assertFamilyMembers(db: Database, familyId: string, memberIds: string[]): Promise<void> {
    if (!Array.isArray(memberIds) || memberIds.length === 0) throw new DestinationValidationError('members_required');
    const unique = Array.from(new Set(memberIds));
    const placeholders = unique.map(() => '?').join(',');
    const rows = await db.all(
      `SELECT id FROM users WHERE familyId = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      [familyId, ...unique]
    );
    if (rows.length !== unique.length) throw new DestinationValidationError('invalid_members');
  }

  private async writeMembersTx(db: Database, listId: string, memberIds: string[]): Promise<void> {
    await db.run(`DELETE FROM packing_list_members WHERE packing_list_id = ?`, [listId]);
    for (const memberId of memberIds) {
      await db.run(`INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [listId, memberId]);
    }
  }

  private async ensureParticipantsTx(db: Database, tripId: string, memberIds: string[]): Promise<void> {
    for (const userId of memberIds) {
      const existing = await db.get(`SELECT id FROM trip_participants WHERE trip_id = ? AND user_id = ?`, [tripId, userId]);
      if (existing) continue;
      const user = await db.get(`SELECT name, username FROM users WHERE id = ?`, [userId]);
      await db.run(
        `INSERT INTO trip_participants (id, trip_id, user_id, display_name, created_at) VALUES (?, ?, ?, ?, datetime('now'))`,
        [uuidv4(), tripId, userId, user?.name || user?.username || 'Traveler']
      );
    }
  }
}
