import type { Database } from 'sqlite';

// The app shares one SQLite connection; callers must not nest transactions.
export async function withTransaction<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  await db.run('BEGIN TRANSACTION');
  try {
    const result = await fn();
    await db.run('COMMIT');
    return result;
  } catch (err) {
    try {
      await db.run('ROLLBACK');
    } catch {
      // already rolled back
    }
    throw err;
  }
}
