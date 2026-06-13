/*
  Migration: Add optional notes column to templates table.
  This is a non-destructive additive migration used to verify
  backup-before-migration functionality.
*/
module.exports = {
  up: async ({ db }) => {
    await db.exec(`ALTER TABLE templates ADD COLUMN notes TEXT;`);
  },
  down: async ({ db }) => {
    // SQLite does not support DROP COLUMN on older versions; create a new table without it
    await db.exec(`
      CREATE TABLE templates_backup AS SELECT id, family_id, name, description, created_at, updated_at, deleted_at FROM templates;
      DROP TABLE templates;
      ALTER TABLE templates_backup RENAME TO templates;
    `);
  }
};
