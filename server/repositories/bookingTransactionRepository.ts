import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface BookingTransaction {
  id: string;
  bookingId: string;
  amountCash: number;
  amountPoints: number;
  transactionDate: string;
  confirmationNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AddTransactionInput {
  amountCash?: number;
  amountPoints?: number;
  transactionDate?: string;
  confirmationNumber?: string;
  notes?: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export class BookingTransactionRepository {
  private db = getDb();

  async addTransaction(bookingId: string, input: AddTransactionInput): Promise<BookingTransaction> {
    const amountCash = input.amountCash ?? 0;
    const amountPoints = input.amountPoints ?? 0;
    if (amountCash === 0 && amountPoints === 0) {
      throw new Error('Transaction must have a non-zero amountCash or amountPoints');
    }
    const id = uuidv4();
    const db = await this.db;
    await db.run(
      `INSERT INTO booking_transactions (id, booking_id, amount_cash, amount_points, transaction_date, confirmation_number, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, bookingId, amountCash, amountPoints, input.transactionDate || todayIsoDate(),
       input.confirmationNumber || null, input.notes || null]
    );
    return this.getTransactionById(id) as Promise<BookingTransaction>;
  }

  async getTransactionsForBooking(bookingId: string): Promise<BookingTransaction[]> {
    const db = await this.db;
    const rows = await db.all(
      `SELECT id, booking_id as bookingId, amount_cash as amountCash, amount_points as amountPoints,
              transaction_date as transactionDate, confirmation_number as confirmationNumber, notes, created_at as createdAt
       FROM booking_transactions WHERE booking_id = ? ORDER BY transaction_date ASC, created_at ASC`,
      [bookingId]
    );
    return rows as BookingTransaction[];
  }

  async updateTransaction(id: string, updates: {
    amountCash?: number;
    amountPoints?: number;
    transactionDate?: string;
    confirmationNumber?: string | null;
    notes?: string | null;
  }): Promise<BookingTransaction> {
    if ('amountCash' in updates || 'amountPoints' in updates) {
      const existing = await this.getTransactionById(id);
      if (existing) {
        const finalCash = 'amountCash' in updates ? (updates.amountCash ?? 0) : existing.amountCash;
        const finalPoints = 'amountPoints' in updates ? (updates.amountPoints ?? 0) : existing.amountPoints;
        if (finalCash === 0 && finalPoints === 0) {
          throw new Error('Transaction must have a non-zero amountCash or amountPoints');
        }
      }
    }
    const fieldMap: Record<string, string> = {
      amountCash: 'amount_cash',
      amountPoints: 'amount_points',
      transactionDate: 'transaction_date',
      confirmationNumber: 'confirmation_number',
      notes: 'notes',
    };
    const dbUpdates: Record<string, any> = {};
    for (const [key, dbKey] of Object.entries(fieldMap)) {
      if (key in updates) dbUpdates[dbKey] = (updates as any)[key] ?? null;
    }
    if (Object.keys(dbUpdates).length > 0) {
      const db = await this.db;
      const fields = Object.keys(dbUpdates).map(k => `${k} = ?`).join(', ');
      const values = [...Object.values(dbUpdates), id];
      await db.run(`UPDATE booking_transactions SET ${fields} WHERE id = ?`, values);
    }
    return this.getTransactionById(id) as Promise<BookingTransaction>;
  }

  async deleteTransaction(id: string): Promise<void> {
    const db = await this.db;
    await db.run(`DELETE FROM booking_transactions WHERE id = ?`, [id]);
  }

  private async getTransactionById(id: string): Promise<BookingTransaction | null> {
    const db = await this.db;
    const row = await db.get(
      `SELECT id, booking_id as bookingId, amount_cash as amountCash, amount_points as amountPoints,
              transaction_date as transactionDate, confirmation_number as confirmationNumber, notes, created_at as createdAt
       FROM booking_transactions WHERE id = ?`,
      [id]
    );
    return (row as BookingTransaction) || null;
  }
}
