#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=test_database="$POSTGRES_TEST_DB" \
  --set=test_user="$POSTGRES_TEST_USER" \
  --set=test_password="$POSTGRES_TEST_PASSWORD" <<-'EOSQL'
SELECT format('CREATE ROLE %I WITH LOGIN PASSWORD %L', :'test_user', :'test_password')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'test_user'
)
\gexec

SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'test_user', :'test_password')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'test_database', :'test_user')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'test_database'
)
\gexec

SELECT format('ALTER DATABASE %I OWNER TO %I', :'test_database', :'test_user')
\gexec
EOSQL
