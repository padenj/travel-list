# New Milestone Starter Prompt — Travel List

Purpose
-------
Use this prompt at the start of a new conversation with an assistant or as a checklist when onboarding a developer to the next incomplete milestone for the Travel List project. It points to important documentation, files, the current technical context, and a suggested checklist and quality gates to get productive quickly.

How to use
---------
1. Paste the entire prompt into the chat (or attach the file) and then append the specific milestone goal (for example: "Implement packing-list endpoints and UI").
2. If you want the assistant to make code changes, explicitly authorize it to edit files in the repository.
3. If you want tests run, ask the assistant to run `npx tsc --noEmit` and `npm test` or to run specific tests.

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

Current known work in progress / next milestone
----------------------------------------------
- Milestone: Implement packing lists (server endpoints + frontend flows) so users can:
  - Create a packing list for a family (name + created_at)
  - Populate a packing list from a template (copy item references and assignment state at creation)
  - Track checked state and whether an item was added during packing
  - Ensure item name/assignments updates in the item manager are reflected in existing packing lists when appropriate (or provide UI to surface new category items as optional additions)

Guidance & constraints (do not break these)
-------------------------------------------
- Keep programmatic seeding on family creation (`seedTemplatesForFamily(familyId)` in `POST /api/families`). Do NOT reintroduce the CLI seed-runner or a file-level `if (require.main === module)` runner.
- Maintain repository patterns and shared types in `src/shared/types.ts` to avoid drifting client and server models.
- Keep changes minimal and scoped per PR: implement server endpoints, unit tests, then wire the frontend and add E2E/integration tests.

Starter checklist for the assistant or developer
-----------------------------------------------
1. Read the docs listed above.
2. Run type check and tests locally:

```bash
npx tsc --noEmit
npm test
```

3. Inspect `server/repositories.ts` to confirm `PackingListRepository` exists and what methods are already implemented.
4. If implementing endpoints: add routes in `server/routes.ts`, unit + integration tests in `server/__tests__/`, and wire to repository methods.
5. After server work, add frontend pages/components in `src/components/` and client API calls in `src/api.ts`.
6. Run tests: unit, integration, and one smoke manual test (create a family via the API and confirm seeding + packing list creation flow).

Minimal "contract" to include in a Milestone ticket or prompt
-------------------------------------------------------------
- Inputs: familyId (UUID), templateId (UUID), packingListName (string)
- Expected outputs: created packing_list record and packing_list_items records, HTTP 201 on success; error codes for invalid family/template/permissions
- Error modes: invalid/missing IDs (400), unauthorized (401/403), DB errors (500)

Edge cases to test
------------------
- Creating a packing list from a template that contains category references (ensure categories/items are expanded correctly)
- Item deleted in the item manager after list creation: confirm packing list still shows the item name (or define expected behavior) or ensure soft-delete handling
- Concurrency: two users creating or updating the same packing list at the same time (surface locking/ETag if needed)
- Large templates (many items) — ensure reasonable performance and transactionality

Quality gates (run before merging)
----------------------------------
- Build: `npx tsc --noEmit` — pass
- Tests: run `npm test` — all tests pass
- Lint: (if configured) `npm run lint` — pass
- Manual smoke: create family via `POST /api/families` and exercise new endpoints from the client or `curl`

Example initial prompt to paste in a conversation
-------------------------------------------------
"I'm starting Milestone 5: implement server endpoints and frontend UI for packing lists. Please read the docs `docs/architecture.md` and `docs/detailed-specifications.md`, then inspect `server/repositories.ts`, `server/db.ts`, and `server/routes.ts` and propose an implementation plan with file-level changes and a test plan. After I approve the plan, proceed to implement the server endpoints, unit tests, and integration tests. Run `npx tsc --noEmit` and `npm test` after changes and report results. Preserve programmatic seeding and don't reintroduce a CLI seed runner."

Notes / context
---------------
- Environment: Linux, bash shell (use absolute paths when running commands in this repo). The repo has a test suite (Vitest) and TypeScript setup. Use the existing repository and style for consistency.
- If the assistant is going to edit files, request permission in the conversation (or be explicitly told to proceed). Provide a short plan and the list of files to change before making edits.

If you want, I can now adapt this prompt for a specific milestone (for example: "Implement packing list endpoints and create a minimal UI to create a packing list from a template").
