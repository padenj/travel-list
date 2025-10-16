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
});

  it('should expand items from categories and direct items', async () => {
    const repo = new TemplateRepository();
    const template_id = uuidv4();
    const family_id = uuidv4();
    const db = await getDb();
    await db.run('PRAGMA foreign_keys = ON');
    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [family_id, 'ExpandFam', new Date().toISOString(), new Date().toISOString()]);
    await repo.create({
      id: template_id,
      family_id,
      name: 'Expand Test',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  // Insert category and items
  const catId = uuidv4();
  const itemId1 = uuidv4();
  const itemId2 = uuidv4();
  await db.run(`INSERT INTO categories (id, familyId, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`, [catId, family_id, 'Cat', new Date().toISOString(), new Date().toISOString()]);
  await db.run(`INSERT INTO items (id, familyId, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`, [itemId1, family_id, 'Item1', new Date().toISOString(), new Date().toISOString()]);
  await db.run(`INSERT INTO items (id, familyId, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, NULL)`, [itemId2, family_id, 'Item2', new Date().toISOString(), new Date().toISOString()]);
  // Assign via the single-category column on items
  await db.run(`UPDATE items SET categoryId = ? WHERE id = ?`, [catId, itemId1]);
  await repo.assignCategory(template_id, catId);
  await repo.assignItem(template_id, itemId2);
  const expanded = await repo.getExpandedItems(template_id);
  const expandedIds = expanded.map(i => i.id);
  expect(expandedIds).toContain(itemId1);
  expect(expandedIds).toContain(itemId2);
  });
