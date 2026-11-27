import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import migration from '../migrations/migrations/20261127_01_payment_methods.cjs';

async function baseDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE families (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, trip_id TEXT);
    CREATE TABLE booking_transactions (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      amount_cash DECIMAL NOT NULL DEFAULT 0,
      amount_points INTEGER NOT NULL DEFAULT 0,
      transaction_date TEXT NOT NULL,
      confirmation_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );
    INSERT INTO families VALUES ('f1', 'Fam');
    INSERT INTO bookings VALUES ('b1', 't1');
    INSERT INTO booking_transactions (id, booking_id, amount_cash, transaction_date) VALUES ('x1', 'b1', 10, '2027-01-01');
  `);
  return db;
}

const cols = async (db: Database, table: string) =>
  (await db.all(`PRAGMA table_info(${table})`)).map((c: { name: string }) => c.name);

describe('20261127_01_payment_methods migration', () => {
  let db: Database;
  beforeEach(async () => { db = await baseDb(); });

  it('creates payment_methods and links transactions', async () => {
    await migration.up({ db });
    expect(await cols(db, 'payment_methods')).toEqual(['id', 'family_id', 'nickname', 'archived_at', 'created_at', 'updated_at']);
    expect(await cols(db, 'booking_transactions')).toContain('payment_method_id');
    await db.run(`INSERT INTO payment_methods (id, family_id, nickname) VALUES ('pm1', 'f1', 'Visa')`);
    await db.run(`UPDATE booking_transactions SET payment_method_id = 'pm1' WHERE id = 'x1'`);
    await expect(db.run(`UPDATE booking_transactions SET payment_method_id = 'nope' WHERE id = 'x1'`)).rejects.toThrow(/FOREIGN KEY/);
  });

  it('is idempotent', async () => {
    await migration.up({ db });
    await migration.up({ db });
    expect(await cols(db, 'booking_transactions')).toContain('payment_method_id');
  });

  it('down removes the column (keeping rows) and the table', async () => {
    await migration.up({ db });
    await migration.down({ db });
    expect(await cols(db, 'booking_transactions')).not.toContain('payment_method_id');
    expect((await db.get(`SELECT amount_cash FROM booking_transactions WHERE id = 'x1'`)).amount_cash).toBe(10);
    expect(await db.get(`SELECT name FROM sqlite_master WHERE name = 'payment_methods'`)).toBeUndefined();
    const fks = await db.all(`PRAGMA foreign_key_list(booking_transactions)`);
    expect(fks.map((f: { table: string }) => f.table)).toEqual(['bookings']);
  });
});
