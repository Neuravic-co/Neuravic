import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newTotpSecret, totpCode } from "../../nbe/core/src/modules/auth/mfa";
import { sessionLifetimes } from "../../nbe/core/src/modules/auth/service";
import { hashIdentifier } from "../../nbe/core/src/modules/audit/audit";
import { MemoryRateLimiter } from "../../nbe/core/src/lib/rate-limit";

describe("one-time codes (TOTP, RFC 4226 and 6238)", () => {
  // The RFC's shared secret "12345678901234567890" written in base32.
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("matches the published test vectors", async () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    for (const [counter, code] of expected.entries()) assert.equal(await totpCode(secret, counter), code, `counter ${counter}`);
  });

  it("makes six-digit codes that change with the time step", async () => {
    const secret = newTotpSecret();
    assert.match(secret, /^[A-Z2-7]{32}$/);
    const a = await totpCode(secret, 57_000_000);
    assert.match(a, /^\d{6}$/);
    assert.equal(a, await totpCode(secret, 57_000_000));
  });

  it("refuses a secret with characters outside the alphabet", async () => {
    await assert.rejects(totpCode("not a base32 secret!", 1), /Invalid stored MFA secret/);
  });
});

describe("session lifetimes", () => {
  const HOUR = 3_600_000;
  it("keeps staff sessions short and fixed", () => {
    assert.deepEqual(sessionLifetimes({ staffRole: "admin" }), { idleMs: 12 * HOUR, absoluteMs: 12 * HOUR });
  });

  it("lets client sessions slide for 30 days up to 90", () => {
    assert.deepEqual(sessionLifetimes({ staffRole: null }), { idleMs: 30 * 24 * HOUR, absoluteMs: 90 * 24 * HOUR });
  });
});

describe("pseudonymous identifiers", () => {
  it("hides the value, stays stable and depends on both the secret and the purpose", async () => {
    const secret = "s".repeat(40);
    const a = await hashIdentifier("203.0.113.9", secret, "audit-ip");
    assert.ok(a && !a.includes("203"));
    assert.equal(a, await hashIdentifier("203.0.113.9", secret, "audit-ip"));
    assert.notEqual(a, await hashIdentifier("203.0.113.9", "t".repeat(40), "audit-ip"));
    assert.notEqual(a, await hashIdentifier("203.0.113.9", secret, "rate:login"));
  });

  it("returns nothing for a missing value", async () => {
    assert.equal(await hashIdentifier(null, "s".repeat(40)), null);
    assert.equal(await hashIdentifier(undefined, "s".repeat(40)), null);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit inside a window, then refuses", async () => {
    const limiter = new MemoryRateLimiter();
    const now = 1_700_000_000_000;
    const results = [] as boolean[];
    for (let i = 0; i < 5; i++) results.push(await limiter.hit("login:a", 3, 60, now));
    assert.deepEqual(results, [true, true, true, false, false]);
  });

  it("counts each key on its own", async () => {
    const limiter = new MemoryRateLimiter();
    const now = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) await limiter.hit("login:a", 3, 60, now);
    assert.equal(await limiter.hit("login:a", 3, 60, now), false);
    assert.equal(await limiter.hit("login:b", 3, 60, now), true);
  });

  it("starts fresh in the next window", async () => {
    const limiter = new MemoryRateLimiter();
    const now = 1_700_000_000_000;
    for (let i = 0; i < 4; i++) await limiter.hit("login:a", 3, 60, now);
    assert.equal(await limiter.hit("login:a", 3, 60, now + 61_000), true);
  });
});
