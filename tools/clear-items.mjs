import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// One-time script to wipe item-related rows from the dev sqlite DB.
// Usage:
//   node --input-type=module tools/clear-items.mjs --yes
// or set environment variable:
//   CLEAR_ITEMS_CONFIRM=1 node --input-type=module tools/clear-items.mjs
// The script will create a timestamped backup of the DB file before deleting rows.

const args = process.argv.slice(2);
const confirmed = process.env.CLEAR_ITEMS_CONFIRM === '1' || args.includes('--yes');
if (!confirmed) {
  console.error('Refusing to run without confirmation. Set CLEAR_ITEMS_CONFIRM=1 or pass --yes');
  process.exit(1);
}

const dbFile = process.env.DB_FILE || path.resolve(process.cwd(), './data/travel-list.sqlite');
if (!fs.existsSync(dbFile)) {
  console.error('Database file not found at', dbFile);
  process.exit(1);
}

const backupPath = dbFile + '.' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak';
fs.copyFileSync(dbFile, backupPath);
console.log('Backup created at', backupPath);

(async () => {
  const db = await open({ filename: dbFile, driver: sqlite3.Database });
  try {
    await db.run('PRAGMA foreign_keys = OFF');
    await db.run('BEGIN TRANSACTION');

    const tables = [
      'packing_list_item_templates',
      'packing_list_item_not_needed',
      'packing_list_item_checks',
      'item_whole_family',
      'item_members',
      'packing_list_items',
      'template_items',
      'items'
    ];

    const counts = {};
    for (const t of tables) {
      try {
        const row = await db.get(`SELECT COUNT(*) as c FROM ${t}`);
        counts[t] = row ? row.c : 0;
      } catch (e) {
        counts[t] = 'N/A';
      }
    }

    console.log('Counts before deletion:', counts);

    for (const t of tables) {
      try {
        await db.run(`DELETE FROM ${t}`);
      } catch (e) {
        console.warn('Failed to delete from', t, e.message || e);
      }
    }

    await db.run('COMMIT');
    console.log('Deletion complete. Counts before deletion:', counts);
  } catch (e) {
    try { await db.run('ROLLBACK'); } catch (e2) {}
    console.error('Error during deletion:', e);
  } finally {
    try { await db.run('PRAGMA foreign_keys = ON'); } catch (e) {}
    await db.close();
  }
})();
