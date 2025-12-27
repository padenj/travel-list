/*
  Migration: Add packing_list_members join table and backfill existing lists
  - Creates packing_list_members(packing_list_id, member_id)
  - Foreign key packing_list_id -> packing_lists(id) ON DELETE CASCADE
  - Foreign key member_id -> users(id)
  - Backfills each existing packing list with users from the same family
*/
module.exports.up = async function up(db) {
  // Create table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS packing_list_members (
      packing_list_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      PRIMARY KEY (packing_list_id, member_id),
      FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES users(id)
    );
  `);

  // Create indexes for faster lookups
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_plm_packing_list_id ON packing_list_members(packing_list_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_plm_member_id ON packing_list_members(member_id);`);

  // Backfill: for each packing list, insert rows for users whose family_id matches the packing_list.family_id
  // Note: use a single SQL statement where possible; SQLite supports INSERT ... SELECT
  await db.exec(`
    INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id)
    SELECT pl.id AS packing_list_id, u.id AS member_id
    FROM packing_lists pl
    JOIN users u ON u.family_id = pl.family_id
    WHERE u.deleted_at IS NULL;
  `);
};

module.exports.down = async function down(db) {
  await db.exec(`DROP INDEX IF EXISTS idx_plm_member_id;`);
  await db.exec(`DROP INDEX IF EXISTS idx_plm_packing_list_id;`);
  await db.exec(`DROP TABLE IF EXISTS packing_list_members;`);
};
