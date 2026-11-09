/*
  Migration: Add bookings, booking_links, booking_travelers, booking_transactions,
  and flight_traveler_seats tables.

  These support per-booking (PNR) tracking with per-person advertised pricing,
  many-to-many booking<->element and booking<->traveler relationships, an
  append-only transaction ledger for actual amounts paid, and per-traveler
  per-leg seat assignments. See docs/superpowers/specs/2026-08-31-flight-bookings-redesign-design.md.
*/

module.exports.up = async function up({ db }) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      confirmation_number TEXT,
      advertised_price_cash DECIMAL,
      advertised_price_points INTEGER,
      loyalty_program TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS booking_links (
      booking_id TEXT NOT NULL,
      element_id TEXT NOT NULL,
      PRIMARY KEY (booking_id, element_id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_booking_links_element ON booking_links(element_id);`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS booking_travelers (
      booking_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      PRIMARY KEY (booking_id, participant_id),
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE RESTRICT
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_booking_travelers_participant ON booking_travelers(participant_id);`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS booking_transactions (
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
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_booking_transactions_booking ON booking_transactions(booking_id);`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS flight_traveler_seats (
      id TEXT PRIMARY KEY,
      leg_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      seat_number TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (leg_id, participant_id),
      FOREIGN KEY (leg_id) REFERENCES flight_legs(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES trip_participants(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_flight_traveler_seats_leg ON flight_traveler_seats(leg_id);`);
};

module.exports.down = async function down({ db }) {
  await db.exec(`DROP INDEX IF EXISTS idx_flight_traveler_seats_leg;`);
  await db.exec(`DROP TABLE IF EXISTS flight_traveler_seats;`);
  await db.exec(`DROP INDEX IF EXISTS idx_booking_transactions_booking;`);
  await db.exec(`DROP TABLE IF EXISTS booking_transactions;`);
  await db.exec(`DROP INDEX IF EXISTS idx_booking_travelers_participant;`);
  await db.exec(`DROP TABLE IF EXISTS booking_travelers;`);
  await db.exec(`DROP INDEX IF EXISTS idx_booking_links_element;`);
  await db.exec(`DROP TABLE IF EXISTS booking_links;`);
  await db.exec(`DROP INDEX IF EXISTS idx_bookings_trip;`);
  await db.exec(`DROP TABLE IF EXISTS bookings;`);
};
