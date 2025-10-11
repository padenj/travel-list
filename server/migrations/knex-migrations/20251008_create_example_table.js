exports.up = async function(knex) {
  await knex.schema.createTableIfNotExists('example', function(t) {
    t.string('id').primary();
    t.string('name');
    t.timestamps(true, true);
  });
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('example');
};
