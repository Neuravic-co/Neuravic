import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  // Always do the same work, so a missing account takes as long as a wrong password.
  const parts = (stored ?? "").split("$");
  const known = parts.length === 6 && parts[0] === "scrypt";
  const [n, r, p] = known ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : [N, R, P];
  const salt = known ? Buffer.from(parts[4] ?? "", "base64url") : Buffer.alloc(16);
  const expected = known ? Buffer.from(parts[5] ?? "", "base64url") : Buffer.alloc(KEY_LENGTH);
  const actual = await derive(password, salt, { N: n, r, p });
  return actual.length === expected.length && timingSafeEqual(actual, expected) && known;
}
