import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('POST /api/item-group/:id/add-category-items', () => {
  let app: express.Application;
  let famId: string;
  let adminToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    const familyRepo = new FamilyRepository();
    const userRepo = new UserRepository();

    await getDb();
    famId = uuidv4();
    await familyRepo.create({ id: famId, name: 'Fam', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const adminId = uuidv4();
    const adminUsername = `admin_${Date.now()}`;
    await userRepo.create({
      id: adminId,
      username: adminUsername,
      email: `${adminUsername}@x.com`,
      password: hashPasswordSync('pw'),
      role: USER_ROLES.SYSTEM_ADMIN,
      familyId: famId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);
    adminToken = generateToken({ id: adminId, username: adminUsername, role: USER_ROLES.SYSTEM_ADMIN, familyId: famId } as any);
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      await db.run('DELETE FROM template_items');
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM items');
      await db.run('DELETE FROM categories');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch {
      // ignore cleanup errors
    }
    await closeDb();
  });

  it('adds deduped items from selected categories to the group', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    const cat = uuidv4();
    const grp = uuidv4();
    const itemA = uuidv4();
    const itemB = uuidv4();

    await db.run(`INSERT INTO categories (id, familyId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [cat, famId, 'Docs', now, now]);
    await db.run(`INSERT INTO templates (id, family_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [grp, famId, 'G', '', now, now]);
    await db.run(`INSERT INTO items (id, familyId, name, categoryId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [itemA, famId, 'A', cat, now, now]);
    await db.run(`INSERT INTO items (id, familyId, name, categoryId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [itemB, famId, 'B', cat, now, now]);
    await db.run(`INSERT INTO template_items (template_id, item_id) VALUES (?, ?)`, [grp, itemA]);

    const res = await request(app)
      .post(`/api/item-group/${grp}/add-category-items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryIds: [cat] });

    expect(res.status).toBe(200);
    const returnedIds = (res.body.items || []).map((i: any) => i.id).sort();
    expect(returnedIds).toEqual([itemA, itemB].sort());

    const rows = await db.all(`SELECT item_id FROM template_items WHERE template_id = ?`, [grp]);
    expect(rows.length).toBe(2);
  });

  it('returns 404 for a missing group', async () => {
    const res = await request(app)
      .post(`/api/item-group/${uuidv4()}/add-category-items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryIds: [uuidv4()] });
    expect(res.status).toBe(404);
  });
});
