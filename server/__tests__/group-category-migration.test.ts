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
  await db.exec(`CREATE TABLE IF NOT EXISTS item_group_categories (
    item_group_id TEXT NOT NULL,
    category_id TEXT NOT NULL
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

    const igcExists = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='item_group_categories'`);
    expect(igcExists).toBeUndefined();
  });
});
