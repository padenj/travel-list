export default {
  name: '20251227_add_packing_list_members.js',
  up: async ({ db }) => {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS packing_list_members (
        packing_list_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        PRIMARY KEY (packing_list_id, member_id),
        FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (member_id) REFERENCES users(id)
      );
    `);

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_plm_packing_list_id ON packing_list_members(packing_list_id);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_plm_member_id ON packing_list_members(member_id);`);

    await db.exec(`
      INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id)
        SELECT pl.id AS packing_list_id, u.id AS member_id
        FROM packing_lists pl
        JOIN users u ON u.familyId = pl.family_id
        WHERE u.deleted_at IS NULL;
    `);
  },
  down: async ({ db }) => {
    await db.exec(`DROP INDEX IF EXISTS idx_plm_member_id;`);
    await db.exec(`DROP INDEX IF EXISTS idx_plm_packing_list_id;`);
    await db.exec(`DROP TABLE IF EXISTS packing_list_members;`);
  }
};
