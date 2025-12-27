# New Milestone Starter Prompt — Travel List
---
mode: 'agent'
model: GPT-5 mini
tools: ['codebase']
description: 'New Milestone Starter Prompt — Travel List'
---

Your goal is to review the milestones in #docs/implementation-checklist.md and implement the next milestone in the Travel List project. The architecture and specifiation documentation can be found in #docs/architecture.md and #docs/detailed-specifications.md.

Start by reviewing the project summary and important documentation links below. Then read the relevant docs, inspect key code locations, and propose a plan for implementing the next milestone. After I approve the plan, proceed to implement the changes in small, testable increments. Run type checks and tests after each change and report results.  Be sure to update the implementation checklist as you complete each task.

Project quick summary
---------------------
- Tech stack: React + TypeScript (Vite) frontend; Node.js + Express + TypeScript backend; SQLite database.
- Testing: Vitest (unit + integration) and Playwright for E2E (some tests in `tests/integration`).
- Architectural pattern: repository pattern for DB access. Seeding of example templates occurs programmatically when a family is created (no CLI seed-runner).

Important documentation to read first
-----------------------------------
- `README.md` — project overview and setup notes
- `docs/architecture.md`
- `docs/detailed-specifications.md`
- `docs/implementation-checklist.md`

Key code locations to inspect (start here)
-----------------------------------------
- Server
  - `server/db.ts` — database initialization and DDL
  - `server/repositories.ts` — repository implementations (Users, Families, Categories, Items, Templates, PackingListRepository)
  - `server/routes.ts` — Express route handlers
  - `server/seed-templates.ts` — programmatic seeding function (no CLI entrypoint)
  - `server/server-types.ts` — server-side TypeScript types
- Frontend
  - `src/components/Dashboard.tsx` — main dashboard; System Administration button was removed
  - `src/components/TemplateManager.tsx` — template CRUD UI
  - `src/components/PackingListPage.tsx` — (where packing lists UI may live)
  - `src/shared/types.ts` — shared interfaces between client & server
- Tooling & tests
  - `package.json` — scripts (note: `seed:templates` script removed)
  - `vitest.config.ts`, `tests/` and `server/__tests__/` — existing tests and integration tests

Guidance & constraints (do not break these)
-------------------------------------------
- Maintain repository patterns and shared types in `src/shared/types.ts` to avoid drifting client and server models.
- Keep changes minimal and scoped per PR: implement server endpoints, unit tests, then wire the frontend and add E2E/integration tests.
- The dev server runs on port 3000 and should be started manually.  Do not try to restart the dev server automatically or change any ports.  The server is configured to watch for changes and restart the site as needed.  If you need the server restarted because a change is not being picked up, please let me know.

Quality gates (run before merging)
----------------------------------
- Build: `npx tsc --noEmit` — pass
- Tests: run `npm test` — all tests pass
- Lint: (if configured) `npm run lint` — pass
- Manual smoke: create family via `POST /api/families` and exercise new endpoints from the client or `curl`

