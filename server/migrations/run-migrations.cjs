const { Umzug } = require('umzug');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

(async () => {
  const cmd = process.argv[2] || 'up';
  const steps = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

  try {
    const db = await sqlite.open({ filename: './travel-list.sqlite', driver: sqlite3.Database });

    const SimpleJSONStorage = require('./simple-json-storage.cjs');

    // --- Simple custom migration runner (replaces Umzug usage) ---
    const fs = require('fs');
    const path = require('path');
    const storage = new SimpleJSONStorage({ path: './server/migrations/migrations.json' });

    const migrationsDir = path.resolve(process.cwd(), './server/migrations/migrations');
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort();
    const migrations = files.map(f => ({ name: f, path: path.join(migrationsDir, f) }));

    const executed = await storage.executed();

    if (cmd === 'status') {
      const pending = migrations.filter(m => !executed.includes(m.name)).map(m => ({ name: m.name, path: m.path }));
      console.log('Executed migrations:');
      console.log(JSON.stringify(executed, null, 2));
      console.log('Pending migrations:');
      console.log(JSON.stringify(pending, null, 2));
    } else if (cmd === 'up') {
      let toRun = migrations.filter(m => !executed.includes(m.name));
      if (steps) toRun = toRun.slice(0, steps);
      for (const m of toRun) {
        console.log('Applying migration', m.name);
        // Use dynamic import to support ESM (project has type:module)
        const moduleUrl = `file://${m.path}`;
        const required = await import(moduleUrl);
        const mod = required.default || required;
        if (!mod || typeof mod.up !== 'function') {
          throw new Error(`Migration ${m.name} has no up function`);
        }
        await mod.up({ db });
        await storage.logMigration(m.name);
        console.log('Applied', m.name);
      }
      console.log('Migrations applied (up)');
    } else if (cmd === 'down') {
      const executedList = await storage.executed();
      let toRevert = migrations.filter(m => executedList.includes(m.name)).reverse();
      if (steps) toRevert = toRevert.slice(0, steps);
      for (const m of toRevert) {
        console.log('Reverting migration', m.name);
        const moduleUrl = `file://${m.path}`;
        const required = await import(moduleUrl);
        const mod = required.default || required;
        if (!mod || typeof mod.down !== 'function') {
          console.log(`Migration ${m.name} has no down function; skipping`);
          await storage.unlogMigration(m.name);
          continue;
        }
        await mod.down({ db });
        await storage.unlogMigration(m.name);
        console.log('Reverted', m.name);
      }
      console.log('Migrations reverted (down)');
    } else {
      console.error('Unknown command. Usage: node run-migrations.cjs [up|down|status] [steps]');
      process.exit(1);
    }

    await db.close();
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
