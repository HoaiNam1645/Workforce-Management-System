#!/usr/bin/env bash

set -euo pipefail

DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_ADMIN_USER="${DATABASE_ADMIN_USER:-$(whoami)}"
DB_NAME="${DATABASE_NAME:-workforce}"
DB_USER="${DATABASE_USER:-workforce}"
DB_PASSWORD="${DATABASE_PASSWORD:-workforce}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required. Install PostgreSQL before running this script."
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_ADMIN_USER}" \
  -d postgres \
  --set=db_user="${DB_USER}" \
  --set=db_password="${DB_PASSWORD}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db_user')
\gexec
SQL

if ! psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" -d postgres \
  -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  createdb -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_ADMIN_USER}" \
    -O "${DB_USER}" "${DB_NAME}"
fi

if ! PGPASSWORD="${DB_PASSWORD}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -tAc "SELECT to_regclass('workforce.organizations') IS NOT NULL" | grep -q t; then
  PGPASSWORD="${DB_PASSWORD}" psql -v ON_ERROR_STOP=1 \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -f "${PROJECT_DIR}/csdl.sql"
fi

echo "Database '${DB_NAME}' and role '${DB_USER}' are ready."
