import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { TripRepository } from '../repositories/tripRepository';

export async function seedFamilyTrip() {
  const db = await getDb();
  const familyId = uuidv4();
  await db.run(`INSERT INTO families (id, name) VALUES (?, ?)`, [familyId, 'Test Family']);
  const user = async (name: string) => {
    const id = uuidv4();
    await db.run(
      `INSERT INTO users (id, name, username, role, familyId) VALUES (?, ?, ?, 'FamilyAdmin', ?)`,
      [id, name, `${name.toLowerCase()}-${id}`, familyId]
    );
    return id;
  };
  const dad = await user('Dad');
  const mom = await user('Mom');
  const ava = await user('Ava');
  const leo = await user('Leo');
  const trip = await new TripRepository().createTrip(familyId, {
    name: 'Spring Break',
    startDate: '2027-03-01',
    endDate: '2027-03-08',
  });
  return { db, familyId, dad, mom, ava, leo, tripId: trip.id };
}

export async function createList(familyId: string, name: string, memberIds: string[]) {
  const db = await getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, familyId, name, now, now]
  );
  for (const m of memberIds) {
    await db.run(`INSERT INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [id, m]);
  }
  return id;
}

export async function createMasterItem(
  familyId: string,
  name: string,
  opts: { memberIds?: string[]; wholeFamily?: boolean } = {}
) {
  const db = await getDb();
  const id = uuidv4();
  await db.run(`INSERT INTO items (id, familyId, name) VALUES (?, ?, ?)`, [id, familyId, name]);
  for (const m of opts.memberIds || []) {
    await db.run(`INSERT INTO item_members (item_id, member_id) VALUES (?, ?)`, [id, m]);
  }
  if (opts.wholeFamily) {
    await db.run(`INSERT INTO item_whole_family (item_id, family_id) VALUES (?, ?)`, [id, familyId]);
  }
  return id;
}

export async function addToList(listId: string, itemId: string) {
  const db = await getDb();
  const id = uuidv4();
  await db.run(
    `INSERT INTO packing_list_items (id, packing_list_id, item_id, created_at) VALUES (?, ?, ?, ?)`,
    [id, listId, itemId, new Date().toISOString()]
  );
  return id;
}

export async function setCheck(pliId: string, memberId: string | null, checked = true) {
  const db = await getDb();
  await db.run(
    `INSERT INTO packing_list_item_checks (id, packing_list_item_id, member_id, checked, checked_at) VALUES (?, ?, ?, ?, ?)`,
    [uuidv4(), pliId, memberId, checked ? 1 : 0, new Date().toISOString()]
  );
}

export async function listRows(listId: string): Promise<{ id: string; item_id: string }[]> {
  const db = await getDb();
  return db.all(`SELECT id, item_id FROM packing_list_items WHERE packing_list_id = ? ORDER BY created_at`, [listId]);
}

export async function checksFor(pliId: string): Promise<{ member_id: string | null; checked: number }[]> {
  const db = await getDb();
  return db.all(`SELECT member_id, checked FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [pliId]);
}
