/*
  Migration: every live packing list belongs to exactly one trip through exactly one destination.
  See docs/superpowers/specs/2026-11-09-every-list-is-a-trip-design.md.
  The runner does not wrap migrations in a transaction, so this one manages its own.
*/
const { randomUUID } = require('crypto');

const COLORS = ['blue', 'green', 'orange', 'grape', 'teal', 'red'];

// Same rule as server/utils/destinationLabel.ts (a .cjs migration cannot import TypeScript).
function label(tripName, destinationName) {
  const trip = String(tripName || '').trim();
  const destination = String(destinationName || '').trim();
  if (!trip) return destination;
  if (!destination || trip.toLowerCase() === destination.toLowerCase()) return trip;
  return `${trip} · ${destination}`;
}

const LIST_HAS_NO_DESTINATION = `NOT EXISTS (
  SELECT 1 FROM trip_destinations d JOIN trips t ON t.id = d.trip_id
  WHERE d.packing_list_id = pl.id AND d.deleted_at IS NULL AND t.deleted_at IS NULL)`;

async function record(db, kind, id) {
  await db.run(`INSERT OR IGNORE INTO migration_trip_shells (kind, id) VALUES (?, ?)`, [kind, id]);
}

async function memberIdsOf(db, listId) {
  return (await db.all(`SELECT member_id FROM packing_list_members WHERE packing_list_id = ?`, [listId])).map(r => r.member_id);
}

async function liveDestinations(db, tripId) {
  return db.all(
    `SELECT id, color, position, packing_list_id AS listId FROM trip_destinations WHERE trip_id = ? AND deleted_at IS NULL`,
    [tripId]
  );
}

async function addDestination(db, { tripId, name, listId, now }) {
  const existing = await liveDestinations(db, tripId);
  const used = new Set(existing.map(d => d.color));
  const color = COLORS.find(c => !used.has(c)) || COLORS[existing.length % COLORS.length];
  const position = existing.reduce((max, d) => Math.max(max, d.position), -1) + 1;
  const id = randomUUID();
  await db.run(
    `INSERT INTO trip_destinations (id, trip_id, name, color, position, packing_list_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tripId, name, color, position, listId, now, now]
  );
  await record(db, 'destination', id);
  const inserted = await db.run(
    `INSERT OR IGNORE INTO trip_packing_lists (trip_id, packing_list_id, created_at) VALUES (?, ?, ?)`,
    [tripId, listId, now]
  );
  if (inserted && inserted.changes) await record(db, 'link', `${tripId}|${listId}`);
  return id;
}

async function up({ db }) {
  await db.exec('BEGIN TRANSACTION');
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS migration_trip_shells (kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY (kind, id))`);
    const now = new Date().toISOString();

    // 1. Lists linked to a trip that are not yet a destination of any trip.
    const linkedRows = await db.all(
      `SELECT tpl.trip_id AS tripId, t.name AS tripName, pl.id AS listId, pl.name AS listName
       FROM trip_packing_lists tpl
       JOIN trips t ON t.id = tpl.trip_id
       JOIN packing_lists pl ON pl.id = tpl.packing_list_id
       WHERE t.deleted_at IS NULL AND pl.deleted_at IS NULL AND t.family_id = pl.family_id AND ${LIST_HAS_NO_DESTINATION}
       ORDER BY tpl.created_at, pl.created_at`
    );
    const handled = new Set();
    for (const row of linkedRows) {
      if (handled.has(row.listId)) continue;
      handled.add(row.listId);
      const members = await memberIdsOf(db, row.listId);
      const destinations = await liveDestinations(db, row.tripId);
      let conflict = false;
      for (const destination of destinations) {
        const others = await memberIdsOf(db, destination.listId);
        if (others.some(m => members.includes(m))) {
          conflict = true;
          break;
        }
      }
      if (conflict) continue; // step 2 gives it a shell trip of its own
      const name = destinations.length === 0 ? row.tripName : row.listName;
      await addDestination(db, { tripId: row.tripId, name, listId: row.listId, now });
    }

    // 2. Every other live list without a destination gets a dateless shell trip.
    const loose = await db.all(
      `SELECT pl.id, pl.name, pl.family_id AS familyId FROM packing_lists pl
       WHERE pl.deleted_at IS NULL AND ${LIST_HAS_NO_DESTINATION}
       ORDER BY pl.created_at`
    );
    for (const list of loose) {
      const tripId = randomUUID();
      await db.run(
        `INSERT INTO trips (id, family_id, name, start_date, end_date, status, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, 'planning', ?, ?)`,
        [tripId, list.familyId, list.name, now, now]
      );
      await record(db, 'trip', tripId);
      await addDestination(db, { tripId, name: list.name, listId: list.id, now });
    }

    // 3. Live trips that still have no destination get one, with a new list for the whole family.
    const emptyTrips = await db.all(
      `SELECT t.id, t.name, t.family_id AS familyId FROM trips t
       WHERE t.deleted_at IS NULL AND NOT EXISTS (
         SELECT 1 FROM trip_destinations d WHERE d.trip_id = t.id AND d.deleted_at IS NULL)`
    );
    for (const trip of emptyTrips) {
      const listId = randomUUID();
      await db.run(
        `INSERT INTO packing_lists (id, family_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        [listId, trip.familyId, trip.name, now, now]
      );
      await record(db, 'list', listId);
      const users = await db.all(`SELECT id FROM users WHERE familyId = ? AND deleted_at IS NULL`, [trip.familyId]);
      for (const user of users) {
        await db.run(`INSERT OR IGNORE INTO packing_list_members (packing_list_id, member_id) VALUES (?, ?)`, [listId, user.id]);
      }
      await addDestination(db, { tripId: trip.id, name: trip.name, listId, now });
    }

    // 4. Every destination list is named after its label.
    const named = await db.all(
      `SELECT d.packing_list_id AS listId, d.name, t.name AS tripName, pl.name AS listName
       FROM trip_destinations d JOIN trips t ON t.id = d.trip_id JOIN packing_lists pl ON pl.id = d.packing_list_id
       WHERE d.deleted_at IS NULL AND t.deleted_at IS NULL AND pl.deleted_at IS NULL`
    );
    for (const row of named) {
      const next = label(row.tripName, row.name);
      if (next !== row.listName) {
        await db.run(`UPDATE packing_lists SET name = ?, updated_at = ? WHERE id = ?`, [next, now, row.listId]);
      }
    }

    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

async function deleteListRows(db, listId) {
  const items = `SELECT id FROM packing_list_items WHERE packing_list_id = ?`;
  for (const table of ['packing_list_item_checks', 'packing_list_item_not_needed', 'packing_list_item_templates']) {
    await db.run(`DELETE FROM ${table} WHERE packing_list_item_id IN (${items})`, [listId]);
  }
  await db.run(`DELETE FROM packing_list_audit_log WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM packing_list_items WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM packing_list_members WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM packing_list_templates WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM trip_packing_lists WHERE packing_list_id = ?`, [listId]);
  await db.run(`DELETE FROM packing_lists WHERE id = ?`, [listId]);
}

async function down({ db }) {
  const tracked = await db.get(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration_trip_shells'`);
  if (!tracked) return;
  await db.exec('BEGIN TRANSACTION');
  try {
    const ids = async kind =>
      (await db.all(`SELECT id FROM migration_trip_shells WHERE kind = ?`, [kind])).map(r => r.id);
    for (const id of await ids('destination')) {
      await db.run(`DELETE FROM trip_destinations WHERE id = ?`, [id]);
    }
    for (const key of await ids('link')) {
      const [tripId, listId] = key.split('|');
      await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ? AND packing_list_id = ?`, [tripId, listId]);
    }
    for (const listId of await ids('list')) {
      await deleteListRows(db, listId);
    }
    for (const tripId of await ids('trip')) {
      await db.run(`DELETE FROM trip_participants WHERE trip_id = ?`, [tripId]);
      await db.run(`DELETE FROM trip_packing_lists WHERE trip_id = ?`, [tripId]);
      await db.run(`DELETE FROM trip_destinations WHERE trip_id = ?`, [tripId]);
      await db.run(`DELETE FROM trips WHERE id = ?`, [tripId]);
    }
    await db.exec(`DROP TABLE migration_trip_shells`);
    await db.exec('COMMIT');
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

module.exports.up = up;
module.exports.down = down;
