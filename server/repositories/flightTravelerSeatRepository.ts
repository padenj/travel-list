import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface FlightTravelerSeat {
  id: string;
  legId: string;
  participantId: string;
  seatNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export class FlightTravelerSeatRepository {
  private db = getDb();

  async upsertSeat(legId: string, participantId: string, seatNumber: string): Promise<FlightTravelerSeat> {
    const db = await this.db;
    const existing = await db.get(
      `SELECT id FROM flight_traveler_seats WHERE leg_id = ? AND participant_id = ?`,
      [legId, participantId]
    );
    if (existing) {
      await db.run(
        `UPDATE flight_traveler_seats SET seat_number = ?, updated_at = datetime('now') WHERE id = ?`,
        [seatNumber, existing.id]
      );
      return this.getSeatById(existing.id) as Promise<FlightTravelerSeat>;
    }
    const id = uuidv4();
    await db.run(
      `INSERT INTO flight_traveler_seats (id, leg_id, participant_id, seat_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, legId, participantId, seatNumber]
    );
    return this.getSeatById(id) as Promise<FlightTravelerSeat>;
  }

  async getSeatsForLeg(legId: string): Promise<FlightTravelerSeat[]> {
    const db = await this.db;
    const rows = await db.all(
      `SELECT id, leg_id as legId, participant_id as participantId, seat_number as seatNumber, created_at as createdAt, updated_at as updatedAt
       FROM flight_traveler_seats WHERE leg_id = ?`,
      [legId]
    );
    return rows as FlightTravelerSeat[];
  }

  async deleteSeat(legId: string, participantId: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM flight_traveler_seats WHERE leg_id = ? AND participant_id = ?`, [legId, participantId]);
  }

  private async getSeatById(id: string): Promise<FlightTravelerSeat | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, leg_id as legId, participant_id as participantId, seat_number as seatNumber, created_at as createdAt, updated_at as updatedAt
       FROM flight_traveler_seats WHERE id = ?`,
      [id]
    );
    return (row as FlightTravelerSeat) || null;
  }
}
