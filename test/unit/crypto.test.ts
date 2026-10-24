import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromBase64Url, hmacHex, randomToken, sha256Hex, toBase64Url } from "../../nbe/core/src/lib/crypto";
import { ulid } from "../../nbe/core/src/lib/ids";

describe("crypto helpers", () => {
  it("computes SHA-256 like the standard test vectors", async () => {
    assert.equal(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("round-trips base64url without padding or unsafe characters", () => {
    const bytes = Uint8Array.from([0, 250, 251, 252, 253, 254, 255, 1, 2]);
    const text = toBase64Url(bytes);
    assert.match(text, /^[A-Za-z0-9_-]+$/);
    assert.deepEqual([...fromBase64Url(text)], [...bytes]);
  });

  it("makes long, unique, URL-safe random tokens", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    assert.equal(tokens.size, 200);
    for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  });

  it("keeps HMAC values stable, secret-dependent and namespace-separated", async () => {
    const a = await hmacHex("secret-one", "audit-ip", "203.0.113.5");
    assert.equal(a, await hmacHex("secret-one", "audit-ip", "203.0.113.5"));
    assert.notEqual(a, await hmacHex("secret-two", "audit-ip", "203.0.113.5"));
    assert.notEqual(a, await hmacHex("secret-one", "rate:login", "203.0.113.5"));
    assert.match(a, /^[0-9a-f]{64}$/);
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
