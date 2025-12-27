import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository, TemplateRepository, ItemRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Template sync endpoint', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let templateRepo: TemplateRepository;
  let itemRepo: ItemRepository;
  let familyId: string;
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
    itemRepo = new ItemRepository();

    familyId = uuidv4();
    await familyRepo.create({ id: familyId, name: 'Sync Family', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const sysId = uuidv4();
    const famId = uuidv4();
    const memId = uuidv4();

    await userRepo.create({ id: sysId, username: `sys_${Date.now()}`, password: hashPasswordSync('AdminPass1!'), role: USER_ROLES.SYSTEM_ADMIN, must_change_password: false, email: '', familyId: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await userRepo.create({ id: famId, username: `fam_${Date.now()}`, password: hashPasswordSync('FamPass1!'), role: USER_ROLES.FAMILY_ADMIN, must_change_password: false, email: '', familyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await userRepo.create({ id: memId, username: `mem_${Date.now()}`, password: hashPasswordSync('MemPass1!'), role: USER_ROLES.FAMILY_MEMBER, must_change_password: false, email: '', familyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const sys = await userRepo.findByUsername((await userRepo.findAll()).find(u => u.role === USER_ROLES.SYSTEM_ADMIN)!.username!);
    const fam = await userRepo.findByUsername((await userRepo.findAll()).find(u => u.role === USER_ROLES.FAMILY_ADMIN)!.username!);
    const mem = await userRepo.findByUsername((await userRepo.findAll()).find(u => u.role === USER_ROLES.FAMILY_MEMBER)!.username!);
    if (!sys || !fam || !mem) throw new Error('users not created');

    systemAdminToken = generateToken(sys);
    familyAdminToken = generateToken(fam);
    memberToken = generateToken(mem);

    // create a couple of items and a template
    await itemRepo.create({ id: 'item-a', familyId, name: 'Item A', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await itemRepo.create({ id: 'item-b', familyId, name: 'Item B', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await templateRepo.create({ id: 'tpl-sync', family_id: familyId, name: 'Sync Template', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    // initially assign item-a to template
    await templateRepo.assignItem('tpl-sync', 'item-a');
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM template_items');
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM items');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch (err) {}
    await closeDb();
  });

  it('allows family admin to sync template items (adds and removes)', async () => {
    // family admin will sync to include item-b and remove item-a
    const resp = await request(app)
      .post('/api/template/tpl-sync/sync-items')
      .set('Authorization', `Bearer ${familyAdminToken}`)
      .send({ itemIds: ['item-b'] });
    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty('items');
    const ids = (resp.body.items || []).map((i: any) => i.id);
    expect(ids).toContain('item-b');
    expect(ids).not.toContain('item-a');
  });

  it('forbids a family member from syncing a template they belong to', async () => {
    const resp = await request(app)
      .post('/api/template/tpl-sync/sync-items')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ itemIds: ['item-a','item-b'] });
    expect(resp.status).toBe(403);
  });

  it('allows system admin to sync any template', async () => {
    const resp = await request(app)
      .post('/api/template/tpl-sync/sync-items')
      .set('Authorization', `Bearer ${systemAdminToken}`)
      .send({ itemIds: ['item-a','item-b'] });
    expect(resp.status).toBe(200);
    const ids = (resp.body.items || []).map((i: any) => i.id);
    expect(ids).toContain('item-a');
    expect(ids).toContain('item-b');
  });
});
