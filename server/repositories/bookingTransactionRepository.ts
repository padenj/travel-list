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
  paymentMethodId: string | null;
  paymentMethodNickname: string | null;
  createdAt: string;
}

export interface AddTransactionInput {
  amountCash?: number;
  amountPoints?: number;
  transactionDate?: string;
  confirmationNumber?: string;
  notes?: string;
  paymentMethodId?: string | null;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const TXN_SELECT = `
  SELECT t.id, t.booking_id as bookingId, t.amount_cash as amountCash, t.amount_points as amountPoints,
         t.transaction_date as transactionDate, t.confirmation_number as confirmationNumber, t.notes,
         t.payment_method_id as paymentMethodId, pm.nickname as paymentMethodNickname, t.created_at as createdAt
  FROM booking_transactions t
  LEFT JOIN payment_methods pm ON pm.id = t.payment_method_id`;

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
      `INSERT INTO booking_transactions (id, booking_id, amount_cash, amount_points, transaction_date, confirmation_number, notes, payment_method_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, bookingId, amountCash, amountPoints, input.transactionDate || todayIsoDate(),
       input.confirmationNumber || null, input.notes || null, input.paymentMethodId || null]
    );
    return this.getTransactionById(id) as Promise<BookingTransaction>;
  }

  async getTransactionsForBooking(bookingId: string): Promise<BookingTransaction[]> {
    const db = await this.db;
    const rows = await db.all(
      `${TXN_SELECT} WHERE t.booking_id = ? ORDER BY t.transaction_date ASC, t.created_at ASC`,
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
    paymentMethodId?: string | null;
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
      paymentMethodId: 'payment_method_id',
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

  async getTransactionById(id: string): Promise<BookingTransaction | null> {
    const db = await this.db;
    const row = await db.get(`${TXN_SELECT} WHERE t.id = ?`, [id]);
    return (row as BookingTransaction) || null;
  }
}
