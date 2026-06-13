# Item-only Item Groups + Searchable Selector — Design

Date: 2026-06-13

## Problem

The Item Groups page is hard to use on mobile: groups render as tabs across the
top, consuming most of the viewport. Separately, item groups can be associated
with whole **categories** as well as individual **items**. The dual model is
confusing — users struggle to decide when to add a category versus individual
items, and category membership changes implicitly over time.

## Goals

1. Item groups are associated with **individual items only**. The category
   association is removed everywhere (UI, API, repository, database).
2. A **one-time migration** converts each group's currently-assigned categories
   into individual item assignments (the items that are in those categories at
   migration time), without creating duplicates.
3. Provide an **"Add from categories"** convenience action that snapshots all
   items in one or more selected categories into the group as individual items,
   skipping items already present.
4. Replace the **tab** navigation with a **searchable dropdown** (typeahead)
   selector so the page works well on mobile.

## Non-goals

- No change to how packing lists consume groups beyond the natural effect of
  groups becoming item-only (category expansion disappears).
- No migration of the orphaned `item_group_*` tables into active use; the active
  tables remain `templates` / `template_items` (the `item_group_*` tables are
  unused duplicates from an earlier incomplete rename).

## Current state (verified)

- The app reads/writes `templates`, `template_categories` (48 rows live),
  `template_items` (4 rows live). The `item_groups` / `item_group_categories` /
  `item_group_items` tables exist from a prior rename migration but are **not**
  used by the repository code.
- `client/src/components/TemplateManager.tsx` renders groups as Mantine `<Tabs>`
  with two sections per group: "Individual Items" and "Categories & Items".
- `TemplateRepository.getExpandedItems()` expands assigned categories to items
  (`items.categoryId IN (...)`) plus direct `template_items`, deduped. This is
  used by packing-list reconciliation.
- The migration runner (`server/migrations/run-migrations.cjs`) and
  `server/index.ts` filter migration files with `endsWith('.js')`, but the
  migration files on disk use the `.cjs` extension and `migrations.json` records
  them under `.js` names. New `.cjs` migrations will not run until the filter is
  fixed.

## Design

### 1. Database migration

New file: `server/migrations/migrations/20260613_01_migrate_group_categories_to_items.cjs`

- **up:**
  1. For each row in `template_categories (template_id, category_id)`, select
     all `items` where `categoryId = category_id AND deleted_at IS NULL` and
     `INSERT OR IGNORE INTO template_items (template_id, item_id)` for each
     (dedupe via the existing uniqueness / IGNORE semantics).
  2. `DROP TABLE IF EXISTS template_categories;`
  3. `DROP TABLE IF EXISTS item_group_categories;` (orphaned cleanup)
- **down:**
  - Recreate an empty `template_categories (template_id TEXT, category_id TEXT)`
    table. The category→item expansion is **not** losslessly reversible; this is
    documented in the migration file. (`item_group_categories` recreation is
    best-effort/empty and noted as non-reversible.)

### 2. Migration runner fix

- Update `server/migrations/run-migrations.cjs` and `server/index.ts` to accept
  both `.js` and `.cjs` migration files (e.g. filter
  `f.endsWith('.js') || f.endsWith('.cjs')`).
- Add `20260613_01_migrate_group_categories_to_items.cjs` to the pending set so
  it runs. Keep existing recorded `.js` names valid (do not rename historical
  entries).

### 3. Backend changes

`server/repositories.ts` — `TemplateRepository`:
- Remove: `assignCategory`, `removeCategory`, `getCategories`,
  `getCategoriesForTemplate`, `getTemplatesReferencingCategory`.
- `getExpandedItems`: drop the category-expansion branch; return direct
  `template_items` only (deduped).

`server/routes.ts`:
- Remove routes: `POST /template/:id/categories/:categoryId`,
  `DELETE /template/:id/categories/:categoryId`,
  `POST /item-group/:id/categories/:categoryId`,
  `DELETE /item-group/:id/categories/:categoryId`,
  and the category listing endpoints (`GET .../categories` for template and
  item-group aliases).
- **New route:** `POST /item-group/:id/add-category-items` with body
  `{ categoryIds: string[] }`:
  - Validate group exists and caller authorization (mirror existing
    assign-item authorization).
  - For each category id, fetch its items (`items.categoryId`, not deleted) and
    `assignItem` (INSERT OR IGNORE) into the group — dedupe against existing.
  - Trigger `propagateTemplateToAssignedLists` / reconcile as the existing
    assign-item path does.
  - Return the updated item list (`getItemsForTemplate`).

### 4. Frontend changes

`client/src/components/TemplateManager.tsx`:
- Add `selectedGroupId` state; default to the first group after load.
- Replace `<Tabs>` with a full-width searchable Mantine `Select`
  (`searchable`, data = groups). Selecting changes `selectedGroupId`.
- Render only the selected group's panel below the selector: title with
  inline rename, delete action, the "Individual Items" list with edit/remove,
  and the add controls.
- Remove the "Categories & Items" section, the per-category cards, the
  add-category modal, and `addCategorySelections` state.
- Add an **"Add from categories"** button beside "Add Item" that opens a modal
  with multi-select checkboxes of the family's categories. On confirm, call
  `POST /item-group/:id/add-category-items` with the selected ids, then refresh
  the group's items.
- Simplify `loadTemplateDetails` to load only items (no categories /
  categoryItems).

`client/src/api.ts`:
- Remove now-unused category helpers (`assignCategoryToTemplate`,
  `assignCategoryToItemGroup`, `getCategoriesForTemplate`,
  `getCategoriesForItemGroup`, `removeCategoryFromTemplate`,
  `removeCategoryFromItemGroup`).
- Add `addCategoryItemsToItemGroup(groupId, categoryIds)`.
- Update `client/src/APIUsage.md` and
  `client/src/components/ComponentUsage.md` accordingly.

### 5. Testing

- Update `client/src/__tests__/TemplateManager.test.tsx` and
  `GlobalListEditDrawer.test.tsx` for the removed category UI and new
  searchable selector + "Add from categories" modal.
- Server test: migration converts category memberships to deduped
  `template_items` and drops `template_categories`.
- Server test: `POST /item-group/:id/add-category-items` adds deduped items and
  reconciles.

## Risks / notes

- Other code paths or tests referencing category endpoints/helpers must be
  updated; a repo-wide search for the removed names is part of implementation.
- The client test harness currently needs Vitest globals / DOM setup; touching
  these tests requires fixing or accounting for that setup rather than assuming
  `npm --prefix client test` is healthy.
- The migration is destructive (drops `template_categories`); `down` is
  explicitly non-reversible for the data.
