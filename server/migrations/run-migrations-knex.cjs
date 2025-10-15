const { Umzug } = require('umzug');
const Knex = require('knex');
const path = require('path');

(async () => {
  const cmd = process.argv[2] || 'up';
  const steps = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

  // Choose knex config via env or default to sqlite file
  const client = process.env.DB_CLIENT || 'sqlite3';
  let knexConfig;
  if (client === 'pg') {
    knexConfig = {
      client: 'pg',
      connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/travel_list',
      migrations: { directory: path.resolve(__dirname, 'knex-migrations') }
    };
  } else {
    knexConfig = {
      client: 'sqlite3',
      connection: { filename: process.env.DB_FILE || path.resolve(process.cwd(), 'travel-list.sqlite') },
      useNullAsDefault: true,
      migrations: { directory: path.resolve(__dirname, 'knex-migrations') }
    };
  }

  const knex = Knex(knexConfig);

  const { JSONStorage } = require('umzug');

  const umzug = new Umzug({
    migrations: {
      glob: './server/migrations/knex-migrations/*.js',
      resolve: ({ name, path: migrationPath }) => {
        // Support both CommonJS (exports.up/down) and ESM (export default or named exports)
        let migration;
        try {
          migration = require(migrationPath);
        } catch (e) {
          // fallback to dynamic import for ESM modules
          migration = null;
        }

        const load = async () => {
          if (!migration) {
            const mod = await import(migrationPath);
            // ESM modules may export default or named up/down
            migration = mod.default || mod;
          }
          return migration;
        };

        return {
          name,
          up: async () => (await load()).up(knex),
          down: async () => (await load()).down(knex)
        };
      }
    },
    storage: new JSONStorage({ path: path.resolve(__dirname, 'knex-migrations.json') }),
    logging: console.log
  });

  try {
    if (cmd === 'status') {
      const executed = await umzug.executed();
      const pending = await umzug.pending();
      console.log('Executed:', executed.map(m => m.name));
      console.log('Pending:', pending.map(m => m.name));
    } else if (cmd === 'up') {
      if (steps) await umzug.up({ step: steps }); else await umzug.up();
      console.log('Knex migrations applied');
    } else if (cmd === 'down') {
      if (steps) await umzug.down({ step: steps }); else await umzug.down();
      console.log('Knex migrations reverted');
    }
  } catch (err) {
    console.error('Knex-Umzug migration error:', err && err.message ? err.message : err);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
})();
