import { describe, it, expect, beforeEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { getDb } from '../db';
import migration from '../migrations/migrations/20261124_01_lodging.cjs';

async function legacyDb(): Promise<Database> {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE trips (id TEXT PRIMARY KEY);
    CREATE TABLE trip_destinations (id TEXT PRIMARY KEY, trip_id TEXT, name TEXT);
    CREATE TABLE trip_participants (id TEXT PRIMARY KEY, trip_id TEXT, display_name TEXT);
    CREATE TABLE trip_elements (id TEXT PRIMARY KEY, trip_id TEXT, element_type TEXT, name TEXT, deleted_at TEXT);
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY, trip_id TEXT NOT NULL, confirmation_number TEXT,
      advertised_price_cash DECIMAL, advertised_price_points INTEGER, loyalty_program TEXT, notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE booking_links (booking_id TEXT NOT NULL, element_id TEXT NOT NULL, PRIMARY KEY (booking_id, element_id));
    CREATE TABLE hotel_element_details (
      element_id TEXT PRIMARY KEY, address TEXT, phone TEXT, website TEXT,
      check_in_date TEXT, check_in_time TEXT, check_out_date TEXT, check_out_time TEXT,
      room_type TEXT, booking_source TEXT, advertised_price_cash DECIMAL, advertised_price_points INTEGER,
      advertised_loyalty_program TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO trips VALUES ('t1');
    INSERT INTO trip_elements VALUES ('h1', 't1', 'hotel', 'Casa', NULL);
    INSERT INTO trip_elements VALUES ('h2', 't1', 'hotel', 'Suite Inn', NULL);
    INSERT INTO trip_elements VALUES ('h3', 't1', 'hotel', 'Booked Already', NULL);
    INSERT INTO hotel_element_details (element_id, address, check_in_date, check_out_date, room_type, booking_source, advertised_price_cash, advertised_price_points, advertised_loyalty_program)
      VALUES ('h1', '1 Main', '2027-01-01', '2027-01-04', 'king', 'expedia', 500, NULL, 'Hilton Honors');
    INSERT INTO hotel_element_details (element_id, room_type) VALUES ('h2', 'Suite');
    INSERT INTO hotel_element_details (element_id) VALUES ('h3');
    INSERT INTO bookings (id, trip_id, confirmation_number) VALUES ('b3', 't1', 'XYZ');
    INSERT INTO booking_links VALUES ('b3', 'h3');
  `);
  return db;
}

const cols = async (db: Database, table: string) =>
  (await db.all(`PRAGMA table_info(${table})`)).map((c: { name: string }) => c.name);

describe('20261124_01_lodging migration', () => {
  let db: Database;
  beforeEach(async () => { db = await legacyDb(); });

  it('adds generic booking columns', async () => {
    await migration.up({ db });
    expect(await cols(db, 'bookings')).toEqual(expect.arrayContaining([
      'booking_site', 'site_itinerary_number', 'advertised_includes_taxes',
      'advertised_rate_cash', 'advertised_rate_points', 'due_at_booking_cash', 'due_at_booking_points',
      'due_later_cash', 'due_later_notes', 'refundability', 'cancel_by', 'cancellation_policy',
    ]));
  });

  it('rebuilds hotel details with destination and amenities, dropping legacy columns', async () => {
    await migration.up({ db });
    const c = await cols(db, 'hotel_element_details');
    expect(c).toEqual(expect.arrayContaining(['destination_id', 'amenities', 'other_amenities', 'address']));
    expect(c).not.toContain('room_type');
    expect(c).not.toContain('booking_source');
    expect(await db.get('SELECT address, amenities FROM hotel_element_details WHERE element_id = ?', ['h1']))
      .toEqual({ address: '1 Main', amenities: '[]' });
  });

  it('creates room, room traveler and coupon tables and no lodging_room_details', async () => {
    await migration.up({ db });
    const tables = (await db.all(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((r: { name: string }) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['lodging_rooms', 'lodging_room_travelers', 'booking_coupons']));
    expect(tables).not.toContain('lodging_room_details');
  });

  it('backfills one booking per unbooked hotel from legacy columns', async () => {
    await migration.up({ db });
    const b1 = await db.get(
      `SELECT b.trip_id, b.booking_site, b.advertised_price_cash, b.loyalty_program
       FROM bookings b JOIN booking_links l ON l.booking_id = b.id WHERE l.element_id = 'h1'`);
    expect(b1).toEqual({ trip_id: 't1', booking_site: 'expedia', advertised_price_cash: 500, loyalty_program: 'Hilton Honors' });
    expect(await db.get(`SELECT COUNT(*) n FROM booking_links WHERE element_id = 'h2'`)).toEqual({ n: 1 });
    expect(await db.get(`SELECT COUNT(*) n FROM booking_links WHERE element_id = 'h3'`)).toEqual({ n: 1 });
    expect(await db.get(`SELECT booking_id FROM booking_links WHERE element_id = 'h3'`)).toEqual({ booking_id: 'b3' });
  });

  it('backfills a room from the legacy room type', async () => {
    await migration.up({ db });
    expect(await db.get(`SELECT room_type, description, beds, amenities, position FROM lodging_rooms WHERE element_id = 'h1'`))
      .toEqual({ room_type: 'other', description: 'king', beds: '[]', amenities: '[]', position: 0 });
    expect(await db.get(`SELECT room_type, description FROM lodging_rooms WHERE element_id = 'h2'`))
      .toEqual({ room_type: 'suite', description: null });
    expect(await db.get(`SELECT COUNT(*) n FROM lodging_rooms WHERE element_id = 'h3'`)).toEqual({ n: 0 });
  });

  it('is idempotent', async () => {
    await migration.up({ db });
    await migration.up({ db });
    expect(await db.get(`SELECT COUNT(*) n FROM booking_links WHERE element_id = 'h1'`)).toEqual({ n: 1 });
    expect(await db.get(`SELECT COUNT(*) n FROM lodging_rooms WHERE element_id = 'h1'`)).toEqual({ n: 1 });
  });

  it('is a no-op on the current schema from initializeDatabase', async () => {
    const current = await getDb();
    const before = await cols(current, 'hotel_element_details');
    const bookingBefore = await cols(current, 'bookings');
    await migration.up({ db: current });
    expect(await cols(current, 'hotel_element_details')).toEqual(before);
    expect(await cols(current, 'bookings')).toEqual(bookingBefore);
  });

  it('down restores the legacy hotel table and removes new tables and columns', async () => {
    await migration.up({ db });
    await migration.down({ db });
    const hotel = await cols(db, 'hotel_element_details');
    expect(hotel).toEqual(expect.arrayContaining(['room_type', 'booking_source', 'advertised_price_cash']));
    expect(hotel).not.toContain('destination_id');
    const tables = (await db.all(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((r: { name: string }) => r.name);
    expect(tables).not.toContain('lodging_rooms');
    expect(tables).not.toContain('lodging_room_travelers');
    expect(tables).not.toContain('booking_coupons');
    const booking = await cols(db, 'bookings');
    expect(booking).not.toContain('due_later_cash');
    expect(booking).not.toContain('booking_site');
    // backfilled bookings are left in place
    expect(await db.get(`SELECT COUNT(*) n FROM booking_links WHERE element_id = 'h1'`)).toEqual({ n: 1 });
  });

  it('migrates the original pre-lodging hotel table (no phone, website or times)', async () => {
    await db.exec(`
      DROP TABLE hotel_element_details;
      CREATE TABLE hotel_element_details (
        element_id TEXT PRIMARY KEY, address TEXT, check_in_date TEXT, check_out_date TEXT,
        room_type TEXT, booking_source TEXT, advertised_price_cash DECIMAL, advertised_price_points INTEGER,
        advertised_loyalty_program TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO hotel_element_details (element_id, address, check_in_date, check_out_date) VALUES ('h1', '1 Main', '2027-01-01', '2027-01-04');
    `);
    await migration.up({ db });
    expect(await db.get(`SELECT address, check_in_date, check_out_date FROM hotel_element_details WHERE element_id = 'h1'`))
      .toEqual({ address: '1 Main', check_in_date: '2027-01-01', check_out_date: '2027-01-04' });
  });
});
