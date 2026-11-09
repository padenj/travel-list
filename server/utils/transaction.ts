import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from 'sqlite';

// Every request shares one SQLite connection, so a BEGIN from one request would land inside
// another request's open transaction. All transactions therefore run one at a time behind
// this process-wide lock.
let lockTail: Promise<void> = Promise.resolve();

async function acquireLock(): Promise<() => void> {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const previous = lockTail;
  lockTail = previous.then(() => held);
  await previous;
  return release;
}

interface TransactionScope {
  db: Database;
  active: boolean;
}

const currentScope = new AsyncLocalStorage<TransactionScope>();

async function runInTransaction<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  await db.run('BEGIN TRANSACTION');
  const scope: TransactionScope = { db, active: true };
  try {
    const result = await currentScope.run(scope, fn);
    await db.run('COMMIT');
    return result;
  } catch (err) {
    try {
      await db.run('ROLLBACK');
    } catch {
      // already rolled back
    }
    throw err;
  } finally {
    // Async work started inside fn but still running afterwards must not count as nested.
    scope.active = false;
  }
}

export async function withTransaction<T>(db: Database, fn: () => Promise<T>): Promise<T> {
  const scope = currentScope.getStore();
  if (scope?.active) {
    // Already inside a transaction on this async chain (and holding the lock).
    if (scope.db === db) return fn();
    return runInTransaction(db, fn);
  }
  const release = await acquireLock();
  try {
    return await runInTransaction(db, fn);
  } finally {
    release();
  }
}
