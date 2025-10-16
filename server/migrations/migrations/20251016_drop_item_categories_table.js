export default {
  name: '20251016_drop_item_categories_table.js',
  up: async ({ db }) => {
    // After migrating data into items.categoryId, drop the legacy item_categories table and its indexes
    await db.exec('PRAGMA foreign_keys = OFF');
    try {
      // Drop indices if they exist (ignore errors)
      try { await db.exec('DROP INDEX IF EXISTS idx_item_categories_item'); } catch (e) {}
      try { await db.exec('DROP INDEX IF EXISTS idx_item_categories_category'); } catch (e) {}
      // Drop the table
      try { await db.exec('DROP TABLE IF EXISTS item_categories'); } catch (e) {}
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
  },
  down: async ({ db }) => {
    // Recreate the legacy join table (empty) and indices to revert
    await db.exec('PRAGMA foreign_keys = OFF');
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS item_categories (item_id TEXT NOT NULL, category_id TEXT NOT NULL, PRIMARY KEY (item_id, category_id), FOREIGN KEY (item_id) REFERENCES items(id), FOREIGN KEY (category_id) REFERENCES categories(id))`);
      await db.exec('CREATE INDEX IF NOT EXISTS idx_item_categories_item ON item_categories(item_id)');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_item_categories_category ON item_categories(category_id)');
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
  }
};
