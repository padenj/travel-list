import { describe, it, expect, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';

describe('getDb', () => {
  afterEach(async () => {
    await closeDb();
  });

  it('returns one fully initialised database to concurrent first callers', async () => {
    await closeDb();
    const [a, b, c] = await Promise.all([getDb(), getDb(), getDb()]);
    expect(b).toBe(a);
    expect(c).toBe(a);
    const latest = await getDb();
    expect(latest).toBe(a);
    await expect(latest.get('SELECT COUNT(*) AS n FROM families')).resolves.toEqual({ n: expect.any(Number) });
  });
});
