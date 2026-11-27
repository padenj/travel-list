import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

export interface PaymentMethod {
  id: string;
  nickname: string;
  archived: boolean;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export class PaymentMethodError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message);
    this.name = 'PaymentMethodError';
  }
}

const SELECT = `
  SELECT pm.id, pm.nickname, pm.archived_at as archivedAt, pm.created_at as createdAt, pm.updated_at as updatedAt,
         (SELECT COUNT(*) FROM booking_transactions t WHERE t.payment_method_id = pm.id) as transactionCount
  FROM payment_methods pm`;

function hydrate(row: any): PaymentMethod {
  return {
    id: row.id, nickname: row.nickname, archived: row.archivedAt != null,
    transactionCount: Number(row.transactionCount ?? 0), createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export function normalizeNickname(value: unknown): string {
  const nickname = typeof value === 'string' ? value.trim() : '';
  if (nickname.length < 1 || nickname.length > 60) throw new PaymentMethodError('Nickname must be 1–60 characters', 400);
  return nickname;
}

export class PaymentMethodRepository {
  private db = getDb();

  async list(familyId: string, includeArchived = false): Promise<PaymentMethod[]> {
    const db = await this.db;
    const rows = await db.all(
      `${SELECT} WHERE pm.family_id = ? ${includeArchived ? '' : 'AND pm.archived_at IS NULL'}
       ORDER BY (pm.archived_at IS NOT NULL), lower(pm.nickname)`,
      [familyId]
    );
    return rows.map(hydrate);
  }

  async getById(familyId: string, id: string): Promise<PaymentMethod | null> {
    const db = await this.db;
    const row = await db.get(`${SELECT} WHERE pm.family_id = ? AND pm.id = ?`, [familyId, id]);
    return row ? hydrate(row) : null;
  }

  async create(familyId: string, rawNickname: unknown): Promise<PaymentMethod> {
    const nickname = normalizeNickname(rawNickname);
    await this.assertUnique(familyId, nickname, null);
    const id = uuidv4();
    const db = await this.db;
    await db.run(`INSERT INTO payment_methods (id, family_id, nickname) VALUES (?, ?, ?)`, [id, familyId, nickname]);
    return (await this.getById(familyId, id))!;
  }

  async update(familyId: string, id: string, updates: { nickname?: unknown; archived?: unknown }): Promise<PaymentMethod> {
    const existing = await this.getById(familyId, id);
    if (!existing) throw new PaymentMethodError('Payment method not found', 404);
    const nickname = updates.nickname !== undefined ? normalizeNickname(updates.nickname) : existing.nickname;
    const archived = updates.archived !== undefined ? Boolean(updates.archived) : existing.archived;
    if (!archived) await this.assertUnique(familyId, nickname, id);
    const db = await this.db;
    await db.run(
      `UPDATE payment_methods
       SET nickname = ?, archived_at = CASE WHEN ? THEN COALESCE(archived_at, datetime('now')) ELSE NULL END,
           updated_at = datetime('now')
       WHERE id = ? AND family_id = ?`,
      [nickname, archived ? 1 : 0, id, familyId]
    );
    return (await this.getById(familyId, id))!;
  }

  async remove(familyId: string, id: string): Promise<void> {
    const existing = await this.getById(familyId, id);
    if (!existing) throw new PaymentMethodError('Payment method not found', 404);
    if (existing.transactionCount > 0) {
      const n = existing.transactionCount;
      throw new PaymentMethodError(`Payment method is used by ${n} transaction${n === 1 ? '' : 's'}. Archive it instead.`, 409);
    }
    const db = await this.db;
    await db.run(`DELETE FROM payment_methods WHERE id = ? AND family_id = ?`, [id, familyId]);
  }

  private async assertUnique(familyId: string, nickname: string, exceptId: string | null): Promise<void> {
    const db = await this.db;
    const clash = await db.get(
      `SELECT id FROM payment_methods
       WHERE family_id = ? AND archived_at IS NULL AND lower(nickname) = lower(?) AND id != ?`,
      [familyId, nickname, exceptId ?? '']
    );
    if (clash) throw new PaymentMethodError('A payment method with that nickname already exists', 409);
  }
}
