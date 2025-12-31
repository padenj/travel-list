module.exports = {
  name: '20251017_01_assign_uncategorized_items_to_first_category.js',
  up: async ({ db }) => {
    await db.exec('PRAGMA foreign_keys = OFF');
    try {
      const uuidv4 = () => {
        try {
          if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
        } catch (e) {}
        return 'id-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
      };
      const now = new Date().toISOString();

      const globalFirst = await db.get(`SELECT id FROM categories WHERE deleted_at IS NULL ORDER BY position IS NULL, position ASC, rowid ASC LIMIT 1`);

      const families = await db.all(`SELECT id FROM families`);
      for (const f of families) {
        let cat = await db.get(`SELECT id FROM categories WHERE familyId = ? AND deleted_at IS NULL ORDER BY position IS NULL, position ASC, rowid ASC LIMIT 1`, [f.id]);
        if (!cat) {
          if (globalFirst) {
            cat = globalFirst;
          } else {
            const newId = uuidv4();
            await db.run(`INSERT INTO categories (id, familyId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [newId, f.id, 'General', now, now]);
            cat = { id: newId };
          }
        }
        await db.run(`UPDATE items SET categoryId = ?, updated_at = ? WHERE familyId = ? AND (categoryId IS NULL OR categoryId = '')`, [cat.id, now, f.id]);
      }
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
  },
  down: async ({ db }) => {
    await db.exec('PRAGMA foreign_keys = OFF');
    try {
      await db.run(`UPDATE items SET categoryId = NULL, updated_at = ? WHERE categoryId IS NOT NULL`, [new Date().toISOString()]);
    } finally {
      await db.exec('PRAGMA foreign_keys = ON');
    }
  }
};
