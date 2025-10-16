export default {
  name: '20251016_migrate_item_categories_to_items_categoryId.js',
  up: async ({ db }) => {
    // Migrate existing item_categories join rows into items.categoryId (pick the first category per item)
    await db.exec('PRAGMA foreign_keys = OFF');
    try {
      // For each item that has at least one entry in item_categories and no categoryId set on items,
      // set items.categoryId to one of the categories (the first by rowid).
      const rows = await db.all(`SELECT item_id, category_id FROM item_categories ORDER BY rowid`);
      const seen = new Set();
      for (const r of rows) {
        const itemId = r.item_id;
        const catId = r.category_id;
        if (seen.has(itemId)) continue;
        const item = await db.get(`SELECT categoryId FROM items WHERE id = ?`, [itemId]);
        if (item && !item.categoryId) {
          await db.run(`UPDATE items SET categoryId = ?, updated_at = ? WHERE id = ?`, [catId, new Date().toISOString(), itemId]);
        }
        seen.add(itemId);
      }
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
  },
  down: async ({ db }) => {
    // Revert: clear items.categoryId for items that have it set
    await db.exec('PRAGMA foreign_keys = OFF');
    try {
      await db.run(`UPDATE items SET categoryId = NULL, updated_at = ? WHERE categoryId IS NOT NULL`, [new Date().toISOString()]);
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
  }
};
