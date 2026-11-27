import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { BedCount, RoomAmenity, RoomType, blankToNull, parseJsonArray } from './bookingRepository';

export interface LodgingRoom {
  id: string;
  elementId: string;
  position: number;
  roomType: RoomType | null;
  beds: BedCount[];
  description: string | null;
  amenities: RoomAmenity[];
  otherAmenities: string | null;
  travelerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RoomInput {
  roomType?: RoomType | null;
  beds?: BedCount[];
  description?: string | null;
  amenities?: RoomAmenity[];
  otherAmenities?: string | null;
  travelerIds?: string[];
}

export class RoomConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomConflictError';
  }
}

function rowToRoom(r: any, travelerIds: string[]): LodgingRoom {
  return {
    id: r.id, elementId: r.element_id, position: r.position, roomType: r.room_type ?? null,
    beds: parseJsonArray(r.beds), description: r.description ?? null,
    amenities: parseJsonArray(r.amenities), otherAmenities: r.other_amenities ?? null,
    travelerIds, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

async function travelersFor(db: Database, roomId: string): Promise<string[]> {
  const rows = await db.all<{ participant_id: string }[]>(
    'SELECT participant_id FROM lodging_room_travelers WHERE room_id = ? ORDER BY rowid', [roomId]);
  return rows.map(r => r.participant_id);
}

export async function listRoomsForElement(db: Database, elementId: string): Promise<LodgingRoom[]> {
  const rows = await db.all('SELECT * FROM lodging_rooms WHERE element_id = ? ORDER BY position, created_at, id', [elementId]);
  const rooms: LodgingRoom[] = [];
  for (const r of rows) rooms.push(rowToRoom(r, await travelersFor(db, r.id)));
  return rooms;
}

export class LodgingRoomRepository {
  private db = getDb();

  async getRoom(id: string): Promise<LodgingRoom | null> {
    const db = await this.db;
    const r = await db.get('SELECT * FROM lodging_rooms WHERE id = ?', [id]);
    return r ? rowToRoom(r, await travelersFor(db, id)) : null;
  }

  async createRoom(elementId: string, input: RoomInput): Promise<LodgingRoom> {
    const db = await this.db;
    const id = uuidv4();
    await withTransaction(db, async () => {
      await this.assertNoConflict(db, elementId, input.travelerIds ?? [], null);
      const { next } = (await db.get<{ next: number }>(
        'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM lodging_rooms WHERE element_id = ?', [elementId]))!;
      await db.run(
        `INSERT INTO lodging_rooms (id, element_id, position, room_type, beds, description, amenities, other_amenities)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, elementId, next, input.roomType ?? null, JSON.stringify(input.beds ?? []), blankToNull(input.description),
          JSON.stringify(input.amenities ?? []), blankToNull(input.otherAmenities)]);
      await this.writeTravelers(db, id, input.travelerIds ?? []);
    });
    return (await this.getRoom(id))!;
  }

  async updateRoom(id: string, input: RoomInput): Promise<LodgingRoom> {
    const db = await this.db;
    await withTransaction(db, async () => {
      const existing = await db.get<{ element_id: string }>('SELECT element_id FROM lodging_rooms WHERE id = ?', [id]);
      if (!existing) throw new Error('Room not found');
      if (input.travelerIds !== undefined) await this.assertNoConflict(db, existing.element_id, input.travelerIds, id);
      const sets: string[] = [];
      const values: unknown[] = [];
      if ('roomType' in input) { sets.push('room_type = ?'); values.push(input.roomType ?? null); }
      if ('beds' in input) { sets.push('beds = ?'); values.push(JSON.stringify(input.beds ?? [])); }
      if ('description' in input) { sets.push('description = ?'); values.push(blankToNull(input.description)); }
      if ('amenities' in input) { sets.push('amenities = ?'); values.push(JSON.stringify(input.amenities ?? [])); }
      if ('otherAmenities' in input) { sets.push('other_amenities = ?'); values.push(blankToNull(input.otherAmenities)); }
      sets.push(`updated_at = datetime('now')`);
      await db.run(`UPDATE lodging_rooms SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
      if (input.travelerIds !== undefined) await this.writeTravelers(db, id, input.travelerIds);
    });
    return (await this.getRoom(id))!;
  }

  async deleteRoom(id: string): Promise<void> {
    const db = await this.db;
    await withTransaction(db, async () => {
      await db.run('DELETE FROM lodging_room_travelers WHERE room_id = ?', [id]);
      await db.run('DELETE FROM lodging_rooms WHERE id = ?', [id]);
    });
  }

  private async writeTravelers(db: Database, roomId: string, travelerIds: string[]): Promise<void> {
    await db.run('DELETE FROM lodging_room_travelers WHERE room_id = ?', [roomId]);
    for (const pid of new Set(travelerIds)) {
      await db.run('INSERT INTO lodging_room_travelers (room_id, participant_id) VALUES (?, ?)', [roomId, pid]);
    }
  }

  private async assertNoConflict(db: Database, elementId: string, travelerIds: string[], excludeRoomId: string | null) {
    if (travelerIds.length === 0) return;
    const marks = travelerIds.map(() => '?').join(', ');
    const hit = await db.get<{ name: string }>(
      `SELECT p.display_name AS name
         FROM lodging_room_travelers t
         JOIN lodging_rooms r ON r.id = t.room_id
         JOIN trip_participants p ON p.id = t.participant_id
        WHERE r.element_id = ? AND r.id != ? AND t.participant_id IN (${marks})
        ORDER BY p.display_name LIMIT 1`,
      [elementId, excludeRoomId ?? '', ...travelerIds]);
    if (hit) throw new RoomConflictError(`${hit.name} is already in another room of this stay`);
  }
}
