import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../../server/routes';
import { getDb, closeDb } from '../../server/db';
import { UserRepository, FamilyRepository } from '../../server/repositories';
import { hashPasswordSync, generateToken } from '../../server/auth';
import { USER_ROLES } from '../../server/constants';

describe('Templates E2E', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let adminToken: string;
  let testFamilyId: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    const db = await getDb();
    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();

    testFamilyId = uuidv4();
    await familyRepo.create({ id: testFamilyId, name: 'TemplateE2E', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const adminUserId = uuidv4();
    const adminUsername = `e2e_admin_${Date.now()}`;
    await userRepo.create({ id: adminUserId, username: adminUsername, password: hashPasswordSync('AdminPass1!'), role: USER_ROLES.SYSTEM_ADMIN, must_change_password: false, email: '', familyId: testFamilyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const createdAdmin = await userRepo.findByUsername(adminUsername);
    if (!createdAdmin) throw new Error('Admin creation failed');
    adminToken = generateToken(createdAdmin);
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM audit_log');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch (e) {
      // ignore
    }
    await closeDb();
  });

  it('creates a family and seeds templates', async () => {
    const res = await request(app)
      .post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E Family 2' });
    expect(res.status).toBe(200);
    const familyId = res.body.family?.id;
    expect(familyId).toBeTruthy();

    const templatesRes = await request(app)
      .get(`/api/templates/${familyId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(templatesRes.status).toBe(200);
    expect(Array.isArray(templatesRes.body.templates)).toBe(true);
  });
});
