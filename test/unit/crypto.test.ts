import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hmacHex, safeEqual, sha256Hex } from "../../nbe/src/core/crypto";
import { ulid } from "../../nbe/src/core/ids";
import { databaseSsl } from "../../nbe/src/db/ssl";

describe("crypto helpers", () => {
  it("computes SHA-256 like the standard test vectors", () => {
    assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("keeps HMAC values stable, secret-dependent and namespace-separated", () => {
    const a = hmacHex("secret-one", "audit-ip", "203.0.113.5");
    assert.equal(a, hmacHex("secret-one", "audit-ip", "203.0.113.5"));
    assert.notEqual(a, hmacHex("secret-two", "audit-ip", "203.0.113.5"));
    assert.notEqual(a, hmacHex("secret-one", "rate:leads", "203.0.113.5"));
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("compares secrets without accepting empty or different-length values", () => {
    assert.equal(safeEqual("same-secret", "same-secret"), true);
    assert.equal(safeEqual("same-secret", "same-secreT"), false);
    assert.equal(safeEqual("short", "longer-value"), false);
    assert.equal(safeEqual("", ""), false);
  });
});

describe("ids", () => {
  it("makes 26-character ids that sort by time", () => {
    const early = ulid(1_700_000_000_000);
    const late = ulid(1_700_000_001_000);
    assert.equal(early.length, 26);
    assert.ok(early < late);
  });
});

describe("database TLS", () => {
  const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

  it("leaves TLS to the connection string when no CA is set", () => {
    assert.equal(databaseSsl(undefined), undefined);
    assert.equal(databaseSsl("   "), undefined);
  });

  it("verifies the server against the given CA", () => {
    assert.deepEqual(databaseSsl(PEM), { ca: PEM, rejectUnauthorized: true });
  });

  it("accepts a single-line value with escaped line breaks", () => {
    assert.equal(databaseSsl(PEM.replace(/\n/g, "\\n"))?.ca, PEM);
  });

  it("refuses a value that is not a certificate", () => {
    assert.throws(() => databaseSsl("not a cert"), /PEM certificate/);
  });
});
