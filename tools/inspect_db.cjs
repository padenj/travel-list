const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
(async () => {
  try {
    const db = await sqlite.open({ filename: './travel-list.sqlite', driver: sqlite3.Database });
    const rows = await db.all("SELECT name, type, sql FROM sqlite_master WHERE sql LIKE '%packing_list_items_old%'");
    console.log(JSON.stringify(rows, null, 2));
    await db.close();
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
