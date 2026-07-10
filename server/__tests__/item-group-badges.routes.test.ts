import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository, TemplateRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Item group badges route regressions', () => {
  let app: express.Application;
  let familyId: string;
  let adminToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    const db = await getDb();
    const userRepo = new UserRepository();
    const familyRepo = new FamilyRepository();

    familyId = uuidv4();
    const now = new Date().toISOString();
    await familyRepo.create({ id: familyId, name: 'Badge Family', created_at: now, updated_at: now });

    const adminId = uuidv4();
    const adminUsername = `admin_badges_${Date.now()}`;
    await userRepo.create({
      id: adminId,
      username: adminUsername,
      password: hashPasswordSync('AdminPass1!'),
      role: USER_ROLES.SYSTEM_ADMIN,
      must_change_password: false,
      email: `${adminUsername}@example.com`,
      familyId,
      created_at: now,
      updated_at: now,
    });

    const createdAdmin = await userRepo.findByUsername(adminUsername);
    if (!createdAdmin) throw new Error('admin not created');
    adminToken = generateToken(createdAdmin);

    const categoryId = uuidv4();
    const itemId = uuidv4();
    const allTripsId = uuidv4();
    const campingId = uuidv4();

    await db.run(
      `INSERT INTO categories (id, familyId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [categoryId, familyId, 'Toiletries', now, now]
    );
    await db.run(
      `INSERT INTO items (id, familyId, categoryId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [itemId, familyId, categoryId, 'Aloe', now, now]
    );

    const templateRepo = new TemplateRepository();
    await templateRepo.create({ id: allTripsId, family_id: familyId, name: 'All Trips', created_at: now, updated_at: now });
    await templateRepo.create({ id: campingId, family_id: familyId, name: 'Camping', created_at: now, updated_at: now });
    await templateRepo.assignItem(allTripsId, itemId);
    await templateRepo.assignItem(campingId, itemId);

    // store ids on app locals for each test
    app.locals.categoryId = categoryId;
    app.locals.allTripsId = allTripsId;
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM template_items');
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM item_members');
      await db.run('DELETE FROM item_whole_family');
      await db.run('DELETE FROM items');
      await db.run('DELETE FROM categories');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch {
      // ignore cleanup errors
    }
    await closeDb();
  });

  it('GET /api/categories/:categoryId/items returns itemGroupNames with all item group names', async () => {
    const res = await request(app)
      .get(`/api/categories/${app.locals.categoryId}/items`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].itemGroupNames).toEqual(['All Trips', 'Camping']);
  });

  it('GET /api/item-group/:id/items includes current group in itemGroupNames', async () => {
    const res = await request(app)
      .get(`/api/item-group/${app.locals.allTripsId}/items`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].itemGroupNames).toContain('All Trips');
    expect(res.body.items[0].itemGroupNames).toEqual(['All Trips', 'Camping']);
  });
});
