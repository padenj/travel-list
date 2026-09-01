import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';
import { BookingTransactionRepository } from './bookingTransactionRepository';
import { BookingRepository } from './bookingRepository';
import { TripParticipantRepository } from './tripParticipantRepository';
import { v4 as uuidv4 } from 'uuid';

describe('BookingTransactionRepository', () => {
  let repo: BookingTransactionRepository;
  let bookingId: string;
  let tripId: string;

  beforeEach(async () => {
    await getDb();
    repo = new BookingTransactionRepository();
    const bookingRepo = new BookingRepository();
    const participantRepo = new TripParticipantRepository();

    const db = await getDb();
    const familyId = uuidv4();
    tripId = uuidv4();
    const elementId = uuidv4();

    await db.run(
      'INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
      [familyId, 'Test Family']
    );
    await db.run(
      `INSERT INTO trips (id, family_id, name, start_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [tripId, familyId, 'Test Trip', '2026-06-01', '2026-06-10']
    );
    await db.run(
      `INSERT INTO trip_elements (id, trip_id, element_type, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [elementId, tripId, 'flight', 'Flight']
    );
    const participant = await participantRepo.createParticipant(tripId, { displayName: 'A' });
    const booking = await bookingRepo.createBooking(tripId, { elementIds: [elementId], travelerIds: [participant.id] });
    bookingId = booking.id;
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('addTransaction', () => {
    it('creates a transaction with cash amount and notes', async () => {
      const txn = await repo.addTransaction(bookingId, {
        amountCash: 78.98,
        transactionDate: '2026-01-15',
        notes: 'Fee breakdown: base $70 + taxes $8.98',
      });
      expect(txn.id).toBeDefined();
      expect(txn.bookingId).toBe(bookingId);
      expect(txn.amountCash).toBe(78.98);
      expect(txn.amountPoints).toBe(0);
      expect(txn.notes).toBe('Fee breakdown: base $70 + taxes $8.98');
    });

    it('creates a negative transaction with a new confirmation number for a price drop', async () => {
      const txn = await repo.addTransaction(bookingId, {
        amountCash: -10,
        transactionDate: '2026-02-01',
        confirmationNumber: 'REBOOKED123',
      });
      expect(txn.amountCash).toBe(-10);
      expect(txn.confirmationNumber).toBe('REBOOKED123');
    });

    it('defaults transactionDate to today when omitted', async () => {
      const txn = await repo.addTransaction(bookingId, { amountCash: 50 });
      expect(txn.transactionDate).toBeTruthy();
    });

    it('rejects a transaction with both cash and points as zero', async () => {
      await expect(repo.addTransaction(bookingId, { amountCash: 0, amountPoints: 0 })).rejects.toThrow(/amount/i);
    });
  });

  describe('getTransactionsForBooking', () => {
    it('returns transactions ordered by transaction_date then created_at', async () => {
      await repo.addTransaction(bookingId, { amountCash: 78.98, transactionDate: '2026-01-15' });
      await repo.addTransaction(bookingId, { amountCash: -10, transactionDate: '2026-02-01' });
      const txns = await repo.getTransactionsForBooking(bookingId);
      expect(txns).toHaveLength(2);
      expect(txns[0].transactionDate).toBe('2026-01-15');
      expect(txns[1].transactionDate).toBe('2026-02-01');
    });
  });

  describe('updateTransaction', () => {
    it('updates the amount and notes', async () => {
      const txn = await repo.addTransaction(bookingId, { amountCash: 78.98, transactionDate: '2026-01-15' });
      const updated = await repo.updateTransaction(txn.id, { amountCash: 79.5, notes: 'corrected' });
      expect(updated.amountCash).toBe(79.5);
      expect(updated.notes).toBe('corrected');
    });
  });

  describe('deleteTransaction', () => {
    it('removes a transaction', async () => {
      const txn = await repo.addTransaction(bookingId, { amountCash: 78.98, transactionDate: '2026-01-15' });
      await repo.deleteTransaction(txn.id);
      const txns = await repo.getTransactionsForBooking(bookingId);
      expect(txns).toEqual([]);
    });
  });
});
