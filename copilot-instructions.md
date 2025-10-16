# Copilot Instructions for Travel Packing Checklist Application

This file provides guidance for using GitHub Copilot and AI agents to assist with development of the travel packing checklist app. It outlines conventions, priorities, and tips for collaborating with AI in this project.

---

## Project Context
- PWA for travel packing lists, designed for families/groups
- React + TypeScript frontend, Node.js backend
- Self-hosted Docker deployment
- Offline support and background sync

## Best-practices note (configuration first)

- Follow clean configuration over quick fixes. Prefer adjusting the repo layout (monorepo/workspaces or separate package.json per server/client) and Docker multi-stage builds that clearly separate build tooling from runtime dependencies. Avoid installing large sets of devDependencies in production build stages or using unpinned, ad-hoc `--no-save` installs during CI; these increase drift and cause subtle type or version mismatches.
- For Vite + React projects:
	- Keep build tooling (vite, @vitejs/plugin-react, vitest) in a top-level devDependencies when using a single-repo approach, or use workspaces where client and server have their own package.json to isolate deps.
	- Use a dedicated `deps` or `builder` stage in Docker to install all dev tooling once and reuse it for client and server builds (reduces duplicated installs and keeps builds reproducible).
	- Ensure `tsconfig.build.json` and any referenced `tsconfig.json` files are available in the build stage so `tsc` can resolve `extends` without copying the entire repo into the container.
	- Pin compiler/tool versions in package.json devDependencies and reference those pinned versions when installing tooling inside CI/build stages.
- Document these choices in the repo (this file is a good place) so future contributors follow the same patterns instead of applying ad-hoc shortcuts.

## Development Environment
- **Architecture**: Single Vite application with integrated frontend and backend
- **Frontend**: Vite + React dev server on localhost:3000, accessible via https://code3000.padenco.com (remote VS Code proxy domain)
- **Backend**: Express API server on localhost:3001 (started automatically with frontend)
- **API Proxy**: Vite automatically proxies `/api/*` requests from the frontend to the backend. All API calls from the browser must go through this proxy. The backend should never be called directly from the browser.
- **Remote Domain Proxying**: When developing in a remote VS Code environment, https://code3000.padenco.com acts as a secure proxy to your local frontend (localhost:3000). All API requests from the browser (including remote browser sessions) must use the `/api` proxy path, which is forwarded to the backend (localhost:3001) by Vite.
- **CORS Configuration**: The backend must allow CORS for the following origins: `http://localhost:3000`, `http://code3000.padenco.com`, and `https://code3000.padenco.com`. This ensures that both local and remote browser sessions can communicate with the backend via the frontend proxy. Do not add other origins unless required for deployment.

## Collaboration Guidelines
- Follow the architecture and implementation checklist in `docs/`
- Use the data model and API contract as reference for backend and frontend integration
- Prioritize user stories and milestones in the checklist
- When generating code, use TypeScript for frontend and JavaScript/TypeScript for backend
- Ensure PWA features (service worker, manifest, offline sync) are included
- Use RESTful conventions for API endpoints
- **Do not restart servers during development** - hot reloading handles changes automatically
- Test frontend changes at https://code3000.padenco.com (remote browser sessions are routed through the frontend proxy)
- Document all major changes in code and update relevant docs

## File/Folder Conventions
-
## API Routing and Proxy Requirements

- **API Routing**: All backend API calls must be made from the frontend using the `/api` proxy path. Never call the backend directly from the browser or from client-side code using the backend's direct address (localhost:3001 or any other backend port/domain).
- **Proxy Path**: The Vite proxy configuration ensures that `/api/*` requests are forwarded to the backend. This is required for both local and remote development, and for production deployments.
- **CORS**: The backend must be configured to allow only the necessary origins for local and remote development. This prevents direct browser-to-backend calls and enforces the use of the frontend proxy.
- **Debugging**: If you encounter issues with API requests (e.g., missing request body, CORS errors, 400/401 responses), first verify that requests are routed through the frontend proxy and not sent directly to the backend.

**Summary:**
- Always use the frontend API proxy for all backend requests.
- Never call the backend directly from the browser.
- Ensure CORS is configured for both local and remote proxy domains.
- Document any changes to proxy or routing logic in this file.
## Single Application Structure
All code is organized as a single Vite application with integrated frontend and backend.

`src/`: React frontend application source code
`server/`: Express backend API source code  
`public/`: Static assets and PWA manifest
`docs/`: Architecture, checklist, and documentation
`travel-list.sqlite`: SQLite database file
`vite.config.ts`: Vite configuration with API proxy
`copilot-instructions.md`: This file
- Keep authentication and data isolated per family/group
- Test offline and sync features thoroughly
- Update documentation as features are added

## How to Use Copilot/AI

- Always add unit tests for all updated code.
- If any updated code breaks a unit test, ask before altering the unit test to get it to pass.

**Unit Test Hygiene:**
- Ensure all unit tests have appropriate setup and teardown logic to clean up any test data, so tests can run repeatedly and independently without affecting other tests or leaving persistent data.
- Use an in-memory database (e.g., SQLite `:memory:`) for backend unit tests to avoid database locking errors (SQLITE_BUSY) and to ensure tests do not affect local or production data.

---

For questions or changes, update this file and notify contributors.

---

## Database migrations (how to create and run)

When altering the database schema or making any breaking changes to the database, create a migration file and run it using the project's migration runner. Follow these steps precisely to keep schema changes auditable, reversible, and safe.

1) Backup the database before running any migration

	- Always make a copy of `travel-list.sqlite` before applying migrations:

		```bash
		cp travel-list.sqlite travel-list.sqlite.bak
		```

2) Create a migration file

	- Migration files live in `server/migrations/migrations/` and must be named so they sort chronologically, e.g. `YYYYMMDD_description.js` (example: `20251008_add_new_column_to_items.js`).
	- Use ES module export style (project `package.json` uses `type: "module"`). Each migration must `export default` an object with `name`, `up`, and optionally `down` functions.
	- The `up` and `down` functions receive a context object: `{ db }` where `db` is the sqlite database handle from the `sqlite` package. Use `await db.exec(sql)` and other `sqlite` methods.

	- Example minimal migration template:

		```javascript
		export default {
			name: '20251008_example_migration.js',
			up: async ({ db }) => {
				// perform schema change(s)
				await db.exec('PRAGMA foreign_keys = OFF');
				await db.exec(`ALTER TABLE example ADD COLUMN new_col TEXT`);
				await db.exec('PRAGMA foreign_keys = ON');
			},
			down: async ({ db }) => {
				// reverse the change if possible (optional)
				// For destructive changes, provide a clear comment and require manual recovery.
			}
		};
		```

3) Make the migration idempotent where practical

	- Use `CREATE TABLE IF NOT EXISTS` or `DROP TABLE IF EXISTS` when appropriate.
	- For ALTER operations that SQLite doesn't support directly, prefer the copy-then-rename pattern:
		- Create a `_new` table with the desired schema
		- Copy rows over: `INSERT INTO new_table (...) SELECT ... FROM old_table`
		- `DROP TABLE old_table` and `ALTER TABLE new_table RENAME TO old_table`

4) Run the migration runner

	- The project includes a simple migration runner. Install dependencies first if needed:

		```bash
		npm install
		```

	- To see status (executed vs pending):

		```bash
		npm run migrate:status
		```

	- To apply pending migrations:

		```bash
		npm run migrate
		```

	- To revert (down) the last migration or N steps:

		```bash
		# revert 1 step
		node server/migrations/run-migrations.cjs down 1
		# or via script
		npm run migrate:down -- 1
		```

5) Verify and test

	- After running migrations, run test suites and smoke tests:

		```bash
		npm run test
		# and manually exercise the app in dev: npm run dev
		```

	- Check that application code and queries are compatible with the new schema.

6) CI/CD recommendation

	- Add a migration step to your deployment pipeline. Prefer an explicit migration job that runs before the application process starts.
	- Example GitHub Actions step (simplified):

		```yaml
		- name: Run DB migrations
			run: |
				npm ci
				node server/migrations/run-migrations.cjs up
		```

7) Safety and rollback

	- Always back up the database file before running migrations on staging/production.
	- Provide a `down` migration when feasible. For destructive operations (dropping columns/tables), document manual rollback steps.
	- If a migration fails partially, restore from backup and investigate; do not attempt automatic retries without understanding the failure.

8) When to create migrations

	- Any change that alters table schemas, indexes, triggers, or constraints.
	- Any change that requires transforming or migrating existing data (e.g., splitting a column into two, moving data between tables).

9) Example: creating a migration that fixes a broken foreign key

	- Follow the copy-then-rename pattern shown above (see `20251008_fix_packing_list_item_checks_fk.js` for a real example in this repo).

If you have any questions about writing a specific migration, include the SQL you want and I (the agent) can draft a migration file and a safe rollback plan.
