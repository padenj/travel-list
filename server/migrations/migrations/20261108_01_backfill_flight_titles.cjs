/*
  Migration: backfill flight element names as "FIRST → LAST" airport codes.
  Flights whose first origin or last destination is missing/TBD keep their name.
  See docs/superpowers/specs/2026-11-08-booking-and-leg-editing-design.md §1.4.
*/

function cleanAirport(value) {
  const code = (value || '').trim().toUpperCase();
  return code && code !== 'TBD' ? code : '';
}

module.exports.up = async function up({ db }) {
  const flights = await db.all(`SELECT id FROM trip_elements WHERE element_type = 'flight'`);
  for (const flight of flights) {
    const legs = await db.all(
      `SELECT departure_airport AS dep, arrival_airport AS arr FROM flight_legs WHERE element_id = ? ORDER BY leg_order ASC`,
      [flight.id]
    );
    if (legs.length === 0) continue;
    const from = cleanAirport(legs[0].dep);
    const to = cleanAirport(legs[legs.length - 1].arr);
    if (!from || !to) continue;
    await db.run(`UPDATE trip_elements SET name = ? WHERE id = ?`, [`${from} → ${to}`, flight.id]);
  }
};

// Previous names are not recoverable and not needed.
module.exports.down = async function down() {};
