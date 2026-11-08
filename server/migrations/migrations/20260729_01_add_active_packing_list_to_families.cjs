'use strict';

module.exports = {
  up: async ({ db }) => {
    const columns = await db.all(`PRAGMA table_info(families)`);
    const hasColumn = columns.some((col) => col.name === 'active_packing_list_id');
    if (hasColumn) return;
    await db.exec(`ALTER TABLE families ADD COLUMN active_packing_list_id TEXT REFERENCES packing_lists(id) ON DELETE SET NULL`);
  },

  down: async ({ db }) => {
    // SQLite doesn't support DROP COLUMN on older versions; no-op
  },
};
