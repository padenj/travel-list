/*
  Migration: add trip_destinations (one packing list per destination of a trip).
  See docs/superpowers/specs/2026-11-08-multi-destination-trips-design.md.
*/

module.exports.up = async function up({ db }) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS trip_destinations (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      packing_list_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id)
    );
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_trip_destinations_trip ON trip_destinations(trip_id);`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_destinations_list_active ON trip_destinations(packing_list_id) WHERE deleted_at IS NULL;`);
};

module.exports.down = async function down({ db }) {
  await db.exec(`DROP TABLE IF EXISTS trip_destinations;`);
};
