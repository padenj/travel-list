# travel-list Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-11-02

## Active Technologies

- (001-remove-assigned-toggle)

## Project Structure

```text
backend/
frontend/
tests/
```

## Commands

# Add commands for 

## TypeScript Build & Validation

- **Project layout:** The repository contains two logical TypeScript projects: the `client/` front-end and the `server/` back-end. Each may have its own `tsconfig.json` and build settings.
- **Best practice:** Run type-checks for each project separately using the project's `tsconfig.json`. Optionally, maintain a root-level `tsconfig.json` that references the two projects (composite project) if you want a single invocation to type-check both.
- **Example commands:**

	- Check only client (recommended while editing client code):

		```bash
		npx tsc -p client/tsconfig.json --noEmit
		```

	- Check only server (recommended while editing server code):

		```bash
		npx tsc -p server/tsconfig.json --noEmit
		```

	- Check both using root config (if present) or composite project:

		```bash
		npx tsc -p tsconfig.json --noEmit
		```

- **Editor consistency:** Ensure VS Code (or other editor) uses the workspace TypeScript version and the intended `tsconfig` for each folder. In VS Code: Command Palette → "TypeScript: Select TypeScript Version" → "Use Workspace Version" and, if needed, add a `jsconfig.json`/`tsconfig.json` at the appropriate folder root to scope the editor's project.
- **When you see editor diagnostics that the CLI doesn't:** the editor may be using a different `tsconfig` or a cached tsserver state. Restart the TS server (Command Palette → "TypeScript: Restart TS Server") and re-run the `npx tsc -p ...` command matching the project the editor is using.

## CI Recommendations

- Add CI steps to run both client and server type-checks on PRs to prevent regressions. Examples (bash):

	```bash
	npx tsc -p client/tsconfig.json --noEmit
	npx tsc -p server/tsconfig.json --noEmit
	```

	Or, with a root composite `tsconfig.json`, run a single:

	```bash
	npx tsc -p tsconfig.json --noEmit
	```

- Include `npm run lint` and unit tests after type-checks for a fuller CI pipeline.

## Code Style

: Follow standard conventions

## Recent Changes

- 001-remove-assigned-toggle: Added

<!-- Documentation guideline: keep API/component usage docs current -->
- **Documentation maintenance:** When adding new components or new API request helpers, update the following files to keep usage maps current:
	- `client/src/APIUsage.md` — map new API helpers to files that import them.
	- `client/src/components/ComponentUsage.md` — record where new components are used and mark unused components for follow-up.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<!-- MANUAL ADDITIONS: Migration Guidance -->
- When adding new migration files under `server/migrations/migrations/`, files must match the project's module type.
	- If `package.json` contains "type": "module" (ESM), migration scripts should use the `.cjs` extension so the runner treats them as CommonJS modules. Example filename: `20260101_my_migration.cjs`.
	- If the project uses CommonJS (no `type` field or `type": "commonjs"`), `.js` files are acceptable.
- Example migration runner commands (from project root):

```bash
# Run all pending migrations up
node server/migrations/run-migrations.cjs up

# Roll back last migration
node server/migrations/run-migrations.cjs down 1

# Show status
node server/migrations/run-migrations.cjs status
```

Add the migration as a `.cjs` file when the repo is ESM to avoid the "module is not defined in ES module scope" error.

<!-- MANUAL ADDITIONS END -->
