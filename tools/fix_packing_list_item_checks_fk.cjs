const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
(async () => {
  try {
    const db = await sqlite.open({ filename: './travel-list.sqlite', driver: sqlite3.Database });
    console.log('Opened DB');

    const tx = await db.get('PRAGMA foreign_keys');
    console.log('Foreign keys currently:', tx);

    await db.exec('PRAGMA foreign_keys = OFF');
    console.log('Disabled foreign_keys for migration');

    // Check current schema
    const info = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='packing_list_item_checks'");
    if (!info || !info.sql) {
      console.error('packing_list_item_checks table not found');
      await db.close();
      process.exit(1);
    }
    console.log('Current packing_list_item_checks schema:', info.sql);

    // Create new table with corrected FK
    const createSql = `
      CREATE TABLE IF NOT EXISTS packing_list_item_checks_new (
        id TEXT PRIMARY KEY,
        packing_list_item_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        checked INTEGER DEFAULT 0,
        checked_at TEXT,
        FOREIGN KEY (packing_list_item_id) REFERENCES packing_list_items(id),
        FOREIGN KEY (member_id) REFERENCES users(id)
      );
    `;

    await db.exec('BEGIN TRANSACTION');
    console.log('BEGIN TRANSACTION');

    await db.exec(createSql);
    console.log('Created packing_list_item_checks_new');

    // Copy data
    await db.exec(`INSERT INTO packing_list_item_checks_new (id, packing_list_item_id, member_id, checked, checked_at) SELECT id, packing_list_item_id, member_id, checked, checked_at FROM packing_list_item_checks`);
    console.log('Copied data to new table');

    // Drop old table
    await db.exec('DROP TABLE packing_list_item_checks');
    console.log('Dropped old packing_list_item_checks');

    // Rename new table
    await db.exec('ALTER TABLE packing_list_item_checks_new RENAME TO packing_list_item_checks');
    console.log('Renamed new table to packing_list_item_checks');

    await db.exec('COMMIT');
    console.log('COMMIT');

    await db.exec('PRAGMA foreign_keys = ON');
    console.log('Re-enabled foreign_keys');

    await db.close();
    console.log('Closed DB');
  } catch (err) {
    console.error('ERROR during migration:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
