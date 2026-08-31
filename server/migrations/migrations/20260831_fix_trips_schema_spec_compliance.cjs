/*
  Migration: Fix trips schema to match spec compliance
  
  This migration corrects the previous trips schema (20260831_create_trips_schema.cjs) 
  to fully comply with the spec requirements:
  
  Changes:
  1. trips table: 'title' → 'name', add 'status' field
  2. Add missing trip_locations table
  3. trip_participants: simplified schema (id, trip_id, user_id, display_name, created_at)
  4. trip_elements: move pricing fields to elements table, remove trip_element_pricing table
  5. flight_legs: use single datetime columns, add airline, seat_numbers fields
  6. Type-specific tables: use element_id as PRIMARY KEY (one-to-one relationships)
  7. hotel_element_details: correct column names and set
  8. car_rental_element_details: correct column names (pickup/dropoff_datetime, etc.)
  9. activity_element_details: add venue_name, activity_date, activity_time, ticket_type, num_tickets
  10. trip_element_attachments: correct column names (filename, mime_type, file_path, file_size)
  11. Remove trip_element_pricing table entirely
  
  Total: 9 tables created per spec
*/

module.exports.up = async function up({ db }) {
  // First, drop the old incorrect schema in reverse order
  await db.exec(`DROP INDEX IF EXISTS idx_trip_participants_family_member;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_participants_trip;`);
  await db.exec(`DROP TABLE IF EXISTS trip_participants;`);

  await db.exec(`DROP INDEX IF EXISTS idx_trip_packing_lists_packing_list;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_packing_lists_trip;`);
  await db.exec(`DROP TABLE IF EXISTS trip_packing_lists;`);

  await db.exec(`DROP INDEX IF EXISTS idx_activity_element_details_element;`);
  await db.exec(`DROP TABLE IF EXISTS activity_element_details;`);

  await db.exec(`DROP INDEX IF EXISTS idx_car_rental_element_details_element;`);
  await db.exec(`DROP TABLE IF EXISTS car_rental_element_details;`);

  await db.exec(`DROP INDEX IF EXISTS idx_hotel_element_details_element;`);
  await db.exec(`DROP TABLE IF EXISTS hotel_element_details;`);

  await db.exec(`DROP INDEX IF EXISTS idx_flight_legs_element;`);
  await db.exec(`DROP TABLE IF EXISTS flight_legs;`);

  await db.exec(`DROP INDEX IF EXISTS idx_trip_element_attachments_element;`);
  await db.exec(`DROP TABLE IF EXISTS trip_element_attachments;`);

  await db.exec(`DROP INDEX IF EXISTS idx_trip_element_pricing_element;`);
  await db.exec(`DROP TABLE IF EXISTS trip_element_pricing;`);

  await db.exec(`DROP INDEX IF EXISTS idx_trip_element_confirmations_element;`);
  await db.exec(`DROP TABLE IF EXISTS trip_element_confirmations;`);

  await db.exec(`DROP INDEX IF EXISTS idx_trip_elements_deleted;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_elements_type;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_elements_trip;`);
  await db.exec(`DROP TABLE IF EXISTS trip_elements;`);

  await db.exec(`DROP INDEX IF EXISTS idx_trips_deleted;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trips_family;`);
  await db.exec(`DROP TABLE IF EXISTS trips;`);

  // Now create the correct schema per spec

  // 1. Create trips table (with 'name' not 'title', and 'status' field)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      trip_type TEXT,
      start_date TEXT,
      end_date TEXT,
      status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trips_family ON trips(family_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trips_deleted ON trips(deleted_at);`);

  // 2. Create trip_locations table (missing in previous migration)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trip_locations (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      name TEXT NOT NULL,
      order_position INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_locations_trip ON trip_locations(trip_id);`);

  // 3. Create trip_participants table (corrected schema)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trip_participants (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      user_id TEXT,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_participants_trip ON trip_participants(trip_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_participants_user ON trip_participants(user_id);`);

  // 4. Create trip_packing_lists junction table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trip_packing_lists (
      trip_id TEXT NOT NULL,
      packing_list_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (trip_id, packing_list_id),
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_packing_lists_trip ON trip_packing_lists(trip_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_packing_lists_packing_list ON trip_packing_lists(packing_list_id);`);

  // 5. Create trip_elements table (corrected schema with pricing fields)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trip_elements (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      element_type TEXT NOT NULL,
      name TEXT NOT NULL,
      booking_reference TEXT,
      booking_url TEXT,
      price_cash DECIMAL,
      price_points INTEGER,
      loyalty_program TEXT,
      total_cash DECIMAL,
      total_points INTEGER,
      notes TEXT,
      sort_position INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_elements_trip ON trip_elements(trip_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_elements_type ON trip_elements(element_type);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_elements_deleted ON trip_elements(deleted_at);`);

  // 6. Create trip_element_confirmations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trip_element_confirmations (
      id TEXT PRIMARY KEY,
      element_id TEXT NOT NULL,
      leg_id TEXT,
      participant_id TEXT,
      confirmation_number TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE,
      FOREIGN KEY (leg_id) REFERENCES flight_legs(id),
      FOREIGN KEY (participant_id) REFERENCES trip_participants(id)
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_element_confirmations_element ON trip_element_confirmations(element_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_element_confirmations_leg ON trip_element_confirmations(leg_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_element_confirmations_participant ON trip_element_confirmations(participant_id);`);

  // 7. Create trip_element_attachments table (corrected column names)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trip_element_attachments (
      id TEXT PRIMARY KEY,
      element_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      file_path TEXT,
      file_size INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_element_attachments_element ON trip_element_attachments(element_id);`);

  // 8. Create flight_legs table (corrected schema)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS flight_legs (
      id TEXT PRIMARY KEY,
      element_id TEXT NOT NULL,
      leg_order INTEGER,
      departure_airport TEXT NOT NULL,
      departure_datetime TEXT NOT NULL,
      arrival_airport TEXT NOT NULL,
      arrival_datetime TEXT NOT NULL,
      airline TEXT,
      flight_number TEXT,
      seat_numbers TEXT,
      price_cash DECIMAL,
      price_points INTEGER,
      loyalty_program TEXT,
      confirmation_number TEXT,
      check_price_url TEXT,
      layover_minutes_after INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_flight_legs_element ON flight_legs(element_id);`);

  // 9. Create hotel_element_details table (corrected schema, one-to-one with element_id as PK)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS hotel_element_details (
      element_id TEXT PRIMARY KEY,
      address TEXT,
      check_in_date TEXT,
      check_out_date TEXT,
      room_type TEXT,
      booking_source TEXT,
      advertised_price_cash DECIMAL,
      advertised_price_points INTEGER,
      advertised_loyalty_program TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );
  `);

  // 10. Create car_rental_element_details table (corrected schema, one-to-one with element_id as PK)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS car_rental_element_details (
      element_id TEXT PRIMARY KEY,
      rental_company TEXT,
      car_size TEXT,
      pickup_location TEXT,
      pickup_datetime TEXT,
      dropoff_location TEXT,
      dropoff_datetime TEXT,
      prepaid_price DECIMAL,
      at_counter_price DECIMAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );
  `);

  // 11. Create activity_element_details table (corrected schema, one-to-one with element_id as PK)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS activity_element_details (
      element_id TEXT PRIMARY KEY,
      venue_name TEXT,
      activity_date TEXT,
      activity_time TEXT,
      num_tickets INTEGER,
      ticket_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (element_id) REFERENCES trip_elements(id) ON DELETE CASCADE
    );
  `);
};

module.exports.down = async function down({ db }) {
  // Drop tables in reverse order of creation
  await db.exec(`DROP TABLE IF EXISTS activity_element_details;`);
  await db.exec(`DROP TABLE IF EXISTS car_rental_element_details;`);
  await db.exec(`DROP TABLE IF EXISTS hotel_element_details;`);
  await db.exec(`DROP TABLE IF EXISTS flight_legs;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_element_attachments_element;`);
  await db.exec(`DROP TABLE IF EXISTS trip_element_attachments;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_element_confirmations_participant;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_element_confirmations_leg;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_element_confirmations_element;`);
  await db.exec(`DROP TABLE IF EXISTS trip_element_confirmations;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_elements_deleted;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_elements_type;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_elements_trip;`);
  await db.exec(`DROP TABLE IF EXISTS trip_elements;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_packing_lists_packing_list;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_packing_lists_trip;`);
  await db.exec(`DROP TABLE IF EXISTS trip_packing_lists;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_participants_user;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_participants_trip;`);
  await db.exec(`DROP TABLE IF EXISTS trip_participants;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trip_locations_trip;`);
  await db.exec(`DROP TABLE IF EXISTS trip_locations;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trips_deleted;`);
  await db.exec(`DROP INDEX IF EXISTS idx_trips_family;`);
  await db.exec(`DROP TABLE IF EXISTS trips;`);
};
