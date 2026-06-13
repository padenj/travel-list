import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateRepository } from '../repositories';
import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';

// Helper to reset DB for each test
beforeEach(async () => {
  const db = await getDb();
  await db.exec('PRAGMA foreign_keys = ON');
  // Explicitly create tables needed for tests
  await db.exec(`CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    familyId TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (familyId) REFERENCES families(id)
  );`);
  await db.exec(`CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    familyId TEXT NOT NULL,
    categoryId TEXT,
    name TEXT NOT NULL,
    checked INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (familyId) REFERENCES families(id)
  );`);
  // Ensure tables exist. Legacy many-to-many storage removed; tests should
  // use the single-column assignment on items (categoryId) instead.
  await db.exec('DELETE FROM templates');
  await db.exec('DELETE FROM template_categories');
  await db.exec('DELETE FROM template_items');
  await db.exec('DELETE FROM families');
  await db.exec('DELETE FROM categories');
  await db.exec('DELETE FROM items');
});

describe('TemplateRepository', () => {
  it('should create, fetch, update, and delete a template', async () => {
    const repo = new TemplateRepository();
    const id = uuidv4();
    const family_id = uuidv4();
    const db = await getDb();
    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [family_id, 'TestFam', new Date().toISOString(), new Date().toISOString()]);
    const created = await repo.create({
      id,
      family_id,
      name: 'Test Template',
      description: 'A template for testing',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    expect(created.name).toBe('Test Template');
    const fetched = await repo.findById(id);
    expect(fetched?.name).toBe('Test Template');
    await repo.update(id, { name: 'Updated Template' });
    const updated = await repo.findById(id);
    expect(updated?.name).toBe('Updated Template');
    await repo.softDelete(id);
    const deleted = await repo.findById(id);
    expect(deleted).toBeUndefined();
  });

  it('should snapshot category items into direct template items and expand item-only results', async () => {
    const repo = new TemplateRepository();
    const template_id = uuidv4();
    const family_id = uuidv4();
    const db = await getDb();
    const now = new Date().toISOString();
    const categoryId = uuidv4();
    const snapshottedItemId = uuidv4();
    const existingDirectItemId = uuidv4();
    const lateCategoryItemId = uuidv4();

    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [family_id, 'ExpandFam', new Date().toISOString(), new Date().toISOString()]);
    await repo.create({
      id: template_id,
      family_id,
      name: 'Expand Test',
      created_at: now,
      updated_at: now,
    });

    await db.run(
      `INSERT INTO categories (id, familyId, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`,
      [categoryId, family_id, 'Category', now, now]
    );
    await db.run(
      `INSERT INTO items (id, familyId, categoryId, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [snapshottedItemId, family_id, categoryId, 'Snapshotted item', now, now]
    );
    await db.run(
      `INSERT INTO items (id, familyId, categoryId, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [existingDirectItemId, family_id, categoryId, 'Existing direct item', now, now]
    );

    await repo.assignItem(template_id, existingDirectItemId);

    const templateItems = await repo.addCategoryItems(template_id, [categoryId]);
    const templateItemIds = templateItems.map(item => item.id).sort();

    expect(templateItemIds).toEqual([existingDirectItemId, snapshottedItemId].sort());

    await db.run(
      `INSERT INTO items (id, familyId, categoryId, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [lateCategoryItemId, family_id, categoryId, 'Late category item', now, now]
    );

    const expanded = await repo.getExpandedItems(template_id);
    const expandedIds = expanded.map(item => item.id).sort();

    expect(expandedIds).toEqual([existingDirectItemId, snapshottedItemId].sort());
    expect(expandedIds).not.toContain(lateCategoryItemId);
  });
});
