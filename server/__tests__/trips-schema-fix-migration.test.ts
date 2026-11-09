import { describe, it, expect } from 'vitest';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import migration from '../migrations/migrations/20260831_fix_trips_schema_spec_compliance.cjs';

const tableNames = async (db: any): Promise<string[]> =>
  (await db.all(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)).map((r: any) => r.name);

describe('20260831_fix_trips_schema_spec_compliance', () => {
  // Production upgrade path: initializeDatabase (foreign_keys = ON) has already created the
  // current trip + booking schema before pending migrations run.
  it('is a non-destructive no-op when the current trip schema already exists', async () => {
    const db = await getDb();
    const now = new Date().toISOString();
    const familyId = uuidv4();
    const tripId = uuidv4();
    const participantId = uuidv4();
    await db.run(`INSERT INTO families (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [familyId, 'F', now, now]);
    await db.run(`INSERT INTO trips (id, family_id, name) VALUES (?, ?, ?)`, [tripId, familyId, 'Trip']);
    await db.run(`INSERT INTO trip_participants (id, trip_id, display_name) VALUES (?, ?, ?)`, [participantId, tripId, 'Ann']);

    await migration.up({ db });

    const tables = await tableNames(db);
    expect(tables).toEqual(expect.arrayContaining([
      'trips', 'trip_locations', 'trip_participants', 'trip_packing_lists', 'trip_elements',
      'trip_element_confirmations', 'trip_element_attachments', 'flight_legs', 'bookings', 'booking_travelers',
    ]));
    const participant = await db.get(`SELECT display_name FROM trip_participants WHERE id = ?`, [participantId]);
    expect(participant?.display_name).toBe('Ann');
    const fk = await db.get(`PRAGMA foreign_keys`);
    expect(fk.foreign_keys).toBe(1);
  });

  it('rebuilds the legacy pre-spec trip schema (trips.title, trip_element_pricing)', async () => {
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    try {
      await db.exec(`PRAGMA foreign_keys = ON`);
      await db.exec(`CREATE TABLE families (id TEXT PRIMARY KEY)`);
      await db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY)`);
      await db.exec(`CREATE TABLE packing_lists (id TEXT PRIMARY KEY)`);
      await db.exec(`CREATE TABLE trips (id TEXT PRIMARY KEY, family_id TEXT, title TEXT)`);
      await db.exec(`CREATE TABLE trip_elements (id TEXT PRIMARY KEY, trip_id TEXT REFERENCES trips(id))`);
      await db.exec(`CREATE TABLE trip_element_pricing (id TEXT PRIMARY KEY, element_id TEXT REFERENCES trip_elements(id))`);

      await migration.up({ db });

      const tables = await tableNames(db);
      expect(tables).not.toContain('trip_element_pricing');
      expect(tables).toEqual(expect.arrayContaining(['trips', 'trip_participants', 'trip_elements', 'flight_legs']));
      const tripCols = (await db.all(`PRAGMA table_info(trips)`)).map((c: any) => c.name);
      expect(tripCols).toContain('name');
      expect(tripCols).not.toContain('title');
      const fk = await db.get(`PRAGMA foreign_keys`);
      expect(fk.foreign_keys).toBe(1);
    } finally {
      await db.close();
    }
  });
});
