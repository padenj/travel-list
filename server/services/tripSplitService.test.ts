import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb } from '../db';
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

    const result = await split();
    const grandmaList = result.destinations[1].packingListId;

    expect((await listRows(sourceListId)).map(r => r.id).sort()).toEqual([passportRow, toothbrushRow].sort());
    const grandmaRows = await listRows(grandmaList);
    expect(grandmaRows.map(r => r.item_id).sort()).toEqual([teddy, toothbrush].sort());
    expect(grandmaRows.find(r => r.item_id === teddy)!.id).toBe(teddyRow);

    expect(await checksFor(toothbrushRow)).toEqual([{ member_id: seed.dad, checked: 1 }]);
    const copy = grandmaRows.find(r => r.item_id === toothbrush)!;
    expect(await checksFor(copy.id)).toEqual([{ member_id: seed.ava, checked: 1 }]);
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
        destinations: [{ name: 'Paris', memberIds: [seed.dad] }, { name: 'Rome', memberIds: ['not-a-user'] }],
        sharedItemsDestinationIndex: 0,
      })
    ).rejects.toBeInstanceOf(DestinationValidationError);
    expect(await new TripDestinationRepository().listForTrip(seed.tripId)).toEqual([]);
    const after = await seed.db.get(`SELECT COUNT(*) AS n FROM packing_lists`);
    expect(after.n).toBe(before.n);
    const members = await seed.db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [sourceListId]);
    expect(members).toHaveLength(4);
  });
});
