import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { withTransaction } from '../utils/transaction';
import { namesMatch } from '../utils/destinationLabel';
import {
  TripDestination,
  TripDestinationRepository,
  DestinationValidationError,
} from '../repositories/tripDestinationRepository';
import { moveAllSharedItemsTx, pullMembersIntoDestinationTx } from './tripSplitService';

const destinationRepo = new TripDestinationRepository();

export class LastDestinationError extends Error {
  constructor() {
    super('last_destination');
  }
}

export interface NewTripInput {
  familyId: string;
  name: string;
  description?: string | null;
  tripType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
}

export interface CreateDestinationInput {
  tripId: string;
  familyId: string;
  name: string;
  memberIds: string[];
  packingListId?: string;
  moveFrom?: boolean;
  sharedItemsTo?: 'existing' | 'new';
}

export interface UpdateDestinationInput {
  destinationId: string;
  familyId: string;
  name?: string;
  color?: string;
  position?: number;
  memberIds?: string[];
  moveFrom?: boolean;
}

const listIdOf = async (db: Database, destinationId: string): Promise<string> =>
  (await db.get(`SELECT packing_list_id AS listId FROM trip_destinations WHERE id = ?`, [destinationId])).listId;

const liveDestinationCount = async (db: Database, tripId: string): Promise<number> =>
  (await db.get(`SELECT COUNT(*) AS n FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`, [tripId])).n;

// Caller owns the transaction.
export async function insertTripTx(db: Database, input: NewTripInput): Promise<string> {
  const id = uuidv4();
  await db.run(
    `INSERT INTO trips (id, family_id, name, description, trip_type, start_date, end_date, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, input.familyId, input.name, input.description || null, input.tripType || null, input.startDate || null, input.endDate || null, input.status || null]
  );
  return id;
}

export async function createTripWithFirstDestination(
  input: NewTripInput & { memberIds: string[] }
): Promise<{ tripId: string; destinationId: string }> {
  const db = await getDb();
  return withTransaction(db, async () => {
    const tripId = await insertTripTx(db, input);
    const destinationId = await destinationRepo.insertDestinationTx(db, {
      tripId,
      familyId: input.familyId,
      name: input.name,
      memberIds: input.memberIds,
      allowNoMembers: true,
    });
    return { tripId, destinationId };
  });
}

/** Puts an existing list into a new dateless trip of its own. Caller owns the transaction. */
export async function createShellTripForListTx(
  db: Database,
  input: { familyId: string; listId: string; name: string }
): Promise<string> {
  const tripId = await insertTripTx(db, { familyId: input.familyId, name: input.name, status: 'planning' });
  const members = ((await db.all(
    `SELECT plm.member_id FROM packing_list_members plm JOIN users u ON u.id = plm.member_id
     WHERE plm.packing_list_id = ? AND u.familyId = ? AND u.deleted_at IS NULL`,
    [input.listId, input.familyId]
  )) as { member_id: string }[]).map(r => r.member_id);
  await destinationRepo.insertDestinationTx(db, {
    tripId,
    familyId: input.familyId,
    name: input.name,
    memberIds: members,
    packingListId: input.listId,
    allowNoMembers: true,
  });
  return tripId;
}

/** Renames a destination; the only destination of a trip takes the trip with it when their names matched. */
export async function renameDestinationTx(db: Database, destinationId: string, name: string): Promise<string[]> {
  const destination = await db.get(
    `SELECT d.id, d.trip_id AS tripId, d.name, t.name AS tripName
     FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
     WHERE d.id = ? AND d.deleted_at IS NULL`,
    [destinationId]
  );
  if (!destination) throw new DestinationValidationError('not_found');
  const renameTrip = (await liveDestinationCount(db, destination.tripId)) === 1 && namesMatch(destination.name, destination.tripName);
  await db.run(`UPDATE trip_destinations SET name = ?, updated_at = ? WHERE id = ?`, [name, new Date().toISOString(), destinationId]);
  if (renameTrip) {
    await db.run(`UPDATE trips SET name = ?, updated_at = datetime('now') WHERE id = ?`, [name, destination.tripId]);
  }
  return destinationRepo.syncListNamesTx(db, destination.tripId);
}

/** After a trip is renamed: destinations that carried the old trip name take the new one, then lists are relabeled. */
export async function applyTripRenameTx(db: Database, tripId: string, oldName: string, newName: string): Promise<string[]> {
  const destinations = (await db.all(
    `SELECT id, name FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
    [tripId]
  )) as { id: string; name: string }[];
  const now = new Date().toISOString();
  for (const destination of destinations) {
    if (namesMatch(destination.name, oldName)) {
      await db.run(`UPDATE trip_destinations SET name = ?, updated_at = ? WHERE id = ?`, [newName, now, destination.id]);
    }
  }
  return destinationRepo.syncListNamesTx(db, tripId);
}

export async function createDestination(input: CreateDestinationInput): Promise<{ destinationId: string; touchedListIds: string[] }> {
  const db = await getDb();
  return withTransaction(db, async () => {
    const before = (await db.all(
      `SELECT packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
      [input.tripId]
    )) as { listId: string }[];
    if (!input.moveFrom) {
      const conflict = await destinationRepo.findConflict(db, input.tripId, input.memberIds);
      if (conflict) throw conflict;
    }
    const destinationId = await destinationRepo.insertDestinationTx(db, {
      tripId: input.tripId,
      familyId: input.familyId,
      name: input.name,
      memberIds: input.memberIds,
      packingListId: input.packingListId,
    });
    const listId = await listIdOf(db, destinationId);
    const touched = [listId];
    if (input.moveFrom) {
      touched.push(...(await pullMembersIntoDestinationTx(db, { tripId: input.tripId, destinationId, memberIds: input.memberIds })));
    }
    if (input.sharedItemsTo === 'new' && before.length === 1) {
      const moved = await moveAllSharedItemsTx(db, before[0].listId, listId);
      if (moved > 0) touched.push(before[0].listId);
    }
    return { destinationId, touchedListIds: Array.from(new Set(touched)) };
  });
}

/** Returns the ids of every list the update changed. */
export async function updateDestination(input: UpdateDestinationInput): Promise<string[]> {
  const db = await getDb();
  return withTransaction(db, async () => {
    const existing = await destinationRepo.getById(input.destinationId);
    if (!existing) throw new DestinationValidationError('not_found');
    const touched = [existing.packingListId];
    if (input.memberIds && input.moveFrom) {
      touched.push(...(await pullMembersIntoDestinationTx(db, {
        tripId: existing.tripId,
        destinationId: existing.id,
        memberIds: input.memberIds,
      })));
    }
    await destinationRepo.updateTx(db, existing, input.familyId, {
      color: input.color,
      position: input.position,
      memberIds: input.memberIds,
    });
    if (typeof input.name === 'string' && input.name !== existing.name) {
      touched.push(...(await renameDestinationTx(db, existing.id, input.name)));
    }
    return Array.from(new Set(touched));
  });
}

/**
 * Deletes a destination that is not its trip's last one. Shared items may move first.
 * The list is deleted when asked or when it is empty; otherwise it moves into a trip of its own.
 * Caller owns the transaction. Returns how many shared rows moved.
 */
export async function deleteDestinationTx(
  db: Database,
  input: { destination: TripDestination; familyId: string; moveSharedItemsToListId?: string | null; deleteList: boolean }
): Promise<number> {
  const { destination } = input;
  if ((await liveDestinationCount(db, destination.tripId)) <= 1) throw new LastDestinationError();
  const moved = input.moveSharedItemsToListId
    ? await moveAllSharedItemsTx(db, destination.packingListId, input.moveSharedItemsToListId)
    : 0;
  const now = new Date().toISOString();
  await db.run(`UPDATE trip_destinations SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, destination.id]);
  await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [destination.tripId, destination.packingListId]);
  const { count } = await db.get(`SELECT COUNT(*) AS count FROM packing_list_items WHERE packing_list_id = ?`, [destination.packingListId]);
  if (input.deleteList || count === 0) {
    await db.run(`UPDATE packing_lists SET deleted_at = ? WHERE id = ?`, [now, destination.packingListId]);
  } else {
    await createShellTripForListTx(db, { familyId: input.familyId, listId: destination.packingListId, name: destination.name });
  }
  return moved;
}

async function copyListContentsTx(
  db: Database,
  input: { fromListId: string; toListId: string; familyId: string; includeOneOffs: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO packing_list_templates (packing_list_id, template_id, created_at)
     SELECT ?, template_id, ? FROM packing_list_templates WHERE packing_list_id = ?`,
    [input.toListId, now, input.fromListId]
  );
  const rows = (await db.all(
    `SELECT pli.id, pli.item_id AS itemId, pli.display_name AS displayName, i.isOneOff AS isOneOff, i.name AS itemName, i.categoryId AS categoryId
     FROM packing_list_items pli LEFT JOIN items i ON i.id = pli.item_id
     WHERE pli.packing_list_id = ? ORDER BY pli.created_at`,
    [input.fromListId]
  )) as { id: string; itemId: string | null; displayName: string | null; isOneOff: number | null; itemName: string | null; categoryId: string | null }[];
  for (const row of rows) {
    let itemId = row.itemId;
    const oneOff = !row.itemId || row.isOneOff === 1;
    if (oneOff) {
      if (!input.includeOneOffs) continue;
      if (row.itemId) {
        itemId = uuidv4();
        await db.run(
          `INSERT INTO items (id, familyId, categoryId, name, isOneOff, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [itemId, input.familyId, row.categoryId, row.itemName, now, now]
        );
        await db.run(`INSERT INTO item_members (item_id, member_id) SELECT ?, member_id FROM item_members WHERE item_id = ?`, [itemId, row.itemId]);
        await db.run(`INSERT INTO item_whole_family (item_id, family_id) SELECT ?, family_id FROM item_whole_family WHERE item_id = ?`, [itemId, row.itemId]);
      }
    }
    const newId = uuidv4();
    await db.run(
      `INSERT INTO packing_list_items (id, packing_list_id, item_id, display_name, checked, added_during_packing, not_needed, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?)`,
      [newId, input.toListId, itemId, row.displayName, now]
    );
    await db.run(
      `INSERT INTO packing_list_item_templates (packing_list_item_id, template_id, created_at)
       SELECT ?, template_id, ? FROM packing_list_item_templates WHERE packing_list_item_id = ?`,
      [newId, now, row.id]
    );
  }
}

/** Copies a trip's destinations and lists (no dates, bookings or checks) into a new trip. Returns the new trip id. */
export async function copyTrip(input: { sourceTripId: string; familyId: string; name: string; includeOneOffs: boolean }): Promise<string> {
  const db = await getDb();
  return withTransaction(db, async () => {
    const source = await db.get(
      `SELECT name, description, trip_type AS tripType FROM trips WHERE id = ? AND family_id = ? AND deleted_at IS NULL`,
      [input.sourceTripId, input.familyId]
    );
    if (!source) throw new DestinationValidationError('not_found');
    const tripId = await insertTripTx(db, {
      familyId: input.familyId,
      name: input.name,
      description: source.description,
      tripType: source.tripType,
      status: 'planning',
    });
    const destinations = (await db.all(
      `SELECT d.name, d.color, d.packing_list_id AS listId
       FROM trip_destinations d JOIN packing_lists pl ON pl.id = d.packing_list_id
       WHERE d.trip_id = ? AND d.deleted_at IS NULL AND pl.deleted_at IS NULL
       ORDER BY d.position, d.created_at`,
      [input.sourceTripId]
    )) as { name: string; color: string | null; listId: string }[];
    for (const destination of destinations) {
      const members = ((await db.all(
        `SELECT plm.member_id FROM packing_list_members plm JOIN users u ON u.id = plm.member_id
         WHERE plm.packing_list_id = ? AND u.familyId = ? AND u.deleted_at IS NULL`,
        [destination.listId, input.familyId]
      )) as { member_id: string }[]).map(r => r.member_id);
      const destinationId = await destinationRepo.insertDestinationTx(db, {
        tripId,
        familyId: input.familyId,
        name: namesMatch(destination.name, source.name) ? input.name : destination.name,
        memberIds: members,
        allowNoMembers: true,
      });
      if (destination.color) {
        await db.run(`UPDATE trip_destinations SET color = ? WHERE id = ?`, [destination.color, destinationId]);
      }
      await copyListContentsTx(db, {
        fromListId: destination.listId,
        toListId: await listIdOf(db, destinationId),
        familyId: input.familyId,
        includeOneOffs: input.includeOneOffs,
      });
    }
    return tripId;
  });
}
