import { v4 as uuidv4 } from 'uuid';
import type { Database } from 'sqlite';
import { getDb } from '../db';
import { broadcastEvent } from '../sse';
import { withTransaction } from '../utils/transaction';
import {
  TripDestination,
  TripDestinationRepository,
  DestinationValidationError,
} from '../repositories/tripDestinationRepository';

export interface SplitInput {
  tripId: string;
  tripName: string;
  familyId: string;
  sourceListId: string;
  destinations: { name: string; memberIds: string[] }[];
  sharedItemsDestinationIndex: number;
}

export interface SplitResult {
  destinations: TripDestination[];
  skippedCount: number;
}

export class MoveValidationError extends Error {}

const destinationRepo = new TripDestinationRepository();

export function notify(listIds: string[], change: 'split' | 'move' | 'destination') {
  for (const listId of new Set(listIds)) {
    try {
      broadcastEvent({ type: 'packing_list_changed', listId, data: { change } });
    } catch {
      // best effort
    }
  }
}

function validateSplitInput(input: SplitInput) {
  if (!Array.isArray(input.destinations) || input.destinations.length < 2) {
    throw new DestinationValidationError('need_two_destinations');
  }
  const seen = new Set<string>();
  for (const dest of input.destinations) {
    if (!dest || typeof dest.name !== 'string' || !dest.name.trim()) {
      throw new DestinationValidationError('destination_name_required');
    }
    if (!Array.isArray(dest.memberIds) || dest.memberIds.length === 0) {
      throw new DestinationValidationError('members_required');
    }
    for (const memberId of dest.memberIds) {
      if (seen.has(memberId)) throw new DestinationValidationError('member_in_two_destinations');
      seen.add(memberId);
    }
  }
  const index = input.sharedItemsDestinationIndex;
  if (!Number.isInteger(index) || index < 0 || index >= input.destinations.length) {
    throw new DestinationValidationError('invalid_shared_destination');
  }
}

async function moveRowTx(db: Database, pliId: string, listId: string) {
  await db.run(`UPDATE packing_list_items SET packing_list_id = ? WHERE id = ?`, [listId, pliId]);
}

async function copyRowForMembersTx(db: Database, pliId: string, listId: string, memberIds: string[]) {
  const newId = uuidv4();
  await db.run(
    `INSERT INTO packing_list_items (id, packing_list_id, item_id, display_name, checked, added_during_packing, not_needed, created_at)
     SELECT ?, ?, item_id, display_name, 0, added_during_packing, 0, created_at FROM packing_list_items WHERE id = ?`,
    [newId, listId, pliId]
  );
  await db.run(
    `INSERT INTO packing_list_item_templates (packing_list_item_id, template_id, created_at)
     SELECT ?, template_id, created_at FROM packing_list_item_templates WHERE packing_list_item_id = ?`,
    [newId, pliId]
  );
  const placeholders = memberIds.map(() => '?').join(',');
  await db.run(
    `UPDATE packing_list_item_checks SET packing_list_item_id = ? WHERE packing_list_item_id = ? AND member_id IN (${placeholders})`,
    [newId, pliId, ...memberIds]
  );
  await db.run(
    `UPDATE packing_list_item_not_needed SET packing_list_item_id = ? WHERE packing_list_item_id = ? AND member_id IN (${placeholders})`,
    [newId, pliId, ...memberIds]
  );
}

// Hands the movers' per-person checks and not-needed marks to an existing row; the target's own rows win.
async function mergeMemberStateTx(db: Database, fromPliId: string, toPliId: string, memberIds: string[]) {
  const placeholders = memberIds.map(() => '?').join(',');
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed']) {
    await db.run(
      `DELETE FROM ${table} WHERE packing_list_item_id = ? AND member_id IN (${placeholders})
       AND member_id IN (SELECT member_id FROM ${table} WHERE packing_list_item_id = ? AND member_id IS NOT NULL)`,
      [fromPliId, ...memberIds, toPliId]
    );
    await db.run(
      `UPDATE ${table} SET packing_list_item_id = ? WHERE packing_list_item_id = ? AND member_id IN (${placeholders})`,
      [toPliId, fromPliId, ...memberIds]
    );
  }
}

async function dropMergedRowTx(db: Database, fromPliId: string, toPliId: string, toListId: string) {
  await db.run(
    `UPDATE packing_list_audit_log SET packing_list_id = ?, packing_list_item_id = ? WHERE packing_list_item_id = ?`,
    [toListId, toPliId, fromPliId]
  );
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed', 'packing_list_item_templates']) {
    await db.run(`DELETE FROM ${table} WHERE packing_list_item_id = ?`, [fromPliId]);
  }
  await db.run(`DELETE FROM packing_list_items WHERE id = ?`, [fromPliId]);
}

/**
 * Moves people from one list to another, taking their personal rows with them.
 * Caller owns the transaction.
 */
export async function moveMembersTx(
  db: Database,
  input: { fromListId: string; toListId: string; memberIds: string[] }
): Promise<void> {
  const movers = Array.from(new Set(input.memberIds));
  if (movers.length === 0 || input.fromListId === input.toListId) return;
  const sourceMembers = new Set(
    ((await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [input.fromListId])) as { member_id: string }[])
      .map(r => r.member_id)
  );
  const moving = new Set(movers.filter(m => sourceMembers.has(m)));
  if (moving.size > 0) {
    const rows = (await db.all(
      `SELECT pli.id, pli.item_id AS itemId FROM packing_list_items pli
       LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
       WHERE pli.packing_list_id = ? AND pli.item_id IS NOT NULL AND iwf.item_id IS NULL
       ORDER BY pli.created_at`,
      [input.fromListId]
    )) as { id: string; itemId: string }[];
    for (const row of rows) {
      const owners = ((await db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [row.itemId])) as { member_id: string }[])
        .map(o => o.member_id)
        .filter(m => sourceMembers.has(m));
      const ownersMoving = owners.filter(m => moving.has(m));
      if (ownersMoving.length === 0) continue;
      const fullMove = ownersMoving.length === owners.length;
      const existing = await db.get(
        `SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`,
        [input.toListId, row.itemId]
      );
      if (existing) {
        await mergeMemberStateTx(db, row.id, existing.id, ownersMoving);
        if (fullMove) await dropMergedRowTx(db, row.id, existing.id, input.toListId);
      } else if (fullMove) {
        await moveRowTx(db, row.id, input.toListId);
        await db.run(`UPDATE packing_list_audit_log SET packing_list_id = ? WHERE packing_list_item_id = ?`, [input.toListId, row.id]);
      } else {
        await copyRowForMembersTx(db, row.id, input.toListId, ownersMoving);
      }
    }
  }
  const placeholders = movers.map(() => '?').join(',');
  await db.run(
    `DELETE FROM packing_list_members WHERE packing_list_id = ? AND member_id IN (${placeholders})`,
    [input.fromListId, ...movers]
  );
  for (const memberId of movers) {
    await db.run(`INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [input.toListId, memberId]);
  }
}

/**
 * Moves `memberIds` out of every other destination of the trip into `destinationId`, items included.
 * Returns the lists it changed. Caller owns the transaction.
 */
export async function pullMembersIntoDestinationTx(
  db: Database,
  input: { tripId: string; destinationId: string; memberIds: string[] }
): Promise<string[]> {
  const target = await db.get(`SELECT packing_list_id AS listId FROM trip_destinations WHERE id = ?`, [input.destinationId]);
  if (!target) throw new DestinationValidationError('not_found');
  const others = (await db.all(
    `SELECT id, packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL AND id != ?`,
    [input.tripId, input.destinationId]
  )) as { id: string; listId: string }[];
  const touched: string[] = [];
  for (const other of others) {
    const members = ((await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [other.listId])) as { member_id: string }[])
      .map(r => r.member_id);
    const movers = members.filter(m => input.memberIds.includes(m));
    if (movers.length === 0) continue;
    if (movers.length === members.length) throw new DestinationValidationError('would_empty_destination');
    await moveMembersTx(db, { fromListId: other.listId, toListId: target.listId, memberIds: movers });
    touched.push(other.listId);
  }
  return touched;
}

async function countUnownedRowsTx(db: Database, listId: string, assigned: Set<string>): Promise<number> {
  const rows = (await db.all(
    `SELECT pli.item_id AS itemId FROM packing_list_items pli
     LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
     WHERE pli.packing_list_id = ? AND iwf.item_id IS NULL`,
    [listId]
  )) as { itemId: string | null }[];
  let count = 0;
  for (const row of rows) {
    const owners = row.itemId
      ? ((await db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [row.itemId])) as { member_id: string }[])
      : [];
    if (!owners.some(o => assigned.has(o.member_id))) count++;
  }
  return count;
}

/**
 * Old clients call `POST /trips` (no memberIds) and then split into the fresh trip. That create
 * auto-fills a single first destination with every family member on an empty list, which would
 * otherwise collide with the split's own member assignment. If the trip still has exactly one live
 * destination and its list has no items, it's that untouched placeholder: retire it (soft-delete the
 * destination and its list, drop the trip_packing_lists link) so the split's destinations are all that
 * remain. Caller owns the transaction, so a later failure rolls this back along with everything else.
 */
async function retirePlaceholderDestinationTx(db: Database, tripId: string): Promise<void> {
  const destinations = (await db.all(
    `SELECT id, packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
    [tripId]
  )) as { id: string; listId: string }[];
  if (destinations.length !== 1) return;
  const [destination] = destinations;
  const { count } = await db.get(
    `SELECT COUNT(*) AS count FROM packing_list_items WHERE packing_list_id = ?`,
    [destination.listId]
  );
  if (count > 0) return;
  const now = new Date().toISOString();
  await db.run(`UPDATE trip_destinations SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, destination.id]);
  await db.run(`UPDATE packing_lists SET deleted_at = ? WHERE id = ?`, [now, destination.listId]);
  await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [tripId, destination.listId]);
}

export async function splitListIntoTrip(input: SplitInput): Promise<SplitResult> {
  validateSplitInput(input);
  const db = await getDb();

  const listIds: string[] = [];
  const skippedCount = await withTransaction(db, async () => {
    await retirePlaceholderDestinationTx(db, input.tripId);
    const conflict = await destinationRepo.findConflict(db, input.tripId, input.destinations.flatMap(d => d.memberIds));
    if (conflict) throw conflict;
    const sourceMembers = (await db.all(
      `SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`,
      [input.sourceListId]
    )) as { member_id: string }[];
    const assigned = new Set(input.destinations.flatMap(d => d.memberIds));
    if (sourceMembers.some(m => !assigned.has(m.member_id))) {
      throw new DestinationValidationError('unassigned_member');
    }
    const skipped = await countUnownedRowsTx(db, input.sourceListId, assigned);
    // The source list becomes the first destination with everyone on it; the others start empty and pull their people over.
    for (const [index, dest] of input.destinations.entries()) {
      const destinationId = await destinationRepo.insertDestinationTx(db, {
        tripId: input.tripId,
        familyId: input.familyId,
        name: dest.name.trim(),
        memberIds: index === 0 ? Array.from(assigned) : [],
        allowNoMembers: index !== 0,
        packingListId: index === 0 ? input.sourceListId : undefined,
      });
      const row = await db.get(`SELECT packing_list_id AS listId FROM trip_destinations WHERE id = ?`, [destinationId]);
      listIds.push(row.listId);
    }
    for (const [index, dest] of input.destinations.entries()) {
      if (index === 0) continue;
      await moveMembersTx(db, { fromListId: listIds[0], toListId: listIds[index], memberIds: dest.memberIds });
    }
    if (input.sharedItemsDestinationIndex !== 0) {
      await moveAllSharedItemsTx(db, listIds[0], listIds[input.sharedItemsDestinationIndex]);
    }
    return skipped;
  });

  notify(listIds, 'split');
  return { destinations: await destinationRepo.listForTrip(input.tripId), skippedCount };
}

export async function validateSameTripDifferentDestinations(fromListId: string, toListId: string) {
  const from = await destinationRepo.findByPackingListId(fromListId);
  const to = await destinationRepo.findByPackingListId(toListId);
  if (!from || !to || from.tripId !== to.tripId || from.id === to.id) {
    throw new MoveValidationError('not_same_trip');
  }
}

async function moveSharedRowTx(db: Database, row: { id: string; itemId: string | null }, toListId: string): Promise<string> {
  const existing = row.itemId
    ? await db.get(`SELECT id FROM packing_list_items WHERE packing_list_id = ? AND item_id = ?`, [toListId, row.itemId])
    : null;
  if (!existing) {
    await moveRowTx(db, row.id, toListId);
    await db.run(`UPDATE packing_list_audit_log SET packing_list_id = ? WHERE packing_list_item_id = ?`, [toListId, row.id]);
    return row.id;
  }
  const sourceChecked = await db.get(
    `SELECT 1 AS yes FROM packing_list_item_checks WHERE packing_list_item_id = ? AND checked = 1 LIMIT 1`,
    [row.id]
  );
  const targetChecked = await db.get(
    `SELECT 1 AS yes FROM packing_list_item_checks WHERE packing_list_item_id = ? AND checked = 1 LIMIT 1`,
    [existing.id]
  );
  if (sourceChecked && !targetChecked) {
    await db.run(`DELETE FROM packing_list_item_checks WHERE packing_list_item_id = ?`, [existing.id]);
    await db.run(
      `INSERT INTO packing_list_item_checks (id, packing_list_item_id, member_id, checked, checked_at) VALUES (?, ?, NULL, 1, ?)`,
      [uuidv4(), existing.id, new Date().toISOString()]
    );
  }
  const wholeNotNeeded = `member_id IS NULL AND not_needed = 1`;
  const sourceNotNeeded = await db.get(
    `SELECT id FROM packing_list_item_not_needed WHERE packing_list_item_id = ? AND ${wholeNotNeeded} LIMIT 1`,
    [row.id]
  );
  const targetNotNeeded = await db.get(
    `SELECT 1 AS yes FROM packing_list_item_not_needed WHERE packing_list_item_id = ? AND ${wholeNotNeeded} LIMIT 1`,
    [existing.id]
  );
  if (sourceNotNeeded && !targetNotNeeded) {
    await db.run(`UPDATE packing_list_item_not_needed SET packing_list_item_id = ? WHERE id = ?`, [existing.id, sourceNotNeeded.id]);
  }
  await db.run(
    `UPDATE packing_list_audit_log SET packing_list_id = ?, packing_list_item_id = ? WHERE packing_list_item_id = ?`,
    [toListId, existing.id, row.id]
  );
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed', 'packing_list_item_templates']) {
    await db.run(`DELETE FROM ${table} WHERE packing_list_item_id = ?`, [row.id]);
  }
  await db.run(`DELETE FROM packing_list_items WHERE id = ?`, [row.id]);
  return existing.id;
}

export async function moveSharedItem(input: { fromListId: string; pliId: string; toListId: string }): Promise<{ id: string; listId: string }> {
  await validateSameTripDifferentDestinations(input.fromListId, input.toListId);
  const db = await getDb();
  const id = await withTransaction(db, async () => {
    const row = await db.get(
      `SELECT pli.id, pli.item_id AS itemId, CASE WHEN iwf.item_id IS NULL THEN 0 ELSE 1 END AS whole
       FROM packing_list_items pli LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
       WHERE pli.id = ? AND pli.packing_list_id = ?`,
      [input.pliId, input.fromListId]
    );
    if (!row) throw new MoveValidationError('item_not_found');
    if (!row.whole) throw new MoveValidationError('personal_item');
    return moveSharedRowTx(db, row, input.toListId);
  });
  notify([input.fromListId, input.toListId], 'move');
  return { id, listId: input.toListId };
}

export async function moveAllSharedItemsTx(db: Database, fromListId: string, toListId: string): Promise<number> {
  const rows = (await db.all(
    `SELECT pli.id, pli.item_id AS itemId FROM packing_list_items pli JOIN item_whole_family iwf ON iwf.item_id = pli.item_id WHERE pli.packing_list_id = ?`,
    [fromListId]
  )) as { id: string; itemId: string | null }[];
  for (const row of rows) await moveSharedRowTx(db, row, toListId);
  return rows.length;
}

export async function moveAllSharedItems(fromListId: string, toListId: string): Promise<number> {
  await validateSameTripDifferentDestinations(fromListId, toListId);
  const db = await getDb();
  const count = await withTransaction(db, () => moveAllSharedItemsTx(db, fromListId, toListId));
  if (count > 0) notify([fromListId, toListId], 'move');
  return count;
}
