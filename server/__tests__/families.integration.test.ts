import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository, TemplateRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Families Integration', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let templateRepo: TemplateRepository;
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    await getDb();
    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();
    templateRepo = new TemplateRepository();

    // create base family and users
    const baseFamilyId = uuidv4();
    await familyRepo.create({ id: baseFamilyId, name: 'Base Family', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const userId = uuidv4();
    await userRepo.create({ id: userId, username: 'regularuser', password: hashPasswordSync('UserPass1!'), role: USER_ROLES.FAMILY_MEMBER, must_change_password: false, email: 'u@example.com', familyId: baseFamilyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const adminId = uuidv4();
    await userRepo.create({ id: adminId, username: 'sysadmin', password: hashPasswordSync('AdminPass1!'), role: USER_ROLES.SYSTEM_ADMIN, must_change_password: false, email: 'a@example.com', familyId: baseFamilyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const createdUser = await userRepo.findByUsername('regularuser');
    const createdAdmin = await userRepo.findByUsername('sysadmin');
    userToken = generateToken(createdUser!);
    adminToken = generateToken(createdAdmin!);
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM audit_log');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM items');
      await db.run('DELETE FROM categories');
      await db.run('DELETE FROM families');
    } catch (err) {
      // ignore
    }
    await closeDb();
  });

  it('creates family and seeds templates synchronously', async () => {
    const res = await request(app)
      .post('/api/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Seeded Family' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('family');
    expect(res.body).toHaveProperty('templates');
    const familyId = res.body.family.id;
    const templates = await templateRepo.findAll(familyId);
    expect(templates.length).toBeGreaterThan(0);
  });

  it('only system admin can fetch arbitrary family details (impersonation)', async () => {
    // create another family
    const famId = uuidv4();
    await familyRepo.create({ id: famId, name: 'Other Family', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    // regular user should be forbidden
    const resUser = await request(app)
      .get(`/api/families/${famId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(resUser.status).toBe(403);

    // admin can fetch
    const resAdmin = await request(app)
      .get(`/api/families/${famId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resAdmin.status).toBe(200);
    expect(resAdmin.body.family).toHaveProperty('id', famId);
  });
});
