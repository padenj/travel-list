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
      .send({ oneOff: { name: 'Travel Pillow', categoryId: (await (async () => {
        // Create a category and return its id
        const cid = uuidv4();
        const db = await getDb();
        await db.run('INSERT INTO categories (id, familyId, name, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)', [cid, testFamilyId, 'Uncategorized', new Date().toISOString(), new Date().toISOString(), null]);
        return cid;
      })()) } });

    expect(addRes.status).toBe(200);
    expect(addRes.body.item).toBeDefined();
    expect(addRes.body.item.display_name).toBe('Travel Pillow');
  });

  it('returns list notes from GET /packing-lists/:id after notes are set', async () => {
    const createRes = await request(app)
      .post(`/api/families/${testFamilyId}/packing-lists`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Notes Trip' });

    expect(createRes.status).toBe(200);
    const listId = createRes.body.list.id;

    const putRes = await request(app)
      .put(`/api/packing-lists/${listId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Remember adapters and rain cover.' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.list.notes).toBe('Remember adapters and rain cover.');

    const getRes = await request(app)
      .get(`/api/packing-lists/${listId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.list.notes).toBe('Remember adapters and rain cover.');
  });

  it('does not include notes in GET /families/:familyId/packing-lists summaries', async () => {
    const createRes = await request(app)
      .post(`/api/families/${testFamilyId}/packing-lists`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Summary Trip' });

    expect(createRes.status).toBe(200);
    const listId = createRes.body.list.id;

    const putRes = await request(app)
      .put(`/api/packing-lists/${listId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Should stay private to detail endpoint' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.list.notes).toBe('Should stay private to detail endpoint');

    const familyListsRes = await request(app)
      .get(`/api/families/${testFamilyId}/packing-lists`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(familyListsRes.status).toBe(200);
    expect(Array.isArray(familyListsRes.body.lists)).toBe(true);
    expect(familyListsRes.body.lists).toHaveLength(1);
    expect(familyListsRes.body.lists[0]).not.toHaveProperty('notes');
  });

  it('rejects non-string notes payload in PUT /packing-lists/:id', async () => {
    const createRes = await request(app)
      .post(`/api/families/${testFamilyId}/packing-lists`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Invalid Notes Trip' });

    expect(createRes.status).toBe(200);
    const listId = createRes.body.list.id;

    const putRes = await request(app)
      .put(`/api/packing-lists/${listId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: { invalid: true } });

    expect(putRes.status).toBe(400);
    expect(putRes.body).toEqual({ error: 'notes must be a string' });
  });
});
