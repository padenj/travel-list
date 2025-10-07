import request from 'supertest';
import app from '../index';
import { getDb } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect } from 'vitest';
import { generateToken } from '../auth';

// This test reproduces the per-user packing list item check flow.
describe('packing list check persistence', () => {
  it('persists a checked value for a user when PATCHing /check', async () => {
    const db = await getDb();
    // Create a family
    const familyId = uuidv4();
    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [familyId, 'test family', new Date().toISOString(), new Date().toISOString()]);
    // Create a user
    const userId = uuidv4();
    const username = 'testuser_' + userId.slice(0, 8);
    await db.run(`INSERT INTO users (id, username, password_hash, role, familyId, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [userId, username, 'hash', 'FamilyMember', familyId, new Date().toISOString(), new Date().toISOString()]);
    // Create a packing list
    const listId = uuidv4();
    await db.run(`INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [listId, familyId, 'test list', new Date().toISOString(), new Date().toISOString()]);
    // Create master item
    const itemId = uuidv4();
    await db.run(`INSERT INTO items (id, familyId, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [itemId, familyId, 'toothbrush', new Date().toISOString(), new Date().toISOString()]);
  // Add item to list
  const pliId = uuidv4();
  await db.run(`INSERT INTO packing_list_items (id, packing_list_id, item_id, display_name, created_at) VALUES (?, ?, ?, ?, ?)`, [pliId, listId, itemId, 'toothbrush', new Date().toISOString()]);

    // Generate JWT and call the check endpoint to set checked = true
  const token = generateToken({ id: userId, name: 'Test User', username, role: 'FamilyMember', familyId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any);
    const patchRes = await request(app)
      .patch(`/api/packing-lists/${listId}/items/${pliId}/check`)
      .set('Authorization', `Bearer ${token}`)
      .send({ checked: true, userId: null });
    expect(patchRes.status).toBe(200);

    // Fetch the packing list and assert check persisted
    const getRes = await request(app)
      .get(`/api/packing-lists/${listId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    const checks = getRes.body.checks || [];
    const found = checks.find((c: any) => c.packing_list_item_id === pliId && c.member_id === userId);
    expect(found).toBeDefined();
    expect(found.checked).toBe(1);
  }, 10000);
});
