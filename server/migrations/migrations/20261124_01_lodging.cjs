/*
  Migration: lodging tracking. See docs/superpowers/specs/2026-11-24-lodging-tracking-design.md.
  Idempotent: fresh databases already get this schema from server/db.ts.
  The runner does not wrap migrations in a transaction, so this one manages its own.
*/
async function columnNames(db, table) {
  const rows = await db.all(`PRAGMA table_info(${table})`);
  return rows.map(r => r.name);
}

async function up({ db }) {
  await db.exec('BEGIN');
  try {
    const bookingCols = await columnNames(db, 'bookings');
    if (!bookingCols.includes('booking_site')) await db.exec('ALTER TABLE bookings ADD COLUMN booking_site TEXT');
    if (!bookingCols.includes('site_itinerary_number')) await db.exec('ALTER TABLE bookings ADD COLUMN site_itinerary_number TEXT');
    if (!bookingCols.includes('advertised_includes_taxes')) {
      await db.exec('ALTER TABLE bookings ADD COLUMN advertised_includes_taxes INTEGER NOT NULL DEFAULT 0');
    }

    const hotelCols = await columnNames(db, 'hotel_element_details');
    if (!hotelCols.includes('destination_id')) {
      await db.exec(`
        CREATE TABLE hotel_element_details_new (
          element_id TEXT PRIMARY KEY REFERENCES trip_elements(id) ON DELETE CASCADE,
          address TEXT,
          phone TEXT,
          website TEXT,
          check_in_date TEXT,
          check_in_time TEXT,
          check_out_date TEXT,
          check_out_time TEXT,
          destination_id TEXT REFERENCES trip_destinations(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`);
      if (hotelCols.length > 0) {
        await db.exec(`
          INSERT INTO hotel_element_details_new (element_id, address, check_in_date, check_out_date, created_at, updated_at)
          SELECT element_id, address, check_in_date, check_out_date, created_at, updated_at FROM hotel_element_details`);
        await db.exec('DROP TABLE hotel_element_details');
      }
      await db.exec('ALTER TABLE hotel_element_details_new RENAME TO hotel_element_details');
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS lodging_room_details (
        booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
        room_type TEXT,
        beds TEXT,
        room_description TEXT,
        amenities TEXT,
        other_amenities TEXT,
        refundability TEXT,
        cancel_by TEXT,
        cancellation_policy TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS booking_coupons (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        code TEXT NOT NULL,
        savings_cash DECIMAL,
        savings_points INTEGER,
        notes TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_booking_coupons_booking ON booking_coupons(booking_id);
    `);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

async function down({ db }) {
  await db.exec('BEGIN');
  try {
    await db.exec('DROP INDEX IF EXISTS idx_booking_coupons_booking');
    await db.exec('DROP TABLE IF EXISTS booking_coupons');
    await db.exec('DROP TABLE IF EXISTS lodging_room_details');
    const bookingCols = await columnNames(db, 'bookings');
    for (const col of ['booking_site', 'site_itinerary_number', 'advertised_includes_taxes']) {
      if (bookingCols.includes(col)) await db.exec(`ALTER TABLE bookings DROP COLUMN ${col}`);
    }
    const hotelCols = await columnNames(db, 'hotel_element_details');
    if (hotelCols.includes('destination_id')) {
      await db.exec(`
        CREATE TABLE hotel_element_details_old (
          element_id TEXT PRIMARY KEY REFERENCES trip_elements(id) ON DELETE CASCADE,
          address TEXT,
          check_in_date TEXT,
          check_out_date TEXT,
          room_type TEXT,
          booking_source TEXT,
          advertised_price_cash DECIMAL,
          advertised_price_points INTEGER,
          advertised_loyalty_program TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO hotel_element_details_old (element_id, address, check_in_date, check_out_date, created_at, updated_at)
          SELECT element_id, address, check_in_date, check_out_date, created_at, updated_at FROM hotel_element_details;
        DROP TABLE hotel_element_details;
        ALTER TABLE hotel_element_details_old RENAME TO hotel_element_details;
      `);
    }
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { up, down };
