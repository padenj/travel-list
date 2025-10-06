import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository, TemplateRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Template permissions', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let templateRepo: TemplateRepository;
  let testFamilyId: string;
  let systemAdminToken: string;
  let familyAdminToken: string;
  let memberToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    await getDb();
    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();
    templateRepo = new TemplateRepository();

    testFamilyId = uuidv4();
    await familyRepo.create({ id: testFamilyId, name: 'Perms Family', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const sysAdminId = uuidv4();
    const famAdminId = uuidv4();
    const memberId = uuidv4();

    await userRepo.create({ id: sysAdminId, username: `sys_${Date.now()}`, password: hashPasswordSync('AdminPass1!'), role: USER_ROLES.SYSTEM_ADMIN, must_change_password: false, email: '', familyId: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await userRepo.create({ id: famAdminId, username: `fam_${Date.now()}`, password: hashPasswordSync('FamPass1!'), role: USER_ROLES.FAMILY_ADMIN, must_change_password: false, email: '', familyId: testFamilyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await userRepo.create({ id: memberId, username: `mem_${Date.now()}`, password: hashPasswordSync('MemPass1!'), role: USER_ROLES.FAMILY_MEMBER, must_change_password: false, email: '', familyId: testFamilyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const sys = await userRepo.findByUsername((await userRepo.findAll()).find(u => u.role === USER_ROLES.SYSTEM_ADMIN)!.username!);
    const fam = await userRepo.findByUsername((await userRepo.findAll()).find(u => u.role === USER_ROLES.FAMILY_ADMIN)!.username!);
    const mem = await userRepo.findByUsername((await userRepo.findAll()).find(u => u.role === USER_ROLES.FAMILY_MEMBER)!.username!);
    if (!sys || !fam || !mem) throw new Error('users not created');

    systemAdminToken = generateToken(sys);
    familyAdminToken = generateToken(fam);
    memberToken = generateToken(mem);

    // create a template owned by testFamilyId
    await templateRepo.create({ id: 'tpl-1', family_id: testFamilyId, name: 'Perms Template', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch (err) {}
    await closeDb();
  });

  it('forbids family member from creating template in family', async () => {
    const resp = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ family_id: testFamilyId, name: 'Nope' });
    expect(resp.status).toBe(403);
  });

  it('allows family admin to create template in their family', async () => {
    const resp = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${familyAdminToken}`)
      .send({ family_id: testFamilyId, name: 'Yes' });
    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty('template');
  });

  it('allows system admin to delete any template', async () => {
    const resp = await request(app)
      .delete('/api/template/tpl-1')
      .set('Authorization', `Bearer ${systemAdminToken}`);
    expect(resp.status).toBe(200);
  });

  it('forbids family member from deleting a template', async () => {
    const resp = await request(app)
      .delete('/api/template/tpl-1')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(resp.status).toBe(403);
  });
});
