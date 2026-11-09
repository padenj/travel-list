import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { closeDb, getDb } from '../db';
import { splitListIntoTrip } from './tripSplitService';
import { DestinationValidationError, TripDestinationRepository } from '../repositories/tripDestinationRepository';
import {
  seedFamilyTrip, createList, createMasterItem, addToList, setCheck, listRows, checksFor,
} from '../test-utils/destinationFixtures';

describe('splitListIntoTrip', () => {
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  let sourceListId: string;

  beforeEach(async () => {
    seed = await seedFamilyTrip();
    sourceListId = await createList(seed.familyId, 'Spring list', [seed.dad, seed.mom, seed.ava, seed.leo]);
  });

  afterEach(async () => {
    await closeDb();
  });

  const split = (sharedItemsDestinationIndex = 0) =>
    splitListIntoTrip({
      tripId: seed.tripId,
      tripName: 'Spring Break',
      familyId: seed.familyId,
      sourceListId,
      destinations: [
        { name: 'Paris', memberIds: [seed.dad, seed.mom] },
        { name: "Grandma's", memberIds: [seed.ava, seed.leo] },
      ],
      sharedItemsDestinationIndex,
    });

  it('keeps the source list as the first destination and creates the others', async () => {
    const result = await split();
    expect(result.destinations.map(d => d.name)).toEqual(['Paris', "Grandma's"]);
    expect(result.destinations[0].packingListId).toBe(sourceListId);
    expect(result.destinations[0].memberIds.sort()).toEqual([seed.dad, seed.mom].sort());
    expect(result.destinations[1].memberIds.sort()).toEqual([seed.ava, seed.leo].sort());
  });

  it('moves personal items to the owner destination and copies shared-owner items with their checks', async () => {
    const passport = await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] });
    const teddy = await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] });
    const toothbrush = await createMasterItem(seed.familyId, 'Toothbrush', { memberIds: [seed.dad, seed.ava] });
    const passportRow = await addToList(sourceListId, passport);
    const teddyRow = await addToList(sourceListId, teddy);
    const toothbrushRow = await addToList(sourceListId, toothbrush);
    await setCheck(toothbrushRow, seed.dad, true);
    await setCheck(toothbrushRow, seed.ava, true);
    const templateId = uuidv4();
    await seed.db.run(`INSERT INTO templates (id, family_id, name) VALUES (?, ?, 'Beach')`, [templateId, seed.familyId]);
    await seed.db.run(
      `INSERT INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, datetime('now'))`,
      [toothbrushRow, templateId]
    );
    for (const member of [seed.dad, seed.ava]) {
      await seed.db.run(
        `INSERT INTO packing_list_item_not_needed (id, packing_list_item_id, member_id, not_needed) VALUES (?, ?, ?, 1)`,
        [uuidv4(), toothbrushRow, member]
      );
    }

    const result = await split();
    const grandmaList = result.destinations[1].packingListId;

    expect((await listRows(sourceListId)).map(r => r.id).sort()).toEqual([passportRow, toothbrushRow].sort());
    const grandmaRows = await listRows(grandmaList);
    expect(grandmaRows.map(r => r.item_id).sort()).toEqual([teddy, toothbrush].sort());
    expect(grandmaRows.find(r => r.item_id === teddy)!.id).toBe(teddyRow);

    expect(await checksFor(toothbrushRow)).toEqual([{ member_id: seed.dad, checked: 1 }]);
    const copy = grandmaRows.find(r => r.item_id === toothbrush)!;
    expect(await checksFor(copy.id)).toEqual([{ member_id: seed.ava, checked: 1 }]);

    const notNeeded = await seed.db.all(`SELECT member_id, packing_list_item_id FROM packing_list_item_not_needed`);
    expect(notNeeded.find(r => r.member_id === seed.dad)!.packing_list_item_id).toBe(toothbrushRow);
    expect(notNeeded.find(r => r.member_id === seed.ava)!.packing_list_item_id).toBe(copy.id);
    const copyTemplates = await seed.db.all(
      `SELECT template_id FROM packing_list_item_templates WHERE packing_list_item_id = ?`, [copy.id]
    );
    expect(copyTemplates).toEqual([{ template_id: templateId }]);
  });

  it('sends shared items to the chosen destination with their checks', async () => {
    const sunscreen = await createMasterItem(seed.familyId, 'Sunscreen', { wholeFamily: true });
    const row = await addToList(sourceListId, sunscreen);
    await setCheck(row, null, true);

    const result = await split(1);

    expect(await listRows(sourceListId)).toEqual([]);
    expect((await listRows(result.destinations[1].packingListId)).map(r => r.id)).toEqual([row]);
    expect(await checksFor(row)).toEqual([{ member_id: null, checked: 1 }]);
  });

  it('counts items that belong to no one at any destination', async () => {
    const orphan = await createMasterItem(seed.familyId, 'Mystery box');
    const row = await addToList(sourceListId, orphan);
    const result = await split();
    expect(result.skippedCount).toBe(1);
    expect((await listRows(sourceListId)).map(r => r.id)).toEqual([row]);
  });

  it('rejects fewer than two destinations', async () => {
    await expect(
      splitListIntoTrip({
        tripId: seed.tripId, tripName: 'Spring Break', familyId: seed.familyId, sourceListId,
        destinations: [{ name: 'Paris', memberIds: [seed.dad] }], sharedItemsDestinationIndex: 0,
      })
    ).rejects.toThrow('need_two_destinations');
  });

  it('rejects one person in two destinations', async () => {
    await expect(
      splitListIntoTrip({
        tripId: seed.tripId, tripName: 'Spring Break', familyId: seed.familyId, sourceListId,
        destinations: [{ name: 'Paris', memberIds: [seed.dad] }, { name: 'Rome', memberIds: [seed.dad] }],
        sharedItemsDestinationIndex: 0,
      })
    ).rejects.toThrow('member_in_two_destinations');
  });

  it('rolls everything back when a later destination is invalid', async () => {
    const before = await seed.db.get(`SELECT COUNT(*) AS n FROM packing_lists`);
    await expect(
      splitListIntoTrip({
        tripId: seed.tripId, tripName: 'Spring Break', familyId: seed.familyId, sourceListId,
        destinations: [{ name: 'Paris', memberIds: [seed.dad, seed.mom] }, { name: 'Rome', memberIds: [seed.ava, seed.leo, 'not-a-user'] }],
        sharedItemsDestinationIndex: 0,
      })
    ).rejects.toBeInstanceOf(DestinationValidationError);
    expect(await new TripDestinationRepository().listForTrip(seed.tripId)).toEqual([]);
    const after = await seed.db.get(`SELECT COUNT(*) AS n FROM packing_lists`);
    expect(after.n).toBe(before.n);
    const members = await seed.db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [sourceListId]);
    expect(members).toHaveLength(4);
  });

  it('rejects a split that leaves a source-list member unassigned and changes nothing', async () => {
    const before = await seed.db.get(`SELECT COUNT(*) AS n FROM packing_lists`);
    await expect(
      splitListIntoTrip({
        tripId: seed.tripId, tripName: 'Spring Break', familyId: seed.familyId, sourceListId,
        destinations: [
          { name: 'Paris', memberIds: [seed.dad, seed.mom] },
          { name: "Grandma's", memberIds: [seed.ava] },
        ],
        sharedItemsDestinationIndex: 0,
      })
    ).rejects.toThrow('unassigned_member');
    expect(await new TripDestinationRepository().listForTrip(seed.tripId)).toEqual([]);
    expect((await seed.db.get(`SELECT COUNT(*) AS n FROM packing_lists`)).n).toBe(before.n);
    const members = await seed.db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [sourceListId]);
    expect(members).toHaveLength(4);
  });

  it('rolls back items already moved when distribution fails midway', async () => {
    const passport = await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] });
    const teddy = await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] });
    const toothbrush = await createMasterItem(seed.familyId, 'Toothbrush', { memberIds: [seed.dad, seed.ava] });
    await addToList(sourceListId, passport);
    await addToList(sourceListId, teddy);
    const toothbrushRow = await addToList(sourceListId, toothbrush);
    await seed.db.run(
      `INSERT INTO packing_list_item_not_needed (id, packing_list_item_id, member_id, not_needed) VALUES (?, ?, ?, 1)`,
      [uuidv4(), toothbrushRow, seed.ava]
    );

    const snapshot = async () => ({
      items: await seed.db.all(`SELECT id, packing_list_id FROM packing_list_items ORDER BY id`),
      members: await seed.db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ? ORDER BY member_id`, [sourceListId]),
      participants: await seed.db.all(`SELECT id, user_id FROM trip_participants WHERE trip_id = ? ORDER BY id`, [seed.tripId]),
      tripLists: await seed.db.all(`SELECT packing_list_id FROM trip_packing_lists WHERE trip_id = ? ORDER BY packing_list_id`, [seed.tripId]),
      lists: (await seed.db.get(`SELECT COUNT(*) AS n FROM packing_lists`)).n,
    });
    const before = await snapshot();

    const db = await getDb();
    const originalRun = db.run.bind(db);
    const spy = vi.spyOn(db, 'run').mockImplementation(((sql: string, ...args: unknown[]) => {
      if (typeof sql === 'string' && sql.startsWith('UPDATE packing_list_item_not_needed')) {
        return Promise.reject(new Error('boom'));
      }
      return (originalRun as (...a: unknown[]) => Promise<unknown>)(sql, ...args);
    }) as typeof db.run);
    try {
      await expect(split()).rejects.toThrow('boom');
    } finally {
      spy.mockRestore();
    }

    expect(await snapshot()).toEqual(before);
  });
});
