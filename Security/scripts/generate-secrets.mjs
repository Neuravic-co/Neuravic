// Prints fresh random values for the secrets the backend needs, to paste into Vercel yourself.
// Nothing is written to disk or sent anywhere. Never commit or share the output.
// Usage: node Security/scripts/generate-secrets.mjs
import { randomBytes } from "node:crypto";

const hex = (bytes) => randomBytes(bytes).toString("hex");

const values = {
  // Shared by the website (API_PROXY_SECRET) and the backend (PROXY_SECRET). 64 characters.
  PROXY_SECRET: hex(32),
  // Dedicated key for pseudonymous identifiers. Must differ from every other secret. 64 characters.
  PRIVACY_HASH_SECRET: hex(32),
  // AES-256 key for staff MFA seeds: exactly 64 hexadecimal characters. Losing it locks staff out of MFA.
  MFA_ENCRYPTION_KEY: hex(32),
  // Authenticates Vercel's daily maintenance call.
  CRON_SECRET: hex(24),
};

console.log("Paste each value into Vercel (Project Settings, Environment Variables, Production, Sensitive).");
console.log("Set PROXY_SECRET on the backend project AND as API_PROXY_SECRET on the website project.\n");
for (const [name, value] of Object.entries(values)) console.log(`${name}=${value}`);
