#!/usr/bin/env bash
# Check PostgreSQL + PostGIS connectivity
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-crime_exposure}"
DB_USER="${DB_USER:-crime}"
DB_PASSWORD="${DB_PASSWORD:-crime_dev}"

echo "Checking PostgreSQL connection at ${DB_HOST}:${DB_PORT}..."

if command -v psql &>/dev/null; then
  PGPASSWORD="$DB_PASSWORD" psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT version();" \
    -c "SELECT PostGIS_Version();"
else
  echo "(psql not found locally, using docker exec)"
  docker compose exec -T db psql \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -c "SELECT version();" \
    -c "SELECT PostGIS_Version();"
fi

echo "PostgreSQL + PostGIS connection OK"
