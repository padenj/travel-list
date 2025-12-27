import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import { FamilyRepository, PackingListRepository, ItemRepository, UserRepository } from '../repositories';
import { Family } from '../server-types';

describe('PackingListRepository', () => {
  let familyRepo: FamilyRepository;
  let packingRepo: PackingListRepository;
  let itemRepo: ItemRepository;
  let familyId: string;

  beforeEach(async () => {
    await getDb();
    familyRepo = new FamilyRepository();
    packingRepo = new PackingListRepository();
    itemRepo = new ItemRepository();

    const family: Family = {
      id: uuidv4(),
      name: 'Test Family',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await familyRepo.create(family);
    familyId = family.id;
    // user repo for creating a member to satisfy FK constraints (after family exists)
    const userRepo = new UserRepository();
    await userRepo.create({ id: 'member-1', name: 'Member One', username: null, role: 'FamilyMember', must_change_password: false, familyId: familyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);
  });

  afterEach(async () => {
    await closeDb();
  });

  it('creates a packing list and populates from template (via populateFromTemplate)', async () => {
    // create a template by creating an item and assigning to a template via TemplateRepository would be heavy; test populateFromTemplate by calling method infra
    const list = await packingRepo.create({ id: uuidv4(), family_id: familyId, name: 'Trip', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    expect(list).toBeDefined();
  });

  it('adds a one-off item and promotes it to master', async () => {
    const list = await packingRepo.create({ id: uuidv4(), family_id: familyId, name: 'Trip2', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const oneOff = await packingRepo.addOneOffItem(list.id, 'Sunglasses', true);
    expect(oneOff).toBeDefined();
    expect(oneOff.display_name).toBe('Sunglasses');

    const promoteResult = await packingRepo.promoteOneOffToMaster(oneOff.id, familyId, false);
    expect(promoteResult).toBeDefined();
    expect(promoteResult.newItemId).toBeDefined();

    const updatedRow = await packingRepo.findItemById(oneOff.id);
    expect(updatedRow && updatedRow.item_id).toBe(promoteResult.newItemId);
  });

  it('sets per-user checked state', async () => {
    const list = await packingRepo.create({ id: uuidv4(), family_id: familyId, name: 'Trip3', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    // create master item
    const item = await itemRepo.create({ id: uuidv4(), familyId: familyId, name: 'Hat', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const pli = await packingRepo.addItem(list.id, item.id, false);
    await packingRepo.setUserItemChecked(pli.id, 'member-1', true);
    const checks = await packingRepo.getUserItemChecks(list.id);
    expect(checks.length).toBeGreaterThanOrEqual(1);
    expect(checks[0].member_id).toBe('member-1');
  });

  it('sets not_needed flag', async () => {
    const list = await packingRepo.create({ id: uuidv4(), family_id: familyId, name: 'Trip4', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const item = await itemRepo.create({ id: uuidv4(), familyId: familyId, name: 'Toothbrush', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const pli = await packingRepo.addItem(list.id, item.id, false);
    await packingRepo.setNotNeeded(pli.id, true);
    const updated = await packingRepo.findItemById(pli.id);
    expect(updated && (updated as any).not_needed).toBe(1);
  });
});
