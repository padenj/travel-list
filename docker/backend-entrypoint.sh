#!/bin/sh
set -e

# Ensure /data exists and is writable
mkdir -p /data
chown -R node:node /data || true

# Run migrations (will create sqlite file if needed)
echo "Running migrations..."
if [ -x "./node_modules/.bin/ts-node" ]; then
  node server/migrations/run-migrations-knex.cjs up || true
else
  node server/migrations/run-migrations-knex.cjs up || true
fi

echo "Starting backend..."
exec "$@"
