#!/bin/sh
# Runs once, the first time the MySQL container starts with an empty data folder.
# Creates the two accounts the system uses (the official image already created the database):
#   neuravic_app       reads and writes rows only
#   neuravic_migrator  also creates and changes tables, indexes and triggers
set -eu

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS 'neuravic_app'@'%' IDENTIFIED BY '${APP_DB_PASSWORD}';
CREATE USER IF NOT EXISTS 'neuravic_migrator'@'%' IDENTIFIED BY '${MIGRATE_DB_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${MYSQL_DATABASE}\`.* TO 'neuravic_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER ON \`${MYSQL_DATABASE}\`.* TO 'neuravic_migrator'@'%';
FLUSH PRIVILEGES;
SQL
