module.exports = {
  up: async ({ db }) => {
    // For each (template_id, category_id), insert all non-deleted items in that
    // category into template_items, deduping via INSERT OR IGNORE.
    let pairs = [];
    try {
      pairs = await db.all(`SELECT template_id, category_id FROM template_categories`);
    } catch (e) {
      if (e && typeof e === 'object' && 'message' in e && String(e.message).includes('no such table')) {
        // table already dropped; nothing to migrate
        pairs = [];
      } else {
        throw e;
      }
    }
    for (const { template_id, category_id } of pairs) {
      const items = await db.all(
        `SELECT id FROM items WHERE categoryId = ? AND deleted_at IS NULL`,
        [category_id]
      );
      for (const it of items) {
        await db.run(
          `INSERT OR IGNORE INTO template_items (template_id, item_id) VALUES (?, ?)`,
          [template_id, it.id]
        );
      }
    }

    // Category assignment is removed from item groups entirely.
    await db.exec(`DROP TABLE IF EXISTS template_categories;`);
    // Clean up the orphaned duplicate table from the earlier incomplete rename.
    await db.exec(`DROP TABLE IF EXISTS item_group_categories;`);
  },

  // NOTE: This migration is intentionally NOT losslessly reversible. The original
  // mapping of which items came from which category is discarded. down() only
  // recreates the (empty) tables so the schema shape can be restored.
  down: async ({ db }) => {
    await db.exec(`CREATE TABLE IF NOT EXISTS template_categories (
      template_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      PRIMARY KEY (template_id, category_id)
    );`);
    await db.exec(`CREATE TABLE IF NOT EXISTS item_group_categories (
      item_group_id TEXT NOT NULL,
      category_id TEXT NOT NULL
    );`);
  }
};
