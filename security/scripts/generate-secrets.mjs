// Prints fresh random values for the secrets the system needs, to place in your secret manager yourself.
// Nothing is written to disk or sent anywhere. Never commit or share the output.
// Usage: node security/scripts/generate-secrets.mjs
import { randomBytes } from "node:crypto";

const hex = (bytes) => randomBytes(bytes).toString("hex");

const values = {
  // Shared by the website (API_PROXY_SECRET) and the backend (PROXY_SECRET). 64 characters.
  PROXY_SECRET: hex(32),
  // Dedicated key for pseudonymous identifiers. Must differ from every other secret. 64 characters.
  PRIVACY_HASH_SECRET: hex(32),
  // AES-256 key for staff MFA seeds: exactly 64 hexadecimal characters. Losing it locks staff out of MFA.
  MFA_ENCRYPTION_KEY: hex(32),
  // MySQL accounts (see database/scripts/create-access.mjs). Use a different value for each.
  MYSQL_ROOT_PASSWORD: hex(24),
  APP_DB_PASSWORD: hex(24),
  MIGRATE_DB_PASSWORD: hex(24),
};

console.log("Store each value in your secret manager (Kubernetes Secret, or the .env file for local use).");
console.log("Set PROXY_SECRET on the backend project AND as API_PROXY_SECRET on the website project.\n");
for (const [name, value] of Object.entries(values)) console.log(`${name}=${value}`);
