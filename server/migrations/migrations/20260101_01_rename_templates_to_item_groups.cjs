module.exports = {
  up: async ({ db }) => {
    // Create new item_groups table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS item_groups (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT,
        updated_at TEXT,
        deleted_at TEXT
      );
    `);

    // Create join tables
    await db.exec(`
      CREATE TABLE IF NOT EXISTS item_group_items (
        item_group_id TEXT NOT NULL,
        item_id TEXT NOT NULL
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS item_group_categories (
        item_group_id TEXT NOT NULL,
        category_id TEXT NOT NULL
      );
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS packing_list_item_groups (
        packing_list_id TEXT NOT NULL,
        item_group_id TEXT NOT NULL
      );
    `);

    // Copy data from templates -> item_groups
    try {
      await db.exec(`
        INSERT INTO item_groups (id, family_id, name, description, created_at, updated_at, deleted_at)
        SELECT id, family_id, name, description, created_at, updated_at, deleted_at FROM templates;
      `);
    } catch (e) {
      // ignore if templates doesn't exist
    }

    // Copy template_items -> item_group_items
    try {
      await db.exec(`
        INSERT INTO item_group_items (item_group_id, item_id)
        SELECT template_id, item_id FROM template_items;
      `);
    } catch (e) {
      // ignore
    }

    // Copy template_categories -> item_group_categories
    try {
      await db.exec(`
        INSERT INTO item_group_categories (item_group_id, category_id)
        SELECT template_id, category_id FROM template_categories;
      `);
    } catch (e) {
      // ignore
    }

    // Copy packing_list_item_templates -> packing_list_item_groups
    try {
      await db.exec(`
        INSERT INTO packing_list_item_groups (packing_list_id, item_group_id)
        SELECT packing_list_id, template_id FROM packing_list_item_templates;
      `);
    } catch (e) {
      // ignore
    }

    // Note: we do not drop the old tables here to allow safe rollback/verification
  },

  down: async ({ db }) => {
    // Reverse copy: copy back into templates if templates table exists
    try {
      await db.exec(`
        INSERT OR IGNORE INTO templates (id, family_id, name, description, created_at, updated_at, deleted_at)
        SELECT id, family_id, name, description, created_at, updated_at, deleted_at FROM item_groups;
      `);
    } catch (e) {
      // ignore
    }

    try {
      await db.exec(`
        INSERT OR IGNORE INTO template_items (template_id, item_id)
        SELECT item_group_id, item_id FROM item_group_items;
      `);
    } catch (e) {}

    try {
      await db.exec(`
        INSERT OR IGNORE INTO template_categories (template_id, category_id)
        SELECT item_group_id, category_id FROM item_group_categories;
      `);
    } catch (e) {}

    try {
      await db.exec(`
        INSERT OR IGNORE INTO packing_list_item_templates (packing_list_id, template_id)
        SELECT packing_list_id, item_group_id FROM packing_list_item_groups;
      `);
    } catch (e) {}

    // Drop new tables
    await db.exec(`DROP TABLE IF EXISTS item_group_items;`);
    await db.exec(`DROP TABLE IF EXISTS item_group_categories;`);
    await db.exec(`DROP TABLE IF EXISTS packing_list_item_groups;`);
    await db.exec(`DROP TABLE IF EXISTS item_groups;`);
  }
};
