#!/bin/sh
# Runs once, the first time the Postgres container starts with an empty data folder.
# Creates the two roles the system uses (the official image already created the database):
#   neuravic_app       reads and writes rows only
#   neuravic_migrator  owns the tables, so it can also create and change them (and their triggers)
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE neuravic_app LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE neuravic_migrator LOGIN PASSWORD '${MIGRATE_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO neuravic_migrator;
GRANT USAGE ON SCHEMA public TO neuravic_app;
ALTER DEFAULT PRIVILEGES FOR ROLE neuravic_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO neuravic_app;
SQL
