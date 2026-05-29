#!/usr/bin/env bash
set -euo pipefail

if [ "${NODE_ENV:-}" = "production" ]; then
  echo "ERROR: db:create must not run in production" >&2
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

echo "Creating database '$DB_NAME' on $DB_HOST:$DB_PORT as user '$DB_USER'..."

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -tc \
  "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" \
  | grep -q 1 \
  && echo "Database '$DB_NAME' already exists." \
  || {
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME"
    echo "Database '$DB_NAME' created."
  }
