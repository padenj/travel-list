import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Packing lists routes', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let testFamilyId: string;
  let adminToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    await getDb();

    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();

    testFamilyId = uuidv4();
    await familyRepo.create({ id: testFamilyId, name: 'Test Family', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const adminUserId = uuidv4();
    const adminUsername = `admin_${Date.now()}`;
    await userRepo.create({ id: adminUserId, username: adminUsername, password: hashPasswordSync('AdminPass1!'), role: USER_ROLES.SYSTEM_ADMIN, must_change_password: false, email: 'a@a.com', familyId: testFamilyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const createdAdmin = await userRepo.findByUsername(adminUsername);
    if (!createdAdmin) throw new Error('admin not created');
    adminToken = generateToken(createdAdmin);
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM packing_list_item_checks');
      await db.run('DELETE FROM packing_list_items');
      await db.run('DELETE FROM packing_lists');
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM items');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch (err) {
      // ignore
    }
    await closeDb();
  });

  it('creates a packing list and adds a one-off item through the API', async () => {
    const createRes = await request(app)
      .post(`/api/families/${testFamilyId}/packing-lists`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'API Trip' });

    expect(createRes.status).toBe(200);
    const list = createRes.body.list;
    expect(list).toBeDefined();

    const addRes = await request(app)
      .post(`/api/packing-lists/${list.id}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ oneOff: { name: 'Travel Pillow' } });

    expect(addRes.status).toBe(200);
    expect(addRes.body.item).toBeDefined();
    expect(addRes.body.item.display_name).toBe('Travel Pillow');
  });
});
