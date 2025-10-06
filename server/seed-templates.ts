import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { FamilyRepository, CategoryRepository, ItemRepository, TemplateRepository } from './repositories';
import { getDb, closeDb } from './db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.resolve(__dirname, 'seeds', 'example-templates.json');
const raw = readFileSync(filePath, 'utf-8');
const seed = JSON.parse(raw) as any;

export async function seedTemplatesForFamily(passedFamilyId?: string, familyNameOverride?: string) {
  const familyRepo = new FamilyRepository();
  const categoryRepo = new CategoryRepository();
  const itemRepo = new ItemRepository();
  const templateRepo = new TemplateRepository();

  // Create a database connection (ensures schema exists)
  await getDb();

  let familyId = passedFamilyId;

  // If a familyId was provided, check if templates already exist for that family and skip if so
  if (familyId) {
    const existingFamily = await familyRepo.findById(familyId);
    if (existingFamily) {
      const existingTemplates = await templateRepo.findAll(familyId);
      if (existingTemplates && existingTemplates.length > 0) {
        console.log(`Skipping seeding: templates already exist for family ${familyId}`);
        await closeDb();
        return;
      }
    } else {
      // Create family record if it doesn't exist
      await familyRepo.create({ id: familyId, name: familyNameOverride || seed.familyName, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
  } else {
    // No familyId provided -- create a new family and use its id
    familyId = uuidv4();
    console.log(`Creating family: ${familyNameOverride || seed.familyName} (${familyId})`);
    await familyRepo.create({ id: familyId, name: familyNameOverride || seed.familyName, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }

  // Create categories
  const categoryMap: Record<string, string> = {};
  for (const catName of seed.categories || []) {
    const id = uuidv4();
    await categoryRepo.create({ id, familyId, name: catName, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    categoryMap[catName] = id;
    console.log(`  - category: ${catName} (${id})`);
  }

  // Create items
  const itemMap: Record<string, string> = {};
  for (const itemDef of seed.items || []) {
    const id = uuidv4();
    await itemRepo.create({ id, familyId, name: itemDef.name, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    itemMap[itemDef.name] = id;
    // assign categories for the item
    for (const catName of itemDef.categories || []) {
      const catId = categoryMap[catName];
      if (catId) {
        await itemRepo.assignToCategory(id, catId);
      }
    }
    console.log(`  - item: ${itemDef.name} (${id})`);
  }

  // Create templates and assignments
  for (const tpl of seed.templates || []) {
    const tplId = uuidv4();
    await templateRepo.create({ id: tplId, family_id: familyId, name: tpl.name, description: tpl.description || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    console.log(`  - template: ${tpl.name} (${tplId})`);
    for (const catName of tpl.categories || []) {
      const catId = categoryMap[catName];
      if (catId) await templateRepo.assignCategory(tplId, catId);
    }
    for (const itemName of tpl.items || []) {
      const itemId = itemMap[itemName];
      if (itemId) await templateRepo.assignItem(tplId, itemId);
    }
  }

  console.log('\nSeeding complete.');
  // In test environments (Vitest) we avoid closing the DB so the in-memory
  // connection remains available for assertions in the test runner.
  if (!process.env.VITEST) {
    await closeDb();
  }
}

// Note: seeding is intended to be invoked programmatically (for example by
// the POST /api/families route) or from tests. There is no CLI runner.
