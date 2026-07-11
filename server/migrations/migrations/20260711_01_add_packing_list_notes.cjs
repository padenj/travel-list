module.exports = {
  up: async ({ db }) => {
    const columns = await db.all(`PRAGMA table_info(packing_lists)`);
    const hasNotes = columns.some((column) => column.name === 'notes');
    if (hasNotes) return;

    await db.exec(`ALTER TABLE packing_lists ADD COLUMN notes TEXT;`);
  },

  down: async ({ db }) => {
    const columns = await db.all(`PRAGMA table_info(packing_lists)`);
    const hasNotes = columns.some((column) => column.name === 'notes');
    if (!hasNotes) return;

    await db.exec('PRAGMA foreign_keys = OFF');
    await db.exec('BEGIN');
    try {
      await db.exec(`
        CREATE TABLE packing_lists_new (
          id TEXT PRIMARY KEY,
          family_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          deleted_at TEXT,
          FOREIGN KEY (family_id) REFERENCES families(id)
        );
      `);

      await db.exec(`
        INSERT INTO packing_lists_new (id, family_id, name, created_at, updated_at, deleted_at)
        SELECT id, family_id, name, created_at, updated_at, deleted_at
        FROM packing_lists;
      `);

      await db.exec(`DROP TABLE packing_lists;`);
      await db.exec(`ALTER TABLE packing_lists_new RENAME TO packing_lists;`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_packing_lists_family ON packing_lists(family_id);`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_packing_lists_deleted ON packing_lists(deleted_at);`);
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
  }
};
