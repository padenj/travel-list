import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { seedTemplatesForFamily } from '../seed-templates';
import { TemplateRepository, CategoryRepository, ItemRepository, FamilyRepository } from '../repositories';
import { getDb, closeDb } from '../db';

describe('seedTemplatesForFamily', () => {
  beforeEach(() => {
    // Ensure in-memory DB is used
    process.env.VITEST = '1';
  });

  afterEach(async () => {
    // Close DB between tests
    await closeDb();
    delete process.env.VITEST;
  });

  it('creates a family with categories, items, and templates', async () => {
    // Run seeder (no familyId => new family created)
    await seedTemplatesForFamily();

    // Open DB and inspect created data
    await getDb();
    const familyRepo = new FamilyRepository();
    const families = await familyRepo.findAll();
    expect(families.length).toBeGreaterThan(0);
    const family = families[0];

    const categoryRepo = new CategoryRepository();
    const categories = await categoryRepo.findAll(family.id);
    expect(categories.length).toBeGreaterThan(0);

    const itemRepo = new ItemRepository();
    const items = await itemRepo.findAll(family.id);
    expect(items.length).toBeGreaterThan(0);

    const templateRepo = new TemplateRepository();
    const templates = await templateRepo.findAll(family.id);
    expect(templates.length).toBeGreaterThan(0);
  });
});
