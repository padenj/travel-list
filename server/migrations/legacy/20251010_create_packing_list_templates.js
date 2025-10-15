/**
 * Migration: create packing_list_templates join table
 */
module.exports.up = async function(db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS packing_list_templates (
      packing_list_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (packing_list_id, template_id)
    )
  `);
};

module.exports.down = async function(db) {
  await db.run(`DROP TABLE IF EXISTS packing_list_templates`);
};
