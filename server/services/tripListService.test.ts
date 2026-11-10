import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { closeDb, getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { TripDestinationRepository } from '../repositories/tripDestinationRepository';
import { TripRepository } from '../repositories/tripRepository';
import {
  createTripWithFirstDestination,
  createShellTripForListTx,
  renameDestinationTx,
  applyTripRenameTx,
  createDestination,
  updateDestination,
  deleteDestinationTx,
  copyTrip,
  LastDestinationError,
} from './tripListService';
import { seedFamilyTrip, createList, createMasterItem, addToList, setCheck, listRows } from '../test-utils/destinationFixtures';

describe('tripListService', () => {
  let seed: Awaited<ReturnType<typeof seedFamilyTrip>>;
  const repo = new TripDestinationRepository();
  // TripRepository holds the db it was built with, so build it after each fresh seed.
  let trips: TripRepository;

  beforeEach(async () => {
    seed = await seedFamilyTrip();
    trips = new TripRepository();
  });

  afterEach(async () => {
    await closeDb();
  });

  const listName = async (listId: string) => (await seed.db.get(`SELECT name FROM packing_lists WHERE id = ?`, [listId])).name;
  const tx = <T>(fn: (db: Awaited<ReturnType<typeof getDb>>) => Promise<T>) => getDb().then(db => withTransaction(db, () => fn(db)));

  describe('createTripWithFirstDestination', () => {
    it('creates a dateless trip with one destination named after it', async () => {
      const { tripId, destinationId } = await createTripWithFirstDestination({ familyId: seed.familyId, name: 'Beach', memberIds: [seed.dad, seed.mom] });
      const trip = await trips.getTripById(tripId);
      expect(trip).toMatchObject({ name: 'Beach', startDate: null, endDate: null });
      const [destination] = await repo.listForTrip(tripId);
      expect(destination).toMatchObject({ id: destinationId, name: 'Beach', position: 0, color: 'blue' });
      expect(destination.memberIds.sort()).toEqual([seed.dad, seed.mom].sort());
      expect(await listName(destination.packingListId)).toBe('Beach');
    });

    it('keeps dates when given', async () => {
      const { tripId } = await createTripWithFirstDestination({ familyId: seed.familyId, name: 'Ski', startDate: '2027-01-02', endDate: '2027-01-09', memberIds: [seed.dad] });
      expect(await trips.getTripById(tripId)).toMatchObject({ startDate: '2027-01-02', endDate: '2027-01-09' });
    });
  });

  it('createShellTripForListTx wraps a list in a planning trip with its members', async () => {
    const listId = await createList(seed.familyId, 'Camping', [seed.ava]);
    const tripId = await tx(db => createShellTripForListTx(db, { familyId: seed.familyId, listId, name: 'Camping' }));
    const trip = await trips.getTripById(tripId);
    expect(trip).toMatchObject({ name: 'Camping', status: 'planning', startDate: null });
    const [destination] = await repo.listForTrip(tripId);
    expect(destination).toMatchObject({ name: 'Camping', packingListId: listId, memberIds: [seed.ava] });
  });

  describe('renames', () => {
    it('renaming the only destination renames the trip when their names matched', async () => {
      const { tripId, destinationId } = await createTripWithFirstDestination({ familyId: seed.familyId, name: 'Beach', memberIds: [seed.dad] });
      const changed = await tx(db => renameDestinationTx(db, destinationId, 'Coast'));
      expect((await trips.getTripById(tripId))!.name).toBe('Coast');
      const [destination] = await repo.listForTrip(tripId);
      expect(await listName(destination.packingListId)).toBe('Coast');
      expect(changed).toEqual([destination.packingListId]);
    });

    it('renaming one of several destinations leaves the trip name', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await tx(db => renameDestinationTx(db, paris.id, 'Paris'));
      expect((await trips.getTripById(seed.tripId))!.name).toBe('Spring Break');
      expect(await listName(paris.packingListId)).toBe('Spring Break · Paris');
      expect(await listName(rome.packingListId)).toBe('Spring Break · Rome');
    });

    it('renaming a trip renames destinations that matched the old name and relabels every list', async () => {
      const home = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await seed.db.run(`UPDATE trips SET name = 'Easter' WHERE id = ?`, [seed.tripId]);
      const changed = await tx(db => applyTripRenameTx(db, seed.tripId, 'Spring Break', 'Easter'));
      expect((await repo.getById(home.id))!.name).toBe('Easter');
      expect(await listName(home.packingListId)).toBe('Easter');
      expect(await listName(rome.packingListId)).toBe('Easter · Rome');
      expect(changed.sort()).toEqual([home.packingListId, rome.packingListId].sort());
    });
  });

  describe('createDestination', () => {
    it('moves a person and their items when moveFrom is set', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad, seed.ava] });
      const teddy = await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] });
      const row = await addToList(paris.packingListId, teddy);
      await setCheck(row, seed.ava, true);

      const { destinationId, touchedListIds } = await createDestination({
        tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.ava], moveFrom: true,
      });

      const rome = (await repo.getById(destinationId))!;
      expect((await listRows(rome.packingListId)).map(r => r.id)).toEqual([row]);
      expect((await repo.getById(paris.id))!.memberIds).toEqual([seed.dad]);
      expect(touchedListIds.sort()).toEqual([paris.packingListId, rome.packingListId].sort());
    });

    it('rejects a person from another destination without moveFrom', async () => {
      await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      await expect(createDestination({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.dad] }))
        .rejects.toThrow('member_in_other_destination');
    });

    it("moves whole-family items to the new list when sharedItemsTo is 'new' and the trip had one destination", async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const sunscreen = await createMasterItem(seed.familyId, 'Sunscreen', { wholeFamily: true });
      const row = await addToList(paris.packingListId, sunscreen);
      const { destinationId } = await createDestination({
        tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom], sharedItemsTo: 'new',
      });
      const rome = (await repo.getById(destinationId))!;
      expect((await listRows(rome.packingListId)).map(r => r.id)).toEqual([row]);
      expect(await listRows(paris.packingListId)).toEqual([]);
    });

    it("keeps whole-family items by default", async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const row = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Sunscreen', { wholeFamily: true }));
      await createDestination({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      expect((await listRows(paris.packingListId)).map(r => r.id)).toEqual([row]);
    });
  });

  describe('updateDestination', () => {
    it('pulls a person with their items when moveFrom is set', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad, seed.ava] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      const row = await addToList(paris.packingListId, await createMasterItem(seed.familyId, 'Teddy', { memberIds: [seed.ava] }));

      const touched = await updateDestination({ destinationId: rome.id, familyId: seed.familyId, memberIds: [seed.mom, seed.ava], moveFrom: true });

      expect((await listRows(rome.packingListId)).map(r => r.id)).toEqual([row]);
      expect((await repo.getById(rome.id))!.memberIds.sort()).toEqual([seed.mom, seed.ava].sort());
      expect(touched.sort()).toEqual([paris.packingListId, rome.packingListId].sort());
    });

    it('fails with would_empty_destination and changes nothing', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await expect(updateDestination({ destinationId: rome.id, familyId: seed.familyId, memberIds: [seed.mom, seed.dad], moveFrom: true }))
        .rejects.toThrow('would_empty_destination');
      expect((await repo.getById(paris.id))!.memberIds).toEqual([seed.dad]);
      expect((await repo.getById(rome.id))!.memberIds).toEqual([seed.mom]);
    });

    it('renames through the label rules', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const touched = await updateDestination({ destinationId: paris.id, familyId: seed.familyId, name: 'Lyon' });
      expect(await listName(paris.packingListId)).toBe('Spring Break · Lyon');
      expect(touched).toEqual([paris.packingListId]);
    });
  });

  describe('deleteDestinationTx', () => {
    it('refuses to delete the last destination', async () => {
      const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      await expect(tx(db => deleteDestinationTx(db, { destination: paris, familyId: seed.familyId, deleteList: true })))
        .rejects.toBeInstanceOf(LastDestinationError);
    });

    it('re-homes a kept list with items into its own trip', async () => {
      await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await addToList(rome.packingListId, await createMasterItem(seed.familyId, 'Hat', { memberIds: [seed.mom] }));

      await tx(db => deleteDestinationTx(db, { destination: rome, familyId: seed.familyId, deleteList: false }));

      const place = await repo.findByPackingListId(rome.packingListId);
      expect(place!.tripId).not.toBe(seed.tripId);
      expect((await trips.getTripById(place!.tripId))!.name).toBe('Rome');
      expect(await listName(rome.packingListId)).toBe('Rome');
      expect((await repo.listForTrip(seed.tripId)).map(d => d.name)).toEqual(['Paris']);
    });

    it('deletes an empty list instead of re-homing it', async () => {
      await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.mom] });
      await tx(db => deleteDestinationTx(db, { destination: rome, familyId: seed.familyId, deleteList: false }));
      const row = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [rome.packingListId]);
      expect(row.deleted_at).toBeTruthy();
    });
  });

  describe('copyTrip', () => {
    it('copies destinations, members, item groups and unchecked items into a dateless trip', async () => {
      const home = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break', memberIds: [seed.dad, seed.mom] });
      const rome = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Rome', memberIds: [seed.ava] });
      const templateId = uuidv4();
      await seed.db.run(`INSERT INTO templates (id, family_id, name) VALUES (?, ?, 'Beach')`, [templateId, seed.familyId]);
      await seed.db.run(`INSERT INTO packing_list_templates (packing_list_id, template_id, created_at) VALUES (?, ?, datetime('now'))`, [home.packingListId, templateId]);
      const passport = await createMasterItem(seed.familyId, 'Passport', { memberIds: [seed.dad] });
      const row = await addToList(home.packingListId, passport);
      await setCheck(row, seed.dad, true);
      await seed.db.run(`INSERT INTO packing_list_item_templates (packing_list_item_id, template_id, created_at) VALUES (?, ?, datetime('now'))`, [row, templateId]);
      const oneOff = uuidv4();
      await seed.db.run(`INSERT INTO items (id, familyId, name, isOneOff) VALUES (?, ?, 'Gift', 1)`, [oneOff, seed.familyId]);
      await seed.db.run(`INSERT INTO item_members (item_id, member_id) VALUES (?, ?)`, [oneOff, seed.ava]);
      await addToList(rome.packingListId, oneOff);

      const newTripId = await copyTrip({ sourceTripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break 2028', includeOneOffs: false });

      const trip = await trips.getTripById(newTripId);
      expect(trip).toMatchObject({ name: 'Spring Break 2028', startDate: null, endDate: null, status: 'planning' });
      const copied = await repo.listForTrip(newTripId);
      expect(copied.map(d => [d.name, d.color])).toEqual([['Spring Break 2028', 'blue'], ['Rome', 'green']]);
      expect(copied[0].memberIds.sort()).toEqual([seed.dad, seed.mom].sort());
      expect(await listName(copied[0].packingListId)).toBe('Spring Break 2028');
      expect(await listName(copied[1].packingListId)).toBe('Spring Break 2028 · Rome');
      const [copiedRow] = await listRows(copied[0].packingListId);
      expect(copiedRow.item_id).toBe(passport);
      expect(await seed.db.all(`SELECT * FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [copiedRow.id])).toEqual([]);
      expect(await seed.db.all(`SELECT template_id FROM packing_list_item_templates WHERE packing_list_item_id = ?`, [copiedRow.id])).toEqual([{ template_id: templateId }]);
      expect(await seed.db.all(`SELECT template_id FROM packing_list_templates WHERE packing_list_id = ?`, [copied[0].packingListId])).toEqual([{ template_id: templateId }]);
      expect(await listRows(copied[1].packingListId)).toEqual([]);
    });

    it('copies one-off items as new one-off items when asked', async () => {
      const home = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Spring Break', memberIds: [seed.ava] });
      const oneOff = uuidv4();
      await seed.db.run(`INSERT INTO items (id, familyId, name, isOneOff) VALUES (?, ?, 'Gift', 1)`, [oneOff, seed.familyId]);
      await seed.db.run(`INSERT INTO item_members (item_id, member_id) VALUES (?, ?)`, [oneOff, seed.ava]);
      await addToList(home.packingListId, oneOff);

      const newTripId = await copyTrip({ sourceTripId: seed.tripId, familyId: seed.familyId, name: 'Again', includeOneOffs: true });

      const [destination] = await repo.listForTrip(newTripId);
      const [copiedRow] = await listRows(destination.packingListId);
      expect(copiedRow.item_id).not.toBe(oneOff);
      const item = await seed.db.get(`SELECT name, isOneOff FROM items WHERE id = ?`, [copiedRow.item_id]);
      expect(item).toEqual({ name: 'Gift', isOneOff: 1 });
      expect(await seed.db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [copiedRow.item_id])).toEqual([{ member_id: seed.ava }]);
    });
  });

  it('deleting a trip soft-deletes its destinations and lists', async () => {
    const paris = await repo.create({ tripId: seed.tripId, familyId: seed.familyId, name: 'Paris', memberIds: [seed.dad] });
    await trips.deleteTrip(seed.tripId);
    const list = await seed.db.get(`SELECT deleted_at FROM packing_lists WHERE id = ?`, [paris.packingListId]);
    expect(list.deleted_at).toBeTruthy();
    expect(await repo.getById(paris.id)).toBeNull();
  });
});
