#!/usr/bin/env bash
set -euo pipefail

if [ "${NODE_ENV:-}" = "production" ]; then
  echo "ERROR: db:drop must not run in production" >&2
  exit 1
fi

# Load env vars from .env if present (grep only DB-related vars to avoid bash expansion issues)
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
  eval "$(grep -E '^(DATABASE_|DB_)' "$ENV_FILE" | sed 's/^/export /')"
fi

# Parse DATABASE_URL or use defaults
if [ -n "${DATABASE_URL:-}" ]; then
  DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
  DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
else
  DB_HOST="${DATABASE_HOST:-localhost}"
  DB_PORT="${DATABASE_PORT:-5432}"
  DB_USER="${DATABASE_USERNAME:-postgres}"
  DB_NAME="${DATABASE_NAME:-assistant}"
fi

echo "Dropping database '$DB_NAME' on $DB_HOST:$DB_PORT as user '$DB_USER'..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
  | grep -q 1 \
  && {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid()" \
      > /dev/null 2>&1 || true
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE $DB_NAME"
    echo "Database '$DB_NAME' dropped."
  } \
  || echo "Database '$DB_NAME' does not exist."
