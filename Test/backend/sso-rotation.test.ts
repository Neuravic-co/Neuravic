import { describe, expect, it } from "vitest";
import { createJwtSigner, verifyJwt } from "../../NBE/src/modules/sso/jwt";
import { body, makeTestApp } from "./helpers";

async function key(kid: string) {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey) as JsonWebKey;
  const publicKey = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey) as JsonWebKey), kid, alg: "EdDSA", use: "sig" };
  return { privateKey, publicKey };
}

describe("SSO key rotation", () => {
  it("prepublishes the next key, accepts overlap, and retires the old key after token expiry", async () => {
    const a = await key("key-a"), b = await key("key-b");
    const overlap = JSON.stringify({ keys: [a.publicKey, b.publicKey] });
    const old = createJwtSigner(JSON.stringify(a.privateKey), "key-a", overlap);
    const next = createJwtSigner(JSON.stringify(b.privateKey), "key-b", overlap);
    const claims = { iss: "https://app.test", aud: "darkagent", sub: "test", jti: "token-id", iat: 1000, exp: 1300 };
    const before = await old.publicJwks();
    const first = await old.sign(claims), second = await next.sign({ ...claims, jti: "next-token" });
    const expected = { issuer: claims.iss, audience: claims.aud, now: 1100_000 };
    await expect(verifyJwt(first, before, expected)).resolves.toBeTruthy();
    await expect(verifyJwt(second, before, expected)).resolves.toBeTruthy();
    await expect(verifyJwt(first, await next.publicJwks(), expected)).resolves.toBeTruthy();
    await expect(verifyJwt(first, before, { ...expected, now: 1300_000 })).rejects.toThrow("expired");
    const retired = createJwtSigner(JSON.stringify(b.privateKey), "key-b");
    await expect(verifyJwt(first, await retired.publicJwks(), expected)).rejects.toThrow("unknown key");
    await expect(verifyJwt(second, await retired.publicJwks(), expected)).resolves.toBeTruthy();
    const ctx = await makeTestApp({ sso: next });
    const response = await ctx.request("/.well-known/jwks.json");
    expect(response.headers.get("cache-control")).toContain("max-age=300");
    const published = await body(response);
    expect(published.keys).toHaveLength(2);
    for (const item of published.keys) expect(Object.keys(item).sort()).toEqual(["alg", "crv", "kid", "kty", "use", "x"]);
  });

  it("rejects private publication, conflicting ids, malformed keys and ambiguous verifier sets", async () => {
    const a = await key("key-a"), b = await key("key-b");
    const signer = (keys: unknown[]) => createJwtSigner(JSON.stringify(a.privateKey), "key-a", JSON.stringify({ keys }));
    expect(() => signer([{ ...a.publicKey, d: a.privateKey.d }])).toThrow("public SSO key");
    expect(() => signer([{ ...b.publicKey, kid: "key-a" }])).toThrow("Conflicting");
    expect(() => signer([b.publicKey, b.publicKey])).toThrow("Duplicate");
    expect(() => signer([{ ...b.publicKey, x: "invalid" }])).toThrow("public SSO key");
    expect(() => createJwtSigner("{}", "key-a")).toThrow("private SSO key");
    const live = signer([]), jwks = await live.publicJwks();
    const token = await live.sign({ iss: "issuer", aud: "aud", sub: "test", jti: "id", iat: 1, exp: 301 });
    await expect(verifyJwt(token, { keys: [...jwks.keys, ...jwks.keys] }, { issuer: "issuer", audience: "aud", now: 2000 })).rejects.toThrow("ambiguous");
  });
});
