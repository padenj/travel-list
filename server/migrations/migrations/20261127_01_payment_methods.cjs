/*
  Migration: payment methods. See docs/superpowers/specs/2026-11-27-price-entry-and-payment-methods-design.md.
  Idempotent: fresh databases already get this schema from server/db.ts.
*/
'use strict';

const columns = async (db, table) => (await db.all(`PRAGMA table_info(${table})`)).map(c => c.name);

async function up({ db }) {
  await db.exec('BEGIN');
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        archived_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_payment_methods_family ON payment_methods(family_id);
    `);
    if (!(await columns(db, 'booking_transactions')).includes('payment_method_id')) {
      await db.exec('ALTER TABLE booking_transactions ADD COLUMN payment_method_id TEXT REFERENCES payment_methods(id)');
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

// SQLite cannot DROP a column that is part of a foreign key, so rebuild booking_transactions.
async function down({ db }) {
  await db.exec('PRAGMA foreign_keys = OFF');
  await db.exec('BEGIN');
  try {
    if ((await columns(db, 'booking_transactions')).includes('payment_method_id')) {
      await db.exec(`
        CREATE TABLE booking_transactions_new (
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
        INSERT INTO booking_transactions_new (id, booking_id, amount_cash, amount_points, transaction_date, confirmation_number, notes, created_at)
          SELECT id, booking_id, amount_cash, amount_points, transaction_date, confirmation_number, notes, created_at FROM booking_transactions;
        DROP TABLE booking_transactions;
        ALTER TABLE booking_transactions_new RENAME TO booking_transactions;
        CREATE INDEX IF NOT EXISTS idx_booking_transactions_booking ON booking_transactions(booking_id);
      `);
    }
    await db.exec('DROP INDEX IF EXISTS idx_payment_methods_family');
    await db.exec('DROP TABLE IF EXISTS payment_methods');
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON');
  }
}

module.exports = { up, down };
