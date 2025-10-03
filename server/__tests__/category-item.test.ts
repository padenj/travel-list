import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { CategoryRepository, ItemRepository, UserRepository, FamilyRepository } from '../repositories';
import { getDb, closeDb } from '../db';
import { Category, Item, Family, User } from '../server-types';

describe('Category and Item Repositories', () => {
  let categoryRepo: CategoryRepository;
  let itemRepo: ItemRepository;
  let familyRepo: FamilyRepository;
  let userRepo: UserRepository;
  let testFamilyId: string;
  let testMemberId: string;

  beforeEach(async () => {
    categoryRepo = new CategoryRepository();
    itemRepo = new ItemRepository();
    familyRepo = new FamilyRepository();
    userRepo = new UserRepository();
    await getDb();
    // Create a test family and member
    const family = await familyRepo.create({
      id: uuidv4(),
      name: 'Test Family',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    testFamilyId = family.id;
    const member = await userRepo.create({
      id: uuidv4(),
      name: 'Test Member',
      username: 'testmember',
      password: 'hashedpassword',
      role: 'FamilyMember',
      must_change_password: false,
      email: 'member@example.com',
      familyId: testFamilyId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    testMemberId = member.id;
  });

  afterEach(async () => {
    await closeDb();
  });

  it('should create and fetch a category', async () => {
    const category = await categoryRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'Beach',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    expect(category.name).toBe('Beach');
    const found = await categoryRepo.findById(category.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Beach');
  });

  it('should update a category', async () => {
    const category = await categoryRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'Original',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const updated = await categoryRepo.update(category.id, { name: 'Updated' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Updated');
  });

  it('should soft delete a category', async () => {
    const category = await categoryRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'DeleteMe',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await categoryRepo.softDelete(category.id);
    const found = await categoryRepo.findById(category.id);
    expect(found).toBeUndefined();
  });

  it('should create and fetch an item', async () => {
    const item = await itemRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'Sunscreen',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    expect(item.name).toBe('Sunscreen');
    const found = await itemRepo.findById(item.id);
    expect(found).toBeDefined();
    expect(found!.name).toBe('Sunscreen');
  });

  it('should update an item', async () => {
    const item = await itemRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'OriginalItem',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const updated = await itemRepo.update(item.id, { name: 'UpdatedItem' });
    expect(updated).toBeDefined();
    expect(updated!.name).toBe('UpdatedItem');
  });

  it('should soft delete an item', async () => {
    const item = await itemRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'DeleteItem',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await itemRepo.softDelete(item.id);
    const found = await itemRepo.findById(item.id);
    expect(found).toBeUndefined();
  });

  it('should assign item to category and fetch categories for item', async () => {
    const category = await categoryRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'Beach',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const item = await itemRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'Sunscreen',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await itemRepo.assignToCategory(item.id, category.id);
    const categories = await itemRepo.getCategoriesForItem(item.id);
    expect(categories.map(c => c.name)).toContain('Beach');
  });

  it('should assign item to member and fetch members for item', async () => {
    const item = await itemRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'Passport',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await itemRepo.assignToMember(item.id, testMemberId);
    const members = await itemRepo.getMembersForItem(item.id);
    expect(members.map(m => m.id)).toContain(testMemberId);
  });

  it('should assign item to whole family and check assignment', async () => {
    const item = await itemRepo.create({
      id: uuidv4(),
      familyId: testFamilyId,
      name: 'First Aid Kit',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    await itemRepo.assignToWholeFamily(item.id, testFamilyId);
    const isWholeFamily = await itemRepo.isAssignedToWholeFamily(item.id);
    expect(isWholeFamily).toBe(true);
    await itemRepo.removeFromWholeFamily(item.id);
    const isWholeFamilyAfter = await itemRepo.isAssignedToWholeFamily(item.id);
    expect(isWholeFamilyAfter).toBe(false);
  });
});
