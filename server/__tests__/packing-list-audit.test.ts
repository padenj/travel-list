import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository, CategoryRepository, ItemRepository, PackingListRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Packing list audit log', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let categoryRepo: CategoryRepository;
  let itemRepo: ItemRepository;
  let packingListRepo: PackingListRepository;
  let familyId: string;
  let adminToken: string;
  let adminUserId: string;
  let adminUsername: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    await getDb();
    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();
    categoryRepo = new CategoryRepository();
    itemRepo = new ItemRepository();
    packingListRepo = new PackingListRepository();

    familyId = uuidv4();
    await familyRepo.create({ id: familyId, name: 'Audit Family', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    adminUserId = uuidv4();
    adminUsername = `admin_audit_${Date.now()}`;
    await userRepo.create({
      id: adminUserId,
      username: adminUsername,
      password: hashPasswordSync('AdminPass1!'),
      role: USER_ROLES.SYSTEM_ADMIN,
      must_change_password: false,
      email: 'a@a.com',
      familyId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const createdAdmin = await userRepo.findByUsername(adminUsername);
    if (!createdAdmin) throw new Error('admin not created');
    adminToken = generateToken(createdAdmin);
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM packing_list_audit_log');
      await db.run('DELETE FROM packing_list_item_templates');
      await db.run('DELETE FROM packing_list_templates');
      await db.run('DELETE FROM packing_list_item_checks');
      await db.run('DELETE FROM packing_list_item_not_needed');
      await db.run('DELETE FROM packing_list_items');
      await db.run('DELETE FROM packing_list_members');
      await db.run('DELETE FROM packing_lists');
      await db.run('DELETE FROM template_items');
      await db.run('DELETE FROM template_categories');
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM item_whole_family');
      await db.run('DELETE FROM item_members');
      await db.run('DELETE FROM items');
      await db.run('DELETE FROM categories');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch {
      // ignore
    }
    await closeDb();
  });

  it('writes audit entries for add/check/not-needed/remove and can query per-list and per-item', async () => {
    const catId = uuidv4();
    await categoryRepo.create({ id: catId, familyId, name: 'Essentials', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const itemId = uuidv4();
    await itemRepo.create({ id: itemId, familyId, name: 'Passport', checked: 0, isOneOff: 0, categoryId: catId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);

    const listId = uuidv4();
    await packingListRepo.create({ id: listId, family_id: familyId, name: 'Trip', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    // add item
    const addResp = await request(app)
      .post(`/api/packing-lists/${listId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ masterItemId: itemId });
    expect(addResp.status).toBe(200);
    const pliId = addResp.body.item?.id;
    expect(typeof pliId).toBe('string');

    // check (member scoped)
    const checkResp = await request(app)
      .patch(`/api/packing-lists/${listId}/items/${pliId}/check`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: adminUserId, checked: true });
    expect(checkResp.status).toBe(200);

    // not-needed (family scoped)
    const nnResp = await request(app)
      .patch(`/api/packing-lists/${listId}/items/${pliId}/not-needed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notNeeded: true });
    expect(nnResp.status).toBe(200);

    // per-item audit
    const itemAuditResp = await request(app)
      .get(`/api/packing-lists/${listId}/items/${pliId}/audit?limit=50`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(itemAuditResp.status).toBe(200);
    expect(Array.isArray(itemAuditResp.body.items)).toBe(true);
    const itemActions = itemAuditResp.body.items.map((a: any) => a.action);
    expect(itemActions).toContain('ITEM_ADDED');
    expect(itemActions).toContain('ITEM_CHECKED');
    expect(itemActions).toContain('ITEM_NOT_NEEDED');
    expect(itemAuditResp.body.items[0]).toHaveProperty('actorName');

    // remove
    const delResp = await request(app)
      .delete(`/api/packing-lists/${listId}/items/${pliId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delResp.status).toBe(200);

    // per-list audit includes removed
    const listAuditResp = await request(app)
      .get(`/api/packing-lists/${listId}/audit?limit=50`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listAuditResp.status).toBe(200);
    const listActions = listAuditResp.body.items.map((a: any) => a.action);
    expect(listActions).toContain('ITEM_REMOVED');
  });

  it('paginates audit entries with beforeId cursor', async () => {
    const catId = uuidv4();
    await categoryRepo.create({ id: catId, familyId, name: 'Essentials', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const itemId = uuidv4();
    await itemRepo.create({ id: itemId, familyId, name: 'Socks', checked: 0, isOneOff: 0, categoryId: catId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);

    const listId = uuidv4();
    await packingListRepo.create({ id: listId, family_id: familyId, name: 'Trip', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const addResp = await request(app)
      .post(`/api/packing-lists/${listId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ masterItemId: itemId });
    const pliId = addResp.body.item?.id;

    // Generate > 50 audit entries by toggling check
    for (let i = 0; i < 55; i++) {
      await request(app)
        .patch(`/api/packing-lists/${listId}/items/${pliId}/check`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: adminUserId, checked: i % 2 === 0 });
    }

    const page1 = await request(app)
      .get(`/api/packing-lists/${listId}/audit?limit=50`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.items.length).toBe(50);
    expect(page1.body.nextBeforeId).toBeTruthy();

    const beforeId = page1.body.nextBeforeId;
    const page2 = await request(app)
      .get(`/api/packing-lists/${listId}/audit?limit=50&beforeId=${beforeId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.items.length).toBeGreaterThan(0);

    // Ensure cursor pagination moves backwards
    const ids1 = page1.body.items.map((a: any) => a.id);
    const ids2 = page2.body.items.map((a: any) => a.id);
    expect(ids1.some((id: any) => ids2.includes(id))).toBe(false);
  });
});
