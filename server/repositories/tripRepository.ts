import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';

export interface Trip {
  id: string;
  familyId: string;
  name: string;
  description?: string | null;
  tripType?: string | null;
  startDate: string | null;
  endDate: string | null;
  status?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export class TripRepository {
  async createTrip(familyId: string, trip: {
    name: string;
    description?: string;
    tripType?: string;
    startDate?: string | null;
    endDate?: string | null;
    status?: string;
  }): Promise<Trip> {
    const id = uuidv4();
    const db = await getDb();
    await db.run(
      `INSERT INTO trips (id, family_id, name, description, trip_type, start_date, end_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, familyId, trip.name, trip.description || null, trip.tripType || null, trip.startDate || null, trip.endDate || null, trip.status || null]
    );
    return this.getTripById(id) as Promise<Trip>;
  }

  async getTripById(tripId: string): Promise<Trip | undefined> {
    const db = await getDb();
    const row = await db.get(
      `SELECT id, family_id as familyId, name, description, trip_type as tripType, start_date as startDate, end_date as endDate, status, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt
       FROM trips WHERE id = ? AND deleted_at IS NULL`,
      [tripId]
    );
    return row as Trip | undefined;
  }

  async getTripsByFamily(familyId: string): Promise<Trip[]> {
    const db = await getDb();
    const rows = await db.all(
      `SELECT id, family_id as familyId, name, description, trip_type as tripType, start_date as startDate, end_date as endDate, status, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt
       FROM trips WHERE family_id = ? AND deleted_at IS NULL ORDER BY start_date DESC`,
      [familyId]
    );
    return rows as Trip[];
  }

  async updateTrip(tripId: string, updates: Partial<Trip>): Promise<Trip> {
    const db = await getDb();
    const dbUpdates: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      tripType: 'trip_type',
      startDate: 'start_date',
      endDate: 'end_date',
      status: 'status',
    };

    for (const [key, dbKey] of Object.entries(fieldMap)) {
      if (key in updates) {
        dbUpdates[dbKey] = (updates as any)[key] || null;
      }
    }

    if (Object.keys(dbUpdates).length === 0) {
      return this.getTripById(tripId) as Promise<Trip>;
    }

    const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(dbUpdates), tripId];
    await db.run(
      `UPDATE trips SET ${fields}, updated_at = datetime('now') WHERE id = ?`,
      values
    );
    return this.getTripById(tripId) as Promise<Trip>;
  }

  async deleteTrip(tripId: string): Promise<void> {
    const db = await getDb();
    await withTransaction(db, async () => {
      await db.run(
        `UPDATE trips SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [tripId]
      );
      // Every list belongs to its trip, so the lists go with it.
      await db.run(
        `UPDATE packing_lists SET deleted_at = datetime('now'), updated_at = datetime('now')
         WHERE deleted_at IS NULL AND id IN (SELECT packing_list_id FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL)`,
        [tripId]
      );
      await db.run(
        `UPDATE trip_destinations SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE trip_id = ? AND deleted_at IS NULL`,
        [tripId]
      );
    });
  }
}
