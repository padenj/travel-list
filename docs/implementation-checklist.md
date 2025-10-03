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
- [x] Frontend: Add family setup wizard.

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
- Seed standard categories and default items should be added automatically through the "Manage my Family" wizard (not on startup).

#### Milestone 3 Tasks
- [x] Backend: CRUD for categories and items (with soft delete, hidden from UI)
- [x] Backend: Many-to-many relationships (items-categories, items-members, including "whole family" assignment)
- [x] Frontend: UI for managing categories and items (checkbox multi-select for assignments)
- [x] Frontend: Integrate category/item management into "Manage my Family" wizard
- [x] Frontend: Display packing lists per user and for "whole family" items
- [x] Seed standard categories and default items via wizard

### Milestone 3 Completion Note

**✅ Milestone 3 core features are now complete.**
- Backend and frontend support for CRUD, assignments, and packing list display per user and whole family.
- Packing list UI now fetches and displays items assigned to whole family (via new API route).
- All assignment, checked state, and seeding logic integrated and tested.
- Ready to proceed to Milestone 4: Template Management.

## Milestone 4: Template Management
- [ ] Backend: CRUD for templates with category and item references
- [ ] Backend: Dynamic template expansion (categories auto-update when items change)
- [ ] Frontend: UI for creating templates (select categories OR individual items)
- [ ] Frontend: Template editing and application to new trips
- [ ] Seed example templates: "International Beach Vacation", "Work Conference", "Weekend Mountain Trip", "National Park Adventure"

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
