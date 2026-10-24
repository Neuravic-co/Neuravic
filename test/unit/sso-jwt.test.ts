import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createJwtSigner, verifyJwt, type JwtSigner } from "../../nbe/core/src/modules/sso/jwt";

const NOW = 1_800_000_000_000;
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: "https://api.example.com",
  aud: "product-one",
  sub: "user-1",
  jti: "token-1",
  iat: NOW / 1000,
  exp: NOW / 1000 + 300,
  ...extra,
});
const expected = { issuer: "https://api.example.com", audience: "product-one", now: NOW + 1000 };

let signer: JwtSigner;
let jwks: { keys: Awaited<ReturnType<JwtSigner["publicJwk"]>>[] };
let privateJwk: string;

before(async () => {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  privateJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey));
  signer = createJwtSigner(privateJwk, "key-1");
  jwks = await signer.publicJwks();
});

describe("single sign-on tokens", () => {
  it("verifies a token it signed and returns its claims", async () => {
    const token = await signer.sign(claims());
    const verified = await verifyJwt(token, jwks, expected);
    assert.equal(verified.claims.sub, "user-1");
    assert.equal(verified.header.kid, "key-1");
  });

  it("publishes only the public half of the key", async () => {
    const [key] = jwks.keys;
    assert.ok(key && !("d" in key));
    assert.equal(key?.crv, "Ed25519");
  });

  it("refuses a tampered payload", async () => {
    const [h, , s] = (await signer.sign(claims())).split(".");
    const forged = Buffer.from(JSON.stringify(claims({ sub: "admin" }))).toString("base64url");
    await assert.rejects(verifyJwt(`${h}.${forged}.${s}`, jwks, expected), /bad signature/);
  });

  it("refuses the wrong audience or issuer", async () => {
    const token = await signer.sign(claims());
    await assert.rejects(verifyJwt(token, jwks, { ...expected, audience: "other" }), /wrong audience/);
    await assert.rejects(verifyJwt(token, jwks, { ...expected, issuer: "https://evil.example.com" }), /wrong issuer/);
  });

  it("refuses an expired token", async () => {
    const token = await signer.sign(claims());
    await assert.rejects(verifyJwt(token, jwks, { ...expected, now: NOW + 301_000 }), /expired/);
  });

  it("refuses a lifetime longer than five minutes", async () => {
    const token = await signer.sign(claims({ exp: NOW / 1000 + 3600 }));
    await assert.rejects(verifyJwt(token, jwks, expected), /lifetime/);
  });

  it("refuses an unknown key id and a different key", async () => {
    const other = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const stranger = createJwtSigner(JSON.stringify(await crypto.subtle.exportKey("jwk", other.privateKey)), "key-2");
    const token = await stranger.sign(claims());
    await assert.rejects(verifyJwt(token, jwks, expected), /unknown key id/);
    const sameIdDifferentKey = createJwtSigner(JSON.stringify(await crypto.subtle.exportKey("jwk", other.privateKey)), "key-1");
    await assert.rejects(verifyJwt(await sameIdDifferentKey.sign(claims()), jwks, expected), /bad signature/);
  });

  it("refuses malformed tokens and the 'none' algorithm", async () => {
    await assert.rejects(verifyJwt("not.a.jwt!", jwks, expected), /malformed/);
    await assert.rejects(verifyJwt("a.b", jwks, expected), /malformed/);
    const none = `${Buffer.from('{"alg":"none","kid":"key-1"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims())).toString("base64url")}.AAAA`;
    await assert.rejects(verifyJwt(none, jwks, expected), /unexpected algorithm/);
  });

  it("refuses to start with a bad private key and keeps rotation keys public-only", async () => {
    assert.throws(() => createJwtSigner("{}", "key-1"), /Invalid private SSO key/);
    const withPrivate = JSON.stringify({ keys: [{ ...JSON.parse(privateJwk), kid: "old" }] });
    assert.throws(() => createJwtSigner(privateJwk, "key-1", withPrivate), /Invalid public SSO key/);
  });

  it("publishes an overlap key during rotation", async () => {
    const other = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const publicOnly = await crypto.subtle.exportKey("jwk", other.publicKey);
    const rotating = createJwtSigner(privateJwk, "key-1", JSON.stringify({ keys: [{ kty: publicOnly.kty, crv: publicOnly.crv, x: publicOnly.x, kid: "key-0" }] }));
    assert.deepEqual((await rotating.publicJwks()).keys.map((key) => key.kid).sort(), ["key-0", "key-1"]);
  });
});
