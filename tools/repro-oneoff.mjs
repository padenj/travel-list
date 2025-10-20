import crypto from 'crypto';
import { getDb } from '../server/db.js';
import { PackingListRepository } from '../server/repositories.js';

(async () => {
  try {
    const db = await getDb();
    const packingListRepo = new PackingListRepository();
    const familyId = crypto.randomUUID();
    const listId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run('INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [familyId, 'Repro Family', now, now]);
    await db.run('INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [listId, familyId, 'Repro List', now, now]);
    const categoryId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    console.log('Calling addOneOffItem with listId=', listId);
    const item = await packingListRepo.addOneOffItem(listId, 'Test one-off', true, [memberId], categoryId, false);
    console.log('Result:', item);
  } catch (err) {
    console.error('Repro error:', err);
    process.exitCode = 1;
  }
})();
