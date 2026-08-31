import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface TripElementConfirmation {
  id: string;
  elementId: string;
  legId?: string | null;
  participantId?: string | null;
  confirmationNumber: string;
  label?: string | null;
  createdAt: string;
}

export class TripElementConfirmationRepository {
  private db = getDb();

  async addConfirmation(elementId: string, confirmation: {
    confirmationNumber: string;
    label?: string;
    legId?: string;
    participantId?: string;
  }): Promise<TripElementConfirmation> {
    const id = uuidv4();
    const db = await this.db;
    await db.run(
      `INSERT INTO trip_element_confirmations (id, element_id, leg_id, participant_id, confirmation_number, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, elementId, confirmation.legId || null, confirmation.participantId || null, 
       confirmation.confirmationNumber, confirmation.label || null]
    );
    return this.getConfirmationById(id) as Promise<TripElementConfirmation>;
  }

  async getConfirmationsForElement(elementId: string): Promise<TripElementConfirmation[]> {
    const db = await this.db;
    const rows = await db.all(
      `SELECT id, element_id as elementId, leg_id as legId, participant_id as participantId, 
              confirmation_number as confirmationNumber, label, created_at as createdAt
       FROM trip_element_confirmations WHERE element_id = ? ORDER BY created_at DESC`,
      [elementId]
    );
    return rows as TripElementConfirmation[];
  }

  async updateConfirmation(confirmationId: string, updates: Partial<TripElementConfirmation>): Promise<TripElementConfirmation> {
    const dbUpdates: Record<string, any> = {};
    const fieldMap: Record<string, string> = {
      confirmationNumber: 'confirmation_number',
      label: 'label',
      legId: 'leg_id',
      participantId: 'participant_id',
    };

    for (const [key, dbKey] of Object.entries(fieldMap)) {
      if (key in updates) {
        dbUpdates[dbKey] = (updates as any)[key] || null;
      }
    }

    if (Object.keys(dbUpdates).length === 0) {
      return this.getConfirmationById(confirmationId) as Promise<TripElementConfirmation>;
    }

    const db = await this.db;
    const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(dbUpdates), confirmationId];
    await db.run(
      `UPDATE trip_element_confirmations SET ${fields} WHERE id = ?`,
      values
    );
    return this.getConfirmationById(confirmationId) as Promise<TripElementConfirmation>;
  }

  async deleteConfirmation(confirmationId: string): Promise<void> {
    const db = await this.db;
    await db.run(
      `DELETE FROM trip_element_confirmations WHERE id = ?`,
      [confirmationId]
    );
  }

  private async getConfirmationById(id: string): Promise<TripElementConfirmation | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, element_id as elementId, leg_id as legId, participant_id as participantId, 
              confirmation_number as confirmationNumber, label, created_at as createdAt
       FROM trip_element_confirmations WHERE id = ?`,
      [id]
    );
    return row as TripElementConfirmation | null;
  }
}
