// Prints a table of strong random passwords for accounts you create yourself (Turso, Resend, Cloudflare, a mailbox...).
// Nothing is saved or sent anywhere: copy the output into a password manager, then close the terminal.
// Usage: node Security/scripts/generate-credentials.mjs "Turso=you@example.com" "Resend=you@example.com" "Mailbox"
//   Each argument is "Account" or "Account=username". The passwords are random: they are NOT for existing accounts,
//   they are what you type when you create the account (or when you change its password).
import { randomInt } from "node:crypto";

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!#$%&*+-=?@^_";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

export function strongPassword(length = 24) {
  if (length < 16) throw new Error("Use at least 16 characters");
  const pick = (set) => set[randomInt(set.length)];
  // One of every kind first, then fill from everything, then shuffle so the kinds are not always in front.
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const accounts = process.argv.slice(2);
if (accounts.length === 0) {
  console.error('Give at least one account, for example: node Security/scripts/generate-credentials.mjs "Turso=you@example.com" "Mailbox"');
  process.exit(1);
}

const rows = accounts.map((arg) => {
  const [name, ...rest] = arg.split("=");
  return { account: name.trim(), username: rest.join("=").trim() || "(choose one)", password: strongPassword() };
});

const bits = Math.floor(24 * Math.log2(ALL.length));
console.log(`Strong random passwords (24 characters, about ${bits} bits). Keep them in a password manager. Never commit or share them.\n`);
for (const row of rows) {
  console.log(`Account:  ${row.account}\nUsername: ${row.username}\nPassword: ${row.password}\n`);
}
