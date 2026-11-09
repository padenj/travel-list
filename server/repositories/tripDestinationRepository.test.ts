import { describe, it, expect, afterEach } from 'vitest';
import { getDb, closeDb } from '../db';

describe('trip_destinations schema', () => {
  afterEach(async () => {
    await closeDb();
  });

  it('creates the trip_destinations table', async () => {
    const db = await getDb();
    const cols = await db.all(`PRAGMA table_info(trip_destinations)`);
    expect(cols.map((c: any) => c.name)).toEqual(
      expect.arrayContaining(['id', 'trip_id', 'name', 'color', 'position', 'packing_list_id', 'created_at', 'updated_at', 'deleted_at'])
    );
  });
});
