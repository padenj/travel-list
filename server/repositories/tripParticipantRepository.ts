import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface TripParticipant {
  id: string;
  tripId: string;
  userId: string | null;
  displayName: string;
  createdAt: string;
}

export class TripParticipantRepository {
  private db = getDb();

  async createParticipant(tripId: string, input: { displayName: string; userId?: string }): Promise<TripParticipant> {
    const id = uuidv4();
    const db = await this.db;
    await db.run(
      `INSERT INTO trip_participants (id, trip_id, user_id, display_name, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [id, tripId, input.userId || null, input.displayName]
    );
    return this.getParticipantById(id) as Promise<TripParticipant>;
  }

  async getParticipantsForTrip(tripId: string): Promise<TripParticipant[]> {
    const db = await this.db;
    const rows = await db.all(
      `SELECT id, trip_id as tripId, user_id as userId, display_name as displayName, created_at as createdAt
       FROM trip_participants WHERE trip_id = ? ORDER BY display_name ASC`,
      [tripId]
    );
    return rows as TripParticipant[];
  }

  async getParticipantById(id: string): Promise<TripParticipant | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, trip_id as tripId, user_id as userId, display_name as displayName, created_at as createdAt
       FROM trip_participants WHERE id = ?`,
      [id]
    );
    return (row as TripParticipant) || null;
  }

  async updateParticipant(id: string, updates: { displayName?: string; userId?: string | null }): Promise<TripParticipant> {
    const dbUpdates: Record<string, any> = {};
    if ('displayName' in updates) dbUpdates.display_name = updates.displayName;
    if ('userId' in updates) dbUpdates.user_id = updates.userId ?? null;

    if (Object.keys(dbUpdates).length > 0) {
      const db = await this.db;
      const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(dbUpdates), id];
      await db.run(`UPDATE trip_participants SET ${fields} WHERE id = ?`, values);
    }
    return this.getParticipantById(id) as Promise<TripParticipant>;
  }

  async deleteParticipant(id: string): Promise<void> {
    const db = await this.db;
    const bookingCount = await db.get(
      `SELECT COUNT(*) as count FROM booking_travelers WHERE participant_id = ?`,
      [id]
    );
    const seatCount = await db.get(
      `SELECT COUNT(*) as count FROM flight_traveler_seats WHERE participant_id = ?`,
      [id]
    );
    if ((bookingCount?.count || 0) > 0 || (seatCount?.count || 0) > 0) {
      throw new Error('Cannot delete participant: attached to one or more bookings or seat assignments');
    }
    await db.run(`DELETE FROM trip_participants WHERE id = ?`, [id]);
  }
}
