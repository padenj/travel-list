import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import routes from '../routes';
import { getDb, closeDb } from '../db';
import { UserRepository, FamilyRepository, TemplateRepository, ItemRepository, PackingListRepository } from '../repositories';
import { hashPasswordSync, generateToken } from '../auth';
import { USER_ROLES } from '../constants';

describe('Template propagation and reconciliation', () => {
  let app: express.Application;
  let userRepo: UserRepository;
  let familyRepo: FamilyRepository;
  let templateRepo: TemplateRepository;
  let itemRepo: ItemRepository;
  let packingRepo: PackingListRepository;
  let familyId: string;
  let familyAdminToken: string;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    app.use('/api', routes);

    await getDb();
    userRepo = new UserRepository();
    familyRepo = new FamilyRepository();
    templateRepo = new TemplateRepository();
    itemRepo = new ItemRepository();
    packingRepo = new PackingListRepository();

    familyId = uuidv4();
    await familyRepo.create({ id: familyId, name: 'Propagate Family', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    const famId = uuidv4();
    await userRepo.create({ id: famId, username: `fam_${Date.now()}`, password: hashPasswordSync('FamPass1!'), role: USER_ROLES.FAMILY_ADMIN, must_change_password: false, email: '', familyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const famUser = await userRepo.findByUsername((await userRepo.findAll()).find(u => u.role === USER_ROLES.FAMILY_ADMIN)!.username!);
    if (!famUser) throw new Error('family admin not created');
    familyAdminToken = generateToken(famUser);

    // create items
    await itemRepo.create({ id: 'item-a', familyId, name: 'Item A', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await itemRepo.create({ id: 'item-b', familyId, name: 'Item B', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await itemRepo.create({ id: 'item-c', familyId, name: 'Item C', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });

    // create template and assign item-a and item-b
    await templateRepo.create({ id: 'tpl-prop', family_id: familyId, name: 'Prop Template', description: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    await templateRepo.assignItem('tpl-prop', 'item-a');
    await templateRepo.assignItem('tpl-prop', 'item-b');
  });

  afterEach(async () => {
    try {
      const db = await getDb();
      // cleanup tables used in test
      await db.run('DELETE FROM packing_list_item_templates');
      await db.run('DELETE FROM packing_list_templates');
      await db.run('DELETE FROM packing_list_item_checks');
      await db.run('DELETE FROM packing_list_items');
      await db.run('DELETE FROM packing_lists');
      await db.run('DELETE FROM template_items');
      await db.run('DELETE FROM templates');
      await db.run('DELETE FROM items');
      await db.run('DELETE FROM users');
      await db.run('DELETE FROM families');
    } catch (err) {}
    await closeDb();
  });

  it('reconciles assigned packing lists when template changes (add/remove)', async () => {
    // create a packing list assigned to the template via API create endpoint
    const createResp = await request(app)
      .post(`/api/families/${familyId}/packing-lists`)
      .set('Authorization', `Bearer ${familyAdminToken}`)
      .send({ name: 'List 1', templateId: 'tpl-prop' });
    expect(createResp.status).toBe(200);
    const listId = createResp.body.list.id;
    expect(listId).toBeTruthy();

    // confirm packing list has item-a and item-b (reconciled synchronously at creation)
    const itemsBefore = await packingRepo.getItems(listId);
    const itemMasterIdsBefore = itemsBefore.map((r: any) => r.item_id).sort();
    expect(itemMasterIdsBefore).toEqual(['item-a', 'item-b'].sort());

    // Ensure provenance rows exist
    const db = await getDb();
    const prow = await db.all(`SELECT * FROM packing_list_item_templates WHERE template_id = ?`, ['tpl-prop']);
    expect(prow.length).toBeGreaterThanOrEqual(2);

    // Now modify template: remove item-a and add item-c via API
    // Remove item-a
    const delResp = await request(app)
      .delete(`/api/template/tpl-prop/items/item-a`)
      .set('Authorization', `Bearer ${familyAdminToken}`)
      .send();
    expect(delResp.status).toBe(200);

    // Assign item-c
    const addResp = await request(app)
      .post(`/api/template/tpl-prop/items/item-c`)
      .set('Authorization', `Bearer ${familyAdminToken}`)
      .send();
    expect(addResp.status).toBe(200);

    // Wait a couple of ticks for async propagation to complete
    await new Promise((r) => setImmediate(r));
    // run one more tick
    await new Promise((r) => setImmediate(r));

    // Fetch packing list items after propagation
    const itemsAfter = await packingRepo.getItems(listId);
    const itemMasterIdsAfter = itemsAfter.map((r: any) => r.item_id).sort();
    // item-a should be removed, item-b remains, item-c added
    expect(itemMasterIdsAfter).toEqual(['item-b', 'item-c'].sort());

    // Ensure provenance rows updated: no mapping for removed item
    const prowAfter = await db.all(`SELECT * FROM packing_list_item_templates WHERE template_id = ?`, ['tpl-prop']);
    const prowItemIds = [] as string[];
    for (const p of prowAfter) {
      const pli = await db.get(`SELECT item_id FROM packing_list_items WHERE id = ?`, [p.packing_list_item_id]);
      prowItemIds.push(pli.item_id);
    }
    expect(prowItemIds.sort()).toEqual(['item-b', 'item-c'].sort());
  });
});
