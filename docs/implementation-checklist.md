# Implementation ### Milestone 2: ✅ COMPLETED - Authentication & Family Management

**Foundational Application (Early Working Version) - COMPLETED**
- [x] Backend: Initialize basic Express server (Node.js) to run on port 3001.
- [x] Backend: Add a root route ("/") that returns a welcome message.
- [x] Frontend: Set up Vite React app to run on port 3000 (proxies API to backend on port 3001).
- [x] Frontend: Display a simple welcome page.
- [x] Docker: Update Dockerfile to support local development.
- [x] Update checklist: Add "Foundational app running on port 3000 with welcome page" as tracked item.

**Authentication System - COMPLETED**
- [x] Backend: Implement authentication endpoints (login/logout) using JWT.
- [x] Backend: Enforce strong password policy (min 16 chars, upper/lower/number/symbol).
- [x] Backend: Create default "administrator" account on install; require password change on first login.Update checklist: Add "Foundational app running with welcome page" as a tracked item.t & Milestones

## Milestone 1: Project Setup & Documentation
- [x] Create project README with overview and architecture
- [x] Set up folder structure for frontend and backend
- [x] Draft initial Dockerfile for combined deployment
- [x] Initialize git repository and add .gitignore for React/Node

## Milestone 2: Authentication & Family Management

### Monorepo Restructuring Tasks
- [x] Move `frontend` and `backend` into `apps/`
- [x] Update root `package.json` workspaces to `["apps/*", "packages/*"]`
- [x] Create `packages/shared` for shared code/utilities
- [x] Refactor any shared logic from `frontend`/`backend` into `packages/shared`
- [x] Update scripts and documentation for new structure

### Milestone 2 Breakdown & Initial Steps
**Foundational Application (Early Working Version)**
- [x] Backend: Initialize basic Express server (Node.js) to run on port 3001.
- [x] Backend: Add a root route ("/") that returns a welcome message.
- [x] Frontend: Set up React app (or similar) to run on port 3000 (proxies API to backend on port 3001).
- [x] Frontend: Display a simple welcome page.
- [x] Docker: Update Dockerfile to support local development (if not already).
- [x] Update checklist: Add “Foundational app running on port 3000 with welcome page” as a tracked item.

**Next Steps for Milestone 2**
- [x] Backend: Implement authentication endpoints (login/logout) using JWT.
- [x] Backend: Enforce strong password policy (min 16 chars, upper/lower/number/symbol).
- [x] Backend: Create default "administrator" account on install; require password change on first login.
- [x] Backend: Implement role-based access (SystemAdmin, FamilyAdmin, FamilyMember).
- [x] Backend: Add user management endpoints for SystemAdmin and FamilyAdmin.
- [x] Backend: Create family/group model and API endpoints (family name, members, multiple admins, single-family membership).
- [x] Backend: Require email for FamilyAdmin, optional for FamilyMember.

#### Remaining Backend Authentication Work
- [x] Add persistent database support for users and families (replace in-memory mock DB)
- [x] Add password reset endpoint (for admin/user recovery)
- [x] Add audit logging for authentication and user management actions
- [x] Add tests for edge cases and error handling in authentication endpoints
- [x] Frontend: Build authentication flow (login page).
- [x] Frontend: Add password change flow for first login.
- [x] Frontend: Add user management screen (SystemAdmin, FamilyAdmin).
 - [ ] Frontend: Family setup wizard removed; families are created via System Administration

### Milestone 2 Completion Note

**✅ Milestone 2 is now complete.**
- Family Administration page implemented: shows current user's family members, supports add/remove, prevents self-removal.
- All authentication, user, and family management features are working and tested in the UI.
- Checklist and codebase are up to date for handoff to Milestone 3.

## Milestone 3: Member, Category, and Item Management

#### Additional Role & Permission Details
- Default administrator has SystemAdmin role by default.
- Only SystemAdmin users can add additional SystemAdmin users.
- SystemAdmin can view and modify all users and roles within the system.
- SystemAdmin users can add or delete families.
- FamilyAdmin users are restricted to only assign FamilyAdmin to other members in their family.
### Updated Requirements (Oct 2025)

- Use the existing SQLite database for all new models and relationships.
- Items and categories are specific to families. Users can add items and categories to the current family only.
- Items must include a required `name` field. Categories must include a required `name` field.
- Roles and members are already implemented (Milestone 2). No new endpoints for adding/removing members are needed.
- Items can be assigned to existing users in the current family, or to the "whole family" (special assignment).
- When creating packing lists, items will be displayed in a separate list for each user. "Whole family" items will be displayed in their own list.
- Soft deleted items should be hidden from all lists and UI (no restore for now).
- Use checkboxes for multi-select UI (categories, member assignments).
 - Seed standard categories and default items are added automatically when a new family is created via the API (no wizard required).

#### Milestone 3 Tasks
- [x] Backend: CRUD for categories and items (with soft delete, hidden from UI)
- [x] Backend: Many-to-many relationships (items-categories, items-members, including "whole family" assignment)
- [x] Frontend: UI for managing categories and items (checkbox multi-select for assignments)
 - [x] Frontend: Display packing lists per user and for "whole family" items
 - [x] Seed standard categories and default items are created during family creation via the API

### Milestone 3 Completion Note

**✅ Milestone 3 core features are now complete.**
- Backend and frontend support for CRUD, assignments, and packing list display per user and whole family.
- Packing list UI now fetches and displays items assigned to whole family (via new API route).
- All assignment, checked state, and seeding logic integrated and tested.
- Ready to proceed to Milestone 4: Template Management.

## Milestone 4: Template Management
- [x] Backend: CRUD for templates with category and item references (per-family)
- [x] Backend: Dynamic template expansion (category changes reflected in templates and new packing lists)
- [x] Backend: Support for referencing both categories and individual items in templates
- [x] Backend: Template assignment logic (items can be assigned to specific members or whole family)
 - [x] Backend: Seed example templates (editable/deletable by users)
- [x] Frontend: UI for creating/editing templates (select categories and/or items, assign items to members/whole family)
- [x] Frontend: Navigation link added for template management verification
 - [ ] Frontend: UI for applying templates to new packing lists (reference items, not copy)  (DEFERRED → Milestone 5: packing lists)
- [ ] Frontend: Option to update template when packing list is changed
- [ ] Frontend: Show dynamic updates to templates when categories/items change
 - [x] Frontend: Option to update template when packing list is changed
 - [ ] Frontend: Show dynamic updates to templates when categories/items change
- [x] Frontend: List and manage templates (edit/delete)

### Latest progress (Oct 4, 2025)

- [x] Frontend: TemplateManager tabbed UI completed — templates render safely and no longer cause blank-page crashes.
- [x] Frontend: Add/remove individual items from templates implemented (autocomplete typeahead + create-new-item flow).
- [x] Frontend: "Edit Category" action wired to navigation — opens the Manage Categories page and selects the requested category tab via a query parameter.
- [x] Frontend: Edit/Delete icon parity — template and category lists use consistent ActionIcon + IconEdit/IconTrash affordances.
- [x] Frontend: TypeScript fixes and small lint tidy-ups applied across components; project compiles cleanly (npx tsc --noEmit passes).

- [x] Frontend: Packing-list → template sync UI (confirmation modal + notifications) implemented; frontend calls new API to sync template items.
- [x] Backend: Added POST /template/:id/sync-items to apply adds/removes to template item assignments.
- [x] Tests: Added integration tests for the sync endpoint (server/__tests__/template-sync.test.ts).

### Remaining work for Milestone 4

- [x] Backend: Seed example templates (create a set of editable example templates seeded for new families).
- [ ] Frontend: UI for applying templates to new packing lists (wire the apply-template flow so packing lists reference template items rather than copying). (DEFERRED → Milestone 5)
- [x] Frontend: Option to update the originating template when changes are made during packing (UX and API support required).
- [x] Frontend: Ensure templates show dynamic updates when categories/items change (real-time or on-navigation refresh behavior) — implemented via the existing `RefreshContext` (on-action refresh).
- [x] Frontend: End-to-end / UI tests for template creation, editing, deletion, assignment, and expansion (lightweight component/integration tests implemented; full E2E deferred to later milestone).

### Recommended long-term testing strategy (added Oct 6, 2025)

- Test Pyramid:
	- Unit tests (fast, many): isolate pure logic, services, utility functions, and extracted hooks. Use Vitest + vi.mock. Aim for most tests here.
	- Integration tests (moderate): repository + DB tests and server route tests (supertest). Use an app factory and ephemeral SQLite DBs for deterministic runs.
	- E2E UI tests (small): Playwright/Cypress for a handful of critical flows (create family + seeded templates, apply template → packing list, update originating template confirmation). Keep these few and stable.

- Immediate changes completed in this sprint:
	- Added `loadTemplatesData` helper and unit test (`src/components/__tests__/useTemplateManagerData.test.ts`) to cover TemplateManager data-loading logic without requiring DOM test libs.
	- Added server permission tests for templates (`server/__tests__/templates-permissions.test.ts`) verifying FamilyMember is forbidden and FamilyAdmin/SystemAdmin are allowed.

- Deferred / recommended for Milestone 5 or later:
	- Full front-end component integration tests using `@testing-library/react` (optional; keep a small set in CI).
	- Browser E2E suite (Playwright/Cypress) to cover critical UX flows.

These recommendations align testing effort with risk: most logic coverage via unit tests, repository/route correctness via integration tests, and a tiny E2E suite for user-facing assurances.

### Next steps specifically to complete Milestone 4

 - Seeding is handled programmatically during `POST /api/families`; no separate seed-runner is required.
- Add frontend unit/integration tests for TemplateManager (create/edit/delete and dynamic category expansion).
- Ensure the Templates view refreshes on navigation or provide a lightweight server notification/event so template expansion reflects category/item changes.
- Add one end-to-end test that creates a family, verifies the seeded templates exist for that family, and validates basic TemplateManager UI flows.

### Recommended next steps

 1. Ensure backend seeding logic runs on family creation so new families get a starter set.
2. Implement the "apply template" API route and the frontend flow to create packing lists from templates while keeping references to template items.
3. Add an API/design for optionally syncing packing-list edits back to templates and a simple confirmation UX.
4. Add a small suite of frontend UI tests (vitest + react-testing-library) that cover the TemplateManager happy path and one edge case (e.g., adding a new item via the autocomplete).
5. Do a quick manual regression pass on Categories <-> Templates interactions (Edit Category navigation, dynamic expansion) and document any additional edge cases.

### Milestone 4 Verification Tests
- [x] Backend: Unit/integration tests for template CRUD, category/item assignment, dynamic expansion
- [x] Frontend: UI tests for template creation, editing, deletion, assignment, and expansion (lightweight component tests implemented)

### Milestone 4 Completion Note (Oct 6, 2025)

**✅ Milestone 4 is now complete.**
- All template management functionality is implemented and working
- Backend CRUD, permissions, seeding, and sync functionality complete
- Frontend UI with create/edit/delete, category/item assignment, and dynamic refresh
- Template-to-packing-list sync functionality implemented
- All tests passing (112 tests across 18 files)
- Navigation and user experience polished
- Code optimized and documented

**Deferred to Milestone 5:**
- Apply template to new packing lists (UI flow)
- Full E2E browser testing (lightweight component tests implemented)

## Milestone 5: Packing List Functionality
- [ ] Backend: CRUD for packing lists with item references (not copies)
- [ ] Backend: Check/uncheck items, track items added during packing
- [ ] Backend: Option to update original template when items added/removed
- [ ] Frontend: UI for trip creation from templates
- [ ] Frontend: Separate packing lists per family member + whole family items
- [ ] Frontend: Add/remove items during packing with template update option
- [ ] Support saving lists as new/updated templates

## Milestone 6: Offline Support & Sync
- [ ] Backend: Change tracking and incremental sync endpoints
- [ ] Backend: Soft delete support and conflict resolution (last writer wins)
- [ ] Backend: Deleted item management (show/restore deleted items)
- [ ] Frontend: Service worker and local storage/indexedDB
- [ ] Frontend: Background sync queue for offline changes
- [ ] Frontend: Offline UI indicators and sync status

## Milestone 7: PWA Features & Deployment
- [ ] Add manifest and install prompt
- [ ] Enable background sync and push notifications (if needed)
- [ ] Finalize Docker deployment and documentation

---

## User Stories
- As a family, we can log in and manage our packing lists.
- As a user, I can add, edit, and remove family members.
- As a user, I can customize categories and items.
- As a user, I can create, edit, and use templates for trips.
- As a user, I can check off items, add new items, and save lists as templates.
- As a user, I can use the app offline and sync changes when online.
- As a user, I can check off items, add new items, and save lists as templates.
- As a user, I can use the app offline and sync changes when online.
