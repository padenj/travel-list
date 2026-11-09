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

function notify(listIds: string[], change: 'split' | 'move') {
  for (const listId of listIds) {
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

async function distributeItemsTx(db: Database, input: SplitInput, listIds: string[]): Promise<number> {
  const destinationOf = new Map<string, number>();
  input.destinations.forEach((dest, index) => dest.memberIds.forEach(m => destinationOf.set(m, index)));

  const rows = await db.all(
    `SELECT pli.id, pli.item_id AS itemId, CASE WHEN iwf.item_id IS NULL THEN 0 ELSE 1 END AS whole
     FROM packing_list_items pli LEFT JOIN item_whole_family iwf ON iwf.item_id = pli.item_id
     WHERE pli.packing_list_id = ?`,
    [input.sourceListId]
  );

  let skipped = 0;
  for (const row of rows as { id: string; itemId: string | null; whole: number }[]) {
    if (row.whole) {
      if (input.sharedItemsDestinationIndex !== 0) {
        await moveRowTx(db, row.id, listIds[input.sharedItemsDestinationIndex]);
      }
      continue;
    }
    const owners = row.itemId
      ? await db.all(`SELECT member_id FROM item_members WHERE item_id = ?`, [row.itemId])
      : [];
    const membersByDestination = new Map<number, string[]>();
    for (const { member_id } of owners as { member_id: string }[]) {
      const index = destinationOf.get(member_id);
      if (index === undefined) continue;
      membersByDestination.set(index, [...(membersByDestination.get(index) || []), member_id]);
    }
    if (membersByDestination.size === 0) {
      skipped++;
      continue;
    }
    // Sorted, so the original row stays in destination 0 whenever one of its owners is there.
    const indexes = Array.from(membersByDestination.keys()).sort((a, b) => a - b);
    if (indexes[0] !== 0) await moveRowTx(db, row.id, listIds[indexes[0]]);
    for (const index of indexes.slice(1)) {
      await copyRowForMembersTx(db, row.id, listIds[index], membersByDestination.get(index)!);
    }
  }
  return skipped;
}

export async function splitListIntoTrip(input: SplitInput): Promise<SplitResult> {
  validateSplitInput(input);
  const db = await getDb();
  const conflict = await destinationRepo.findConflict(db, input.tripId, input.destinations.flatMap(d => d.memberIds));
  if (conflict) throw conflict;

  const listIds: string[] = [];
  const skippedCount = await withTransaction(db, async () => {
    const sourceMembers = (await db.all(
      `SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`,
      [input.sourceListId]
    )) as { member_id: string }[];
    const assigned = new Set(input.destinations.flatMap(d => d.memberIds));
    if (sourceMembers.some(m => !assigned.has(m.member_id))) {
      throw new DestinationValidationError('unassigned_member');
    }
    for (const [index, dest] of input.destinations.entries()) {
      const name = dest.name.trim();
      const destinationId = await destinationRepo.insertDestinationTx(db, {
        tripId: input.tripId,
        familyId: input.familyId,
        name,
        memberIds: dest.memberIds,
        listName: `${input.tripName} – ${name}`,
        packingListId: index === 0 ? input.sourceListId : undefined,
      });
      const row = await db.get(`SELECT packing_list_id AS listId FROM trip_destinations WHERE id = ?`, [destinationId]);
      listIds.push(row.listId);
    }
    return distributeItemsTx(db, input, listIds);
  });

  notify(listIds, 'split');
  return { destinations: await destinationRepo.listForTrip(input.tripId), skippedCount };
}
