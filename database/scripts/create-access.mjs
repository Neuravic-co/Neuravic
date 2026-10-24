// Creates the database and the two MySQL accounts Neuravic uses. Safe to run again: it only creates what is missing
// and always resets the two passwords to the values you give it.
//
//   neuravic_app       runs the services. Can read and write rows, nothing else (no DDL, no GRANT, no other database).
//   neuravic_migrator  runs `npm run db:migrate`. Can also create and change tables, indexes and triggers.
//
// Usage (against any MySQL 8+ server, with an administrator account):
//   MYSQL_ADMIN_URL=mysql://root:secret@db.example.com:3306 \
//   APP_DB_PASSWORD=... MIGRATE_DB_PASSWORD=... node database/scripts/create-access.mjs
// Optional: DB_NAME (default neuravic), DB_USER_HOSTS (default "%", a comma list such as "10.0.%,localhost").
import { createConnection } from "mysql2/promise";
import { pathToFileURL } from "node:url";

const APP_USER = "neuravic_app";
const MIGRATOR_USER = "neuravic_migrator";

const APP_PRIVILEGES = "SELECT, INSERT, UPDATE, DELETE";
// Triggers run with the migrator's rights, so it keeps data access as well as schema changes.
const MIGRATOR_PRIVILEGES = "SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER";

const identifier = (name) => {
  if (!/^[A-Za-z0-9_]{1,48}$/.test(name)) throw new Error(`Unsafe name: ${name}`);
  return name;
};

export async function createAccess({ connection, database = "neuravic", hosts = ["%"], appPassword, migratorPassword }) {
  if (!appPassword || !migratorPassword) throw new Error("Both passwords are required");
  if (appPassword.length < 16 || migratorPassword.length < 16) throw new Error("Passwords must be at least 16 characters");
  const db = identifier(database);
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
  for (const host of hosts) {
    for (const [user, password, privileges] of [
      [APP_USER, appPassword, APP_PRIVILEGES],
      [MIGRATOR_USER, migratorPassword, MIGRATOR_PRIVILEGES],
    ]) {
      await connection.query("CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?", [user, host, password]);
      await connection.query("ALTER USER ?@? IDENTIFIED BY ?", [user, host, password]);
      await connection.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ?@?`, [user, host]);
      await connection.query(`GRANT ${privileges} ON \`${db}\`.* TO ?@?`, [user, host]);
    }
  }
  await connection.query("FLUSH PRIVILEGES");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = process.env.MYSQL_ADMIN_URL;
  if (!url) throw new Error("Set MYSQL_ADMIN_URL to an administrator connection, for example mysql://root:secret@host:3306");
  const connection = await createConnection({ uri: url });
  try {
    await createAccess({
      connection,
      database: process.env.DB_NAME ?? "neuravic",
      hosts: (process.env.DB_USER_HOSTS ?? "%").split(",").map((h) => h.trim()).filter(Boolean),
      appPassword: process.env.APP_DB_PASSWORD,
      migratorPassword: process.env.MIGRATE_DB_PASSWORD,
    });
    console.log(`Database and the accounts ${APP_USER} and ${MIGRATOR_USER} are ready.`);
  } finally {
    await connection.end();
  }
}
