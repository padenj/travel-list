import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db';

interface AuditLogEntry {
  userId: string;
  username: string;
  action: string;
  details?: string;
}

export async function logAudit({ userId, username, action, details }: AuditLogEntry): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO audit_log (id, user_id, username, action, details, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), userId, username, action, details || '', new Date().toISOString()]
  );
}
