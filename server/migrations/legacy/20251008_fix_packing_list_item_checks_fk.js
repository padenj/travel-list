export default {
  name: '20251008_fix_packing_list_item_checks_fk.js',
  up: async ({ db }) => {
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS packing_list_item_checks_new (
        id TEXT PRIMARY KEY,
        packing_list_item_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        checked INTEGER DEFAULT 0,
        checked_at TEXT,
        FOREIGN KEY (packing_list_item_id) REFERENCES packing_list_items(id),
        FOREIGN KEY (member_id) REFERENCES users(id)
      );
    `);
    await db.exec(`INSERT INTO packing_list_item_checks_new (id, packing_list_item_id, member_id, checked, checked_at) SELECT id, packing_list_item_id, member_id, checked, checked_at FROM packing_list_item_checks`);
    await db.exec('DROP TABLE IF EXISTS packing_list_item_checks');
    await db.exec('ALTER TABLE packing_list_item_checks_new RENAME TO packing_list_item_checks');
    await db.exec('PRAGMA foreign_keys = ON');
  },
  down: async ({ db }) => {
    // NOTE: down migration attempts to restore previous schema but cannot recreate packing_list_items_old.
    // We'll create the old schema with the old FK to packing_list_items_old to allow a revert if needed.
    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec(`
      CREATE TABLE IF NOT EXISTS packing_list_item_checks_old (
        id TEXT PRIMARY KEY,
        packing_list_item_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        checked INTEGER DEFAULT 0,
        checked_at TEXT,
        FOREIGN KEY (packing_list_item_id) REFERENCES "packing_list_items_old"(id),
        FOREIGN KEY (member_id) REFERENCES users(id)
      );
    `);
    await db.exec(`INSERT INTO packing_list_item_checks_old (id, packing_list_item_id, member_id, checked, checked_at) SELECT id, packing_list_item_id, member_id, checked, checked_at FROM packing_list_item_checks`);
    await db.exec('DROP TABLE IF EXISTS packing_list_item_checks');
    await db.exec('ALTER TABLE packing_list_item_checks_old RENAME TO packing_list_item_checks');
    await db.exec('PRAGMA foreign_keys = ON');
  }
};
