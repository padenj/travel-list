/**
 * Migration: create packing_list_item_templates join table to track which template(s)
 * caused a packing_list_items row to be added. This enables reconciliation/removal
 * when templates change.
 */
module.exports.up = async function(db) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS packing_list_item_templates (
      packing_list_item_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (packing_list_item_id, template_id)
    )
  `);
};

module.exports.down = async function(db) {
  await db.run(`DROP TABLE IF EXISTS packing_list_item_templates`);
};
