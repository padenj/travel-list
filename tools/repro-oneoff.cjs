const { getDb } = require('../server/db');
const { PackingListRepository } = require('../server/repositories');
const crypto = require('crypto');

(async () => {
  try {
    const db = await getDb();
    const packingListRepo = new PackingListRepository();
    // Create a family and packing list
    const familyId = crypto.randomUUID();
    const listId = crypto.randomUUID();
    await db.run('INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)', [familyId, 'Repro Family', new Date().toISOString(), new Date().toISOString()]);
    await db.run('INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [listId, familyId, 'Repro List', new Date().toISOString(), new Date().toISOString()]);
    // Use a category id (non-existent is fine for FK?)
    const categoryId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    // Attempt to add one-off with categoryId and memberIds
    console.log('Calling addOneOffItem with listId=', listId);
    const item = await packingListRepo.addOneOffItem(listId, 'Test one-off', true, [memberId], categoryId, false);
    console.log('Result:', item);
  } catch (err) {
    console.error('Repro error:', err);
  } finally {
    try { process.exit(0); } catch (e) { }
  }
})();
