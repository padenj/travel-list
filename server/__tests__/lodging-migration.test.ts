import { describe, it, expect, beforeEach } from 'vitest';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { getDb } from '../db';
import migration from '../migrations/migrations/20261124_01_lodging.cjs';

async function legacyDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE trip_destinations (id TEXT PRIMARY KEY);
    CREATE TABLE trip_elements (id TEXT PRIMARY KEY, trip_id TEXT, element_type TEXT, name TEXT, notes TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, trip_id TEXT, current_confirmation TEXT,
      advertised_price_cash REAL, advertised_price_points INTEGER);
    CREATE TABLE hotel_element_details (
      element_id TEXT PRIMARY KEY, address TEXT, check_in_date TEXT, check_out_date TEXT,
      room_type TEXT, booking_source TEXT, advertised_price_cash REAL, advertised_price_points INTEGER,
      advertised_loyalty_program TEXT, created_at TEXT, updated_at TEXT);
    INSERT INTO trip_elements VALUES ('h1','t1','hotel','Hotel A',NULL);
    INSERT INTO hotel_element_details VALUES ('h1','1 Main St','2027-01-01','2027-01-03','king','expedia',500,NULL,NULL,'2026-01-01','2026-01-02');
  `);
  return db;
}

async function columns(db: Database, table: string): Promise<string[]> {
  return (await db.all(`PRAGMA table_info(${table})`)).map((c: any) => c.name);
}

describe('20261124_01_lodging migration', () => {
  let db: Database;
  beforeEach(async () => { db = await legacyDb(); });

  it('adds booking columns, rebuilds hotel details and creates room/coupon tables', async () => {
    await migration.up({ db });
    expect(await columns(db, 'bookings')).toEqual(
      expect.arrayContaining(['booking_site', 'site_itinerary_number', 'advertised_includes_taxes']));
    const hotelCols = await columns(db, 'hotel_element_details');
    expect(hotelCols).toEqual(expect.arrayContaining(
      ['element_id', 'address', 'phone', 'website', 'check_in_date', 'check_in_time',
       'check_out_date', 'check_out_time', 'destination_id', 'created_at', 'updated_at']));
    expect(hotelCols).not.toContain('room_type');
    expect(hotelCols).not.toContain('advertised_price_cash');
    const row = await db.get('SELECT * FROM hotel_element_details WHERE element_id = ?', ['h1']);
    expect(row).toMatchObject({ address: '1 Main St', check_in_date: '2027-01-01', check_out_date: '2027-01-03', created_at: '2026-01-01' });
    expect(await columns(db, 'lodging_room_details')).toEqual(expect.arrayContaining(
      ['booking_id', 'room_type', 'beds', 'room_description', 'amenities', 'other_amenities',
       'refundability', 'cancel_by', 'cancellation_policy']));
    expect(await columns(db, 'booking_coupons')).toEqual(expect.arrayContaining(
      ['id', 'booking_id', 'code', 'savings_cash', 'savings_points', 'notes', 'position']));
  });

  it('is idempotent', async () => {
    await migration.up({ db });
    await expect(migration.up({ db })).resolves.not.toThrow();
    expect(await db.get('SELECT COUNT(*) AS n FROM hotel_element_details')).toEqual({ n: 1 });
  });

  it('rebuilds an empty legacy hotel table', async () => {
    await db.exec('DELETE FROM hotel_element_details');
    await migration.up({ db });
    expect(await columns(db, 'hotel_element_details')).toContain('destination_id');
    expect(await db.get('SELECT COUNT(*) AS n FROM hotel_element_details')).toEqual({ n: 0 });
  });

  it('is a no-op on the current schema from initializeDatabase', async () => {
    const current = await getDb();
    const before = await columns(current, 'hotel_element_details');
    await migration.up({ db: current });
    expect(await columns(current, 'hotel_element_details')).toEqual(before);
  });

  it('down restores the old hotel table shape and keeps shared columns', async () => {
    await migration.up({ db });
    await migration.down({ db });
    expect(await columns(db, 'hotel_element_details')).toEqual(expect.arrayContaining(
      ['room_type', 'booking_source', 'advertised_price_cash', 'advertised_loyalty_program']));
    expect(await db.get('SELECT address, check_in_date FROM hotel_element_details WHERE element_id = ?', ['h1']))
      .toEqual({ address: '1 Main St', check_in_date: '2027-01-01' });
  });

  it('down reverses the booking columns and new tables', async () => {
    await migration.up({ db });
    await migration.down({ db });
    expect(await columns(db, 'bookings')).not.toContain('booking_site');
    const tables = (await db.all(`SELECT name FROM sqlite_master WHERE type='table'`)).map((t: any) => t.name);
    expect(tables).not.toContain('lodging_room_details');
    expect(tables).not.toContain('booking_coupons');
  });
});
