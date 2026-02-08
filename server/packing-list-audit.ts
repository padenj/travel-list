import { getDb } from './db';

export type PackingListAuditAction =
  | 'ITEM_CHECKED'
  | 'ITEM_UNCHECKED'
  | 'ITEM_NOT_NEEDED'
  | 'ITEM_NEEDED'
  | 'ITEM_ADDED'
  | 'ITEM_REMOVED';

export type AppliesToScope = 'family' | 'member';

export interface PackingListAuditInsert {
  packingListId: string;
  packingListItemId?: string | null;
  actorUserId?: string | null;
  action: PackingListAuditAction;
  appliesToScope: AppliesToScope;
  appliesToMemberId?: string | null;
  details?: string | null;
  metadata?: any;
}

export interface PackingListAuditRow {
  id: number;
  packingListId: string;
  packingListItemId: string | null;
  actorUserId: string | null;
  actorName: string;
  action: PackingListAuditAction;
  appliesToScope: AppliesToScope;
  appliesToMemberId: string | null;
  appliesToMemberName: string | null;
  details: string | null;
  createdAt: string;
}

const clampLimit = (limit: any): number => {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.max(1, Math.min(100, Math.floor(n)));
};

export async function insertPackingListAudit(entry: PackingListAuditInsert): Promise<void> {
  const db = await getDb();
  const metadataJson = typeof entry.metadata === 'undefined' ? null : JSON.stringify(entry.metadata);
  await db.run(
    `INSERT INTO packing_list_audit_log (
      packing_list_id,
      packing_list_item_id,
      actor_user_id,
      action,
      applies_to_scope,
      applies_to_member_id,
      details,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.packingListId,
      entry.packingListItemId ?? null,
      entry.actorUserId ?? null,
      entry.action,
      entry.appliesToScope,
      entry.appliesToMemberId ?? null,
      entry.details ?? null,
      metadataJson
    ]
  );
}

async function queryAuditRows(whereSql: string, params: any[], limit: number, beforeId?: number | null) {
  const db = await getDb();
  const effLimit = clampLimit(limit);
  const beforeClause = beforeId ? ` AND a.id < ?` : '';
  const finalParams = beforeId ? [...params, beforeId, effLimit + 1] : [...params, effLimit + 1];

  const rows: any[] = await db.all(
    `SELECT
      a.id,
      a.packing_list_id,
      a.packing_list_item_id,
      a.actor_user_id,
      a.action,
      a.applies_to_scope,
      a.applies_to_member_id,
      a.details,
      a.created_at,
      u.name as actor_name,
      u.username as actor_username,
      m.name as applies_to_member_name,
      m.username as applies_to_member_username
    FROM packing_list_audit_log a
    LEFT JOIN users u ON u.id = a.actor_user_id
    LEFT JOIN users m ON m.id = a.applies_to_member_id
    WHERE ${whereSql}${beforeClause}
    ORDER BY a.id DESC
    LIMIT ?`,
    finalParams
  );

  const hasMore = rows.length > effLimit;
  const page = hasMore ? rows.slice(0, effLimit) : rows;
  const nextBeforeId = hasMore ? page[page.length - 1].id : null;

  const items: PackingListAuditRow[] = page.map(r => {
    const actorName = r.actor_name || r.actor_username || 'system';
    const appliesToMemberName = r.applies_to_member_name || r.applies_to_member_username || null;
    return {
      id: r.id,
      packingListId: r.packing_list_id,
      packingListItemId: r.packing_list_item_id || null,
      actorUserId: r.actor_user_id || null,
      actorName,
      action: r.action,
      appliesToScope: r.applies_to_scope,
      appliesToMemberId: r.applies_to_member_id || null,
      appliesToMemberName,
      details: r.details || null,
      createdAt: r.created_at
    } as PackingListAuditRow;
  });

  return { items, nextBeforeId };
}

export async function listPackingListAudit(opts: { packingListId: string; limit?: number; beforeId?: number | null }) {
  return queryAuditRows('a.packing_list_id = ?', [opts.packingListId], opts.limit ?? 50, opts.beforeId ?? null);
}

export async function listPackingListItemAudit(opts: { packingListId: string; packingListItemId: string; limit?: number; beforeId?: number | null }) {
  return queryAuditRows(
    'a.packing_list_id = ? AND a.packing_list_item_id = ?',
    [opts.packingListId, opts.packingListItemId],
    opts.limit ?? 50,
    opts.beforeId ?? null
  );
}
