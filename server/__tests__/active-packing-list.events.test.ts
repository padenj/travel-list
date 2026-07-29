import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

const { broadcastEvent } = vi.hoisted(() => ({ broadcastEvent: vi.fn() }));
vi.mock('../sse', async () => {
  const actual = await vi.importActual<typeof import('../sse')>('../sse');
  return { ...actual, broadcastEvent };
});
import routes from '../routes';

describe('Active packing list SSE events', () => {
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
    await familyRepo.create({
      id: testFamilyId,
      name: 'Test Family',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const adminUserId = uuidv4();
    const adminUsername = `admin_${Date.now()}`;
    await userRepo.create({
      id: adminUserId,
      username: adminUsername,
      password: hashPasswordSync('AdminPass1!'),
      role: USER_ROLES.SYSTEM_ADMIN,
      must_change_password: false,
      email: 'a@a.com',
      familyId: testFamilyId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const createdAdmin = await userRepo.findByUsername(adminUsername);
    if (!createdAdmin) throw new Error('admin not created');
    adminToken = generateToken(createdAdmin);
    broadcastEvent.mockReset();
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

  it('emits family_active_list_changed when active list is updated', async () => {
    const createRes = await request(app)
      .post(`/api/families/${testFamilyId}/packing-lists`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Active Trip' });

    expect(createRes.status).toBe(200);
    const listId = createRes.body.list.id as string;

    const patchRes = await request(app)
      .patch(`/api/families/${testFamilyId}/active-packing-list`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ listId });

    expect(patchRes.status).toBe(200);
    expect(broadcastEvent).toHaveBeenCalledWith({
      type: 'family_active_list_changed',
      familyId: testFamilyId,
      listId,
    });
  });
});
