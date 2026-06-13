# Item-only Item Groups + Searchable Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make item groups associated with individual items only — migrate existing category memberships into item memberships, remove the category mechanism everywhere, add an "Add from categories" snapshot action, and replace the tab navigation with a searchable dropdown selector.

**Architecture:** A one-time SQLite migration expands each group's assigned categories into deduped direct item rows, then drops the category junction table. Backend repository/routes lose all category-assignment surface and gain one `add-category-items` endpoint that snapshots category items into a group. The React `TemplateManager` page swaps Mantine `<Tabs>` for a searchable `<Select>` and replaces the category panel with a multi-select "Add from categories" modal.

**Tech Stack:** Node ≥22 (ESM), Express, SQLite (`sqlite`/`sqlite3`), TypeScript, React 18 + Mantine v8, Vitest + supertest.

---

## Background facts (verified — do not re-derive)

- The live app reads/writes the tables `templates`, `template_categories`, `template_items`. The `item_groups` / `item_group_categories` / `item_group_items` tables exist from an earlier incomplete rename and are **unused** by the code. The HTTP API exposes both `/template/...` and `/item-group/...` aliases that both operate on `TemplateRepository` (the `templates*` tables).
- `TemplateRepository` lives in `server/repositories.ts` (class starts ~line 332).
- Schema is created in `server/db.ts` (table `template_categories` ~lines 81-87; its indexes ~lines 222-223).
- `TemplateCategory` interface is in `server/server-types.ts` (~lines 77-81).
- The client component is `client/src/components/TemplateManager.tsx`; API helpers are in `client/src/api.ts`.
- Migration runners filter `.js`: `server/migrations/run-migrations.cjs` (~line 21) and `server/index.ts` (~line 121). Actual migration files use `.cjs`. `migrations.json` records historical names with `.js` extension.
- Tests run with `npx vitest --run <file>` (jsdom env, globals on). Server route tests use `supertest` against `app.use('/api', routes)`. The root vitest `include` (in `vitest.config.ts`) covers `server/**/*.test.ts`, `tests/integration/**`, and only the single client test `client/src/__tests__/GlobalListEditDrawer.test.tsx`. `client/src/__tests__/TemplateManager.test.tsx` is **not** in the run set.

---

## File Structure

**Backend**
- `server/migrations/migrations/20260613_01_migrate_group_categories_to_items.cjs` — NEW one-time migration.
- `server/migrations/run-migrations.cjs` — MODIFY file filter to accept `.cjs`.
- `server/index.ts` — MODIFY startup migration file filter to accept `.cjs`.
- `server/repositories.ts` — MODIFY `TemplateRepository`: remove category methods; new `addCategoryItems`; item-only `getExpandedItems`.
- `server/routes.ts` — MODIFY: remove category routes; add `POST /item-group/:id/add-category-items`; fix `getTemplatesReferencingCategory` call sites.
- `server/db.ts` — MODIFY: stop creating `template_categories` table + its indexes.
- `server/server-types.ts` — MODIFY: remove `TemplateCategory` interface.

**Frontend**
- `client/src/api.ts` — MODIFY: remove category helpers; add `addCategoryItemsToItemGroup`.
- `client/src/components/TemplateManager.tsx` — MODIFY: searchable selector + "Add from categories" modal; remove category UI.
- `client/src/APIUsage.md` — MODIFY docs.
- `client/src/components/ComponentUsage.md` — MODIFY docs.

**Tests**
- `server/__tests__/group-category-migration.test.ts` — NEW.
- `server/__tests__/add-category-items.route.test.ts` — NEW.
- `client/src/__tests__/TemplateManager.test.tsx` — MODIFY (best-effort; not in default run set).

---

## Task 1: Fix migration runners to accept `.cjs` files

**Files:**
- Modify: `server/migrations/run-migrations.cjs:21`
- Modify: `server/index.ts:121`

Without this, no `.cjs` migration (including Task 2's) will ever run.

- [ ] **Step 1: Update the CLI runner filter**

In `server/migrations/run-migrations.cjs`, change:

```js
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort();
```

to:

```js
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js') || f.endsWith('.cjs')).sort();
```

- [ ] **Step 2: Update the startup runner filter**

In `server/index.ts`, change:

```ts
      const files: string[] = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js')).sort() : [];
```

to:

```ts
      const files: string[] = fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir).filter(f => f.endsWith('.js') || f.endsWith('.cjs')).sort() : [];
```

- [ ] **Step 3: Verify existing migrations are still reported as already executed (no accidental re-run)**

Run: `npm run migrate:status`
Expected: Command prints "Executed migrations:" including the historical `.js` names, and "Pending migrations:" lists the `.cjs` files that are NOT yet in `migrations.json`. Confirm it does NOT crash. The historical `.cjs` files may appear pending because their names differ from the recorded `.js` names by extension — that is expected; they are idempotent `CREATE TABLE IF NOT EXISTS`-style migrations. Do NOT run `migrate up` yet; Task 6 handles applying.

- [ ] **Step 4: Commit**

```bash
git add server/migrations/run-migrations.cjs server/index.ts
git commit -m "fix(migrations): accept .cjs migration files in both runners"
```

---

## Task 2: One-time migration — expand group categories into items, drop category tables

**Files:**
- Create: `server/migrations/migrations/20260613_01_migrate_group_categories_to_items.cjs`
- Test: `server/__tests__/group-category-migration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/group-category-migration.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import migration from '../migrations/migrations/20260613_01_migrate_group_categories_to_items.cjs';

beforeEach(async () => {
  const db = await getDb();
  // Recreate template_categories in case a prior migration test dropped it
  await db.exec(`CREATE TABLE IF NOT EXISTS template_categories (
    template_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    PRIMARY KEY (template_id, category_id)
  );`);
  await db.exec('DELETE FROM templates');
  await db.exec('DELETE FROM template_items');
  await db.exec('DELETE FROM template_categories');
  await db.exec('DELETE FROM items');
  await db.exec('DELETE FROM categories');
  await db.exec('DELETE FROM families');
});

describe('20260613_01_migrate_group_categories_to_items', () => {
  it('copies category items into template_items (deduped) and drops template_categories', async () => {
    const db = await getDb();
    const fam = uuidv4();
    const cat = uuidv4();
    const grp = uuidv4();
    const itemA = uuidv4();
    const itemB = uuidv4();
    const now = new Date().toISOString();

    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [fam, 'F', now, now]);
    await db.run(`INSERT INTO categories (id, familyId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [cat, fam, 'Docs', now, now]);
    await db.run(`INSERT INTO templates (id, family_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [grp, fam, 'G', '', now, now]);
    await db.run(`INSERT INTO items (id, familyId, name, categoryId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [itemA, fam, 'A', cat, now, now]);
    await db.run(`INSERT INTO items (id, familyId, name, categoryId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [itemB, fam, 'B', cat, now, now]);
    // group references the category, and ALREADY has itemA directly (dedupe case)
    await db.run(`INSERT INTO template_categories (template_id, category_id) VALUES (?, ?)`, [grp, cat]);
    await db.run(`INSERT INTO template_items (template_id, item_id) VALUES (?, ?)`, [grp, itemA]);

    await migration.up({ db });

    const rows = await db.all(`SELECT item_id FROM template_items WHERE template_id = ? ORDER BY item_id`, [grp]);
    const ids = rows.map((r: any) => r.item_id).sort();
    expect(ids).toEqual([itemA, itemB].sort());

    const tcExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='template_categories'`);
    expect(tcExists).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run server/__tests__/group-category-migration.test.ts`
Expected: FAIL — cannot resolve module `20260613_01_migrate_group_categories_to_items.cjs` (file does not exist yet).

- [ ] **Step 3: Write the migration**

Create `server/migrations/migrations/20260613_01_migrate_group_categories_to_items.cjs`:

```js
module.exports = {
  up: async ({ db }) => {
    // For each (template_id, category_id), insert all non-deleted items in that
    // category into template_items, deduping via INSERT OR IGNORE.
    let pairs = [];
    try {
      pairs = await db.all(`SELECT template_id, category_id FROM template_categories`);
    } catch (e) {
      // template_categories already gone; nothing to migrate
      pairs = [];
    }
    for (const { template_id, category_id } of pairs) {
      const items = await db.all(
        `SELECT id FROM items WHERE categoryId = ? AND deleted_at IS NULL`,
        [category_id]
      );
      for (const it of items) {
        await db.run(
          `INSERT OR IGNORE INTO template_items (template_id, item_id) VALUES (?, ?)`,
          [template_id, it.id]
        );
      }
    }

    // Category assignment is removed from item groups entirely.
    await db.exec(`DROP TABLE IF EXISTS template_categories;`);
    // Clean up the orphaned duplicate table from the earlier incomplete rename.
    await db.exec(`DROP TABLE IF EXISTS item_group_categories;`);
  },

  // NOTE: This migration is intentionally NOT losslessly reversible. The original
  // mapping of which items came from which category is discarded. down() only
  // recreates the (empty) tables so the schema shape can be restored.
  down: async ({ db }) => {
    await db.exec(`CREATE TABLE IF NOT EXISTS template_categories (
      template_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      PRIMARY KEY (template_id, category_id)
    );`);
    await db.exec(`CREATE TABLE IF NOT EXISTS item_group_categories (
      item_group_id TEXT NOT NULL,
      category_id TEXT NOT NULL
    );`);
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest --run server/__tests__/group-category-migration.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Do not pre-mark the migration as executed**

The migration is applied at runtime by name. Do NOT hand-edit `migrations.json` to mark it executed. Leave it out of the executed list so `migrate up` / startup will apply it. (Verification of an actual apply happens in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add server/migrations/migrations/20260613_01_migrate_group_categories_to_items.cjs server/__tests__/group-category-migration.test.ts
git commit -m "feat(migrations): expand group categories into items and drop category tables"
```

---

## Task 3: Backend repository — remove category methods, item-only expansion

**Files:**
- Modify: `server/repositories.ts` (`TemplateRepository`, ~lines 330-457)
- Modify: `server/server-types.ts` (remove `TemplateCategory`)
- Test: `server/__tests__/template-repository.test.ts` (existing; ensure still green)

- [ ] **Step 1: Remove the `TemplateCategory` import and category methods in `repositories.ts`**

Change the import at line ~330 from:

```ts
  import { Template, TemplateCategory, TemplateItem } from './server-types';
```

to:

```ts
  import { Template, TemplateItem } from './server-types';
```

Delete these methods from `TemplateRepository` entirely: `assignCategory`, `removeCategory`, `getCategories`, `getCategoriesForTemplate`, and `getTemplatesReferencingCategory`.

- [ ] **Step 2: Make `getExpandedItems` item-only**

Replace the whole `getExpandedItems` method body with:

```ts
    // Get all items for a group (direct items only — categories are no longer supported)
    async getExpandedItems(template_id: string): Promise<Item[]> {
      const db = await getDb();
      const itemRows = await db.all(`SELECT item_id FROM template_items WHERE template_id = ?`, [template_id]);
      const itemIds = itemRows.map((row: any) => row.item_id);
      if (itemIds.length === 0) return [];
      const items = await db.all(
        `SELECT * FROM items WHERE id IN (${itemIds.map(() => '?').join(',')}) AND deleted_at IS NULL`,
        itemIds
      );
      const uniqueItems = Object.values(items.reduce<{ [id: string]: Item }>((acc, item) => { acc[item.id] = item; return acc; }, {}));
      return uniqueItems as Item[];
    }
```

- [ ] **Step 3: Add an `addCategoryItems` helper to `TemplateRepository`**

Add this method to `TemplateRepository` (used by the new route in Task 4):

```ts
    // Snapshot all current items of the given categories into the group as
    // individual items, skipping any already present. Returns the group's items.
    async addCategoryItems(template_id: string, category_ids: string[]): Promise<Item[]> {
      const db = await getDb();
      for (const category_id of category_ids) {
        const items = await db.all(
          `SELECT id FROM items WHERE categoryId = ? AND deleted_at IS NULL`,
          [category_id]
        );
        for (const it of items) {
          await db.run(
            `INSERT OR IGNORE INTO template_items (template_id, item_id) VALUES (?, ?)`,
            [template_id, it.id]
          );
        }
      }
      return this.getItemsForTemplate(template_id);
    }
```

- [ ] **Step 4: Remove the `TemplateCategory` interface from `server-types.ts`**

Delete these lines from `server/server-types.ts`:

```ts
// Template-Category assignment
export interface TemplateCategory {
  template_id: string;
  category_id: string;
}
```

- [ ] **Step 5: Run the repository test suite**

Run: `npx vitest --run server/__tests__/template-repository.test.ts`
Expected: PASS. If a test references the removed `assignCategory`/`getCategoriesForTemplate`/`getExpandedItems` category behavior, update that test to the item-only model (remove category-expansion assertions; keep direct-item assertions). Re-run until green.

- [ ] **Step 6: Commit**

```bash
git add server/repositories.ts server/server-types.ts server/__tests__/template-repository.test.ts
git commit -m "refactor(server): make item groups item-only in TemplateRepository"
```

---

## Task 4: Backend routes — remove category routes, add add-category-items, fix call sites

**Files:**
- Modify: `server/routes.ts`
- Test: `server/__tests__/add-category-items.route.test.ts` (new)

- [ ] **Step 1: Write the failing route test**

Create `server/__tests__/add-category-items.route.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb } from '../db';
import { UserRepository, FamilyRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('POST /api/item-group/:id/add-category-items', () => {
  let app: express.Application;
  let famId: string;
  let adminToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    const db = await getDb();
    const familyRepo = new FamilyRepository();
    const userRepo = new UserRepository();

    famId = uuidv4();
    await familyRepo.create({ id: famId, name: 'Fam', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const adminId = uuidv4();
    const adminUsername = `admin_${Date.now()}`;
    await userRepo.create({
      id: adminId,
      username: adminUsername,
      email: `${adminUsername}@x.com`,
      password: hashPasswordSync('pw'),
      role: USER_ROLES.SYSTEM_ADMIN,
      familyId: famId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    adminToken = generateToken({ id: adminId, username: adminUsername, role: USER_ROLES.SYSTEM_ADMIN, familyId: famId } as any);
  });

  it('adds deduped items from selected categories to the group', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    const cat = uuidv4();
    const grp = uuidv4();
    const itemA = uuidv4();
    const itemB = uuidv4();

    await db.run(`INSERT INTO categories (id, familyId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [cat, famId, 'Docs', now, now]);
    await db.run(`INSERT INTO templates (id, family_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [grp, famId, 'G', '', now, now]);
    await db.run(`INSERT INTO items (id, familyId, name, categoryId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [itemA, famId, 'A', cat, now, now]);
    await db.run(`INSERT INTO items (id, familyId, name, categoryId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [itemB, famId, 'B', cat, now, now]);
    // itemA already in group -> must not duplicate
    await db.run(`INSERT INTO template_items (template_id, item_id) VALUES (?, ?)`, [grp, itemA]);

    const res = await request(app)
      .post(`/api/item-group/${grp}/add-category-items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryIds: [cat] });

    expect(res.status).toBe(200);
    const returnedIds = (res.body.items || []).map((i: any) => i.id).sort();
    expect(returnedIds).toEqual([itemA, itemB].sort());

    const rows = await db.all(`SELECT item_id FROM template_items WHERE template_id = ?`, [grp]);
    expect(rows.length).toBe(2);
  });

  it('returns 404 for a missing group', async () => {
    const res = await request(app)
      .post(`/api/item-group/${uuidv4()}/add-category-items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryIds: [uuidv4()] });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest --run server/__tests__/add-category-items.route.test.ts`
Expected: FAIL — route returns 404/`Cannot POST` because the endpoint does not exist yet.

- [ ] **Step 3: Remove the category routes**

Delete these route handlers from `server/routes.ts` entirely:
- `POST /template/:id/categories/:categoryId` (~lines 247-265)
- `POST /item-group/:id/categories/:categoryId` (~lines 268-284)
- `DELETE /item-group/:id/categories/:categoryId` (~lines 286-302)
- `DELETE /template/:id/categories/:categoryId` (~lines 394-411)
- `GET /template/:id/categories` (~lines 594-604)
- `GET /item-group/:id/categories` (~lines 606-616)

(Use surrounding context to locate exact boundaries; remove each handler including its `router.<verb>(...)` opening through its closing `});`.)

- [ ] **Step 4: Add the new add-category-items route**

Insert near the other `/item-group/:id/items/...` handlers in `server/routes.ts`:

```ts
router.post('/item-group/:id/add-category-items', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { categoryIds } = req.body as { categoryIds?: string[] };
  try {
    const existing = await templateRepo.findById(id);
    if (!existing) return res.status(404).json({ error: 'Item group not found' });
    if (req.user?.role !== 'SystemAdmin') {
      if (req.user?.familyId !== existing.family_id || req.user.role !== 'FamilyAdmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({ error: 'categoryIds must be a non-empty array' });
    }
    const items = await templateRepo.addCategoryItems(id, categoryIds);
    try {
      const lists = await packingListRepo.getPackingListsForTemplate(id);
      for (const l of lists) {
        await packingListRepo.reconcilePackingListAgainstTemplate(l.id, id);
      }
    } catch (err) {
      console.error('Error propagating item group changes synchronously', { itemGroupId: id, err });
    }
    return res.json({ items });
  } catch (error) {
    console.error('Error adding category items to item group:', error);
    return res.status(500).json({ error: 'Failed to add category items to item group' });
  }
});
```

- [ ] **Step 5: Fix the `getTemplatesReferencingCategory` call sites**

This method no longer exists. Update each call site in `server/routes.ts`:

In `PUT /categories/:id` (~lines 1275-1281), remove the propagation block so the body becomes:

```ts
    const updated = await categoryRepo.update(id, { name: name.trim() });
    return res.json({ category: updated });
```

In `POST /items/:itemId/categories/:categoryId` (~lines 1452-1459), remove the propagation block so the body becomes:

```ts
    await itemRepo.assignToCategory(itemId, categoryId);
    return res.json({ message: 'Item assigned to category' });
```

In `POST /items/:itemId/members/:memberId` (~lines 1485-1495), replace the template-id gathering with direct-only:

```ts
      const directTemplateIds = await templateRepo.getTemplatesReferencingItem(itemId);
      const templateIds = directTemplateIds;
```

(Delete the `getCategoriesForItem` lookup, the `categoryTemplateIdsSet` loop, and the merged-set construction; keep the downstream `for (const tid of templateIds)` broadcast loop.)

In `DELETE /items/:itemId/members/:memberId` (~lines 1527-1537), apply the identical replacement:

```ts
      const directTemplateIds = await templateRepo.getTemplatesReferencingItem(itemId);
      const templateIds = directTemplateIds;
```

- [ ] **Step 6: Run the new route test**

Run: `npx vitest --run server/__tests__/add-category-items.route.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 7: Run the full server suite to catch references to removed routes**

Run: `npx vitest --run server/__tests__/`
Expected: PASS. If any existing test calls a removed category route/helper, update it to the item-only model (e.g. replace category-assignment setup with direct `template_items` inserts or the new endpoint). Re-run until green.

- [ ] **Step 8: Commit**

```bash
git add server/routes.ts server/__tests__/add-category-items.route.test.ts
git commit -m "feat(server): add add-category-items route and remove group category endpoints"
```

---

## Task 5: Backend schema — stop creating `template_categories`

**Files:**
- Modify: `server/db.ts` (table ~lines 81-87, indexes ~lines 222-223)

- [ ] **Step 1: Remove the `template_categories` table creation**

In `server/db.ts`, delete this block:

```ts
      CREATE TABLE IF NOT EXISTS template_categories (
        template_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        PRIMARY KEY (template_id, category_id),
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );
```

- [ ] **Step 2: Remove the `template_categories` indexes**

In `server/db.ts`, delete these two lines:

```ts
    CREATE INDEX IF NOT EXISTS idx_template_categories_template ON template_categories(template_id);
    CREATE INDEX IF NOT EXISTS idx_template_categories_category ON template_categories(category_id);
```

- [ ] **Step 3: Verify server tests still pass (schema bootstrap unaffected)**

Run: `npx vitest --run server/__tests__/database.test.ts server/__tests__/template-repository.test.ts`
Expected: PASS. (Note: the migration test in Task 2 recreates `template_categories` itself in its own `beforeEach`, so it is unaffected.)

- [ ] **Step 4: Commit**

```bash
git add server/db.ts
git commit -m "chore(db): stop creating template_categories table"
```

---

## Task 6: Apply and verify the migration end-to-end

**Files:** none (operational verification)

- [ ] **Step 1: Back up the dev database**

Run: `cp data/travel-list.sqlite data/travel-list.sqlite.pre-itemgroups.bak`
Expected: file copied (no output).

- [ ] **Step 2: Capture pre-migration counts**

Run:
```bash
node -e "const s=require('sqlite3');const db=new s.Database('data/travel-list.sqlite');db.all(\"SELECT (SELECT COUNT(*) FROM template_categories) tc,(SELECT COUNT(*) FROM template_items) ti\",(e,r)=>{console.log(r);db.close();});"
```
Expected: prints current `tc` and `ti` counts (e.g. `[ { tc: 48, ti: 4 } ]`).

- [ ] **Step 3: Run the migration**

Run: `npm run migrate`
Expected: logs "Applying migration 20260613_01_migrate_group_categories_to_items.cjs" then "Migrations applied (up)". If historical `.cjs` files are also reported pending and applied, they are idempotent and should succeed; if any fails, STOP and inspect (do not force).

- [ ] **Step 4: Verify post-migration state**

Run:
```bash
node -e "const s=require('sqlite3');const db=new s.Database('data/travel-list.sqlite');db.all(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN('template_categories','item_group_categories')\",(e,r)=>{console.log('remaining category tables:',r);db.all('SELECT COUNT(*) ti FROM template_items',(e2,r2)=>{console.log(r2);db.close();});});"
```
Expected: `remaining category tables: []` (both dropped) and `template_items` count >= the pre-migration `ti` (it grew to include category items).

- [ ] **Step 5: Commit (records the applied-migration bookkeeping if tracked in repo)**

```bash
git add -A
git commit -m "chore(migrations): apply group-category-to-items migration on dev db" --allow-empty
```

---

## Task 7: Client API — remove category helpers, add add-category-items

**Files:**
- Modify: `client/src/api.ts`
- Modify: `client/src/APIUsage.md`

- [ ] **Step 1: Remove category API helpers**

In `client/src/api.ts`, delete these exported functions entirely: `assignCategoryToTemplate`, `assignCategoryToItemGroup`, `removeCategoryFromTemplate`, `removeCategoryFromItemGroup`, `getCategoriesForTemplate`, `getCategoriesForItemGroup`.

- [ ] **Step 2: Add the new helper**

Add to `client/src/api.ts` (near `assignItemToItemGroup`):

```ts
  export const addCategoryItemsToItemGroup = async (itemGroupId: string, categoryIds: string[]): Promise<ApiResponse> => {
    return authenticatedApiCall(`/item-group/${itemGroupId}/add-category-items`, {
      method: 'POST',
      body: JSON.stringify({ categoryIds }),
    });
  };
```

- [ ] **Step 3: Update `APIUsage.md`**

In `client/src/APIUsage.md`, remove the rows/entries documenting the six removed helpers and add an entry for `addCategoryItemsToItemGroup(itemGroupId, categoryIds)` → `POST /item-group/:id/add-category-items` ("snapshot category items into a group, deduped"). Match the file's existing formatting.

- [ ] **Step 4: Commit**

```bash
git add client/src/api.ts client/src/APIUsage.md
git commit -m "feat(client): add addCategoryItemsToItemGroup and remove category helpers"
```

(Compilation of the client is verified together with the component in Task 8 Step 4.)

---

## Task 8: Client — searchable selector + "Add from categories" modal

**Files:**
- Modify: `client/src/components/TemplateManager.tsx`
- Modify: `client/src/components/ComponentUsage.md`

This is a focused rewrite of the page's rendering. The data-loading helpers shrink to item-only. Below is the complete new component. Replace the entire contents of `client/src/components/TemplateManager.tsx` with it.

- [ ] **Step 1: Replace the component**

```tsx
import { useEffect, useState } from 'react';
import { Button, TextInput, Textarea, Group, Modal, Checkbox, Stack, Select, Card, Title, Text, List, ActionIcon } from '@mantine/core';
import {
  getItemGroups,
  createItemGroup,
  updateItemGroup,
  deleteItemGroup,
  assignItemToItemGroup,
  getCategories,
  getItemsForItemGroup,
  removeItemFromItemGroup,
  addCategoryItemsToItemGroup,
} from '../api';
import { getMembersForItem } from '../api';
import { getCurrentUserProfile } from '../api';
import { useImpersonation } from '../contexts/ImpersonationContext';
import { useRefresh } from '../contexts/RefreshContext';
import { IconEdit, IconTrash, IconPlus, IconX } from '@tabler/icons-react';
import AddItemsDrawer from './AddItemsDrawer';
import ItemEditDrawer from './ItemEditDrawer';

type Group = { id: string; name: string; description?: string };
type Category = { id: string; name: string };
type Item = { id: string; name: string };

export default function TemplateManager() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [groupItems, setGroupItems] = useState<{ [groupId: string]: Item[] }>({});
  const [itemMembers, setItemMembers] = useState<{ [itemId: string]: { id: string; name: string }[] }>({});
  const [showAddItemsDrawer, setShowAddItemsDrawer] = useState<{ open: boolean; groupId?: string }>({ open: false });
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editMasterItemId, setEditMasterItemId] = useState<string | null>(null);
  const [editingNameDraft, setEditingNameDraft] = useState<string>('');
  const [editingName, setEditingName] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [addCategorySelections, setAddCategorySelections] = useState<string[]>([]);

  const { impersonatingFamilyId } = useImpersonation();
  const { refreshKey } = useRefresh();

  useEffect(() => {
    async function fetchData() {
      let fid: string | null = null;
      if (impersonatingFamilyId) {
        fid = impersonatingFamilyId;
      } else {
        const profileRes = await getCurrentUserProfile();
        if (profileRes.response.ok && profileRes.data.family) fid = profileRes.data.family.id;
      }
      if (!fid) return;
      setFamilyId(fid);
      const groupsRes = await getItemGroups(fid);
      const loaded: Group[] = groupsRes.data?.itemGroups || groupsRes.data?.templates || [];
      setGroups(loaded);
      setSelectedGroupId(prev => (prev && loaded.some(g => g.id === prev) ? prev : (loaded[0]?.id ?? null)));
      getCategories(fid).then(res => setCategories((res.data?.categories || []).slice().sort((a: Category, b: Category) => (a.name || '').localeCompare(b.name || ''))));
      await loadAllGroupItems(loaded);
    }
    fetchData();
  }, [impersonatingFamilyId, refreshKey]);

  const loadGroupItems = async (groupId: string): Promise<Item[]> => {
    const res = await getItemsForItemGroup(groupId);
    const items: Item[] = res.response.ok && res.data ? (res.data.items || []) : [];
    return items.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  const loadAllGroupItems = async (groupList: Group[]) => {
    const map: { [groupId: string]: Item[] } = {};
    for (const g of groupList) {
      try { map[g.id] = await loadGroupItems(g.id); } catch { map[g.id] = []; }
    }
    setGroupItems(map);
    await fetchMembersForItems(map);
  };

  const fetchMembersForItems = async (map: { [groupId: string]: Item[] }) => {
    const ids = new Set<string>();
    Object.values(map).forEach(list => list.forEach(i => ids.add(i.id)));
    const result: { [itemId: string]: { id: string; name: string }[] } = {};
    await Promise.all(Array.from(ids).map(async itemId => {
      try {
        const res = await getMembersForItem(itemId);
        if (res.response.ok) result[itemId] = Array.isArray(res.data) ? res.data : (res.data?.members || []);
        else result[itemId] = [];
      } catch { result[itemId] = []; }
    }));
    setItemMembers(result);
  };

  const refreshGroupItems = async (groupId: string) => {
    const items = await loadGroupItems(groupId);
    setGroupItems(prev => ({ ...prev, [groupId]: items }));
    await fetchMembersForItems({ [groupId]: items });
  };

  const openCreateModal = () => {
    setForm({ name: '', description: '' });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !familyId) return;
    const createRes = await createItemGroup(familyId, form.name, form.description);
    const newId = createRes.data?.itemGroup?.id || createRes.data?.template?.id;
    setModalOpen(false);
    const groupsRes = await getItemGroups(familyId);
    const loaded: Group[] = groupsRes.data?.itemGroups || groupsRes.data?.templates || [];
    setGroups(loaded);
    if (newId) setSelectedGroupId(newId);
    await loadAllGroupItems(loaded);
  };

  const handleDelete = async (id: string) => {
    await deleteItemGroup(id);
    if (!familyId) return;
    const groupsRes = await getItemGroups(familyId);
    const loaded: Group[] = groupsRes.data?.itemGroups || groupsRes.data?.templates || [];
    setGroups(loaded);
    setSelectedGroupId(loaded[0]?.id ?? null);
    await loadAllGroupItems(loaded);
  };

  const selectedGroup = groups.find(g => g.id === selectedGroupId) || null;
  const currentItems = selectedGroupId ? (groupItems[selectedGroupId] || []) : [];
  const excludedItemIds = currentItems.map(i => i.id);

  return (
    <div>
      <Group justify="space-between" mb="md">
        <Title order={2}>Item Groups</Title>
        <Button onClick={openCreateModal}>New Item Group</Button>
      </Group>

      {groups.length === 0 ? (
        <Text c="dimmed">No item groups yet. Create your first item group!</Text>
      ) : (
        <>
          <Select
            mb="md"
            searchable
            placeholder="Select an item group"
            nothingFoundMessage="No groups found"
            data={groups.map(g => ({ value: g.id, label: g.name }))}
            value={selectedGroupId}
            onChange={setSelectedGroupId}
            aria-label="Select item group"
          />

          {selectedGroup && (
            <Card withBorder style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 240px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 12px) + 12px)' }}>
              <Group justify="space-between" mb="md">
                {editingName ? (
                  <Group>
                    <TextInput value={editingNameDraft} onChange={e => setEditingNameDraft(e.target.value)} size="sm" />
                    <ActionIcon color="green" variant="light" onClick={async () => {
                      const newName = editingNameDraft.trim();
                      if (!newName) return;
                      await updateItemGroup(selectedGroup.id, { name: newName });
                      setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, name: newName } : g));
                      setEditingName(false);
                    }}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon color="gray" variant="light" onClick={() => setEditingName(false)}>
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                ) : (
                  <Group>
                    <Title order={3}>{selectedGroup.name}</Title>
                    {selectedGroup.description && <Text c="dimmed">{selectedGroup.description}</Text>}
                    <ActionIcon color="blue" variant="light" onClick={() => { setEditingName(true); setEditingNameDraft(selectedGroup.name || ''); }}>
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Group>
                )}
                <ActionIcon color="red" variant="light" onClick={() => handleDelete(selectedGroup.id)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>

              <Group style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Title order={4} mb="sm">Items</Title>
                <Group>
                  <Button size="xs" variant="light" leftSection={<IconPlus size={16} />} onClick={() => { setAddCategorySelections([]); setShowAddCategoryModal(true); }}>Add from categories</Button>
                  <Button size="xs" leftSection={<IconPlus size={16} />} onClick={() => setShowAddItemsDrawer({ open: true, groupId: selectedGroup.id })}>Add Item</Button>
                </Group>
              </Group>

              <List mb="md">
                {currentItems.length > 0 ? (
                  currentItems.map(item => (
                    <List.Item key={item.id}>
                      <Group justify="space-between">
                        <Text>{item.name}</Text>
                        <Group>
                          <Text c="dimmed" size="sm">{(itemMembers[item.id] || []).map(m => m.name).join(', ')}</Text>
                          <ActionIcon color="blue" variant="light" onClick={() => { setEditMasterItemId(item.id); setShowEditDrawer(true); }}>
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon color="red" variant="light" onClick={async () => {
                            await removeItemFromItemGroup(selectedGroup.id, item.id);
                            setGroupItems(prev => ({ ...prev, [selectedGroup.id]: (prev[selectedGroup.id] || []).filter(i => i.id !== item.id) }));
                          }}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    </List.Item>
                  ))
                ) : (
                  <List.Item><Text c="dimmed">No items in this group yet.</Text></List.Item>
                )}
              </List>
            </Card>
          )}
        </>
      )}

      <Modal opened={showAddCategoryModal} onClose={() => setShowAddCategoryModal(false)} title="Add all items from categories">
        <Text mb="sm">Select categories. Their current items will be added individually (duplicates are skipped):</Text>
        <Stack>
          {categories.map(c => (
            <Checkbox key={c.id} label={c.name} checked={addCategorySelections.includes(c.id)} onChange={e => {
              const checked = e.target.checked;
              setAddCategorySelections(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
            }} />
          ))}
        </Stack>
        <Group mt="md">
          <Button disabled={addCategorySelections.length === 0} onClick={async () => {
            if (!selectedGroupId) return;
            await addCategoryItemsToItemGroup(selectedGroupId, addCategorySelections);
            await refreshGroupItems(selectedGroupId);
            setAddCategorySelections([]);
            setShowAddCategoryModal(false);
          }}>Add</Button>
          <Button variant="outline" onClick={() => { setAddCategorySelections([]); setShowAddCategoryModal(false); }}>Cancel</Button>
        </Group>
      </Modal>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="New Item Group">
        <TextInput label="Item Group Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <Textarea label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <Group mt="md">
          <Button onClick={handleCreate}>Create</Button>
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
        </Group>
      </Modal>

      <AddItemsDrawer
        opened={showAddItemsDrawer.open}
        onClose={() => setShowAddItemsDrawer({ open: false })}
        familyId={familyId}
        excludedItemIds={excludedItemIds}
        showIsOneOffCheckbox={false}
        autoApplyOnCreate={true}
        onApply={async (ids: string[]) => {
          const gid = showAddItemsDrawer.groupId;
          if (!gid) return;
          for (const id of ids) {
            await assignItemToItemGroup(gid, id);
          }
          await refreshGroupItems(gid);
        }}
      />

      {showEditDrawer && editMasterItemId && (
        <ItemEditDrawer
          opened={showEditDrawer}
          masterItemId={editMasterItemId}
          onClose={() => { setShowEditDrawer(false); setEditMasterItemId(null); if (selectedGroupId) refreshGroupItems(selectedGroupId); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reconcile `ItemEditDrawer` props**

Run: `grep -nE "interface Props|opened|masterItemId|onClose" client/src/components/ItemEditDrawer.tsx | head`
Expected: shows the actual prop names. If `ItemEditDrawer` uses different prop names than `opened` / `masterItemId` / `onClose` (the original TemplateManager passed `editMasterItemId` into it — mirror exactly how the original code rendered `ItemEditDrawer`), adjust the `<ItemEditDrawer .../>` usage in Step 1 to match the real interface. Verified by the build in Step 4.

- [ ] **Step 3: Update `ComponentUsage.md`**

In `client/src/components/ComponentUsage.md`, update the `TemplateManager` entry to describe: a searchable `Select` group picker (no more tabs), an item-only list, "Add Item" (via `AddItemsDrawer`), and "Add from categories" (snapshot). Remove any mention of category panels/tabs.

- [ ] **Step 4: Build the client to typecheck the component in its real project context**

Run: `npm run build`
Expected: Vite build succeeds. Resolve any TypeScript/import errors originating from `TemplateManager.tsx` or `api.ts` (e.g. prop mismatches surfaced in Step 2, unused imports). Fix the component/helper rather than unrelated code. Re-run until the build passes.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TemplateManager.tsx client/src/components/ComponentUsage.md
git commit -m "feat(client): searchable item-group selector and add-from-categories action"
```

---

## Task 9: Update client tests for the new UI

**Files:**
- Modify: `client/src/__tests__/TemplateManager.test.tsx`

This file is NOT in the default `npm test` include set, so it will not gate CI, but keep it consistent and runnable on demand.

- [ ] **Step 1: Inspect the current test and its harness expectations**

Run: `sed -n '1,140p' client/src/__tests__/TemplateManager.test.tsx`
Expected: see how it mocks `../api` (e.g. `getItemGroups`, `getCategoriesForTemplate`, etc.) and renders the component.

- [ ] **Step 2: Update mocks and assertions to the item-only model**

- Remove mocks/assertions for removed helpers: `getCategoriesForTemplate`, `getCategoriesForItemGroup`, `assignCategoryToTemplate`, `assignCategoryToItemGroup`, `removeCategoryFromTemplate`, `removeCategoryFromItemGroup`.
- Ensure `getItemGroups` mock returns `{ response: { ok: true }, data: { itemGroups: [{ id: 'g1', name: 'Group 1' }] } }`.
- Mock `getItemsForItemGroup` to return `{ response: { ok: true }, data: { items: [...] } }`.
- Mock `getCategories` to return some categories for the "Add from categories" modal.
- Replace any tab-related assertions with selector assertions: assert the `Select` with `aria-label="Select item group"` renders and that the selected group's items appear. If the test harness lacks Mantine/DOM setup (per repo notes), copy the render/provider setup pattern used by `client/src/__tests__/GlobalListEditDrawer.test.tsx`.

- [ ] **Step 3: Run the test (best-effort)**

Run: `npx vitest --run client/src/__tests__/TemplateManager.test.tsx`
Expected: PASS. If the client harness is missing globals/providers and cannot be made green within this task without broader setup work, leave the file updated to the new API surface (no references to removed helpers) and note the harness gap in the commit message rather than fabricating a pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/__tests__/TemplateManager.test.tsx
git commit -m "test(client): update TemplateManager tests for item-only selector UI"
```

---

## Task 10: Full verification sweep

**Files:** none

- [ ] **Step 1: Run the root test suite (server + integration + included client test)**

Run: `npm test`
Expected: All suites pass. Investigate and fix any failure tied to removed category routes/helpers (search the repo for the removed names and update call sites/tests). Do NOT claim success without seeing the passing summary line.

- [ ] **Step 2: Confirm no lingering references to removed symbols**

Run:
```bash
grep -rnE "template_categories|TemplateCategory|getCategoriesForTemplate|getCategoriesForItemGroup|assignCategoryToTemplate|assignCategoryToItemGroup|removeCategoryFromTemplate|removeCategoryFromItemGroup|getTemplatesReferencingCategory" server client/src --include=*.ts --include=*.tsx
```
Expected: No matches (empty output) except possibly inside the new migration's `down()` which legitimately recreates `template_categories`. Resolve anything else.

- [ ] **Step 3: Build the client**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Final commit (if any fixups were made)**

```bash
git add -A
git commit -m "chore: finalize item-only item groups verification fixups" --allow-empty
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** Migration (Task 2), runner fix (Task 1), full backend category removal (Tasks 3-5), item-only `getExpandedItems` (Task 3), `add-category-items` snapshot endpoint + helper + UI (Tasks 4, 7, 8), searchable selector (Task 8), docs (Tasks 7, 8), tests (Tasks 2, 4, 9, 10) — all mapped.
- **Dedupe** is enforced by `INSERT OR IGNORE` against the `template_items` PRIMARY KEY `(template_id, item_id)` and verified in Task 2 and Task 4 tests.
- **Down migration is intentionally non-reversible** for data — documented in the migration file.
- **Naming consistency:** repo method `addCategoryItems`; API helper `addCategoryItemsToItemGroup`; route `POST /item-group/:id/add-category-items`; body `{ categoryIds }` — consistent across Tasks 3, 4, 7, 8.
