import { randomBytes } from "node:crypto";

const hex = (bytes) => randomBytes(bytes).toString("hex");

const values = {
  PRIVACY_HASH_SECRET: hex(32),
  PROXY_SECRET: hex(32),
  CRON_SECRET: hex(32),
  POSTGRES_PASSWORD: hex(24),
  APP_DB_PASSWORD: hex(24),
  MIGRATE_DB_PASSWORD: hex(24),
};

console.log("Store each value in your secret manager or in the untracked .env file. Never commit them.");
console.log("Set PROXY_SECRET on the backend AND as API_PROXY_SECRET on the website.\n");
for (const [name, value] of Object.entries(values)) console.log(`${name}=${value}`);
