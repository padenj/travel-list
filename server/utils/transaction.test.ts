import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { closeDb, getDb } from '../db';
import { withTransaction } from './transaction';
import { PackingListRepository } from '../repositories';
import { seedFamilyTrip, createList } from '../test-utils/destinationFixtures';

const tick = () => new Promise(resolve => setTimeout(resolve, 5));

function gate() {
  let open!: () => void;
  const opened = new Promise<void>(resolve => { open = resolve; });
  return { open, opened };
}

describe('withTransaction', () => {
  beforeEach(async () => {
    const db = await getDb();
    await db.run(`CREATE TABLE IF NOT EXISTS tx_test (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL)`);
  });

  afterEach(async () => {
    await closeDb();
  });

  const labels = async () => {
    const db = await getDb();
    return ((await db.all(`SELECT label FROM tx_test ORDER BY id`)) as { label: string }[]).map(r => r.label);
  };

  it('serializes concurrent transactions on the shared connection', async () => {
    const db = await getDb();
    const events: string[] = [];
    const first = withTransaction(db, async () => {
      events.push('first:start');
      await db.run(`INSERT INTO tx_test (label) VALUES ('a1')`);
      await tick();
      await db.run(`INSERT INTO tx_test (label) VALUES ('a2')`);
      events.push('first:end');
    }).then(() => events.push('first:committed'));
    const second = withTransaction(db, async () => {
      events.push('second:start');
      await db.run(`INSERT INTO tx_test (label) VALUES ('b1')`);
      events.push('second:end');
    }).then(() => events.push('second:committed'));

    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'first:committed', 'second:start', 'second:end', 'second:committed']);
    expect(await labels()).toEqual(['a1', 'a2', 'b1']);
  });

  it('rolls back a failing transaction without affecting a concurrent one', async () => {
    const db = await getDb();
    const failing = withTransaction(db, async () => {
      await db.run(`INSERT INTO tx_test (label) VALUES ('bad')`);
      await tick();
      throw new Error('boom');
    });
    const ok = withTransaction(db, async () => {
      await db.run(`INSERT INTO tx_test (label) VALUES ('good')`);
      await tick();
      return 'done';
    });

    await expect(failing).rejects.toThrow('boom');
    await expect(ok).resolves.toBe('done');
    expect(await labels()).toEqual(['good']);
  });

  it('runs nested calls inside the outer transaction without deadlocking', async () => {
    const db = await getDb();
    const result = await withTransaction(db, async () => {
      await db.run(`INSERT INTO tx_test (label) VALUES ('outer')`);
      return withTransaction(db, async () => {
        await db.run(`INSERT INTO tx_test (label) VALUES ('inner')`);
        return 42;
      });
    });
    expect(result).toBe(42);
    expect(await labels()).toEqual(['outer', 'inner']);
  });

  it('rolls back nested work when the outer transaction fails', async () => {
    const db = await getDb();
    await expect(withTransaction(db, async () => {
      await withTransaction(db, async () => {
        await db.run(`INSERT INTO tx_test (label) VALUES ('inner')`);
      });
      throw new Error('outer failed');
    })).rejects.toThrow('outer failed');
    expect(await labels()).toEqual([]);
    // The lock is released: a later transaction still runs.
    await withTransaction(db, () => db.run(`INSERT INTO tx_test (label) VALUES ('after')`));
    expect(await labels()).toEqual(['after']);
  });

  it('does not treat work that outlives a transaction as nested', async () => {
    const db = await getDb();
    let late!: Promise<void>;
    const release = gate();
    await withTransaction(db, async () => {
      late = release.opened.then(() =>
        withTransaction(db, async () => {
          await db.run(`INSERT INTO tx_test (label) VALUES ('late')`);
          throw new Error('late failure');
        })
      );
      late.catch(() => undefined);
    });
    release.open();
    await expect(late).rejects.toThrow('late failure');
    expect(await labels()).toEqual([]);
  });

  it('keeps a long transaction intact while setMemberIdsForPackingList runs concurrently', async () => {
    const seed = await seedFamilyTrip();
    const db = seed.db;
    const listId = await createList(seed.familyId, 'Unrelated', [seed.dad]);
    const repo = new PackingListRepository();
    const release = gate();

    const long = withTransaction(db, async () => {
      await db.run(`INSERT INTO tx_test (label) VALUES ('long-1')`);
      await release.opened;
      await db.run(`INSERT INTO tx_test (label) VALUES ('long-2')`);
      return 'committed';
    });
    await tick();
    const members = repo.setMemberIdsForPackingList(listId, [seed.mom, seed.ava]);
    await tick();
    release.open();

    await expect(long).resolves.toBe('committed');
    await expect(members).resolves.toBeUndefined();
    expect(await labels()).toEqual(['long-1', 'long-2']);
    const rows = await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ? ORDER BY member_id`, [listId]);
    expect(rows.map((r: any) => r.member_id)).toEqual([seed.mom, seed.ava].sort());
  });
});
