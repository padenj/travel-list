import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository, CategoryRepository, ItemRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Items routes', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let categoryRepo: CategoryRepository;
  let itemRepo: ItemRepository;
  let familyId: string;
  let adminToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    await getDb();
    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();
    categoryRepo = new CategoryRepository();
    itemRepo = new ItemRepository();

    familyId = uuidv4();
    await familyRepo.create({ id: familyId, name: 'Items Family', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const adminUserId = uuidv4();
    const adminUsername = `admin_items_${Date.now()}`;
    await userRepo.create({ id: adminUserId, username: adminUsername, password: hashPasswordSync('AdminPass1!'), role: USER_ROLES.SYSTEM_ADMIN, must_change_password: false, email: 'a@a.com', familyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const createdAdmin = await userRepo.findByUsername(adminUsername);
    if (!createdAdmin) throw new Error('admin not created');
    adminToken = generateToken(createdAdmin);
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      // cleanup many tables touched by item flows
      await db.run('DELETE FROM packing_list_item_templates');
      await db.run('DELETE FROM packing_list_templates');
      await db.run('DELETE FROM packing_list_item_checks');
      await db.run('DELETE FROM packing_list_items');
      await db.run('DELETE FROM packing_lists');
      await db.run('DELETE FROM template_items');
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM items');
      await db.run('DELETE FROM categories');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch (err) {
      // ignore
    }
    await closeDb();
  });

  it('creates, updates, assigns and returns edit-data for an item', async () => {
    // Create a category to assign to the item
    const cid = uuidv4();
    await categoryRepo.create({ id: cid, familyId, name: 'Essentials', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    // Create an item via API (include required categoryId)
    const createResp = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ familyId, name: 'Wallet', categoryId: cid });
    expect(createResp.status).toBe(200);
    const created = createResp.body.item;
    expect(created).toBeDefined();
    expect(created.name).toBe('Wallet');
    const itemId = created.id;

    // Ensure listing items for family returns it
    const listResp = await request(app)
      .get(`/api/items/${familyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(listResp.status).toBe(200);
    expect(Array.isArray(listResp.body.items)).toBe(true);
    expect(listResp.body.items.map((i: any) => i.id)).toContain(itemId);

    // Update the item
    const updResp = await request(app)
      .put(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Travel Wallet' });
    expect(updResp.status).toBe(200);
    expect(updResp.body.item).toBeDefined();
    expect(updResp.body.item.name).toBe('Travel Wallet');

    // Create a new category and assign it to the item
    const cid2 = uuidv4();
    await categoryRepo.create({ id: cid2, familyId, name: 'Accessories', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const assignCat = await request(app)
      .post(`/api/items/${itemId}/categories/${cid2}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(assignCat.status).toBe(200);

    // Create a family member and assign to item
    const memberId = uuidv4();
    await userRepo.create({ id: memberId, username: `member_${Date.now()}`, password: hashPasswordSync('Member1!'), role: USER_ROLES.FAMILY_MEMBER, must_change_password: false, email: '', familyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const assignMem = await request(app)
      .post(`/api/items/${itemId}/members/${memberId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(assignMem.status).toBe(200);

    // Assign to whole family
    const assignWhole = await request(app)
      .post(`/api/items/${itemId}/whole-family/${familyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(assignWhole.status).toBe(200);

    // Fetch item categories via the item-specific endpoint
    const catResp = await request(app)
      .get(`/api/items/${itemId}/categories`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(catResp.status).toBe(200);
    expect(Array.isArray(catResp.body.categories)).toBe(true);
    const catIds = catResp.body.categories.map((c: any) => c.id);
    expect(catIds).toContain(cid2);

    // Fetch item members
    const memResp = await request(app)
      .get(`/api/items/${itemId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(memResp.status).toBe(200);
    expect(Array.isArray(memResp.body.members)).toBe(true);
    expect(memResp.body.members.map((m: any) => m.id)).toContain(memberId);

    // Fetch whole-family assignment for the item
    const wholeResp = await request(app)
      .get(`/api/items/${itemId}/whole-family`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(wholeResp.status).toBe(200);
    expect(wholeResp.body.item).toBeDefined();

    // Remove whole-family assignment
    const remWhole = await request(app)
      .delete(`/api/items/${itemId}/whole-family`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(remWhole.status).toBe(200);

    // Delete the item
    const delResp = await request(app)
      .delete(`/api/items/${itemId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(delResp.status).toBe(200);

    // Confirm item not returned in family list
    const listAfter = await request(app)
      .get(`/api/items/${familyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();
    expect(listAfter.status).toBe(200);
    expect(listAfter.body.items.map((i: any) => i.id)).not.toContain(itemId);
  });
});
