/*
  Migration: lodging rework. See docs/superpowers/specs/2026-11-26-lodging-booking-rework-design.md.
  Idempotent: fresh databases already get this schema from server/db.ts.
  The runner does not wrap migrations in a transaction, so this one manages its own.
*/
'use strict';
const { randomUUID } = require('crypto');

const BOOKING_COLUMNS = [
  ['booking_site', 'TEXT'],
  ['site_itinerary_number', 'TEXT'],
  ['advertised_includes_taxes', 'INTEGER NOT NULL DEFAULT 0'],
  ['advertised_rate_cash', 'DECIMAL'],
  ['advertised_rate_points', 'INTEGER'],
  ['due_at_booking_cash', 'DECIMAL'],
  ['due_at_booking_points', 'INTEGER'],
  ['due_later_cash', 'DECIMAL'],
  ['due_later_notes', 'TEXT'],
  ['refundability', 'TEXT'],
  ['cancel_by', 'TEXT'],
  ['cancellation_policy', 'TEXT'],
];

const NEW_HOTEL_TABLE = `
  CREATE TABLE hotel_element_details (
    element_id TEXT PRIMARY KEY,
    address TEXT,
    phone TEXT,
    website TEXT,
    check_in_date TEXT,
    check_in_time TEXT,
    check_out_date TEXT,
    check_out_time TEXT,
    destination_id TEXT,
    amenities TEXT NOT NULL DEFAULT '[]',
    other_amenities TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE,
    FOREIGN KEY (destination_id) REFERENCES trip_destinations(id) ON DELETE SET NULL
  )`;

const LEGACY_HOTEL_TABLE = `
  CREATE TABLE hotel_element_details (
    element_id TEXT PRIMARY KEY,
    address TEXT,
    phone TEXT,
    website TEXT,
    check_in_date TEXT,
    check_in_time TEXT,
    check_out_date TEXT,
    check_out_time TEXT,
    room_type TEXT,
    booking_source TEXT,
    advertised_price_cash DECIMAL,
    advertised_price_points INTEGER,
    advertised_loyalty_program TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
  )`;

const ROOM_TABLES = `
  CREATE TABLE IF NOT EXISTS lodging_rooms (
    id TEXT PRIMARY KEY,
    element_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    room_type TEXT,
    beds TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    amenities TEXT NOT NULL DEFAULT '[]',
    other_amenities TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_lodging_rooms_element ON lodging_rooms(element_id);
  CREATE TABLE IF NOT EXISTS lodging_room_travelers (
    room_id TEXT NOT NULL,
    participant_id TEXT NOT NULL,
    PRIMARY KEY (room_id, participant_id),
    FOREIGN KEY (room_id) REFERENCES lodging_rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE RESTRICT
  );
  CREATE TABLE IF NOT EXISTS booking_coupons (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    code TEXT NOT NULL,
    savings_cash DECIMAL,
    savings_points INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_booking_coupons_booking ON booking_coupons(booking_id);
`;

const KNOWN_ROOM_TYPES = ['standard', 'suite', 'studio', '1br', '2br', '3br', 'other'];

async function columns(db, table) {
  return (await db.all(`PRAGMA table_info(${table})`)).map(c => c.name);
}

function mapRoomType(raw) {
  const value = (raw || '').trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (KNOWN_ROOM_TYPES.includes(lower)) return { roomType: lower, description: null };
  return { roomType: 'other', description: value };
}

async function up({ db }) {
  await db.exec('BEGIN');
  try {
    const bookingCols = await columns(db, 'bookings');
    for (const [name, type] of BOOKING_COLUMNS) {
      if (!bookingCols.includes(name)) await db.exec(`ALTER TABLE bookings ADD COLUMN ${name} ${type}`);
    }

    await db.exec(ROOM_TABLES);

    const hotelCols = await columns(db, 'hotel_element_details');
    if (hotelCols.includes('room_type')) {
      const legacy = await db.all(
        `SELECT h.element_id, h.room_type, h.booking_source, h.advertised_price_cash, h.advertised_price_points,
                h.advertised_loyalty_program, e.trip_id
         FROM hotel_element_details h JOIN trip_elements e ON e.id = h.element_id`);

      for (const row of legacy) {
        const linked = await db.get('SELECT booking_id FROM booking_links WHERE element_id = ? LIMIT 1', [row.element_id]);
        if (!linked) {
          const bookingId = randomUUID();
          await db.run(
            `INSERT INTO bookings (id, trip_id, booking_site, advertised_price_cash, advertised_price_points, loyalty_program)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [bookingId, row.trip_id, row.booking_source || null, row.advertised_price_cash ?? null,
              row.advertised_price_points ?? null, row.advertised_loyalty_program || null]);
          await db.run('INSERT INTO booking_links (booking_id, element_id) VALUES (?, ?)', [bookingId, row.element_id]);
        }
        const room = mapRoomType(row.room_type);
        const hasRoom = await db.get('SELECT id FROM lodging_rooms WHERE element_id = ? LIMIT 1', [row.element_id]);
        if (room && !hasRoom) {
          await db.run(
            `INSERT INTO lodging_rooms (id, element_id, position, room_type, description) VALUES (?, ?, 0, ?, ?)`,
            [randomUUID(), row.element_id, room.roomType, room.description]);
        }
      }

      await db.exec('ALTER TABLE hotel_element_details RENAME TO hotel_element_details_legacy');
      await db.exec(NEW_HOTEL_TABLE);
      const keep = ['element_id', 'address', 'phone', 'website', 'check_in_date', 'check_in_time',
        'check_out_date', 'check_out_time', 'created_at', 'updated_at'].filter(c => hotelCols.includes(c)).join(', ');
      await db.exec(
        `INSERT INTO hotel_element_details (${keep}) SELECT ${keep} FROM hotel_element_details_legacy`);
      await db.exec('DROP TABLE hotel_element_details_legacy');
    } else {
      if (!hotelCols.includes('amenities')) {
        await db.exec(`ALTER TABLE hotel_element_details ADD COLUMN amenities TEXT NOT NULL DEFAULT '[]'`);
      }
      if (!hotelCols.includes('other_amenities')) {
        await db.exec('ALTER TABLE hotel_element_details ADD COLUMN other_amenities TEXT');
      }
    }

    await db.exec('DROP TABLE IF EXISTS lodging_room_details');
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

async function down({ db }) {
  await db.exec('BEGIN');
  try {
    await db.exec('DROP TABLE IF EXISTS lodging_room_travelers');
    await db.exec('DROP TABLE IF EXISTS lodging_rooms');
    await db.exec('DROP INDEX IF EXISTS idx_booking_coupons_booking');
    await db.exec('DROP TABLE IF EXISTS booking_coupons');

    const hotelCols = await columns(db, 'hotel_element_details');
    if (hotelCols.includes('destination_id')) {
      await db.exec('ALTER TABLE hotel_element_details RENAME TO hotel_element_details_new');
      await db.exec(LEGACY_HOTEL_TABLE);
      await db.exec(
        `INSERT INTO hotel_element_details (element_id, address, phone, website, check_in_date, check_in_time,
                                            check_out_date, check_out_time, created_at, updated_at)
         SELECT element_id, address, phone, website, check_in_date, check_in_time,
                check_out_date, check_out_time, created_at, updated_at
         FROM hotel_element_details_new`);
      await db.exec('DROP TABLE hotel_element_details_new');
    }

    const bookingCols = await columns(db, 'bookings');
    for (const [name] of BOOKING_COLUMNS) {
      if (bookingCols.includes(name)) await db.exec(`ALTER TABLE bookings DROP COLUMN ${name}`);
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { up, down };
