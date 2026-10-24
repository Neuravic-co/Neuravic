const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Time-sortable unique id (ULID layout: 10 time chars + 16 random chars). */
export function ulid(now: number = Date.now()): string {
  let time = "";
  let remaining = now;
  for (let i = 0; i < 10; i += 1) {
    time = ALPHABET[remaining % 32]! + time;
    remaining = Math.floor(remaining / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let random = "";
  for (const byte of bytes) random += ALPHABET[byte % 32];
  return time + random;
}
