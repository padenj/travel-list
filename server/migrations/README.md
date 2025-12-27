Migration runner using Umzug

Files:
- run-migrations.cjs: The migration runner script. Usage: node run-migrations.cjs [up|down|status] [steps]
- migrations/: Directory containing migration JS files. Each migration exports up and down functions and receives { db } in the context.
- migrations/migrations.json: Umzug JSON storage file created automatically.

How it works:
- The runner opens the project's `travel-list.sqlite` via sqlite/sqlite3 and passes the `db` object as context to migration files.
- Migrations can use `await db.exec(...)` and other sqlite methods. They should be idempotent and safe.

Example:
  node server/migrations/run-migrations.cjs up
  node server/migrations/run-migrations.cjs down 1
  node server/migrations/run-migrations.cjs status

Notes:
- Install Umzug first: `npm install umzug`
- Migrations run synchronously from oldest to newest. Keep migration files named with an ordered prefix (YYYYMMDD_description.js).
- The migration `down` operations are provided where feasible, but some schema rollbacks (especially those dropping or renaming tables) may require manual intervention.
