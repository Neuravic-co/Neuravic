import pg from "pg";
import { pathToFileURL } from "node:url";

const APP_USER = "neuravic_app";
const MIGRATOR_USER = "neuravic_migrator";

const identifier = (name) => {
  if (!/^[A-Za-z0-9_]{1,48}$/.test(name)) throw new Error(`Unsafe name: ${name}`);
  return `"${name}"`;
};
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;

export async function createAccess({ adminUrl, database = "neuravic", appPassword, migratorPassword }) {
  if (!appPassword || !migratorPassword) throw new Error("Both passwords are required");
  if (appPassword.length < 16 || migratorPassword.length < 16) throw new Error("Passwords must be at least 16 characters");
  const db = identifier(database);

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    for (const [user, password] of [[APP_USER, appPassword], [MIGRATOR_USER, migratorPassword]]) {
      const { rowCount } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [user]);
      const verb = rowCount ? "ALTER" : "CREATE";
      await admin.query(`${verb} ROLE ${identifier(user)} WITH LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    }
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (!exists.rowCount) await admin.query(`CREATE DATABASE ${db} OWNER ${identifier(MIGRATOR_USER)} ENCODING 'UTF8'`);
    await admin.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
    await admin.query(`GRANT CONNECT ON DATABASE ${db} TO ${identifier(APP_USER)}, ${identifier(MIGRATOR_USER)}`);
  } finally {
    await admin.end();
  }

  const target = new URL(adminUrl);
  target.pathname = `/${database}`;
  const inside = new pg.Client({ connectionString: target.toString() });
  await inside.connect();
  try {
    await inside.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await inside.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${identifier(MIGRATOR_USER)}`);
    await inside.query(`GRANT USAGE ON SCHEMA public TO ${identifier(APP_USER)}`);
    await inside.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(MIGRATOR_USER)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${identifier(APP_USER)}`);
    await inside.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier(APP_USER)}`);
  } finally {
    await inside.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = process.env.PG_ADMIN_URL;
  if (!url) throw new Error("Set PG_ADMIN_URL to an administrator connection, for example postgres://postgres:secret@host:5432/postgres");
  await createAccess({
    adminUrl: url,
    database: process.env.DB_NAME ?? "neuravic",
    appPassword: process.env.APP_DB_PASSWORD,
    migratorPassword: process.env.MIGRATE_DB_PASSWORD,
  });
  console.log(`Database and the roles ${APP_USER} and ${MIGRATOR_USER} are ready.`);
}
