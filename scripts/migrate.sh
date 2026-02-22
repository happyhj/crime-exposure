#!/usr/bin/env bash
# Run SQL migrations against the database
set -euo pipefail

DB_USER="${DB_USER:-crime}"
DB_NAME="${DB_NAME:-crime_exposure}"
MIGRATIONS_DIR="${1:-etl/migrations}"

echo "Running migrations from ${MIGRATIONS_DIR}..."

for file in "${MIGRATIONS_DIR}"/*.sql; do
  echo "  → $(basename "$file")"
  if command -v psql &>/dev/null; then
    PGPASSWORD="${DB_PASSWORD:-crime_dev}" psql \
      -h "${DB_HOST:-localhost}" \
      -p "${DB_PORT:-5432}" \
      -U "$DB_USER" \
      -d "$DB_NAME" \
      -f "$file"
  else
    docker compose exec -T db psql \
      -U "$DB_USER" \
      -d "$DB_NAME" \
      -f - < "$file"
  fi
done

echo "Migrations complete."
