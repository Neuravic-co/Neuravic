import { fromBase64Url, toBase64Url } from "../../lib/crypto";

const encoder = new TextEncoder();
const b64json = (value: unknown) => toBase64Url(encoder.encode(JSON.stringify(value)));

export interface PublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  alg: "EdDSA";
  use: "sig";
}

export interface JwtSigner {
  sign(claims: Record<string, unknown>): Promise<string>;
  publicJwk(): Promise<PublicJwk>;
}

/** Ed25519 (EdDSA) signer. The private key is imported lazily and cached. */
export function createJwtSigner(privateJwkJson: string, keyId: string): JwtSigner {
  const jwk = JSON.parse(privateJwkJson) as JsonWebKey;
  let key: Promise<CryptoKey> | undefined;
  const privateKey = () =>
    (key ??= crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"] }, { name: "Ed25519" }, false, ["sign"]));

  return {
    async sign(claims) {
      const signingInput = `${b64json({ alg: "EdDSA", typ: "JWT", kid: keyId })}.${b64json(claims)}`;
      const signature = await crypto.subtle.sign({ name: "Ed25519" }, await privateKey(), encoder.encode(signingInput));
      return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
    },
    async publicJwk() {
      return { kty: "OKP", crv: "Ed25519", x: String(jwk.x), kid: keyId, alg: "EdDSA", use: "sig" };
    },
  };
}

export interface VerifiedJwt {
  header: { alg: string; kid?: string };
  claims: Record<string, unknown>;
}

/**
 * Reference verifier (what DARKAGENT / COOLACCESS_DXB must do): check the
 * signature against the JWKS, then `iss`, `aud` and `exp`.
 */
export async function verifyJwt(
  token: string,
  jwks: { keys: PublicJwk[] },
  expected: { issuer: string; audience: string; now: number },
): Promise<VerifiedJwt> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("malformed token");
  const header = JSON.parse(new TextDecoder().decode(fromBase64Url(h))) as VerifiedJwt["header"];
  if (header.alg !== "EdDSA") throw new Error("unexpected algorithm");
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key id");
  const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromBase64Url(s), encoder.encode(`${h}.${p}`));
  if (!valid) throw new Error("bad signature");
  const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(p))) as Record<string, unknown>;
  if (claims.iss !== expected.issuer) throw new Error("wrong issuer");
  if (claims.aud !== expected.audience) throw new Error("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= expected.now) throw new Error("token expired");
  return { header, claims };
}
